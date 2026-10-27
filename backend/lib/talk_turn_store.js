// T-1118 — bounded durable storage for accepted /talk metadata.
//
// The HTTP facade remains responsible for sanitizing the public turn shape and
// enforcing read authorization. This capability owns only retention,
// persistence-before-publication, restart hydration, and bounded cache state.

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
const TALK_TURNS_DOMAIN = "talk_turns";

function ownerScope(entry = {}) {
  const userId = String(entry.userId || "").trim();
  return userId ? `user:${userId}` : `session:${String(entry.sessionId || "").trim()}`;
}

function turnStorageKey(turnId, scope) {
  return `${createHash("sha256").update(ownerScope(scope)).digest("hex")}:${turnId}`;
}

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

  function acceptedContent(entry) {
    const { updatedAt: _updatedAt, expiresAt: _expiresAt, ...content } = entry;
    return content;
  }

  async function prune(at = now()) {
    const rows = [...cache.entries()];
    for (const [key, entry] of rows) {
      if (!isExpired(entry, at)) continue;
      cache.delete(key);
      await persistence.delete({ domain: TALK_TURNS_DOMAIN, key });
    }
    if (cache.size <= capacity) return;
    const ordered = [...cache.entries()].sort(
      (a, b) => Number(b[1].updatedAt || 0) - Number(a[1].updatedAt || 0)
    );
    for (const [key] of ordered.slice(capacity)) {
      cache.delete(key);
      await persistence.delete({ domain: TALK_TURNS_DOMAIN, key });
    }
  }

  return {
    async restoreForReplay(record, scope) {
      const snapshot = normalizedStoredEntry(record?.turnMetadata);
      if (!snapshot) throw new Error("accepted turn metadata is missing");
      if (snapshot.turnId !== String(record.headers?.["x-turn-id"] || "").trim()
        || ownerScope(snapshot) !== ownerScope(scope)
        || (record.userId && snapshot.userId !== record.userId)) {
        throw new Error("accepted turn metadata identity mismatch");
      }
      const key = turnStorageKey(snapshot.turnId, snapshot);
      const previous = await persistence.get({ domain: TALK_TURNS_DOMAIN, key });
      const current = normalizedStoredEntry(previous);
      if (current && !isDeepStrictEqual(acceptedContent(current), acceptedContent(snapshot))) {
        throw new Error("accepted turn metadata conflicts with another publication");
      }
      if (current && !isExpired(current)) {
        cache.set(key, current);
        return visibleEntry(current);
      }
      if (typeof persistence.compareAndSwap !== "function") {
        throw new Error("accepted turn metadata restoration requires atomic persistence");
      }
      const at = now();
      const restored = { ...snapshot, updatedAt: at, expiresAt: at + retentionMs };
      const changed = await persistence.compareAndSwap({ domain: TALK_TURNS_DOMAIN, key,
        expectedValue: previous, value: restored });
      if (!changed) {
        const winner = normalizedStoredEntry(await persistence.get({ domain: TALK_TURNS_DOMAIN, key }));
        if (!winner || isExpired(winner)
          || !isDeepStrictEqual(acceptedContent(winner), acceptedContent(snapshot))) {
          throw new Error("accepted turn metadata changed during restoration");
        }
        cache.set(key, winner);
        return visibleEntry(winner);
      }
      cache.set(key, restored);
      await prune(at);
      return visibleEntry(restored);
    },

    async hydrate() {
      cache.clear();
      const rows = await persistence.list({
        domain: TALK_TURNS_DOMAIN,
        limit: Math.min(10_000, capacity + 1_000),
      });
      for (const row of rows) {
        const entry = normalizedStoredEntry(row?.value);
        if (entry) cache.set(row.key, entry);
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
      const key = turnStorageKey(normalized.turnId, normalized);
      await persistence.put({
        domain: TALK_TURNS_DOMAIN,
        key,
        value: normalized,
      });
      cache.set(key, normalized);
      try {
        await prune(now());
      } catch (err) {
        logger?.log?.(`[talk_turn_store] prune_error=${String(err?.message || err)}`);
      }
      return visibleEntry(normalized);
    },

    get(turnId, scope = null) {
      const key = String(turnId || "").trim();
      if (!key) return null;
      const candidates = [...cache.values()].filter(entry => entry.turnId === key && !isExpired(entry)
        && (!scope || ownerScope(entry) === ownerScope(scope)));
      return candidates.length === 1 ? visibleEntry(candidates[0]) : null;
    },

    async read(turnId, scope = null) {
      const id = String(turnId || "").trim();
      if (!id) return null;
      if (scope) {
        const key = turnStorageKey(id, scope);
        const entry = normalizedStoredEntry(await persistence.get({ domain: TALK_TURNS_DOMAIN, key }));
        if (entry && !isExpired(entry)) {
          if (entry.turnId !== id || ownerScope(entry) !== ownerScope(scope)) throw new Error("Talk metadata identity mismatch");
          cache.set(key, entry);
          return visibleEntry(entry);
        }
        cache.delete(key);
      }
      // Legacy unscoped entries remain readable only through the unchanged HTTP
      // authorization policy. Never pick arbitrarily among colliding owners.
      const found = this.get(id, scope) || this.get(id);
      if (found) return found;
      const denied = scope && [...cache.values()].find(entry => entry.turnId === id
        && !isExpired(entry) && ownerScope(entry) !== ownerScope(scope));
      // Preserve the existing403 contract without choosing another writer's
      // screenplay. The facade uses only this identity to deny authorization.
      return denied ? { turnId: id, userId: denied.userId || "", sessionId: denied.sessionId || "" } : null;
    },

    async delete(turnId, scope = null) {
      const id = String(turnId || "").trim();
      for (const [key, entry] of cache) {
        if (entry.turnId !== id || (scope && ownerScope(entry) !== ownerScope(scope))) continue;
        await persistence.delete({ domain: TALK_TURNS_DOMAIN, key });
        cache.delete(key);
      }
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
