// T-1118 — bounded durable storage for accepted /talk metadata.
//
// The HTTP facade remains responsible for sanitizing the public turn shape and
// enforcing read authorization. This capability owns only retention,
// persistence-before-publication, restart hydration, and bounded cache state.

const TALK_TURNS_DOMAIN = "talk_turns";

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTalkTurnStore({
  persistence,
  ttlMs = 30 * 60 * 1000,
  maxEntries = 4_000,
  now = () => Date.now(),
  logger = console,
} = {}) {
  if (!persistence || typeof persistence.get !== "function" || typeof persistence.put !== "function") {
    throw new Error("createTalkTurnStore requires persistence get/put methods");
  }
  if (typeof persistence.list !== "function" || typeof persistence.delete !== "function") {
    throw new Error("createTalkTurnStore requires persistence list/delete methods");
  }
  const retentionMs = Math.max(60_000, positiveInt(ttlMs, 30 * 60 * 1000));
  const capacity = positiveInt(maxEntries, 4_000);
  const cache = new Map();

  function normalizedStoredEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const turnId = String(entry.turnId || entry.turn_id || "").trim();
    if (!turnId) return null;
    const updatedAt = Math.max(0, Number(entry.updatedAt || entry.updated_at || entry.createdAt || 0));
    const createdAt = Math.max(0, Number(entry.createdAt || entry.created_at || updatedAt || now()));
    const expiresAt = Math.max(0, Number(entry.expiresAt || entry.expires_at || (updatedAt + retentionMs)));
    return cloneJson({ ...entry, turnId, createdAt, updatedAt, expiresAt });
  }

  function isExpired(entry, at = now()) {
    return Math.max(0, Number(entry?.expiresAt || 0)) <= at;
  }

  function visibleEntry(entry) {
    if (!entry) return null;
    const { expiresAt: _expiresAt, ...visible } = entry;
    return cloneJson(visible);
  }

  async function prune(at = now()) {
    const rows = [...cache.entries()];
    for (const [turnId, entry] of rows) {
      if (!isExpired(entry, at)) continue;
      cache.delete(turnId);
      await persistence.delete({ domain: TALK_TURNS_DOMAIN, key: turnId });
    }
    if (cache.size <= capacity) return;
    const ordered = [...cache.values()].sort(
      (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    );
    for (const entry of ordered.slice(capacity)) {
      cache.delete(entry.turnId);
      await persistence.delete({ domain: TALK_TURNS_DOMAIN, key: entry.turnId });
    }
  }

  return {
    async hydrate() {
      cache.clear();
      const rows = await persistence.list({
        domain: TALK_TURNS_DOMAIN,
        limit: Math.min(10_000, capacity + 1_000),
      });
      for (const row of rows) {
        const entry = normalizedStoredEntry(row?.value);
        if (entry) cache.set(entry.turnId, entry);
      }
      try {
        await prune(now());
      } catch (err) {
        logger?.log?.(`[talk_turn_store] prune_error=${String(err?.message || err)}`);
      }
      return { hydrated: cache.size };
    },

    async put(entry) {
      const normalized = normalizedStoredEntry({
        ...entry,
        updatedAt: Math.max(0, Number(entry?.updatedAt || now())),
      });
      if (!normalized) throw new Error("talk turn persistence requires turnId");
      normalized.expiresAt = normalized.updatedAt + retentionMs;
      await persistence.put({
        domain: TALK_TURNS_DOMAIN,
        key: normalized.turnId,
        value: normalized,
      });
      cache.set(normalized.turnId, normalized);
      try {
        await prune(now());
      } catch (err) {
        logger?.log?.(`[talk_turn_store] prune_error=${String(err?.message || err)}`);
      }
      return visibleEntry(normalized);
    },

    get(turnId) {
      const key = String(turnId || "").trim();
      if (!key) return null;
      const entry = cache.get(key);
      if (!entry || isExpired(entry, now())) return null;
      return visibleEntry(entry);
    },

    async delete(turnId) {
      const key = String(turnId || "").trim();
      if (!key) return;
      await persistence.delete({ domain: TALK_TURNS_DOMAIN, key });
      cache.delete(key);
    },

    size() {
      return cache.size;
    },

    values() {
      return [...cache.values()]
        .filter((entry) => !isExpired(entry, now()))
        .map(visibleEntry);
    },
  };
}

export { TALK_TURNS_DOMAIN, createTalkTurnStore };
