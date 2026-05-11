// T-block-signal-history-route — GET /memory/block-signal/history
//
// Read-only projection of habits.block_signal_history populated by
// PR #103 (T-block-signal-history-tracking). Separate from the
// polling endpoint at /memory/block-signal so dashboards / sparklines
// can read the buffer without triggering the same-level debounce or
// adding a new sample on every render.
//
// Response shape:
//
//   {
//     schemaVersion: 1,
//     entries: [{ at: 1715..., score: 0.3, level: "medium" }, ...],
//     counts: { total: N, byLevel: { low: ..., medium: ..., high: ... } },
//     newestAt: 1715... | null,
//     oldestAt: 1715... | null
//   }
//
// Unauthenticated → 200 + zero envelope (same posture as
// /memory/block-signal).

const BLOCK_SIGNAL_HISTORY_SCHEMA_VERSION = 1;

function defaultResolveUserId(req) {
  return (
    (req && req.user && req.user.id) ||
    (req && req.authUser && req.authUser.id) ||
    (req && req.userId) ||
    (req && typeof req.get === "function" ? req.get("X-User-Id") : null) ||
    null
  );
}

function zeroEnvelope() {
  return {
    schemaVersion: BLOCK_SIGNAL_HISTORY_SCHEMA_VERSION,
    entries: [],
    counts: { total: 0, byLevel: { low: 0, medium: 0, high: 0 } },
    newestAt: null,
    oldestAt: null,
  };
}

function summarizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory) || rawHistory.length === 0) return zeroEnvelope();
  const entries = rawHistory
    .filter((e) => e && typeof e === "object")
    .map((e) => ({
      at: Number.isFinite(e.at) ? e.at : 0,
      score: Number.isFinite(e.score) ? e.score : 0,
      level: typeof e.level === "string" && e.level.trim() ? e.level.trim() : "low",
    }));
  const byLevel = { low: 0, medium: 0, high: 0 };
  let newest = -Infinity;
  let oldest = Infinity;
  for (const e of entries) {
    if (byLevel[e.level] !== undefined) byLevel[e.level] += 1;
    if (e.at > newest) newest = e.at;
    if (e.at < oldest) oldest = e.at;
  }
  return {
    schemaVersion: BLOCK_SIGNAL_HISTORY_SCHEMA_VERSION,
    entries,
    counts: { total: entries.length, byLevel },
    newestAt: Number.isFinite(newest) ? newest : null,
    oldestAt: Number.isFinite(oldest) ? oldest : null,
  };
}

function mountBlockSignalHistoryRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveUserId,
} = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountBlockSignalHistoryRoute requires an Express app");
  }
  if (!creativeMemoryStore || typeof creativeMemoryStore.getHabitsForUser !== "function") {
    throw new Error("mountBlockSignalHistoryRoute requires a creativeMemoryStore");
  }

  app.get("/memory/block-signal/history", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(200).json(zeroEnvelope());
    }
    try {
      const habits = await creativeMemoryStore.getHabitsForUser(userId);
      const raw = habits?.block_signal_history;
      return res.status(200).json(summarizeHistory(raw));
    } catch (e) {
      return res.status(500).json({
        ...zeroEnvelope(),
        error: e?.message || "block_signal_history_failed",
      });
    }
  });
}

export {
  mountBlockSignalHistoryRoute,
  summarizeHistory,
  BLOCK_SIGNAL_HISTORY_SCHEMA_VERSION,
};
