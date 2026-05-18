// T-archetype-engine — GET /memory/character-archetypes
//
// Returns a per-character archetype classification for the requesting
// user, computed from `creativeMemoryStore.getCharacterTraits(...)`
// + the pure `classifyArchetypes` analyzer.
//
// Read-only. Unauthenticated requests return an empty entries array
// (matching the other /memory/* endpoints).

import { classifyArchetypes } from "./archetype_engine.js";

function defaultResolveUserId(req) {
  return (
    (req && req.user && req.user.id) ||
    (req && req.authUser && req.authUser.id) ||
    (req && req.userId) ||
    null
  );
}

function mountArchetypeRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveUserId,
} = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountArchetypeRoute requires an Express app");
  }
  if (!creativeMemoryStore || typeof creativeMemoryStore.getCharacterTraits !== "function") {
    throw new Error("mountArchetypeRoute requires a creativeMemoryStore with trait support");
  }

  app.get("/memory/character-archetypes", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(200).json({ schemaVersion: 1, userId: null, entries: [] });
    }
    try {
      const records = await creativeMemoryStore.getCharacterTraits({ userId });
      const characters = Array.isArray(records)
        ? records.map((r) => ({ name: r.name, traits: r.traits, tags: r.tags || [] }))
        : [];
      const result = classifyArchetypes({ characters });
      return res.status(200).json({
        schemaVersion: result.schemaVersion,
        userId,
        entries: result.entries,
      });
    } catch (e) {
      return res.status(500).json({
        schemaVersion: 1,
        userId,
        entries: [],
        error: e?.message || "archetype_classification_failed",
      });
    }
  });
}

export { mountArchetypeRoute };
