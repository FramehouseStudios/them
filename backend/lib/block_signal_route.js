// T-block-detector — GET /memory/block-signal
//
// Returns the writer's-block signal for the authenticated user. Reads
// `habits` from `creativeMemoryStore.getHabitsForUser(userId)` and runs
// it through the pure `computeBlockSignal({ habits, nowMs })`.
//
// Auth mirrors the other user-memory routes: trusted auth identity is
// required, and caller-supplied X-User-Id is never trusted.

import { computeBlockSignal } from "./block_detector.js";
import { defaultResolveMemoryUserId, memoryAuthRequired } from "./memory_route_auth.js";

function emptySnapshot() {
  return {
    schemaVersion: 1,
    score: 0,
    level: "low",
    signals: [],
    summary: "No block signal — keep going.",
    habitsObserved: {
      last_scene_attempt_at: null,
      last_scene_completion_at: null,
      last_talk_turn_at: null,
      scenes_attempted: 0,
      scenes_completed: 0,
      recent_short_turns: 0,
    },
  };
}

function mountBlockSignalRoute(app, {
  creativeMemoryStore,
  resolveUserId = defaultResolveMemoryUserId,
  nowFn = () => Date.now(),
} = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountBlockSignalRoute requires an Express app");
  }
  if (!creativeMemoryStore || typeof creativeMemoryStore.getHabitsForUser !== "function") {
    throw new Error("mountBlockSignalRoute requires a creativeMemoryStore");
  }

  app.get("/memory/block-signal", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const userId = resolveUserId(req);
    if (!userId) {
      return res.status(401).json(memoryAuthRequired("memory_block_signal"));
    }
    try {
      const habits = await creativeMemoryStore.getHabitsForUser(userId);
      const signal = computeBlockSignal({ habits: habits || {}, nowMs: nowFn() });
      // T-block-signal-history-tracking: append a sample to the
      // user's habits.block_signal_history ring buffer (debounced
      // to 60s on the same level). Best-effort; never blocks the
      // response on a recording failure.
      if (typeof creativeMemoryStore.recordBlockSignalSample === "function") {
        try {
          await creativeMemoryStore.recordBlockSignalSample({
            userId,
            score: signal.score,
            level: signal.level,
            atMs: nowFn(),
          });
        } catch (_e) { /* best-effort */ }
      }
      return res.status(200).json(signal);
    } catch (e) {
      return res.status(500).json({
        ...emptySnapshot(),
        error: e?.message || "block_signal_failed",
      });
    }
  });
}

export { mountBlockSignalRoute };
