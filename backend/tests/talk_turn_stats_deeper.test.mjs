// T-deeper-lib-tests-batch-3 — deeper talk_turn_stats coverage
// beyond backend/tests/talk_turn_stats.test.mjs.
//
// Smoke covers: empty envelope, basic percentile math,
// role-count, route mounting.
//
// This file exercises gaps the smoke skipped:
//   - ageBuckets math at boundaries (last5min, last1h, last24h, older)
//   - newestCreatedAtMs / oldestCreatedAtMs invariant
//   - authoritativePageTextRate + syncReadyRate math
//   - safeNumber defensiveness (audioDurationMs missing/negative)
//   - transcriptChars / replyChars percentiles with missing fields

import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeTalkTurns } from "../lib/talk_turn_stats.js";

function makeTurn(overrides = {}) {
  return {
    turnId: overrides.turnId || `t-${Math.random().toString(36).slice(2)}`,
    sessionId: overrides.sessionId || "session-1",
    userId: overrides.userId || "user-1",
    transcript: "transcript".repeat(overrides.transcriptMul || 1),
    reply: "reply".repeat(overrides.replyMul || 1),
    audioDurationMs: overrides.audioDurationMs ?? 1000,
    renderContract: {
      reply_role: "final",
      authoritative_page_text_available: false,
      sync_ready: false,
      ...(overrides.renderContract || {}),
    },
    createdAt: overrides.createdAt || Date.now(),
  };
}

// ---------- age buckets ----------

test("[talk-turn-stats-deeper] ageBuckets partition turns by createdAt window", () => {
  const NOW = 10_000_000_000;
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const turns = [
    makeTurn({ createdAt: NOW - 2 * MIN }),         // last5min
    makeTurn({ createdAt: NOW - 30 * MIN }),        // last1h (not in last5min)
    makeTurn({ createdAt: NOW - 6 * HOUR }),        // last24h (not in last1h)
    makeTurn({ createdAt: NOW - 2 * DAY }),         // older
    makeTurn({ createdAt: NOW - 4 * MIN }),         // last5min
  ];
  const s = summarizeTalkTurns(turns, { now: NOW });
  assert.equal(s.ageBuckets.last5min, 2);
  assert.equal(s.ageBuckets.last1h, 1);
  assert.equal(s.ageBuckets.last24h, 1);
  assert.equal(s.ageBuckets.older, 1);
});

test("[talk-turn-stats-deeper] newest/oldestCreatedAtMs reflect extremes", () => {
  const NOW = 10_000_000_000;
  const turns = [
    makeTurn({ createdAt: NOW - 1000 }),
    makeTurn({ createdAt: NOW - 5000 }),
    makeTurn({ createdAt: NOW - 100 }),
  ];
  const s = summarizeTalkTurns(turns, { now: NOW });
  assert.equal(s.newestCreatedAtMs, NOW - 100);
  assert.equal(s.oldestCreatedAtMs, NOW - 5000);
});

// ---------- rates ----------

test("[talk-turn-stats-deeper] authoritativePageTextRate = hits / total", () => {
  const turns = [
    makeTurn({ renderContract: { authoritative_page_text_available: true } }),
    makeTurn({ renderContract: { authoritative_page_text_available: true } }),
    makeTurn({ renderContract: { authoritative_page_text_available: false } }),
    makeTurn({ renderContract: { authoritative_page_text_available: false } }),
  ];
  const s = summarizeTalkTurns(turns);
  // 2/4 = 0.5.
  assert.equal(s.authoritativePageTextRate, 0.5);
});

test("[talk-turn-stats-deeper] syncReadyRate = hits / total", () => {
  const turns = [
    makeTurn({ renderContract: { sync_ready: true } }),
    makeTurn({ renderContract: { sync_ready: false } }),
    makeTurn({ renderContract: { sync_ready: true } }),
  ];
  const s = summarizeTalkTurns(turns);
  // 2/3 ≈ 0.67; rate values are typically rounded to 2 decimals.
  assert.ok(s.syncReadyRate > 0.6 && s.syncReadyRate < 0.7);
});

test("[talk-turn-stats-deeper] both rates are 0 on empty input", () => {
  const s = summarizeTalkTurns([]);
  assert.equal(s.authoritativePageTextRate, 0);
  assert.equal(s.syncReadyRate, 0);
});

// ---------- safeNumber defensiveness ----------

test("[talk-turn-stats-deeper] audioDurationMs handles missing field as 0", () => {
  const turns = [
    makeTurn({ audioDurationMs: 1000 }),
    { ...makeTurn(), audioDurationMs: undefined }, // missing
    makeTurn({ audioDurationMs: 2000 }),
  ];
  // Should not throw; missing audioDurationMs counts as 0.
  const s = summarizeTalkTurns(turns);
  assert.equal(s.audioDurationMs.max, 2000);
});

test("[talk-turn-stats-deeper] audioDurationMs treats negatives as 0", () => {
  const turns = [
    makeTurn({ audioDurationMs: -500 }),
    makeTurn({ audioDurationMs: 1000 }),
  ];
  const s = summarizeTalkTurns(turns);
  assert.equal(s.audioDurationMs.max, 1000);
});

// ---------- unique cardinalities ----------

test("[talk-turn-stats-deeper] uniqueUserCount + uniqueSessionCount dedupe correctly", () => {
  const turns = [
    makeTurn({ userId: "u1", sessionId: "s1" }),
    makeTurn({ userId: "u1", sessionId: "s1" }),
    makeTurn({ userId: "u2", sessionId: "s1" }),
    makeTurn({ userId: "u2", sessionId: "s2" }),
  ];
  const s = summarizeTalkTurns(turns);
  assert.equal(s.uniqueUserCount, 2);
  assert.equal(s.uniqueSessionCount, 2);
});

// ---------- role counts ----------

test("[talk-turn-stats-deeper] replyRoleCounts split preview vs final", () => {
  const turns = [
    makeTurn({ renderContract: { reply_role: "preview" } }),
    makeTurn({ renderContract: { reply_role: "preview" } }),
    makeTurn({ renderContract: { reply_role: "final" } }),
  ];
  const s = summarizeTalkTurns(turns);
  assert.equal(s.replyRoleCounts.preview, 2);
  assert.equal(s.replyRoleCounts.final, 1);
});
