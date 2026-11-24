const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");

const {
  normalizeText,
  extractUrlContext,
  buildBookmarkEmbeddingText,
  computeContentHash,
  isValidEmbedding,
} = require("../utils/embeddingText");
const {
  EmbeddingServiceError,
  generateEmbedding,
  generateEmbeddingsBatch,
} = require("../services/embeddingService");
const Bookmark = require("../models/Bookmark");
const Folder = require("../models/Folder");
const bookmarkController = require("../controllers/bookmarkController");
const { parseArgs, processBatch } = require("../scripts/backfillEmbeddings");
const app = require("../server");

function makeVector(seed = 1, dim = 384) {
  const vec = Array.from({ length: dim }, (_, i) => ((i + seed) % 10) + 1);
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  return vec.map((v) => v / norm);
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// 1. Embedding Text Preprocessing & Validation
// ---------------------------------------------------------------------------
test("embeddingText builds canonical text and handles missing descriptions gracefully", () => {
  const withDesc = buildBookmarkEmbeddingText({
    title: "  OWASP API Security  ",
    description: "<p>Learn JWT &amp; OAuth2 hardening</p>",
    url: "https://www.owasp.org/api-security/top-10?ref=home",
    tags: ["security", "jwt"],
    folder: "Work",
  });
  assert.match(withDesc, /Title: OWASP API Security/);
  assert.match(withDesc, /Description: Learn JWT &amp; OAuth2 hardening/);
  assert.match(withDesc, /Tags: security, jwt/);
  assert.match(withDesc, /Source: owasp\.org api security top 10/);

  const withoutDesc = buildBookmarkEmbeddingText({
    title: "Express Docs",
    url: "https://expressjs.com/en/guide/routing.html",
  });
  assert.ok(!withoutDesc.includes("Description:"));
  assert.match(withoutDesc, /Title: Express Docs/);
  assert.equal(normalizeText("  hello \n\t world  "), "hello world");
  assert.equal(extractUrlContext("not-a-url"), "");
});

test("isValidEmbedding enforces exact 384 finite numeric dimensions", () => {
  const valid = makeVector(1, 384);
  assert.equal(isValidEmbedding(valid), true);
  assert.equal(isValidEmbedding(valid.slice(0, 10)), false);
  assert.equal(isValidEmbedding([...valid.slice(0, 383), NaN]), false);
  assert.equal(isValidEmbedding("not-an-array"), false);
});

// ---------------------------------------------------------------------------
// 2. Embedding Service Client (Single, Batch, Error & Timeout Handling)
// ---------------------------------------------------------------------------
test("embeddingService generates single and batch embeddings via HTTP", async () => {
  const expectedVec = makeVector(2, 384);
  const mockFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith("/embed")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          embedding: expectedVec,
          dimensions: 384,
          model: "sentence-transformers/all-MiniLM-L6-v2",
        }),
      };
    }
    if (url.endsWith("/embed/batch")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: body.texts.map((_, idx) => makeVector(idx + 1, 384)),
          count: body.texts.length,
          dimensions: 384,
          model: "sentence-transformers/all-MiniLM-L6-v2",
        }),
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const single = await generateEmbedding("backend auth", { fetchImpl: mockFetch });
  assert.equal(single.embedding.length, 384);

  const batch = await generateEmbeddingsBatch(["doc 1", "doc 2"], { fetchImpl: mockFetch });
  assert.equal(batch.embeddings.length, 2);
});

test("embeddingService rejects empty text and handles downstream failures cleanly", async () => {
  await assert.rejects(
    () => generateEmbedding("   "),
    (err) => err instanceof EmbeddingServiceError && err.statusCode === 400
  );

  const failingFetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ detail: "Model unavailable" }),
  });

  await assert.rejects(
    () => generateEmbedding("valid query", { fetchImpl: failingFetch }),
    (err) => err instanceof EmbeddingServiceError && err.statusCode === 503
  );
});

