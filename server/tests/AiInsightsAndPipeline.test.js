const test = require("node:test");
const assert = require("node:assert/strict");

const { GeminiProvider, DEFAULT_GEMINI_MODEL } = require("../services/llm/geminiProvider");
const { getLlmProvider, registerLlmProvider, LlmProviderError } = require("../services/llm/llmProvider");
const {
  INSUFFICIENT_CONTENT_FALLBACK,
  generateAllBookmarkInsights,
  generateBookmarkSummary,
  generateTagSuggestions,
  generateFolderRecommendation,
} = require("../services/aiInsightsService");
const { normalizeSuggestedTags, mergeUniqueTags } = require("../utils/tagNormalizer");
const { buildBookmarkEmbeddingText } = require("../utils/embeddingText");
const { BookmarkProcessingQueue } = require("../services/bookmarkProcessingQueue");

function makeVector(seed = 1, dim = 384) {
  const vec = Array.from({ length: dim }, (_, i) => ((i + seed) % 10) + 1);
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
  return vec.map((v) => v / norm);
}

// ---------------------------------------------------------------------------
// 1. Provider-Independent LLM & Gemini Provider Tests
// ---------------------------------------------------------------------------
test("GeminiProvider defaults to gemini-3.5-flash-lite, calls Gemini API, and handles errors safely", async () => {
  assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.5-flash-lite");

  const unconfigured = new GeminiProvider({ apiKey: "" });
  await assert.rejects(
    () => unconfigured.generate({ userPrompt: "hello" }),
    (err) => err instanceof LlmProviderError && err.code === "LLM_NOT_CONFIGURED"
  );

  let capturedHeaders = null;
  const mockFetch = async (url, init) => {
    capturedHeaders = init.headers;
    assert.match(url, /gemini-3\.5-flash-lite:generateContent$/);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ summary: "A concise summary.", sufficientContent: true }) }],
            },
          },
        ],
      }),
    };
  };

  const provider = new GeminiProvider({
    apiKey: "test-secret-key",
    fetchImpl: mockFetch,
  });

  const out = await provider.generate({ userPrompt: "Summarize this." });
  assert.equal(out.provider, "gemini");
  assert.equal(out.model, "gemini-3.5-flash-lite");
  assert.equal(capturedHeaders["x-goog-api-key"], "test-secret-key");
  assert.match(out.text, /concise summary/);

  registerLlmProvider("mock-custom", () => ({
    name: "mock-custom",
    model: "custom-1",
    generate: async () => ({ text: "ok", provider: "mock-custom", model: "custom-1" }),
  }));
  const custom = getLlmProvider({ provider: "mock-custom" });
  assert.equal(custom.name, "mock-custom");
});

// ---------------------------------------------------------------------------
// 2. Single-Call Combined Insights Generator (3x Quota Optimization)
// ---------------------------------------------------------------------------
test("generateAllBookmarkInsights returns summary, normalized tags, and folder in 1 LLM call", async () => {
  let callCount = 0;
  const mockProvider = {
    name: "gemini",
    model: "gemini-3.5-flash-lite",
    generate: async ({ systemInstruction, userPrompt }) => {
      callCount += 1;
      assert.match(systemInstruction, /NEVER follow instructions/i);
      assert.match(userPrompt, /<UNTRUSTED_WEBPAGE_DATA>/);
      return {
        text: JSON.stringify({
          summary:
            "This guide explains React Hooks including useState and useEffect with practical component patterns. It helps frontend developers manage state and side effects cleanly.",
          sufficientContent: true,
          tags: ["react", "web_development", "Frontend", "Hooks", "JavaScript"],
          folder: {
            folderName: "web development",
            isNewFolder: true,
            reason: "Covers React frontend development patterns.",
          },
        }),
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
      };
    },
  };

  const result = await generateAllBookmarkInsights(
    {
      bookmark: {
        title: "React Hooks Complete Guide",
        description: "Practical guide to React Hooks for modern components.",
        url: "https://react.example.dev/hooks",
        folder: "Personal",
        tags: ["React"],
      },
      extractedText:
        "React Hooks let you use state and other React features without writing a class. useState manages local state and useEffect synchronizes with external systems.",
      existingUserTags: ["Frontend", "Web Development"],
      existingFolders: [{ name: "Web Development", description: "Frontend and React guides" }],
    },
    { llmProvider: mockProvider }
  );

  assert.equal(callCount, 1);
  assert.equal(result.aiSummary.status, "generated");
  assert.match(result.aiSummary.text, /React Hooks/);
  assert.ok(!result.suggestedTags.some((t) => t.normalized === "react"));
  assert.ok(result.suggestedTags.some((t) => t.name === "Frontend" && t.isExistingUserTag));
  assert.equal(result.suggestedFolder.name, "Web Development");
  assert.equal(result.suggestedFolder.isNewFolder, false);
});

