const MAX_TEXT_PREVIEW_CHARS = 4000;
const MAX_ANALYSIS_TEXT_CHARS = 8000;
const MAX_TITLE_CHARS = 300;
const MAX_DESCRIPTION_CHARS = 1000;

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: "...",
  copy: "©",
};

function decodeHtmlEntities(input) {
  if (typeof input !== "string" || !input) return "";
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function cleanText(value, maxLength = 0) {
  if (typeof value !== "string") return "";
  const normalized = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  if (maxLength > 0 && normalized.length > maxLength) {
    return normalized.slice(0, maxLength).trimEnd();
  }
  return normalized;
}

function parseAttributes(tagString) {
  const attrs = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRegex.exec(tagString)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = decodeHtmlEntities(val).trim();
  }
  return attrs;
}

function resolveSafeHttpUrl(candidate, baseUrl) {
  if (!candidate || typeof candidate !== "string") return "";
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) {
    return "";
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return "";
    }
    return resolved.toString();
  } catch {
    return "";
  }
}

function extractMetaMap(html) {
  const byName = new Map();
  const byProperty = new Map();
  const metaRegex = /<meta\b([^>]*?)\/?>/gi;
  let match;

  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = parseAttributes(match[1]);
    const content = cleanText(attrs.content || "", MAX_DESCRIPTION_CHARS);
    if (!content) continue;

    if (attrs.property) {
      const prop = attrs.property.toLowerCase();
      if (!byProperty.has(prop)) byProperty.set(prop, content);
    }
    if (attrs.name) {
      const name = attrs.name.toLowerCase();
      if (!byName.has(name)) byName.set(name, content);
    }
    if (attrs.itemprop) {
      const itemprop = attrs.itemprop.toLowerCase();
      if (!byName.has(itemprop)) byName.set(itemprop, content);
    }
  }

  return { byName, byProperty };
}

function extractLinks(html, baseUrl) {
  let canonicalUrl = "";
  let favicon = "";
  const linkRegex = /<link\b([^>]*?)\/?>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = parseAttributes(match[1]);
    const rel = (attrs.rel || "").toLowerCase();
    const href = attrs.href || "";
    if (!rel || !href) continue;

    const relTokens = rel.split(/\s+/);
    if (!canonicalUrl && relTokens.includes("canonical")) {
      canonicalUrl = resolveSafeHttpUrl(href, baseUrl);
    }
    if (
      !favicon &&
      (relTokens.includes("icon") ||
        relTokens.includes("apple-touch-icon") ||
        rel === "shortcut icon")
    ) {
      favicon = resolveSafeHttpUrl(href, baseUrl);
    }
  }

  if (!favicon) {
    try {
      const parsed = new URL(baseUrl);
      favicon = `${parsed.protocol}//${parsed.host}/favicon.ico`;
    } catch {
      favicon = "";
    }
  }

  return { canonicalUrl, favicon };
}

function extractJsonLdMetadata(html) {
  const result = { author: "", publishedAt: "", description: "", title: "" };
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw || raw.length > 100000) continue;
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed["@graph"])
          ? parsed["@graph"]
          : [parsed];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (!result.title && typeof item.headline === "string") {
          result.title = cleanText(item.headline, MAX_TITLE_CHARS);
        }
        if (!result.description && typeof item.description === "string") {
          result.description = cleanText(item.description, MAX_DESCRIPTION_CHARS);
        }
        if (!result.publishedAt && typeof item.datePublished === "string") {
          result.publishedAt = cleanText(item.datePublished, 64);
        }
        if (!result.author && item.author) {
          if (typeof item.author === "string") {
            result.author = cleanText(item.author, 120);
          } else if (Array.isArray(item.author)) {
            const first = item.author[0];
            result.author = cleanText(
              typeof first === "string" ? first : first?.name || "",
              120
            );
          } else if (typeof item.author === "object" && item.author.name) {
            result.author = cleanText(item.author.name, 120);
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  return result;
}

function removeNoiseBlocks(html) {
  let cleaned = html;

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, " ");

  // Remove non-content elements (scripts, styles, nav, headers, footers, forms, asides, iframes, svgs)
  const noiseTags = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "iframe",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "button",
    "select",
    "dialog",
  ];
  for (const tag of noiseTags) {
    const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    cleaned = cleaned.replace(pattern, " ");
  }

  // Remove obvious ad/cookie/sidebar containers by class or id when cleanly closed
  cleaned = cleaned.replace(
    /<(div|section)\b[^>]*(?:class|id)=["'][^"']*(?:cookie|banner|advert|ad-slot|sponsor|sidebar|newsletter|popup|modal|breadcrumbs|social-share)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    " "
  );

  return cleaned;
}

