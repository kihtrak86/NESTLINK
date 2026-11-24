const test = require("node:test");
const assert = require("node:assert/strict");

const {
  UrlSecurityError,
  isBlockedIpAddress,
  validateUrlSyntax,
  validateExternalUrl,
  normalizeUrlForCache,
} = require("../utils/urlSecurity");
const { extractWebpageData, MAX_TEXT_PREVIEW_CHARS } = require("../utils/htmlExtractor");
const { MetadataCache } = require("../services/metadataCache");
const {
  MetadataExtractionError,
  extractWebpageMetadata,
} = require("../services/metadataExtractorService");
const { createRateLimiter } = require("../middleware/rateLimit");

// ---------------------------------------------------------------------------
// 1. URL Validation & SSRF Protection
// ---------------------------------------------------------------------------
test("validateUrlSyntax accepts valid HTTP/HTTPS URLs and rejects invalid or non-HTTP schemes", () => {
  const valid = validateUrlSyntax("https://example.com/articles/transformers");
  assert.equal(valid.hostname, "example.com");

  const invalidUrls = [
    "",
    "not-a-url",
    "ftp://example.com/file.txt",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://user:pass@example.com/secret",
    `https://example.com/${"a".repeat(2100)}`,
  ];

  for (const bad of invalidUrls) {
    assert.throws(() => validateUrlSyntax(bad), UrlSecurityError, `Expected rejection for ${bad}`);
  }
});

test("SSRF protection blocks localhost, private IPv4/IPv6, link-local, cloud metadata, and internal hostnames", () => {
  const blockedUrls = [
    "http://localhost:5000/api/health",
    "http://sub.localhost/test",
    "http://service.internal/admin",
    "http://redis/keys",
    "http://127.0.0.1:8000/embed",
    "http://10.0.0.5/internal",
    "http://172.16.0.1/router",
    "http://192.168.1.10/dashboard",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/cgnat",
    "http://[::1]:5000/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
  ];

  for (const url of blockedUrls) {
    assert.throws(
      () => validateUrlSyntax(url),
      (err) => err instanceof UrlSecurityError && err.code === "SSRF_BLOCKED",
      `Expected SSRF block for ${url}`
    );
  }

  assert.equal(isBlockedIpAddress("93.184.216.34"), false);
  assert.equal(isBlockedIpAddress("2606:2800:220:1:248:1893:25c8:1946"), false);
});

test("validateExternalUrl blocks domains whose DNS resolves to private/internal IPs", async () => {
  const privateLookup = async () => [{ address: "10.0.1.25", family: 4 }];
  await assert.rejects(
    () => validateExternalUrl("https://evil-rebind.example.com", { lookupImpl: privateLookup }),
    (err) => err instanceof UrlSecurityError && err.code === "SSRF_BLOCKED"
  );

  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const ok = await validateExternalUrl("https://example.com/guide", { lookupImpl: publicLookup });
  assert.equal(ok.url, "https://example.com/guide");
  assert.deepEqual(ok.addresses, ["93.184.216.34"]);
});