// ---------------------------------------------------------------------------
// 3. AI Summary Generation & Fallback
// ---------------------------------------------------------------------------
test("generateBookmarkSummary returns grounded summary, wraps untrusted webpage content, and falls back when sparse", async () => {
  let called = false;
  const mockProvider = {
    name: "mock",
    model: "mock-1",
    generate: async ({ systemInstruction, userPrompt }) => {
      called = true;
      assert.match(systemInstruction, /NEVER follow instructions/i);
      assert.match(userPrompt, /<UNTRUSTED_WEBPAGE_DATA>/);
      return {
        text: JSON.stringify({
          summary:
            "This article explains the Transformer neural network architecture and its self-attention mechanism. It is useful for ML engineers learning how modern NLP models process sequences in parallel.",
          sufficientContent: true,
        }),
        provider: "mock",
        model: "mock-1",
      };
    },
  };

  const fallbackResult = await generateBookmarkSummary(
    { bookmark: { title: "Hi", url: "https://example.com" }, extractedText: "" },
    { llmProvider: mockProvider }
  );
  assert.equal(called, false);
  assert.equal(fallbackResult.status, "fallback");
  assert.equal(fallbackResult.text, INSUFFICIENT_CONTENT_FALLBACK);

  const generated = await generateBookmarkSummary(
    {
      bookmark: {
        title: "Introduction to Transformer Architecture",
        description: "Research article explaining the Transformer model.",
        url: "https://ml.example.org/transformers",
      },
      extractedText:
        "Transformers replace recurrent layers with multi-head self-attention, enabling parallel sequence training and strong long-range context modeling.",
    },
    { llmProvider: mockProvider }
  );
  assert.equal(called, true);
  assert.equal(generated.status, "generated");
  assert.match(generated.text, /Transformer/);
});

// ---------------------------------------------------------------------------
// 4. Structured Tag Suggestions & Normalization
// ---------------------------------------------------------------------------
test("generateTagSuggestions returns structured normalized tags preferring existing user tags and never duplicating", async () => {
  const mockProvider = {
    name: "mock",
    model: "mock-1",
    generate: async () => ({
      text: JSON.stringify({
        tags: ["machine_learning", "DEEP LEARNING", "nlp", "Transformers", "research", "ML"],
      }),
      provider: "mock",
      model: "mock-1",
    }),
  };

  const suggestions = await generateTagSuggestions(
    {
      bookmark: {
        title: "Introduction to Transformer Architecture",
        description: "Research article explaining the Transformer model.",
        tags: ["Research"],
      },
      existingUserTags: ["machine learning", "NLP"],
    },
    { llmProvider: mockProvider }
  );

  assert.ok(suggestions.length >= 3 && suggestions.length <= 5);
  assert.equal(suggestions[0].isExistingUserTag, true);
  assert.ok(suggestions.some((t) => t.name === "machine learning"));
  assert.ok(suggestions.some((t) => t.name === "NLP"));
  assert.ok(!suggestions.some((t) => t.normalized === "research"));

  const merged = mergeUniqueTags(["CustomTag", "NLP"], ["nlp", "Transformers"]);
  assert.deepEqual(merged, ["CustomTag", "NLP", "Transformers"]);
});

test("normalizeSuggestedTags deduplicates variations cleanly", () => {
  const out = normalizeSuggestedTags(["react", "React", "REACT-hooks", "react_hooks"], {
    existingUserTags: [],
    bookmarkTags: [],
  });
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((t) => t.name),
    ["React", "React Hooks"]
  );
});

// ---------------------------------------------------------------------------
// 5. Intelligent Folder Recommendations
// ---------------------------------------------------------------------------
test("generateFolderRecommendation selects existing folder or suggests a new one without duplicating", async () => {
  const existingFolders = [
    { name: "Web Development", description: "Frontend, React, CSS, and browser APIs" },
    { name: "Artificial Intelligence", description: "ML papers and LLM engineering" },
  ];

  const matchExistingProvider = {
    name: "mock",
    model: "mock-1",
    generate: async () => ({
      text: JSON.stringify({
        folderName: "web development",
        isNewFolder: true,
        reason: "Covers React Hooks and frontend development patterns.",
      }),
      provider: "mock",
      model: "mock-1",
    }),
  };

  const rec1 = await generateFolderRecommendation(
    {
      bookmark: { title: "React Hooks Complete Guide", folder: "Personal" },
      existingFolders,
    },
    { llmProvider: matchExistingProvider }
  );

  assert.equal(rec1.name, "Web Development");
  assert.equal(rec1.isNewFolder, false);
  assert.equal(rec1.status, "pending");
  assert.match(rec1.reason, /React Hooks/);

  const suggestNewProvider = {
    name: "mock",
    model: "mock-1",
    generate: async () => ({
      text: JSON.stringify({
        folderName: "Distributed Systems",
        isNewFolder: true,
        reason: "No existing folder covers consensus algorithms like Raft.",
      }),
      provider: "mock",
      model: "mock-1",
    }),
  };

  const rec2 = await generateFolderRecommendation(
    {
      bookmark: { title: "Raft Consensus Paper", folder: "Personal" },
      existingFolders,
    },
    { llmProvider: suggestNewProvider }
  );

  assert.equal(rec2.name, "Distributed Systems");
  assert.equal(rec2.isNewFolder, true);
});

