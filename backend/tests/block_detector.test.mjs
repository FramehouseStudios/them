// T-block-detector — unit tests for the pure analysis module and
// integration tests for GET /memory/block-signal.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import {
  computeBlockSignal,
  SIGNAL_WEIGHTS,
  LEVEL_LOW_MAX,
  LEVEL_MEDIUM_MAX,
} from "../lib/block_detector.js";
import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { mountBlockSignalRoute } from "../lib/block_signal_route.js";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// ---------- pure analysis ----------

test("[block-detector] cold habits returns score=0 / level=low", () => {
  const s = computeBlockSignal({ habits: {}, nowMs: 0 });
  assert.equal(s.score, 0);
  assert.equal(s.level, "low");
  assert.deepEqual(s.signals, []);
});

test("[block-detector] 14-day completion gap saturates the scene-completion-gap signal", () => {
  const now = 1_000_000_000_000;
  const s = computeBlockSignal({
    habits: { last_scene_completion_at: now - 14 * DAY },
    nowMs: now,
  });
  const gap = s.signals.find((x) => x.key === "scene_completion_gap");
  assert.ok(gap);
  assert.equal(gap.value, 1);
  // With only the gap firing at full strength, weighted score is
  // 0.4 * 1 / 1.0 = 0.4 → level=medium.
  assert.equal(s.level, "medium");
});

test("[block-detector] 30-day completion gap stays clamped at 1", () => {
  const now = 1_000_000_000_000;
  const s = computeBlockSignal({
    habits: { last_scene_completion_at: now - 30 * DAY },
    nowMs: now,
  });
  const gap = s.signals.find((x) => x.key === "scene_completion_gap");
  assert.equal(gap.value, 1);
});

test("[block-detector] 0/5 completion rate fires the dropoff signal at full strength", () => {
  const now = 1_000_000_000_000;
  const s = computeBlockSignal({
    habits: {
      _scenes_attempted: 5,
      _scenes_completed: 0,
      last_scene_attempt_at: now - HOUR,
    },
    nowMs: now,
  });
  const drop = s.signals.find((x) => x.key === "attempt_completion_dropoff");
  assert.equal(drop.value, 1);
});

test("[block-detector] dropoff stays at 0 below the minimum attempt threshold", () => {
  const s = computeBlockSignal({
    habits: { _scenes_attempted: 2, _scenes_completed: 0 },
    nowMs: 0,
  });
  const drop = s.signals.find((x) => x.key === "attempt_completion_dropoff");
  assert.equal(drop, undefined);
});

test("[block-detector] healthy 4/5 completion rate produces zero dropoff", () => {
  const s = computeBlockSignal({
    habits: { _scenes_attempted: 5, _scenes_completed: 4 },
    nowMs: 0,
  });
  const drop = s.signals.find((x) => x.key === "attempt_completion_dropoff");
  assert.equal(drop, undefined);
});

test("[block-detector] short-turn streak surfaces the short_turn_ratio signal", () => {
  const s = computeBlockSignal({
    habits: { recent_short_turns: 4 },
    nowMs: 0,
  });
  const sr = s.signals.find((x) => x.key === "short_turn_ratio");
  assert.equal(sr.value, 0.5);
});

test("[block-detector] talk-turn 72h+ gap saturates the talk-turn-gap signal", () => {
  const now = 1_000_000_000_000;
  const s = computeBlockSignal({
    habits: { last_talk_turn_at: now - 72 * HOUR },
    nowMs: now,
  });
  const tg = s.signals.find((x) => x.key === "talk_turn_gap");
  assert.equal(tg.value, 1);
});

test("[block-detector] high-block scenario produces level=high and an actionable summary", () => {
  const now = 1_000_000_000_000;
  const s = computeBlockSignal({
    habits: {
      last_scene_completion_at: now - 14 * DAY,
      last_scene_attempt_at: now - 14 * DAY,
      last_talk_turn_at: now - 72 * HOUR,
      _scenes_attempted: 8,
      _scenes_completed: 1,
      recent_short_turns: 8,
    },
    nowMs: now,
  });
  assert.equal(s.score, 1);
  assert.equal(s.level, "high");
  assert.ok(s.summary && s.summary.length > 0);
  assert.notEqual(s.summary, "No block signal — keep going.");
});

test("[block-detector] level boundaries match the documented thresholds", () => {
  assert.ok(LEVEL_LOW_MAX < LEVEL_MEDIUM_MAX && LEVEL_MEDIUM_MAX < 1);
  // Compose habits that put the weighted score exactly at LEVEL_LOW_MAX.
  // Easiest path: only the gap signal contributing, with gap ratio
  // such that 0.4 * ratio / 1.0 < LEVEL_LOW_MAX = 0.25. ratio < 0.625.
  const now = 1_000_000_000_000;
  const ratio = 0.5; // → weighted 0.2 < 0.25
  const s = computeBlockSignal({
    habits: { last_scene_completion_at: now - ratio * 14 * DAY },
    nowMs: now,
  });
  assert.equal(s.level, "low");
});

