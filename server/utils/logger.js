const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|secret|password|authorization)/i;

function sanitizeLogMeta(value, depth = 0) {
  if (depth > 4) return "[Truncated]";
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeLogMeta(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeLogMeta(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}...`;
  }
  return value;
}

function log(level, event, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "nestlink-server",
    event,
    ...sanitizeLogMeta(meta),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (process.env.NODE_ENV !== "test" || process.env.VERBOSE_TEST_LOGS === "true") {
    console.log(line);
  }
}

module.exports = {
  info: (event, meta) => log("info", event, meta),
  warn: (event, meta) => log("warn", event, meta),
  error: (event, meta) => log("error", event, meta),
  sanitizeLogMeta,
};
