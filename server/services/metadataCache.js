/**
 * Bounded in-memory LRU/TTL cache for extracted webpage metadata.
 * Prevents repeated network requests when multiple bookmarks or previews reference the same URL.
 */
class MetadataCache {
  constructor({
    maxEntries = parseInt(process.env.METADATA_CACHE_MAX_ENTRIES || "200", 10) || 200,
    ttlMs = parseInt(process.env.METADATA_CACHE_TTL_MS || String(60 * 60 * 1000), 10) ||
      60 * 60 * 1000,
  } = {}) {
    this.maxEntries = Math.max(10, maxEntries);
    this.ttlMs = Math.max(1000, ttlMs);
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Refresh LRU position
    this.store.delete(key);
    this.store.set(key, entry);
    return structuredClone(entry.value);
  }

  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

const defaultMetadataCache = new MetadataCache();

module.exports = {
  MetadataCache,
  defaultMetadataCache,
};
