// T-talk-turn-meta-stats — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  summarizeTalkTurns,
  mountTalkTurnStatsRoute,
  TALK_TURN_STATS_SCHEMA_VERSION,
} from "../lib/talk_turn_stats.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function makeTurn(overrides = {}) {
  return {
    turnId: overrides.turnId || `t-${Math.random().toString(36).slice(2)}`,
    sessionId: overrides.sessionId || "session-1",
    userId: overrides.userId || "user-1",
    transcript: overrides.transcript || "Hello world.",
    reply: overrides.reply || "Hi there.",
    audioDurationMs: Number.isFinite(overrides.audioDurationMs) ? overrides.audioDurationMs : 1000,
    renderContract: overrides.renderContract || {
      reply_role: "final",
      authoritative_page_text_available: false,
      sync_ready: false,
    },
    createdAt: overrides.createdAt || Date.now(),
  };
}

// ---------- shape ----------

test("[talk-stats] empty turns returns zero-state envelope", () => {
  const s = summarizeTalkTurns([]);
  assert.equal(s.schemaVersion, TALK_TURN_STATS_SCHEMA_VERSION);
  assert.equal(s.total, 0);
  assert.equal(s.audioDurationMs.median, 0);
  assert.equal(s.uniqueUserCount, 0);
});

test("[talk-stats] handles iterable (Map.values()) input", () => {
  const map = new Map();
  map.set("a", makeTurn());
  map.set("b", makeTurn());
  const s = summarizeTalkTurns(map.values());
  assert.equal(s.total, 2);
});

// ---------- percentiles ----------

test("[talk-stats] computes median + p90 + max for audioDurationMs", () => {
  const turns = [];
  for (let i = 1; i <= 10; i += 1) turns.push(makeTurn({ audioDurationMs: i * 100 }));
  const s = summarizeTalkTurns(turns);
  assert.equal(s.audioDurationMs.max, 1000);
  assert.ok(s.audioDurationMs.median >= 400 && s.audioDurationMs.median <= 700);
  assert.ok(s.audioDurationMs.p90 >= 800);
});

test("[talk-stats] transcript + reply char counts use string lengths", () => {
  const turns = [
    makeTurn({ transcript: "x", reply: "yyyyy" }),
    makeTurn({ transcript: "xxx", reply: "y" }),
  ];
  const s = summarizeTalkTurns(turns);
  assert.equal(s.transcriptChars.max, 3);
  assert.equal(s.replyChars.max, 5);
});

// ---------- cardinality + role + flags ----------

test("[talk-stats] uniqueUserCount + uniqueSessionCount dedupe", () => {
  const turns = [
    makeTurn({ userId: "u1", sessionId: "s1" }),
    makeTurn({ userId: "u1", sessionId: "s2" }),
    makeTurn({ userId: "u2", sessionId: "s1" }),
  ];
  const s = summarizeTalkTurns(turns);
  assert.equal(s.uniqueUserCount, 2);
  assert.equal(s.uniqueSessionCount, 2);
});

test("[talk-stats] replyRoleCounts splits preview vs final", () => {
  const turns = [
    makeTurn({ renderContract: { reply_role: "preview", authoritative_page_text_available: false, sync_ready: false } }),
    makeTurn({ renderContract: { reply_role: "final", authoritative_page_text_available: true, sync_ready: true } }),
    makeTurn({ renderContract: { reply_role: "final", authoritative_page_text_available: false, sync_ready: false } }),
  ];
  const s = summarizeTalkTurns(turns);
  assert.equal(s.replyRoleCounts.preview, 1);
  assert.equal(s.replyRoleCounts.final, 2);
  assert.ok(s.authoritativePageTextRate > 0);
  assert.ok(s.syncReadyRate > 0);
});

// ---------- age buckets ----------

test("[talk-stats] age buckets categorize turns by recency", () => {
  const now = 1_700_000_000_000;
  const turns = [
    makeTurn({ createdAt: now - 1000 }),                     // last5min
    makeTurn({ createdAt: now - 30 * 60 * 1000 }),           // last1h
    makeTurn({ createdAt: now - 5 * 60 * 60 * 1000 }),       // last24h
    makeTurn({ createdAt: now - 2 * 24 * 60 * 60 * 1000 }),  // older
  ];
  const s = summarizeTalkTurns(turns, { now });
  assert.equal(s.ageBuckets.last5min, 1);
  assert.equal(s.ageBuckets.last1h, 1);
  assert.equal(s.ageBuckets.last24h, 1);
  assert.equal(s.ageBuckets.older, 1);
  assert.equal(s.newestCreatedAtMs, now - 1000);
});

// ---------- robustness ----------

