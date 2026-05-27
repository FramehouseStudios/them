// T-archetype-engine — GET /memory/character-archetypes
//
// Returns a per-character archetype classification for the requesting
// user, computed from `creativeMemoryStore.getCharacterTraits(...)`
// + the pure `classifyArchetypes` analyzer.
//
// Read-only user-memory data. Trusted auth identity is required, and
// caller-supplied X-User-Id is never trusted.

import { classifyArchetypes } from "./archetype_engine.js";
import { defaultResolveMemoryUserId, memoryAuthRequired } from "./memory_route_auth.js";

function mountArchetypeRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveMemoryUserId,
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
      return res.status(401).json(memoryAuthRequired("memory_character_archetypes"));
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