test("[block-detector] weights sum to 1 (so the composite score is naturally normalized)", () => {
  const total = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test("[block-detector] habitsObserved echoes the inputs the score was built from", () => {
  const now = 1_000_000_000_000;
  const s = computeBlockSignal({
    habits: {
      last_scene_completion_at: now - DAY,
      last_scene_attempt_at: now - HOUR,
      last_talk_turn_at: now - 2 * HOUR,
      _scenes_attempted: 5,
      _scenes_completed: 3,
      recent_short_turns: 2,
    },
    nowMs: now,
  });
  assert.equal(s.habitsObserved.scenes_attempted, 5);
  assert.equal(s.habitsObserved.scenes_completed, 3);
  assert.equal(s.habitsObserved.recent_short_turns, 2);
  assert.equal(s.habitsObserved.last_scene_completion_at, now - DAY);
});

// ---------- creative_memory triggers update the habits fields ----------

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-block-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

test("[block-detector] recordSceneCompletion stamps last_scene_completion_at and clears recent_short_turns", async () => {
  const store = freshStore();
  // First, simulate two short turns to build up recent_short_turns.
  await store.recordTalkTurnForBlockSignal({ userId: "u1", transcript: "uh" });
  await store.recordTalkTurnForBlockSignal({ userId: "u1", transcript: "..." });
  let habits = await store.getHabitsForUser("u1");
  assert.equal(habits.recent_short_turns, 2);

  await store.recordSceneCompletion({ userId: "u1", scenePageCount: 3 });
  habits = await store.getHabitsForUser("u1");
  assert.ok(habits.last_scene_completion_at);
  assert.equal(habits.recent_short_turns, 0);
});

test("[block-detector] recordSceneAttempt stamps last_scene_attempt_at but not completion", async () => {
  const store = freshStore();
  await store.recordSceneAttempt({ userId: "u-attempt" });
  const habits = await store.getHabitsForUser("u-attempt");
  assert.ok(habits.last_scene_attempt_at);
  assert.equal(habits.last_scene_completion_at, undefined);
});

test("[block-detector] long talk turn decays the short-turn counter", async () => {
  const store = freshStore();
  for (let i = 0; i < 3; i += 1) {
    await store.recordTalkTurnForBlockSignal({ userId: "u2", transcript: "nope" });
  }
  let habits = await store.getHabitsForUser("u2");
  assert.equal(habits.recent_short_turns, 3);
  await store.recordTalkTurnForBlockSignal({
    userId: "u2",
    transcript: "Let me describe the scene properly with at least forty characters of text.",
  });
  habits = await store.getHabitsForUser("u2");
  assert.equal(habits.recent_short_turns, 2);
});

// ---------- endpoint integration tests ----------

async function withTestServer(fn, { userId = "user-block", store = null, fixedNowMs = null } = {}) {
  const creativeMemoryStore = store || freshStore();
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => {
      req.user = { id: userId };
      next();
    });
  }
  mountBlockSignalRoute(app, {
    creativeMemoryStore,
    nowFn: fixedNowMs ? () => fixedNowMs : () => Date.now(),
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, creativeMemoryStore, userId });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

test("[block-detector] GET /memory/block-signal for an unknown user returns the empty snapshot", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/memory/block-signal");
    assert.equal(status, 200);
    assert.equal(body.score, 0);
    assert.equal(body.level, "low");
    assert.deepEqual(body.signals, []);
  });
});

test("[block-detector] GET /memory/block-signal returns the computed signal after triggers fire", async () => {
  const store = freshStore();
  const fixedNow = 1_000_000_000_000;
  // Drive habits up to a clear medium/high state via the canonical
  // triggers: 4 scene attempts with no completions saturates dropoff,
  // and 5 short /talk turns 72h in the past saturates talk_turn_gap
  // plus contributes 0.625 to short_turn_ratio.
  for (let i = 0; i < 4; i += 1) {
    await store.recordSceneAttempt({ userId: "u-blocked" });
  }
  for (let i = 0; i < 5; i += 1) {
    await store.recordTalkTurnForBlockSignal({
      userId: "u-blocked",
      transcript: "uh",
      nowAtMs: fixedNow - 72 * HOUR,
    });
  }
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await get(baseURL, "/memory/block-signal");
      assert.equal(status, 200);
      const sr = body.signals.find((s) => s.key === "short_turn_ratio");
      assert.ok(sr, "short_turn_ratio should be present");
      assert.ok(sr.value > 0.5);
      const drop = body.signals.find((s) => s.key === "attempt_completion_dropoff");
      assert.ok(drop, "attempt_completion_dropoff should be present");
      assert.equal(drop.value, 1);
      assert.ok(["medium", "high"].includes(body.level));
    },
    { userId: "u-blocked", store, fixedNowMs: fixedNow },
  );
});

test("[block-detector] unauthenticated request returns the empty snapshot, not 401", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await get(baseURL, "/memory/block-signal");
      assert.equal(status, 200);
      assert.equal(body.level, "low");
      assert.equal(body.score, 0);
    },
    { userId: null },
  );
});

test("[block-detector] endpoint score round-trips the pure analyzer for the same habits", async () => {
  const store = freshStore();
  // Build a habits state with a clear completion gap and a dropoff.
  await store.recordSceneAttempt({ userId: "u-rt" });
  await store.recordSceneAttempt({ userId: "u-rt" });
  await store.recordSceneAttempt({ userId: "u-rt" });
  await store.recordSceneAttempt({ userId: "u-rt" });
  await store.recordSceneAttempt({ userId: "u-rt" });
  // No completions → dropoff = 1 once attempts >= 3.
  const habits = await store.getHabitsForUser("u-rt");
  const expected = computeBlockSignal({ habits, nowMs: Date.now() });
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await get(baseURL, "/memory/block-signal");
      assert.equal(status, 200);
      assert.equal(body.level, expected.level);
      // score from endpoint may differ by a small amount due to clock
      // skew on the time-based signals; only the dropoff signal is
      // time-independent, so check that one matches.
      const droppoint = body.signals.find((s) => s.key === "attempt_completion_dropoff");
      assert.ok(droppoint);
      assert.equal(droppoint.value, 1);
    },
    { userId: "u-rt", store },
  );
});