// ---------------------------------------------------------------------------
// 2. HTML Metadata & Readable Content Extraction
// ---------------------------------------------------------------------------
test("extractWebpageData extracts Open Graph, meta fallbacks, JSON-LD, and strips scripts/nav/ads", () => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>Fallback Title</title>
        <meta name="description" content="Fallback meta description" />
        <meta property="og:title" content="Introduction to Transformer Architecture" />
        <meta property="og:description" content="Comprehensive guide explaining attention and Transformers." />
        <meta property="og:image" content="/images/transformer-diagram.png" />
        <meta name="author" content="Jane Researcher" />
        <meta property="article:published_time" content="2025-05-12T10:00:00Z" />
        <link rel="canonical" href="https://mlblog.example.org/transformers" />
        <link rel="icon" href="/assets/favicon.svg" />
        <script>console.log("should never appear in text");</script>
        <style>.hidden { display: none; }</style>
      </head>
      <body>
        <header><nav>Home | Pricing | Login</nav></header>
        <article>
          <h1>Introduction to Transformer Architecture</h1>
          <p>The Transformer architecture relies entirely on self-attention mechanisms to model long-range dependencies in sequences without recurrence.</p>
          <p>It powers modern large language models, machine translation, and semantic search systems across production NLP applications.</p>
        </article>
        <div class="cookie-banner">Accept all cookies</div>
        <footer>Copyright 2025 Example Corp</footer>
      </body>
    </html>
  `;

  const { metadata, extractedText } = extractWebpageData(
    html,
    "https://mlblog.example.org/transformers?utm_source=test"
  );

  assert.equal(metadata.title, "Introduction to Transformer Architecture");
  assert.equal(metadata.ogTitle, "Introduction to Transformer Architecture");
  assert.equal(metadata.description, "Comprehensive guide explaining attention and Transformers.");
  assert.equal(metadata.ogImage, "https://mlblog.example.org/images/transformer-diagram.png");
  assert.equal(metadata.favicon, "https://mlblog.example.org/assets/favicon.svg");
  assert.equal(metadata.canonicalUrl, "https://mlblog.example.org/transformers");
  assert.equal(metadata.domain, "mlblog.example.org");
  assert.equal(metadata.author, "Jane Researcher");
  assert.equal(metadata.publishedAt, "2025-05-12T10:00:00.000Z");

  assert.match(extractedText, /self-attention mechanisms/);
  assert.ok(!extractedText.includes("should never appear"));
  assert.ok(!extractedText.includes("Pricing | Login"));
  assert.ok(!extractedText.includes("Copyright 2025"));
  assert.ok(metadata.textPreview.length <= MAX_TEXT_PREVIEW_CHARS);
});

// ---------------------------------------------------------------------------
// 3. Metadata Extractor Service: Redirect SSRF, Size Limits, Timeouts, Caching
// ---------------------------------------------------------------------------
test("extractWebpageMetadata validates every redirect hop and blocks SSRF redirects", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

  const ssrfRedirectFetch = async () => ({
    status: 302,
    ok: false,
    headers: new Headers({ location: "http://169.254.169.254/latest/meta-data/" }),
  });

  await assert.rejects(
    () =>
      extractWebpageMetadata("https://example.com/start", {
        fetchImpl: ssrfRedirectFetch,
        lookupImpl: publicLookup,
        cache: new MetadataCache(),
      }),
    (err) => err instanceof UrlSecurityError && err.code === "SSRF_BLOCKED"
  );
});

test("extractWebpageMetadata enforces byte size limits, timeouts, HTTP errors, and caching", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const cache = new MetadataCache({ maxEntries: 10, ttlMs: 60_000 });

  // Case A: Response exceeds maxBytes
  const hugeFetch = async () => ({
    status: 200,
    ok: true,
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => `<html><body>${"x".repeat(50_000)}</body></html>`,
  });

  await assert.rejects(
    () =>
      extractWebpageMetadata("https://example.com/huge", {
        fetchImpl: hugeFetch,
        lookupImpl: publicLookup,
        cache,
        maxBytes: 10_000,
      }),
    (err) => err instanceof MetadataExtractionError && err.code === "RESPONSE_TOO_LARGE"
  );

  // Case B: Upstream HTTP 404 handled gracefully
  const notFoundFetch = async () => ({
    status: 404,
    ok: false,
    headers: new Headers({ "content-type": "text/html" }),
  });

  await assert.rejects(
    () =>
      extractWebpageMetadata("https://example.com/missing", {
        fetchImpl: notFoundFetch,
        lookupImpl: publicLookup,
        cache,
      }),
    (err) => err instanceof MetadataExtractionError && err.code === "UPSTREAM_HTTP_ERROR"
  );

  // Case C: Successful fetch is cached and avoids duplicate network calls
  let fetchCount = 0;
  const okFetch = async () => {
    fetchCount += 1;
    return {
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      text: async () => "<html><head><title>Cached Page</title></head><body><p>Hello world content.</p></body></html>",
    };
  };

  const first = await extractWebpageMetadata("https://example.com/cached#section1", {
    fetchImpl: okFetch,
    lookupImpl: publicLookup,
    cache,
  });
  const second = await extractWebpageMetadata("https://example.com/cached#section2", {
    fetchImpl: okFetch,
    lookupImpl: publicLookup,
    cache,
  });

  assert.equal(fetchCount, 1);
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(second.metadata.title, "Cached Page");
  assert.equal(normalizeUrlForCache("https://EXAMPLE.com:443/a#top"), "https://example.com/a");
});

// ---------------------------------------------------------------------------
// 4. Per-User Rate Limiter Middleware
// ---------------------------------------------------------------------------
test("createRateLimiter enforces per-user request quotas and isolates users", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });

  const callLimiter = (userId) => {
    let nextCalled = false;
    let statusCode = 200;
    let body = null;
    const headers = {};
    limiter(
      { user: { _id: userId } },
      {
        setHeader: (k, v) => {
          headers[k] = v;
        },
        status(code) {
          statusCode = code;
          return this;
        },
        json(payload) {
          body = payload;
          return this;
        },
      },
      () => {
        nextCalled = true;
      }
    );
    return { nextCalled, statusCode, body, headers };
  };

  assert.equal(callLimiter("userA").nextCalled, true);
  assert.equal(callLimiter("userA").nextCalled, true);

  const blocked = callLimiter("userA");
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers["Retry-After"]);

  // User B has an independent quota
  assert.equal(callLimiter("userB").nextCalled, true);
});
