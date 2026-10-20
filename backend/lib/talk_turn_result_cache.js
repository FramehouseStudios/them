import { createHash } from "node:crypto";

// The existing ephemeral turn-result cache, now bounded by serialized bytes
// as well as the caller's TTL/entry limit. Keep whole results or evict them;
// silently clipping the authoritative screenplay is never a cache policy.
export class TalkTurnResultCache extends Map {
  #sizes = new Map();
  #bytes = 0;
  #maxBytes;

  constructor({ maxBytes = 128 * 1024 * 1024 } = {}) {
    super();
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("Invalid turn-result cache byte limit");
    this.#maxBytes = maxBytes;
  }

  set(key, value) {
    const text = value?.screenplayOutput?.text;
    const encoded = JSON.stringify({ ...value, screenplayOutputSHA256: typeof text === "string"
      ? createHash("sha256").update(text, "utf8").digest("hex") : null });
    const size = Buffer.byteLength(encoded, "utf8");
    if (size > this.#maxBytes) { this.delete(key); return this; } // Never serve a stale same-key result or evict unrelated work.
    this.delete(key);
    while (this.#bytes + size > this.#maxBytes) this.delete(this.keys().next().value);
    super.set(key, JSON.parse(encoded)); // Snapshot before callers can mutate the original object.
    this.#sizes.set(key, size);
    this.#bytes += size;
    return this;
  }

  delete(key) {
    this.#bytes -= this.#sizes.get(key) ?? 0;
    this.#sizes.delete(key);
    return super.delete(key);
  }

  clear() {
    super.clear();
    this.#sizes.clear();
    this.#bytes = 0;
  }
}
