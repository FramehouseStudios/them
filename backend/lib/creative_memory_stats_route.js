// T-creative-memory-stats-route — GET /memory/stats
//
// Lightweight summary of the authenticated user's creative memory.
// Returns counts and high-level shape without exposing the underlying
// content (no character names, no lexical fingerprint, no twist
// content). The iOS "what does the companion remember about me?" UI
// uses this to badge the sidebar; full content is fetched through the
// existing per-domain endpoints when the user opens the detail view.
//
// Unauthenticated requests return 401. Caller-supplied X-User-Id is
// never trusted for ownership.

import { defaultResolveMemoryUserId, memoryAuthRequired } from "./memory_route_auth.js";

const CREATIVE_MEMORY_STATS_SCHEMA_VERSION = 1;

function zeroEnvelope() {
  return {
    schemaVersion: CREATIVE_MEMORY_STATS_SCHEMA_VERSION,
    hasMemory: false,
    counts: {
      characters: 0,
      charactersWithVoice: 0,
      charactersWithTraits: 0,
      toneSignals: 0,
      habitSignals: 0,
    },
    lastUpdatedMs: null,
  };
}

function summarizeMemory(memory) {
  if (!memory) return zeroEnvelope();
  const characters = Array.isArray(memory.characters) ? memory.characters : [];
  const charactersWithVoice = characters.filter((c) => typeof c?.voice === "string" && c.voice.trim().length > 0).length;
  const charactersWithTraits = characters.filter(
    (c) => c?.traits && typeof c.traits === "object" && Object.keys(c.traits).length > 0,
  ).length;
  const toneSignals = memory.tone && typeof memory.tone === "object" ? Object.keys(memory.tone).length : 0;
  const habitSignals = memory.habits && typeof memory.habits === "object" ? Object.keys(memory.habits).length : 0;
  return {
    schemaVersion: CREATIVE_MEMORY_STATS_SCHEMA_VERSION,
    hasMemory: true,
    counts: {
      characters: characters.length,
      charactersWithVoice,
      charactersWithTraits,
      toneSignals,
      habitSignals,
    },
    lastUpdatedMs: Number.isFinite(memory.updatedAt) ? memory.updatedAt : null,
  };
}

function mountCreativeMemoryStatsRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveMemoryUserId,
} = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountCreativeMemoryStatsRoute requires an Express app");
  }
  if (!creativeMemoryStore || typeof creativeMemoryStore.getCreativeMemoryForPrompt !== "function") {
    throw new Error("mountCreativeMemoryStatsRoute requires a creativeMemoryStore");
  }

  app.get("/memory/stats", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json(memoryAuthRequired("memory_stats"));
    }
    try {
      const memory = await creativeMemoryStore.getCreativeMemoryForPrompt({ userId });
      return res.status(200).json(summarizeMemory(memory));
    } catch (e) {
      return res.status(500).json({
        ...zeroEnvelope(),
        error: e?.message || "memory_stats_failed",
      });
    }
  });
}

export {
  mountCreativeMemoryStatsRoute,
  summarizeMemory,
  CREATIVE_MEMORY_STATS_SCHEMA_VERSION,
};
