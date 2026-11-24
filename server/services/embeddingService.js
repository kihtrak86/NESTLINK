const {
  DEFAULT_EMBEDDING_DIMENSIONS,
  normalizeText,
  buildBookmarkEmbeddingText,
  computeContentHash,
  isValidEmbedding,
} = require("../utils/embeddingText");

class EmbeddingServiceError extends Error {
  constructor(message, { statusCode = 503, publicMessage = "Semantic search service is temporarily unavailable." } = {}) {
    super(message);
    this.name = "EmbeddingServiceError";
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

function getConfig() {
  return {
    baseUrl: (process.env.EMBEDDING_SERVICE_URL || "http://localhost:8000").replace(/\/+$/, ""),
    timeoutMs: Math.max(parseInt(process.env.EMBEDDING_TIMEOUT_MS || "15000", 10) || 15000, 1000),
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || String(DEFAULT_EMBEDDING_DIMENSIONS), 10) || 384,
    apiKey: (process.env.EMBEDDING_API_KEY || "").trim(),
    modelName: process.env.EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2",
  };
}

async function requestEmbeddingService(path, payload, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new EmbeddingServiceError("Global fetch is not available in this Node.js runtime.");
  }

  const config = getConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }

  try {
    const response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = data?.detail || `HTTP ${response.status}`;
      throw new EmbeddingServiceError(`Embedding service responded with ${response.status}: ${detail}`, {
        statusCode: response.status >= 400 && response.status < 500 ? 400 : 503,
        publicMessage:
          response.status >= 400 && response.status < 500
            ? "Invalid search query."
            : "Semantic search service is temporarily unavailable.",
      });
    }

    return { data, config };
  } catch (err) {
    if (err instanceof EmbeddingServiceError) {
      throw err;
    }
    if (err?.name === "AbortError") {
      throw new EmbeddingServiceError(`Embedding service request timed out after ${config.timeoutMs}ms.`, {
        statusCode: 504,
        publicMessage: "Semantic search timed out. Please try again.",
      });
    }
    throw new EmbeddingServiceError(`Embedding service request failed: ${err?.message || "unknown error"}`, {
      statusCode: 503,
      publicMessage: "Semantic search service is temporarily unavailable.",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generates a single normalized 384-dim embedding for arbitrary text or search query.
 */
async function generateEmbedding(text, { fetchImpl = global.fetch } = {}) {
  const cleaned = normalizeText(text);
  if (!cleaned) {
    throw new EmbeddingServiceError("Cannot generate embedding for empty text.", {
      statusCode: 400,
      publicMessage: "Search query cannot be empty.",
    });
  }

  const { data, config } = await requestEmbeddingService("/embed", { text: cleaned }, fetchImpl);

  if (!data || !isValidEmbedding(data.embedding, config.dimensions)) {
    throw new EmbeddingServiceError(
      `Embedding service returned an invalid vector (expected ${config.dimensions} finite floats).`
    );
  }

  return {
    embedding: data.embedding,
    model: data.model || config.modelName,
    dimensions: data.dimensions || data.embedding.length,
  };
}

/**
 * Generates embeddings for a batch of texts in a single HTTP request.
 */
async function generateEmbeddingsBatch(texts, { fetchImpl = global.fetch } = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return { embeddings: [], model: getConfig().modelName, dimensions: getConfig().dimensions };
  }

  const cleanedTexts = texts.map((t) => normalizeText(t));
  if (cleanedTexts.some((t) => !t)) {
    throw new EmbeddingServiceError("Batch contains an empty text entry.", {
      statusCode: 400,
      publicMessage: "All texts in embedding batch must be non-empty.",
    });
  }

  const { data, config } = await requestEmbeddingService(
    "/embed/batch",
    { texts: cleanedTexts },
    fetchImpl
  );

  if (
    !data ||
    !Array.isArray(data.embeddings) ||
    data.embeddings.length !== cleanedTexts.length ||
    !data.embeddings.every((vec) => isValidEmbedding(vec, config.dimensions))
  ) {
    throw new EmbeddingServiceError("Embedding service returned an invalid batch response.");
  }

  return {
    embeddings: data.embeddings,
    model: data.model || config.modelName,
    dimensions: data.dimensions || config.dimensions,
  };
}

/**
 * Builds canonical bookmark text, hashes it, and fetches its embedding.
 */
async function generateBookmarkEmbeddingData(bookmarkFields, options = {}) {
  const text = buildBookmarkEmbeddingText(bookmarkFields);
  if (!text) {
    return null;
  }

  const contentHash = computeContentHash(text);
  const { embedding, model } = await generateEmbedding(text, options);

  return {
    embedding,
    embeddingModel: model,
    embeddingContentHash: contentHash,
    embeddingUpdatedAt: new Date(),
  };
}

module.exports = {
  EmbeddingServiceError,
  generateEmbedding,
  generateEmbeddingsBatch,
  generateBookmarkEmbeddingData,
};