test("[talk-stats] non-object turns are skipped silently", () => {
  const s = summarizeTalkTurns([null, undefined, makeTurn()]);
  assert.equal(s.total, 3); // .total reflects iteration count
  // Counts derived from valid entries — should not throw.
});

test("[talk-stats] non-finite audioDurationMs coerces to 0", () => {
  // Bypass makeTurn's fallback by writing the field directly.
  const base = makeTurn();
  const turns = [
    { ...base, audioDurationMs: Number.NaN },
    { ...base, audioDurationMs: -500 },
    { ...base, audioDurationMs: 1000 },
  ];
  const s = summarizeTalkTurns(turns);
  assert.equal(s.audioDurationMs.max, 1000);
  // Median of [0, 0, 1000] (sorted) = 0; p90 close to 1000.
  assert.equal(s.audioDurationMs.median, 0);
});

test("[talk-stats] determinism: same input → same output", () => {
  const turns = [
    makeTurn({ userId: "u1", audioDurationMs: 100, createdAt: 1 }),
    makeTurn({ userId: "u2", audioDurationMs: 200, createdAt: 2 }),
  ];
  const a = summarizeTalkTurns(turns, { now: 1000 });
  const b = summarizeTalkTurns(turns, { now: 1000 });
  assert.deepEqual(a, b);
});

// ---------- endpoint integration ----------

async function withTestServer(fn, turns = []) {
  const app = express();
  mountTalkTurnStatsRoute(app, { getAllTalkTurns: () => turns });
  const server = listenEphemeral(app);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[talk-stats] GET /talk/stats returns the summary", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/stats");
    assert.equal(r.status, 200);
    assert.equal(r.body.schemaVersion, TALK_TURN_STATS_SCHEMA_VERSION);
    assert.equal(r.body.total, 2);
  }, [
    makeTurn({ userId: "u1", audioDurationMs: 500 }),
    makeTurn({ userId: "u2", audioDurationMs: 1500 }),
  ]);
});

test("[talk-stats] GET /talk/stats with no turns returns zero envelope", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/stats");
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
  }, []);
});

test("[talk-stats] mountTalkTurnStatsRoute throws when getAllTalkTurns is missing", () => {
  const app = express();
  assert.throws(() => mountTalkTurnStatsRoute(app, {}));
});

// Codex review on #97 specifically asked for an explicit
// access-control policy and a test. The endpoint is safe-public
// (matches /ops/metrics, /ops/alerts, /ops/health-summary) BECAUSE
// the response carries counts/percentiles/cardinalities only — no
// per-user content. This test pins that property: even when the
// input has identifying content, the response body must not leak
// it.

test("[talk-stats] response contains no per-user content (no-leakage)", async () => {
  const sensitive = {
    transcript: "SECRET_TRANSCRIPT_PHRASE_DO_NOT_LEAK",
    reply: "SECRET_REPLY_PHRASE_DO_NOT_LEAK",
    userId: "SECRET_USER_ID_DO_NOT_LEAK",
    sessionId: "SECRET_SESSION_ID_DO_NOT_LEAK",
    turnId: "SECRET_TURN_ID_DO_NOT_LEAK",
  };
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/stats");
    assert.equal(r.status, 200);
    const serialized = JSON.stringify(r.body);
    assert.ok(!serialized.includes("SECRET_TRANSCRIPT_PHRASE"), "transcript content must not appear in /talk/stats");
    assert.ok(!serialized.includes("SECRET_REPLY_PHRASE"), "reply content must not appear in /talk/stats");
    assert.ok(!serialized.includes("SECRET_USER_ID"), "userId must not appear in /talk/stats");
    assert.ok(!serialized.includes("SECRET_SESSION_ID"), "sessionId must not appear in /talk/stats");
    assert.ok(!serialized.includes("SECRET_TURN_ID"), "turnId must not appear in /talk/stats");
    // Cardinality counts are OK — there should be 1 unique user / session.
    assert.equal(r.body.uniqueUserCount, 1);
    assert.equal(r.body.uniqueSessionCount, 1);
  }, [makeTurn(sensitive)]);
});

test("[talk-stats] response keys are exactly the canonical set (no fields ever added silently)", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/stats");
    assert.equal(r.status, 200);
    const allowed = new Set([
      "schemaVersion",
      "total",
      "audioDurationMs",
      "transcriptChars",
      "replyChars",
      "uniqueUserCount",
      "uniqueSessionCount",
      "replyRoleCounts",
      "authoritativePageTextRate",
      "syncReadyRate",
      "ageBuckets",
      "newestCreatedAtMs",
      "oldestCreatedAtMs",
    ]);
    for (const k of Object.keys(r.body)) {
      assert.ok(allowed.has(k), `unexpected response key in /talk/stats: ${k} (would risk leaking per-user content)`);
    }
  }, [makeTurn(), makeTurn()]);
});
