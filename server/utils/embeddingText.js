const crypto = require("crypto");

const DEFAULT_MAX_TEXT_LENGTH = 2000;
const DEFAULT_EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || "384", 10);

/**
 * Consistent text normalization matching the Python embedding service.
 */
function normalizeText(value, maxLength = DEFAULT_MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  const cleaned = value
    .normalize("NFC")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (maxLength > 0 && cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength).trimEnd();
  }
  return cleaned;
}

/**
 * Extracts readable semantic tokens from a URL (hostname + meaningful path segments)
 * while stripping protocol boilerplate and query parameters.
 */
function extractUrlContext(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.replace(/^www\./i, "");
    const pathTokens = decodeURIComponent(parsed.pathname || "")
      .replace(/[-_/+.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalizeText(pathTokens ? `${host} ${pathTokens}` : host, 300);
  } catch {
    return "";
  }
}

/**
 * Builds the canonical text representation of a bookmark for embedding generation.
 * Preserves exact Phase 1 output when aiSummary is omitted, and enriches embeddings
 * cleanly when an AI-generated summary is available.
 */
function buildBookmarkEmbeddingText({
  title = "",
  description = "",
  url = "",
  tags = [],
  folder = "",
  aiSummary = "",
} = {}) {
  const parts = [];

  const cleanTitle = normalizeText(title, 300);
  if (cleanTitle) {
    parts.push(`Title: ${cleanTitle}`);
  }

  const cleanDescription = normalizeText(description, 1000);
  if (cleanDescription) {
    parts.push(`Description: ${cleanDescription}`);
  }

  const cleanSummary = normalizeText(aiSummary, 600);
  if (cleanSummary) {
    parts.push(`Summary: ${cleanSummary}`);
  }

  const normalizedTags = Array.isArray(tags)
    ? tags.map((t) => normalizeText(String(t), 60)).filter(Boolean)
    : [];
  if (normalizedTags.length > 0) {
    parts.push(`Tags: ${normalizedTags.join(", ")}`);
  }

  const cleanFolder = normalizeText(folder, 100);
  if (cleanFolder) {
    parts.push(`Folder: ${cleanFolder}`);
  }

  const urlContext = extractUrlContext(url);
  if (urlContext) {
    parts.push(`Source: ${urlContext}`);
  }

  return normalizeText(parts.join(". "));
}

/**
 * Computes a deterministic SHA-256 hash of normalized embedding input text
 * so unchanged bookmarks skip redundant embedding regeneration.
 */
function computeContentHash(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

/**
 * Validates that an embedding is a finite numeric array of the expected dimension.
 */
function isValidEmbedding(embedding, expectedDimensions = DEFAULT_EMBEDDING_DIMENSIONS) {
  if (!Array.isArray(embedding) || embedding.length !== expectedDimensions) {
    return false;
  }
  for (let i = 0; i < embedding.length; i += 1) {
    if (typeof embedding[i] !== "number" || !Number.isFinite(embedding[i])) {
      return false;
    }
  }
  return true;
}

module.exports = {
  DEFAULT_EMBEDDING_DIMENSIONS,
  normalizeText,
  extractUrlContext,
  buildBookmarkEmbeddingText,
  computeContentHash,
  isValidEmbedding,
};