function extractReadableText(html, maxLength = MAX_ANALYSIS_TEXT_CHARS) {
  if (typeof html !== "string" || !html.trim()) return "";

  // Prefer <article> or <main> if substantial content is inside
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  const candidates = [
    articleMatch ? articleMatch[1] : "",
    mainMatch ? mainMatch[1] : "",
    bodyMatch ? bodyMatch[1] : html,
  ];

  let selectedHtml = candidates[2];
  for (const candidate of candidates.slice(0, 2)) {
    if (!candidate) continue;
    const stripped = cleanText(removeNoiseBlocks(candidate).replace(/<[^>]+>/g, " "));
    if (stripped.length >= 200) {
      selectedHtml = candidate;
      break;
    }
  }

  const withoutNoise = removeNoiseBlocks(selectedHtml);

  // Preserve sentence boundaries across block tags
  const withBreaks = withoutNoise
    .replace(/<\/(p|h1|h2|h3|h4|h5|h6|li|blockquote|pre|tr|div|section|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const lines = decodeHtmlEntities(withBreaks)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3);

  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  if (maxLength > 0 && joined.length > maxLength) {
    return joined.slice(0, maxLength).trimEnd();
  }
  return joined;
}

/**
 * Extracts structured webpage metadata and meaningful text from raw HTML without executing JS.
 */
function extractWebpageData(html, pageUrl) {
  const safeHtml = typeof html === "string" ? html : "";
  let domain = "";
  try {
    domain = new URL(pageUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    domain = "";
  }

  const titleMatch = safeHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const htmlTitle = cleanText(titleMatch ? titleMatch[1] : "", MAX_TITLE_CHARS);

  const { byName, byProperty } = extractMetaMap(safeHtml);
  const { canonicalUrl, favicon } = extractLinks(safeHtml, pageUrl);
  const jsonLd = extractJsonLdMetadata(safeHtml);

  const ogTitle = cleanText(
    byProperty.get("og:title") || byName.get("twitter:title") || "",
    MAX_TITLE_CHARS
  );
  const ogDescription = cleanText(
    byProperty.get("og:description") || byName.get("twitter:description") || "",
    MAX_DESCRIPTION_CHARS
  );
  const ogImage = resolveSafeHttpUrl(
    byProperty.get("og:image") || byName.get("twitter:image") || "",
    pageUrl
  );

  const metaDescription = cleanText(
    byName.get("description") || jsonLd.description || "",
    MAX_DESCRIPTION_CHARS
  );

  // Prefer Open Graph when meaningful, with sensible fallbacks
  const title = ogTitle || htmlTitle || jsonLd.title || "";
  const description = ogDescription || metaDescription || "";

  const author = cleanText(
    byName.get("author") ||
      byProperty.get("article:author") ||
      byName.get("dc.creator") ||
      jsonLd.author ||
      "",
    120
  );

  const publishedAtRaw =
    byProperty.get("article:published_time") ||
    byName.get("pubdate") ||
    byName.get("publish-date") ||
    byName.get("date") ||
    byName.get("dc.date.issued") ||
    jsonLd.publishedAt ||
    "";

  let publishedAt = "";
  if (publishedAtRaw) {
    const parsedDate = new Date(publishedAtRaw);
    publishedAt = Number.isNaN(parsedDate.getTime())
      ? cleanText(publishedAtRaw, 64)
      : parsedDate.toISOString();
  }

  const extractedText = extractReadableText(safeHtml, MAX_ANALYSIS_TEXT_CHARS);
  const textPreview =
    extractedText.length > MAX_TEXT_PREVIEW_CHARS
      ? extractedText.slice(0, MAX_TEXT_PREVIEW_CHARS).trimEnd()
      : extractedText;

  return {
    metadata: {
      title,
      description,
      ogTitle,
      ogDescription,
      ogImage,
      favicon,
      canonicalUrl: canonicalUrl || pageUrl,
      domain,
      author,
      publishedAt,
      textPreview,
      extractedAt: new Date(),
    },
    extractedText,
  };
}

module.exports = {
  MAX_TEXT_PREVIEW_CHARS,
  MAX_ANALYSIS_TEXT_CHARS,
  decodeHtmlEntities,
  cleanText,
  extractReadableText,
  extractWebpageData,
};
