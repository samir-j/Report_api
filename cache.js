const logger = require("./logger");

/**
 * Simple in-memory TTL cache.
 * Keys expire after `ttlSeconds` and are lazily evicted on read.
 *
 * For production at large scale, replace with Redis or Memcached.
 */
class Cache {
  constructor(ttlSeconds) {
    this.ttlMs = ttlSeconds * 1000;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      logger.debug("Cache miss (expired)", { key });
      return null;
    }

    logger.debug("Cache hit", { key });
    return entry.value;
  }

  set(key, value) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      cachedAt: new Date().toISOString(),
    });
    logger.debug("Cache set", { key, ttlMs: this.ttlMs });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  /** Returns metadata about a cached entry without the full value */
  meta(key) {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return {
      cachedAt: entry.cachedAt,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    };
  }
}

module.exports = Cache;
