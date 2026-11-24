/**
 * Lightweight per-user in-memory sliding-window rate limiter middleware.
 * Protects expensive webpage scraping and LLM endpoints without external dependencies.
 */
function createRateLimiter({
  windowMs = 60_000,
  maxRequests = 20,
  message = "Too many AI requests. Please wait a moment and try again.",
  keyGenerator = (req) => String(req.user?._id || req.ip || "anonymous"),
} = {}) {
  const buckets = new Map();

  // Periodic cleanup to avoid unbounded memory growth
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of buckets.entries()) {
      const recent = timestamps.filter((ts) => ts > cutoff);
      if (recent.length === 0) {
        buckets.delete(key);
      } else {
        buckets.set(key, recent);
      }
    }
  }, Math.max(windowMs, 30_000));
  if (typeof cleanupInterval.unref === "function") {
    cleanupInterval.unref();
  }

  const middleware = (req, res, next) => {
    const now = Date.now();
    const cutoff = now - windowMs;
    const key = keyGenerator(req);

    const history = (buckets.get(key) || []).filter((ts) => ts > cutoff);
    if (history.length >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((history[0] + windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    history.push(now);
    buckets.set(key, history);
    return next();
  };

  middleware._reset = () => buckets.clear();
  return middleware;
}

module.exports = { createRateLimiter };
