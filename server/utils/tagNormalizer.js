const MAX_TAG_LENGTH = 40;

const ACRONYMS = new Set([
  "AI",
  "API",
  "APIs",
  "AWS",
  "CSS",
  "DB",
  "DevOps",
  "GCP",
  "GitHub",
  "GraphQL",
  "HTML",
  "HTTP",
  "HTTPS",
  "IoT",
  "JS",
  "JSON",
  "JWT",
  "LLM",
  "LLMs",
  "ML",
  "MongoDB",
  "NLP",
  "Node.js",
  "OAuth",
  "OpenAI",
  "PostgreSQL",
  "RAG",
  "React",
  "REST",
  "SaaS",
  "SDK",
  "SEO",
  "SQL",
  "SSRF",
  "TS",
  "TypeScript",
  "UI",
  "UX",
  "WebAssembly",
]);

const ACRONYM_MAP = new Map(Array.from(ACRONYMS).map((word) => [word.toLowerCase(), word]));

function normalizeTagKey(tag) {
  return String(tag || "")
    .replace(/^#+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s.+#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function formatTagDisplay(tag) {
  const cleaned = String(tag || "")
    .replace(/^#+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s.+#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const words = cleaned.split(" ").map((word) => {
    const exactAcronym = ACRONYM_MAP.get(word.toLowerCase());
    if (exactAcronym) return exactAcronym;
    if (word.length <= 1) return word.toUpperCase();
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  });

  const formatted = words.join(" ").trim();
  return formatted.length > MAX_TAG_LENGTH ? formatted.slice(0, MAX_TAG_LENGTH).trim() : formatted;
}

/**
 * Normalizes AI-suggested tags, prefers existing user tags when matching,
 * deduplicates, and excludes tags already present on the bookmark.
 */
function normalizeSuggestedTags(rawSuggestions, { existingUserTags = [], bookmarkTags = [], min = 3, max = 5 } = {}) {
  const userTagMap = new Map();
  for (const tag of existingUserTags) {
    const key = normalizeTagKey(tag);
    if (key && !userTagMap.has(key)) {
      userTagMap.set(key, String(tag).trim());
    }
  }

  const bookmarkTagKeys = new Set(bookmarkTags.map(normalizeTagKey).filter(Boolean));
  const seen = new Set();
  const normalized = [];

  for (const raw of Array.isArray(rawSuggestions) ? rawSuggestions : []) {
    const candidate = typeof raw === "string" ? raw : raw?.name;
    const key = normalizeTagKey(candidate);
    if (!key || seen.has(key) || bookmarkTagKeys.has(key)) {
      continue;
    }

    seen.add(key);
    const existingMatch = userTagMap.get(key);
    const displayName = existingMatch || formatTagDisplay(candidate);
    if (!displayName) continue;

    normalized.push({
      name: displayName,
      normalized: key,
      status: "pending",
      isExistingUserTag: Boolean(existingMatch),
    });

    if (normalized.length >= max) {
      break;
    }
  }

  // Sort existing user tags first while keeping relative relevance order
  normalized.sort((a, b) => Number(b.isExistingUserTag) - Number(a.isExistingUserTag));

  return normalized.slice(0, Math.max(max, min));
}

/**
 * Merges accepted tags into existing bookmark tags without duplicating or overwriting user tags.
 */
function mergeUniqueTags(existingTags = [], tagsToAdd = []) {
  const result = [];
  const seen = new Set();

  for (const tag of [...existingTags, ...tagsToAdd]) {
    const trimmed = String(tag || "").trim();
    const key = normalizeTagKey(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

module.exports = {
  normalizeTagKey,
  formatTagDisplay,
  normalizeSuggestedTags,
  mergeUniqueTags,
};
