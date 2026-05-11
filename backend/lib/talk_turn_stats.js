// T-talk-turn-meta-stats — pure aggregator over /talk turn metadata.
//
// The /talk endpoint stores `talkTurnMetaById` entries in-memory
// (Map<turnId, entry>). Each entry includes turnId, userId, sessionId,
// transcript, reply, audioDurationMs, renderContract.reply_role,
// createdAt. This helper computes aggregate stats over an arbitrary
// iterable of those entries, so the route layer can pass either:
//   - the full Map.values() iterable, or
//   - a filtered subset (e.g. last 1000 turns).
//
// Pure: same input → same output. No I/O, no LLM, no PII leakage —
// the output contains counts + percentiles + cardinalities, never
// raw transcript content.
//
// Public surface:
//
//   summarizeTalkTurns(turns, { now? }) -> {
//     schemaVersion,
//     total,
//     audioDurationMs: { median, p90, max },
//     transcriptChars: { median, p90, max },
//     replyChars: { median, p90, max },
//     uniqueUserCount,
//     uniqueSessionCount,
//     replyRoleCounts: { preview, final },
//     authoritativePageTextRate, // 0..1
//     syncReadyRate,             // 0..1
//     ageBuckets: {
//       last5min, last1h, last24h, older
//     },
//     newestCreatedAtMs,
//     oldestCreatedAtMs
//   }

const SCHEMA_VERSION = 1;

function percentile(sortedNums, p) {
  if (!Array.isArray(sortedNums) || sortedNums.length === 0) return 0;
  if (sortedNums.length === 1) return sortedNums[0];
  const rank = (p / 100) * (sortedNums.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedNums[lo];
  const w = rank - lo;
  return Math.round((sortedNums[lo] * (1 - w) + sortedNums[hi] * w));
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function summarizeTalkTurns(turns, { now = Date.now() } = {}) {
  const list = Array.isArray(turns)
    ? turns
    : (turns && typeof turns[Symbol.iterator] === "function" ? [...turns] : []);
  if (list.length === 0) {
    return {
      schemaVersion: SCHEMA_VERSION,
      total: 0,
      audioDurationMs: { median: 0, p90: 0, max: 0 },
      transcriptChars: { median: 0, p90: 0, max: 0 },
      replyChars: { median: 0, p90: 0, max: 0 },
      uniqueUserCount: 0,
      uniqueSessionCount: 0,
      replyRoleCounts: { preview: 0, final: 0 },
      authoritativePageTextRate: 0,
      syncReadyRate: 0,
      ageBuckets: { last5min: 0, last1h: 0, last24h: 0, older: 0 },
      newestCreatedAtMs: 0,
      oldestCreatedAtMs: 0,
    };
  }
  const durations = [];
  const transcriptLens = [];
  const replyLens = [];
  const userIds = new Set();
  const sessionIds = new Set();
  const roleCounts = { preview: 0, final: 0 };
  let authoritativeHits = 0;
  let syncHits = 0;
  let newest = 0;
  let oldest = Number.POSITIVE_INFINITY;
  const ageBuckets = { last5min: 0, last1h: 0, last24h: 0, older: 0 };

  for (const turn of list) {
    if (!turn || typeof turn !== "object") continue;
    durations.push(safeNumber(turn.audioDurationMs));
    transcriptLens.push(typeof turn.transcript === "string" ? turn.transcript.length : 0);
    replyLens.push(typeof turn.reply === "string" ? turn.reply.length : 0);
    if (typeof turn.userId === "string" && turn.userId.trim()) userIds.add(turn.userId.trim());
    if (typeof turn.sessionId === "string" && turn.sessionId.trim()) sessionIds.add(turn.sessionId.trim());
    const replyRole = String(turn.renderContract?.reply_role || "").toLowerCase();
    if (replyRole === "preview") roleCounts.preview += 1;
    else roleCounts.final += 1;
    if (turn.renderContract?.authoritative_page_text_available) authoritativeHits += 1;
    if (turn.renderContract?.sync_ready) syncHits += 1;
    const createdAt = safeNumber(turn.createdAt);
    if (createdAt > 0) {
      if (createdAt > newest) newest = createdAt;
      if (createdAt < oldest) oldest = createdAt;
      const ageMs = now - createdAt;
      if (ageMs < 5 * 60 * 1000) ageBuckets.last5min += 1;
      else if (ageMs < 60 * 60 * 1000) ageBuckets.last1h += 1;
      else if (ageMs < 24 * 60 * 60 * 1000) ageBuckets.last24h += 1;
      else ageBuckets.older += 1;
    }
  }

  durations.sort((a, b) => a - b);
  transcriptLens.sort((a, b) => a - b);
  replyLens.sort((a, b) => a - b);

  return {
    schemaVersion: SCHEMA_VERSION,
    total: list.length,
    audioDurationMs: {
      median: percentile(durations, 50),
      p90: percentile(durations, 90),
      max: durations.length ? durations[durations.length - 1] : 0,
    },
    transcriptChars: {
      median: percentile(transcriptLens, 50),
      p90: percentile(transcriptLens, 90),
      max: transcriptLens.length ? transcriptLens[transcriptLens.length - 1] : 0,
    },
    replyChars: {
      median: percentile(replyLens, 50),
      p90: percentile(replyLens, 90),
      max: replyLens.length ? replyLens[replyLens.length - 1] : 0,
    },
    uniqueUserCount: userIds.size,
    uniqueSessionCount: sessionIds.size,
    replyRoleCounts: roleCounts,
    authoritativePageTextRate: Math.round((authoritativeHits / list.length) * 1000) / 1000,
    syncReadyRate: Math.round((syncHits / list.length) * 1000) / 1000,
    ageBuckets,
    newestCreatedAtMs: newest,
    oldestCreatedAtMs: oldest === Number.POSITIVE_INFINITY ? 0 : oldest,
  };
}

function mountTalkTurnStatsRoute(app, { getAllTalkTurns } = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountTalkTurnStatsRoute requires an Express app");
  }
  if (typeof getAllTalkTurns !== "function") {
    throw new Error("mountTalkTurnStatsRoute requires a getAllTalkTurns callback");
  }
  app.get("/talk/stats", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const turns = getAllTalkTurns();
      const summary = summarizeTalkTurns(turns);
      return res.status(200).json(summary);
    } catch (e) {
      return res.status(500).json({
        schemaVersion: SCHEMA_VERSION,
        total: 0,
        error: e?.message || "talk_turn_stats_failed",
      });
    }
  });
}

export {
  summarizeTalkTurns,
  mountTalkTurnStatsRoute,
  SCHEMA_VERSION as TALK_TURN_STATS_SCHEMA_VERSION,
};
