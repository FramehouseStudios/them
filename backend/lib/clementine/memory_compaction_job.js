// Background memory compaction job stub (D008).
//
// Process-local queue is enough for v0. Production may move to outbox /
// scale_backplane without changing enqueueCompaction / runCompactionOnce.
//
// Request shape for a future Spark summarizer (Standard Muse only — never
// Contributor):
//   {
//     model: "muse-spark-1.2",
//     background: true,          // mark async / non-interactive compaction
//     store: false,              // companion privacy default
//     reasoning: { effort: "minimal" },
//     input: [ /* folded turns */ ],
//     instructions: "Summarize working-set for memory; no spoken reply.",
//   }
// runCompactionOnce may no-op the Spark call until wired.

import { compactWorkingSet, shouldCompact } from "./memory_working_set.js";

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function createMemoryCompactionJob({
  now = () => Date.now(),
  /**
   * Optional async (userId, payload) => result.
   * Default is a no-op that returns { ok: true, spark: "skipped" }.
   * When calling Muse later, pass background: true on the request body.
   */
  runSparkCompaction = null,
  /** Optional: (userId) => turns[] for that user. */
  loadTurns = null,
  /** Optional persist hook after compact. */
  saveCompact = null,
} = {}) {
  /** @type {object[]} */
  const queue = [];
  const stateByUser = new Map();

  function enqueueCompaction(userId, meta = {}) {
    const uid = trimToString(userId);
    if (!uid) {
      return { ok: false, error: "missing_userId", code: "compaction_enqueue_invalid" };
    }
    const job = {
      id: `cmp_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      userId: uid,
      enqueuedAt: now(),
      status: "queued",
      meta: meta && typeof meta === "object" ? { ...meta } : {},
      // Documented request flag for the future Spark path:
      // background: true
    };
    queue.push(job);
    return { ok: true, job };
  }

  function peekQueue() {
    return queue.map((j) => ({ ...j }));
  }

  function queueDepth() {
    return queue.length;
  }

  /**
   * Process at most one queued compaction.
   * Spark call is optional / no-op by default (background: true when wired).
   */
  async function runCompactionOnce() {
    const job = queue.shift();
    if (!job) {
      return { ok: true, ran: false, reason: "empty_queue" };
    }
    job.status = "running";
    job.startedAt = now();

    let turns = [];
    if (typeof loadTurns === "function") {
      try {
        turns = (await loadTurns(job.userId)) || [];
      } catch (e) {
        job.status = "failed";
        job.error = String(e?.message || e);
        job.finishedAt = now();
        return { ok: false, ran: true, job, error: job.error };
      }
    } else if (Array.isArray(job.meta?.turns)) {
      turns = job.meta.turns;
    }

    const needs = shouldCompact({ turns, ...(job.meta?.shouldCompactOptions || {}) });
    const compact = compactWorkingSet(turns, job.meta?.compactOptions || {});
    compact.compactedAt = now();

    // Future Muse Responses request shape (Standard only):
    // { background: true, store: false, model: "muse-spark-1.2", ... }
    let sparkResult = { ok: true, spark: "skipped", background: true };
    if (typeof runSparkCompaction === "function") {
      try {
        sparkResult = await runSparkCompaction(job.userId, {
          // background: true — non-interactive compaction; do not stream to TTS
          background: true,
          store: false,
          turns,
          compact,
        });
      } catch (e) {
        job.status = "failed";
        job.error = String(e?.message || e);
        job.finishedAt = now();
        return { ok: false, ran: true, job, error: job.error, sparkResult };
      }
    }

    if (typeof saveCompact === "function") {
      try {
        await saveCompact(job.userId, compact);
      } catch (e) {
        job.status = "failed";
        job.error = String(e?.message || e);
        job.finishedAt = now();
        return { ok: false, ran: true, job, error: job.error };
      }
    }

    stateByUser.set(job.userId, {
      lastCompact: compact,
      lastJobId: job.id,
      updatedAt: now(),
      didCompact: needs,
    });

    job.status = "done";
    job.finishedAt = now();
    job.didCompact = needs;
    job.foldedTurnCount = compact.foldedTurnCount;

    return {
      ok: true,
      ran: true,
      job,
      compact,
      sparkResult,
      // Reminder for callers wiring Muse:
      // request.background === true for compaction traffic
    };
  }

  function getUserState(userId) {
    return stateByUser.get(trimToString(userId)) || null;
  }

  function _clear() {
    queue.length = 0;
    stateByUser.clear();
  }

  return {
    enqueueCompaction,
    runCompactionOnce,
    peekQueue,
    queueDepth,
    getUserState,
    _clear,
  };
}

export { createMemoryCompactionJob };
