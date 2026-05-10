// T21 follow-up: per-scene classifier cache.
//
// Caches per-scene LLM classifications keyed by content hash so the
// expensive `classifyScene` call doesn't re-fire for unchanged scenes.
// Cache lives in the persistence adapter under
// `domain="craft_classifications"`. Storage is opportunistic — if the
// cache layer fails, callers receive a fresh classification.
//
// Key shape: `<frameworkId>:<contentHash>` (e.g.
// "save-the-cat:7f4a8c3e..."). Hashing uses sha-256 over a
// normalized scene representation (title + content text); the
// normalization strips trailing whitespace and Windows line endings.

import { createHash } from "node:crypto";

const DOMAIN = "craft_classifications";

function normalizeForHash({ title = "", text = "" } = {}) {
  const normTitle = String(title || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  const normText = String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return `${normTitle}${normText}`;
}

function sceneContentHash(scene) {
  const norm = normalizeForHash(scene);
  return createHash("sha256").update(norm, "utf8").digest("hex");
}

function cacheKey({ frameworkId, hash }) {
  return `${String(frameworkId).trim()}:${hash}`;
}

function isFreshEnough(record, ttlMs) {
  if (!record || !record.updatedAt) return false;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return true;
  return Date.now() - record.updatedAt <= ttlMs;
}

function createCraftSceneCache({ persistence, ttlMs = 0 } = {}) {
  if (!persistence || typeof persistence.get !== "function") {
    throw new Error("createCraftSceneCache requires a persistence handle");
  }

  async function read({ frameworkId, scene }) {
    const hash = sceneContentHash(scene);
    const key = cacheKey({ frameworkId, hash });
    let record;
    try {
      record = await persistence.get({ domain: DOMAIN, key });
    } catch (_e) {
      return null;
    }
    if (!isFreshEnough(record, ttlMs)) return null;
    return { hash, key, value: record.value, updatedAt: record.updatedAt };
  }

  async function write({ frameworkId, scene, value }) {
    const hash = sceneContentHash(scene);
    const key = cacheKey({ frameworkId, hash });
    const record = { value, updatedAt: Date.now() };
    try {
      await persistence.put({ domain: DOMAIN, key, value: record });
    } catch (_e) {
      // Cache writes are best-effort; never block the classifier.
    }
    return { hash, key };
  }

  // Bulk classify with the cache transparently in front of a per-scene
  // classifier function. `classifyOne(scene)` returns the value to
  // cache. Returns an array aligned with `scenes` of
  // `{ scene, value, fromCache, hash }`.
  async function classifyWithCache({ frameworkId, scenes, classifyOne }) {
    if (!Array.isArray(scenes) || scenes.length === 0) return [];
    if (typeof classifyOne !== "function") {
      throw new Error("classifyWithCache requires a classifyOne function");
    }
    const out = new Array(scenes.length);
    for (let i = 0; i < scenes.length; i += 1) {
      const scene = scenes[i];
      const cached = await read({ frameworkId, scene });
      if (cached) {
        out[i] = { scene, value: cached.value, fromCache: true, hash: cached.hash };
        continue;
      }
      let value;
      try {
        value = await classifyOne(scene);
      } catch (e) {
        out[i] = { scene, value: null, fromCache: false, error: e?.message || String(e) };
        continue;
      }
      const { hash } = await write({ frameworkId, scene, value });
      out[i] = { scene, value, fromCache: false, hash };
    }
    return out;
  }

  async function clear() {
    if (typeof persistence.clear === "function") {
      await persistence.clear({ domain: DOMAIN });
    }
  }

  return {
    DOMAIN,
    sceneContentHash,
    cacheKey,
    read,
    write,
    classifyWithCache,
    clear,
  };
}

export {
  createCraftSceneCache,
  sceneContentHash,
  cacheKey as craftSceneCacheKey,
  DOMAIN as CRAFT_CLASSIFICATIONS_DOMAIN,
};
