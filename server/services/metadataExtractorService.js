const {
  UrlSecurityError,
  validateExternalUrl,
  normalizeUrlForCache,
} = require("../utils/urlSecurity");
const { extractWebpageData } = require("../utils/htmlExtractor");
const { defaultMetadataCache } = require("./metadataCache");
const logger = require("../utils/logger");

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 1_500_000; // 1.5 MB
const DEFAULT_MAX_REDIRECTS = 5;

class MetadataExtractionError extends Error {
  constructor(message, { code = "EXTRACTION_FAILED", statusCode = 502, publicMessage } = {}) {
    super(message);
    this.name = "MetadataExtractionError";
    this.code = code;
    this.statusCode = statusCode;
    this.publicMessage = publicMessage || "Unable to extract metadata from the webpage.";
  }
}

function getExtractorConfig() {
  return {
    timeoutMs: Math.max(
      1000,
      parseInt(process.env.METADATA_FETCH_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) ||
        DEFAULT_TIMEOUT_MS
    ),
    maxBytes: Math.max(
      10_000,
      parseInt(process.env.METADATA_MAX_RESPONSE_BYTES || String(DEFAULT_MAX_BYTES), 10) ||
        DEFAULT_MAX_BYTES
    ),
    maxRedirects: Math.max(
      0,
      Math.min(
        10,
        parseInt(process.env.METADATA_MAX_REDIRECTS || String(DEFAULT_MAX_REDIRECTS), 10) ||
          DEFAULT_MAX_REDIRECTS
      )
    ),
    userAgent:
      process.env.METADATA_USER_AGENT ||
      "NestLinkBot/2.0 (+https://nestlink-indol.vercel.app; Bookmark Metadata Extractor)",
  };
}

async function readResponseWithByteLimit(response, maxBytes) {
  const declaredLen = parseInt(response.headers?.get?.("content-length") || "", 10);
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    throw new MetadataExtractionError(
      `Response Content-Length (${declaredLen}) exceeds max limit (${maxBytes} bytes).`,
      {
        code: "RESPONSE_TOO_LARGE",
        statusCode: 413,
        publicMessage: "Webpage response exceeded the maximum allowed size.",
      }
    );
  }

  // Prefer streaming reader so huge responses abort before buffering into memory
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : Buffer.from(value);
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new MetadataExtractionError(
            `Response body exceeded max limit (${maxBytes} bytes).`,
            {
              code: "RESPONSE_TOO_LARGE",
              statusCode: 413,
              publicMessage: "Webpage response exceeded the maximum allowed size.",
            }
          );
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }

    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  }

  // Fallback for mocked responses in tests that only provide .text()
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new MetadataExtractionError(
      `Response body exceeded max limit (${maxBytes} bytes).`,
      {
        code: "RESPONSE_TOO_LARGE",
        statusCode: 413,
        publicMessage: "Webpage response exceeded the maximum allowed size.",
      }
    );
  }
  return text;
}

/**
 * Fetches a webpage safely with SSRF validation on initial URL and every redirect hop,
 * strict timeout, response byte limit, and HTML metadata/content extraction.
 */
async function extractWebpageMetadata(
  rawUrl,
  {
    bypassCache = false,
    cache = defaultMetadataCache,
    fetchImpl = global.fetch,
    lookupImpl,
    timeoutMs,
    maxBytes,
    maxRedirects,
  } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new MetadataExtractionError("Fetch API is unavailable in this runtime.", {
      code: "RUNTIME_ERROR",
      statusCode: 500,
    });
  }

  const config = getExtractorConfig();
  const effectiveTimeoutMs = timeoutMs ?? config.timeoutMs;
  const effectiveMaxBytes = maxBytes ?? config.maxBytes;
  const effectiveMaxRedirects = maxRedirects ?? config.maxRedirects;

  // Step 1: Validate initial URL & DNS resolution before checking cache or making requests
  const initialValidation = await validateExternalUrl(rawUrl, { lookupImpl });
  const cacheKey = normalizeUrlForCache(initialValidation.url);

  if (!bypassCache && cache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.info("metadata.cache_hit", { domain: cached.metadata?.domain });
      return { ...cached, fromCache: true };
    }
  }

  let currentUrl = initialValidation.url;
  let redirectCount = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    let response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": config.userAgent,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err?.name === "AbortError") {
        throw new MetadataExtractionError(`Request timed out after ${effectiveTimeoutMs}ms.`, {
          code: "FETCH_TIMEOUT",
          statusCode: 504,
          publicMessage: "The target webpage took too long to respond.",
        });
      }
      throw new MetadataExtractionError(`Network error fetching webpage: ${err?.message || "unknown"}`, {
        code: "FETCH_NETWORK_ERROR",
        statusCode: 502,
        publicMessage: "Could not reach the target webpage.",
      });
    } finally {
      clearTimeout(timer);
    }

    // Handle 3xx redirects manually and validate every hop against SSRF rules
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      if (!location) {
        throw new MetadataExtractionError("Redirect response missing Location header.", {
          code: "INVALID_REDIRECT",
          statusCode: 502,
          publicMessage: "The webpage returned an invalid redirect.",
        });
      }

      redirectCount += 1;
      if (redirectCount > effectiveMaxRedirects) {
        throw new MetadataExtractionError(`Exceeded maximum redirects (${effectiveMaxRedirects}).`, {
          code: "TOO_MANY_REDIRECTS",
          statusCode: 502,
          publicMessage: "The webpage redirected too many times.",
        });
      }

      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        throw new MetadataExtractionError("Invalid redirect target URL.", {
          code: "INVALID_REDIRECT",
          statusCode: 502,
          publicMessage: "The webpage redirected to an invalid URL.",
        });
      }

      // Re-validate redirect target (protocol, hostname, DNS, private IPs)
      const hopValidation = await validateExternalUrl(nextUrl, { lookupImpl });
      currentUrl = hopValidation.url;
      continue;
    }

    if (!response.ok) {
      throw new MetadataExtractionError(`Webpage returned HTTP ${response.status}.`, {
        code: "UPSTREAM_HTTP_ERROR",
        statusCode: 502,
        publicMessage: `The target webpage could not be accessed (HTTP ${response.status}).`,
      });
    }

    const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      throw new MetadataExtractionError(`Unsupported content-type: ${contentType}`, {
        code: "UNSUPPORTED_CONTENT_TYPE",
        statusCode: 422,
        publicMessage: "Only HTML webpages are supported for automatic metadata extraction.",
      });
    }

    const html = await readResponseWithByteLimit(response, effectiveMaxBytes);
    const extracted = extractWebpageData(html, currentUrl);

    const result = {
      metadata: extracted.metadata,
      extractedText: extracted.extractedText,
      finalUrl: currentUrl,
      fromCache: false,
    };

    if (cache) {
      cache.set(cacheKey, result);
      const finalCacheKey = normalizeUrlForCache(currentUrl);
      if (finalCacheKey !== cacheKey) {
        cache.set(finalCacheKey, result);
      }
    }

    logger.info("metadata.extracted", {
      domain: extracted.metadata.domain,
      textLength: extracted.extractedText.length,
      redirects: redirectCount,
    });

    return result;
  }
}

module.exports = {
  MetadataExtractionError,
  UrlSecurityError,
  extractWebpageMetadata,
  readResponseWithByteLimit,
};
