const dns = require("dns");
const net = require("net");

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
];

class UrlSecurityError extends Error {
  constructor(message, code = "URL_SECURITY_ERROR", statusCode = 400) {
    super(message);
    this.name = "UrlSecurityError";
    this.code = code;
    this.statusCode = statusCode;
    this.publicMessage = message;
  }
}

function ipv4ToInt(ip) {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return null;
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isInIpv4Cidr(ipInt, baseIp, prefixLen) {
  const baseInt = ipv4ToInt(baseIp);
  if (ipInt === null || baseInt === null) return false;
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

const BLOCKED_IPV4_CIDRS = [
  ["0.0.0.0", 8],         // Current network ("this host")
  ["10.0.0.0", 8],        // RFC 1918 private
  ["100.64.0.0", 10],     // Shared Address Space / CGNAT (RFC 6598)
  ["127.0.0.0", 8],       // Loopback
  ["169.254.0.0", 16],    // Link-local & cloud metadata (AWS/GCP/Azure)
  ["172.16.0.0", 12],     // RFC 1918 private
  ["192.0.0.0", 24],      // IETF protocol assignments
  ["192.0.2.0", 24],      // TEST-NET-1
  ["192.168.0.0", 16],    // RFC 1918 private
  ["198.18.0.0", 15],     // Benchmarking
  ["198.51.100.0", 24],   // TEST-NET-2
  ["203.0.113.0", 24],    // TEST-NET-3
  ["224.0.0.0", 4],       // Multicast
  ["240.0.0.0", 4],       // Reserved / Broadcast
];

function isBlockedIpv4(ip) {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return true;
  return BLOCKED_IPV4_CIDRS.some(([base, prefix]) => isInIpv4Cidr(ipInt, base, prefix));
}

function expandIpv6(ip) {
  const clean = ip.toLowerCase().split("%")[0]; // strip zone index if any
  if (!clean.includes(":")) return null;

  // Handle IPv4-embedded IPv6 such as ::ffff:127.0.0.1
  let working = clean;
  const lastColon = working.lastIndexOf(":");
  if (working.includes(".") && lastColon !== -1) {
    const ipv4Part = working.slice(lastColon + 1);
    const ipv4Int = ipv4ToInt(ipv4Part);
    if (ipv4Int === null) return null;
    const high = ((ipv4Int >>> 16) & 0xffff).toString(16);
    const low = (ipv4Int & 0xffff).toString(16);
    working = `${working.slice(0, lastColon)}:${high}:${low}`;
  }

  const sides = working.split("::");
  if (sides.length > 2) return null;

  const left = sides[0] ? sides[0].split(":").filter(Boolean) : [];
  const right = sides.length === 2 && sides[1] ? sides[1].split(":").filter(Boolean) : [];
  const missing = 8 - (left.length + right.length);
  if (missing < 0 || (sides.length === 1 && missing !== 0)) return null;

  const full = [...left, ...Array(missing).fill("0"), ...right];
  if (full.length !== 8) return null;

  const nums = full.map((part) => {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return NaN;
    return parseInt(part, 16);
  });
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums;
}

function isBlockedIpv6(ip) {
  const groups = expandIpv6(ip);
  if (!groups) return true;

  const allZero = groups.every((g) => g === 0);
  if (allZero) return true; // :: unspecified

  // ::1 loopback
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) {
    return true;
  }

  // ::ffff:0:0/96 IPv4-mapped IPv6
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const ipv4 = [
      (groups[6] >>> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >>> 8) & 0xff,
      groups[7] & 0xff,
    ].join(".");
    return isBlockedIpv4(ipv4);
  }

  // 64:ff9b::/96 NAT64 well-known prefix
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    const ipv4 = [
      (groups[6] >>> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >>> 8) & 0xff,
      groups[7] & 0xff,
    ].join(".");
    return isBlockedIpv4(ipv4);
  }

  // fc00::/7 Unique local address (ULA)
  if ((groups[0] & 0xfe00) === 0xfc00) return true;

  // fe80::/10 Link-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true;

  // fec0::/10 Deprecated site-local
  if ((groups[0] & 0xffc0) === 0xfec0) return true;

  // ff00::/8 Multicast
  if ((groups[0] & 0xff00) === 0xff00) return true;

  // 2001:db8::/32 Documentation
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;

  return false;
}

function isBlockedIpAddress(ip) {
  if (typeof ip !== "string" || !ip.trim()) return true;
  const trimmed = ip.trim().replace(/^\[|\]$/g, "");
  const version = net.isIP(trimmed);
  if (version === 4) return isBlockedIpv4(trimmed);
  if (version === 6) return isBlockedIpv6(trimmed);
  return true;
}

function isBlockedHostname(hostname) {
  const lower = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!lower) return true;
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  // Block single-label internal hostnames (e.g. "redis", "mongo", "internal-api") unless it's a valid public IP
  if (!lower.includes(".") && net.isIP(lower.replace(/^\[|\]$/g, "")) === 0) {
    return true;
  }
  return false;
}

/**
 * Synchronous structural URL validation (scheme, credentials, hostname, literal IP checks).
 */
function validateUrlSyntax(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new UrlSecurityError("URL is required.", "INVALID_URL", 400);
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    throw new UrlSecurityError("URL exceeds maximum allowed length.", "INVALID_URL", 400);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UrlSecurityError("Please provide a valid HTTP or HTTPS URL.", "INVALID_URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlSecurityError("Only HTTP and HTTPS URLs are allowed.", "INVALID_PROTOCOL", 400);
  }

  if (parsed.username || parsed.password) {
    throw new UrlSecurityError("URLs containing embedded credentials are not allowed.", "INVALID_URL", 400);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) {
    throw new UrlSecurityError("URL must include a valid hostname.", "INVALID_URL", 400);
  }

  if (net.isIP(hostname) !== 0) {
    if (isBlockedIpAddress(hostname)) {
      throw new UrlSecurityError(
        "Requests to private, loopback, or internal network addresses are blocked.",
        "SSRF_BLOCKED",
        400
      );
    }
  } else if (isBlockedHostname(hostname)) {
    throw new UrlSecurityError(
      "Requests to local or internal hostnames are blocked.",
      "SSRF_BLOCKED",
      400
    );
  }

  return parsed;
}

/**
 * Full async URL validation including DNS resolution checks against private/internal IP ranges.
 */
async function validateExternalUrl(rawUrl, { lookupImpl = dns.promises.lookup } = {}) {
  const parsed = validateUrlSyntax(rawUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(hostname) !== 0) {
    return { url: parsed.toString(), parsed, addresses: [hostname] };
  }

  let records;
  try {
    records = await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlSecurityError("Unable to resolve webpage hostname.", "DNS_LOOKUP_FAILED", 400);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new UrlSecurityError("Unable to resolve webpage hostname.", "DNS_LOOKUP_FAILED", 400);
  }

  const addresses = records.map((rec) => rec.address);
  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new UrlSecurityError(
        "Resolved destination points to a private or internal network address.",
        "SSRF_BLOCKED",
        400
      );
    }
  }

  return { url: parsed.toString(), parsed, addresses };
}

/**
 * Produces a canonical cache key for a URL (strips fragment, normalizes host casing).
 */
function normalizeUrlForCache(rawUrl) {
  const parsed = new URL(String(rawUrl).trim());
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }
  return parsed.toString();
}

module.exports = {
  UrlSecurityError,
  isBlockedIpv4,
  isBlockedIpv6,
  isBlockedIpAddress,
  isBlockedHostname,
  validateUrlSyntax,
  validateExternalUrl,
  normalizeUrlForCache,
};
