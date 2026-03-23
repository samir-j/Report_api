const Cache = require("../src/utils/cache");

describe("Cache", () => {
  it("stores and retrieves a value", () => {
    const cache = new Cache(60);
    cache.set("key", { data: 1 });
    expect(cache.get("key")).toEqual({ data: 1 });
  });

  it("returns null for missing keys", () => {
    const cache = new Cache(60);
    expect(cache.get("missing")).toBeNull();
  });

  it("expires entries after TTL", async () => {
    const cache = new Cache(0.01); // 10ms TTL
    cache.set("key", "value");
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get("key")).toBeNull();
  });

  it("deletes entries", () => {
    const cache = new Cache(60);
    cache.set("key", "value");
    cache.delete("key");
    expect(cache.get("key")).toBeNull();
  });

  it("clears all entries", () => {
    const cache = new Cache(60);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBeNull();
  });

  it("returns meta for cached entry", () => {
    const cache = new Cache(60);
    cache.set("key", "value");
    const meta = cache.meta("key");
    expect(meta).toHaveProperty("cachedAt");
    expect(meta).toHaveProperty("expiresAt");
  });
});