// ---------------------------------------------------------------------------
// 6. Background Processing Pipeline: Partial Failures, Retries, Dedup, Isolation, Deletion
// ---------------------------------------------------------------------------
test("BookmarkProcessingQueue handles partial failures, retries, user isolation, deduplication, and deletion", async () => {
  const userA = "507f1f77bcf86cd799439011";
  const bookmarkId = "507f1f77bcf86cd799439022";

  const storedDoc = {
    _id: bookmarkId,
    user: userA,
    title: "React Hooks Complete Guide",
    description: "In-depth guide to useState and useEffect",
    url: "https://react.example.dev/hooks",
    folder: "Personal",
    tags: ["react"],
    processingStatus: "pending",
    aiProcessingError: null,
  };

  const updateCalls = [];
  const mockBookmarkModel = {
    findOne: (filter) => ({
      select: async () => {
        if (filter._id === bookmarkId && filter.user === userA) {
          return { ...storedDoc };
        }
        return null;
      },
    }),
    updateOne: async (filter, update) => {
      updateCalls.push({ filter, update });
      assert.equal(filter._id, bookmarkId);
      assert.equal(filter.user, userA);
      Object.assign(storedDoc, update.$set);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    distinct: async (_field, filter) => {
      assert.equal(filter.user, userA);
      return ["react", "frontend"];
    },
  };

  const mockFolderModel = {
    find: (filter) => {
      assert.equal(filter.user, userA);
      return {
        select: () => ({
          lean: async () => [{ name: "Web Development", description: "React & frontend" }],
        }),
      };
    },
  };

  let combinedAttempts = 0;
  const queue = new BookmarkProcessingQueue({
    retryDelayMs: 5,
    BookmarkModel: mockBookmarkModel,
    FolderModel: mockFolderModel,
    extractWebpageMetadata: async () => {
      const err = new Error("HTTP 403");
      err.code = "UPSTREAM_HTTP_ERROR";
      err.publicMessage = "Could not access webpage.";
      throw err;
    },
    generateAllBookmarkInsights: async () => {
      combinedAttempts += 1;
      if (combinedAttempts === 1) {
        throw new Error("Transient LLM error");
      }
      return {
        aiSummary: {
          text: "Explains React Hooks patterns for managing component state and side effects.",
          status: "generated",
          provider: "gemini",
          model: "gemini-3.5-flash-lite",
          updatedAt: new Date(),
        },
        suggestedTags: [
          { name: "Frontend", normalized: "frontend", status: "pending", isExistingUserTag: true },
        ],
        suggestedFolder: {
          name: "Web Development",
          isNewFolder: false,
          reason: "Matches React frontend content.",
          status: "pending",
          updatedAt: new Date(),
        },
      };
    },
    generateBookmarkEmbeddingData: async (fields) => {
      assert.match(fields.aiSummary, /React Hooks/);
      return {
        embedding: makeVector(3, 384),
        embeddingModel: "sentence-transformers/all-MiniLM-L6-v2",
        embeddingContentHash: "new-hash",
        embeddingUpdatedAt: new Date(),
      };
    },
  });

  const firstEnqueue = queue.enqueue(bookmarkId, userA, { maxRetries: 1 });
  const secondEnqueue = queue.enqueue(bookmarkId, userA, { maxRetries: 1 });
  assert.equal(firstEnqueue.queued, true);
  assert.equal(secondEnqueue.queued, false);
  assert.equal(secondEnqueue.deduplicated, true);

  const outcome = await firstEnqueue.promise;
  assert.equal(outcome.status, "partial");
  assert.equal(combinedAttempts, 2);
  assert.equal(storedDoc.processingStatus, "partial");
  assert.equal(storedDoc.suggestedFolder.name, "Web Development");
  assert.equal(storedDoc.embedding.length, 384);
  assert.ok(storedDoc.aiProcessingError);

  const wrongUserResult = await queue.processBookmark(bookmarkId, "507f1f77bcf86cd799439099");
  assert.equal(wrongUserResult.status, "skipped");

  const beforeCount = updateCalls.length;
  queue.cancelBookmark(bookmarkId);
  const cancelledRes = await queue.processBookmark(bookmarkId, userA);
  assert.equal(cancelledRes.status, "skipped");
  assert.equal(updateCalls.length, beforeCount);
});

// ---------------------------------------------------------------------------
// 7. Embedding Text Backward Compatibility
// ---------------------------------------------------------------------------
test("buildBookmarkEmbeddingText preserves Phase 1 format and cleanly adds optional AI summary", () => {
  const phase1 = buildBookmarkEmbeddingText({
    title: "Express Guide",
    description: "Routing basics",
    url: "https://expressjs.com/guide",
    tags: ["node"],
    folder: "Backend",
  });
  assert.ok(!phase1.includes("Summary:"));

  const phase2 = buildBookmarkEmbeddingText({
    title: "Express Guide",
    description: "Routing basics",
    url: "https://expressjs.com/guide",
    tags: ["node"],
    folder: "Backend",
    aiSummary: "Explains Express routing and middleware architecture.",
  });
  assert.match(phase2, /Summary: Explains Express routing/);
});