// ---------------------------------------------------------------------------
// 3. Authentication Requirement on /api/bookmarks/semantic-search
// ---------------------------------------------------------------------------
test("GET /api/bookmarks/semantic-search rejects unauthenticated requests with 401", async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/bookmarks/semantic-search?q=api+security`
    );
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.match(body.message, /Not authorized/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---------------------------------------------------------------------------
// 4. Semantic Search Endpoint: Validation, User Isolation, Ranking, No Vector Leak
// ---------------------------------------------------------------------------
test("semanticSearchBookmarks rejects empty and overly long queries with 400", async () => {
  const userId = new mongoose.Types.ObjectId();

  const resEmpty = createMockRes();
  await bookmarkController.semanticSearchBookmarks(
    { query: { q: "   " }, user: { _id: userId } },
    resEmpty
  );
  assert.equal(resEmpty.statusCode, 400);

  const resLong = createMockRes();
  await bookmarkController.semanticSearchBookmarks(
    { query: { q: "a".repeat(501) }, user: { _id: userId } },
    resLong
  );
  assert.equal(resLong.statusCode, 400);
});

test("semanticSearchBookmarks enforces user isolation, hides embeddings, and ranks by score", async () => {
  const userA = new mongoose.Types.ObjectId();
  const queryVec = makeVector(7, 384);
  const originalFetch = global.fetch;
  const originalAggregate = Bookmark.aggregate;

  let capturedPipeline = null;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      embedding: queryVec,
      dimensions: 384,
      model: "sentence-transformers/all-MiniLM-L6-v2",
    }),
  });

  Bookmark.aggregate = async (pipeline) => {
    capturedPipeline = pipeline;
    return [
      {
        _id: new mongoose.Types.ObjectId(),
        user: userA,
        title: "OWASP API Security Guide",
        description: "JWT and OAuth2 best practices",
        url: "https://owasp.org/API-Security/",
        folder: "Work",
        tags: ["security"],
        score: 0.91234,
        // Even if a raw doc ever had embedding, sanitizeBookmark must strip it
        embedding: makeVector(3, 384),
      },
      {
        _id: new mongoose.Types.ObjectId(),
        user: userA,
        title: "Express Middleware Patterns",
        description: "Authentication middleware in Node",
        url: "https://expressjs.com/",
        folder: "Work",
        tags: ["node"],
        score: 0.78123,
      },
    ];
  };

  try {
    const res = createMockRes();
    await bookmarkController.semanticSearchBookmarks(
      {
        query: {
          q: "Resources to learn backend authentication and API security",
          limit: "5",
          folder: "Work",
        },
        user: { _id: userA },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 2);
    assert.equal(res.body.limit, 5);
    assert.equal(res.body.results[0].title, "OWASP API Security Guide");
    assert.equal(res.body.results[0].score, 0.9123);
    assert.ok(res.body.results[0].score > res.body.results[1].score);
    assert.equal(res.body.results[0].embedding, undefined);

    // Verify strict user isolation in both $vectorSearch.filter and defensive $match
    assert.ok(Array.isArray(capturedPipeline));
    const vectorStage = capturedPipeline[0].$vectorSearch;
    assert.equal(vectorStage.filter.user.toString(), userA.toString());
    assert.equal(vectorStage.path, "embedding");
    assert.equal(vectorStage.queryVector.length, 384);

    const matchStage = capturedPipeline[1].$match;
    assert.equal(matchStage.user.toString(), userA.toString());
    assert.equal(matchStage.folder, "Work");

    const projectStage = capturedPipeline.find((stage) => stage.$project).$project;
    assert.equal(projectStage.embedding, 0);
  } finally {
    global.fetch = originalFetch;
    Bookmark.aggregate = originalAggregate;
  }
});

// ---------------------------------------------------------------------------
// 5. Bookmark Lifecycle Synchronization (Create & Update Embedding Regeneration)
// ---------------------------------------------------------------------------
test("createBookmark generates embedding and omits it from response", async () => {
  const userId = new mongoose.Types.ObjectId();
  const vec = makeVector(4, 384);
  const originalFetch = global.fetch;
  const originalSave = Bookmark.prototype.save;
  const originalFolderUpdate = Folder.updateOne;

  let savedDoc = null;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ embedding: vec, dimensions: 384, model: "all-MiniLM-L6-v2" }),
  });
  Bookmark.prototype.save = async function () {
    savedDoc = this;
    return this;
  };
  Folder.updateOne = async () => ({});

  try {
    const res = createMockRes();
    await bookmarkController.createBookmark(
      {
        body: {
          title: "JWT Handbook",
          description: "Deep dive on token authentication",
          url: "https://auth0.com/resources/ebooks/jwt-handbook",
          folder: "Study",
          tags: ["auth", "jwt"],
        },
        user: { _id: userId },
      },
      res
    );

    assert.equal(res.statusCode, 201);
    assert.equal(savedDoc.embedding.length, 384);
    assert.ok(savedDoc.embeddingContentHash);
    // Response must NOT leak embedding
    assert.equal(res.body.embedding, undefined);
    assert.equal(res.body.embeddingContentHash, undefined);
  } finally {
    global.fetch = originalFetch;
    Bookmark.prototype.save = originalSave;
    Folder.updateOne = originalFolderUpdate;
  }
});

test("updateBookmark skips embedding regeneration when content is unchanged, regenerates when changed or missing", async () => {
  const userId = new mongoose.Types.ObjectId();
  const existingVec = makeVector(5, 384);
  const newVec = makeVector(9, 384);
  const originalFetch = global.fetch;
  const originalFindOne = Bookmark.findOne;
  const originalFolderUpdate = Folder.updateOne;

  let embedCallCount = 0;
  global.fetch = async () => {
    embedCallCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ embedding: newVec, dimensions: 384, model: "all-MiniLM-L6-v2" }),
    };
  };
  Folder.updateOne = async () => ({});

  const baseFields = {
    title: "Node Security Checklist",
    description: "Express security headers",
    url: "https://example.com/node-security",
    folder: "Work",
    tags: ["node"],
  };
  const baseHash = computeContentHash(buildBookmarkEmbeddingText(baseFields));

  try {
    // Case A: Unchanged content + valid existing embedding => 0 embedding calls
    const unchangedDoc = new Bookmark({
      ...baseFields,
      user: userId,
      embedding: existingVec,
      embeddingContentHash: baseHash,
    });
    unchangedDoc.save = async () => unchangedDoc;
    Bookmark.findOne = () => ({ select: async () => unchangedDoc });

    const resUnchanged = createMockRes();
    await bookmarkController.updateBookmark(
      { params: { id: unchangedDoc._id }, body: { title: baseFields.title }, user: { _id: userId } },
      resUnchanged
    );
    assert.equal(resUnchanged.statusCode, 200);
    assert.equal(embedCallCount, 0);

    // Case B: Changed description => regenerates embedding (1 call)
    const changedDoc = new Bookmark({
      ...baseFields,
      user: userId,
      embedding: existingVec,
      embeddingContentHash: baseHash,
    });
    changedDoc.save = async () => changedDoc;
    Bookmark.findOne = () => ({ select: async () => changedDoc });

    const resChanged = createMockRes();
    await bookmarkController.updateBookmark(
      {
        params: { id: changedDoc._id },
        body: { description: "OAuth2, RBAC, and API rate limiting" },
        user: { _id: userId },
      },
      resChanged
    );
    assert.equal(resChanged.statusCode, 200);
    assert.equal(embedCallCount, 1);
    assert.deepEqual(changedDoc.embedding, newVec);
    assert.equal(resChanged.body.embedding, undefined);

    // Case C: Missing embedding on existing bookmark => regenerates embedding
    const missingEmbDoc = new Bookmark({
      ...baseFields,
      user: userId,
    });
    missingEmbDoc.save = async () => missingEmbDoc;
    Bookmark.findOne = () => ({ select: async () => missingEmbDoc });

    const resMissing = createMockRes();
    await bookmarkController.updateBookmark(
      { params: { id: missingEmbDoc._id }, body: {}, user: { _id: userId } },
      resMissing
    );
    assert.equal(resMissing.statusCode, 200);
    assert.equal(embedCallCount, 2);
  } finally {
    global.fetch = originalFetch;
    Bookmark.findOne = originalFindOne;
    Folder.updateOne = originalFolderUpdate;
  }
});

// ---------------------------------------------------------------------------
// 6. Backfill Script Batching, Skip Logic, & Ownership Preservation
// ---------------------------------------------------------------------------
test("backfillEmbeddings skips up-to-date bookmarks and preserves user ownership in bulkWrite", async () => {
  const user1 = new mongoose.Types.ObjectId();
  const user2 = new mongoose.Types.ObjectId();
  const validVec = makeVector(1, 384);
  const newVec = makeVector(6, 384);

  const upToDateFields = {
    title: "Existing Valid Bookmark",
    description: "",
    url: "https://example.com/valid",
    folder: "Personal",
    tags: [],
  };
  const upToDateHash = computeContentHash(buildBookmarkEmbeddingText(upToDateFields));

  const docs = [
    {
      _id: new mongoose.Types.ObjectId(),
      user: user1,
      ...upToDateFields,
      embedding: validVec,
      embeddingContentHash: upToDateHash,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      user: user2,
      title: "Needs Embedding",
      description: "Missing vector",
      url: "https://example.com/missing",
      folder: "Study",
      tags: ["ml"],
    },
  ];

  const originalFetch = global.fetch;
  const originalBulkWrite = Bookmark.bulkWrite;
  let capturedOps = null;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      embeddings: [newVec],
      count: 1,
      dimensions: 384,
      model: "sentence-transformers/all-MiniLM-L6-v2",
    }),
  });
  Bookmark.bulkWrite = async (ops) => {
    capturedOps = ops;
    return { modifiedCount: ops.length };
  };

  try {
    const opts = parseArgs(["--batch-size=10"]);
    assert.equal(opts.batchSize, 10);

    const stats = { scanned: 0, updated: 0, skipped: 0, failed: 0 };
    await processBatch(docs, opts, stats);

    assert.equal(stats.scanned, 2);
    assert.equal(stats.skipped, 1);
    assert.equal(stats.updated, 1);
    assert.equal(stats.failed, 0);
    assert.equal(capturedOps.length, 1);
    assert.equal(capturedOps[0].updateOne.filter.user.toString(), user2.toString());
  } finally {
    global.fetch = originalFetch;
    Bookmark.bulkWrite = originalBulkWrite;
  }
});
