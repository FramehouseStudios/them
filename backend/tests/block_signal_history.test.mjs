// T-block-signal-history-tracking — unit + integration tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { mountBlockSignalRoute } from "../lib/block_signal_route.js";

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-blockhist-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

// ---------- recordBlockSignalSample ----------

test("[block-history] recordBlockSignalSample appends an entry to habits", async () => {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "u1", score: 0.3, level: "medium", atMs: 1000 });
  const habits = await store.getHabitsForUser("u1");
  assert.ok(Array.isArray(habits.block_signal_history));
  assert.equal(habits.block_signal_history.length, 1);
  assert.equal(habits.block_signal_history[0].level, "medium");
  assert.equal(habits.block_signal_history[0].score, 0.3);
});

test("[block-history] missing userId is a no-op", async () => {
  const store = freshStore();
  const r = await store.recordBlockSignalSample({ userId: "", score: 0.5, level: "medium" });
  assert.equal(r.skipped, true);
});

test("[block-history] debounces same-level samples within 60s", async () => {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "u-debounce", score: 0.1, level: "low", atMs: 1000 });
  await store.recordBlockSignalSample({ userId: "u-debounce", score: 0.15, level: "low", atMs: 30_000 });
  const habits = await store.getHabitsForUser("u-debounce");
  assert.equal(habits.block_signal_history.length, 1);
});

test("[block-history] records when level changes within the debounce window", async () => {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "u-change", score: 0.1, level: "low", atMs: 1000 });
  await store.recordBlockSignalSample({ userId: "u-change", score: 0.5, level: "medium", atMs: 30_000 });
  const habits = await store.getHabitsForUser("u-change");
  assert.equal(habits.block_signal_history.length, 2);
});

test("[block-history] records when 60+s passes even on same level", async () => {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "u-time", score: 0.1, level: "low", atMs: 1000 });
  await store.recordBlockSignalSample({ userId: "u-time", score: 0.12, level: "low", atMs: 70_000 });
  const habits = await store.getHabitsForUser("u-time");
  assert.equal(habits.block_signal_history.length, 2);
});

test("[block-history] caps the ring buffer at 30 entries", async () => {
  const store = freshStore();
  // Alternate levels every 60s so debounce doesn't kick in.
  for (let i = 0; i < 50; i += 1) {
    await store.recordBlockSignalSample({
      userId: "u-cap",
      score: 0.5,
      level: i % 2 === 0 ? "medium" : "low",
      atMs: i * 100_000,
    });
  }
  const habits = await store.getHabitsForUser("u-cap");
  assert.equal(habits.block_signal_history.length, 30);
  // Newest entries preserved (last entry from the loop).
  assert.equal(habits.block_signal_history[29].at, 49 * 100_000);
});

test("[block-history] non-finite score coerces to 0", async () => {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "u-nan", score: Number.NaN, level: "medium" });
  const habits = await store.getHabitsForUser("u-nan");
  assert.equal(habits.block_signal_history[0].score, 0);
});

test("[block-history] atMs=0 is honored verbatim (regression against falsy-coerce bug)", async () => {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "u-zero", score: 0.1, level: "low", atMs: 0 });
  const habits = await store.getHabitsForUser("u-zero");
  assert.equal(habits.block_signal_history.length, 1);
  assert.equal(habits.block_signal_history[0].at, 0);
});

test("[block-history] non-finite atMs falls back to nowMs", async () => {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "u-nan-at", score: 0.1, level: "low", atMs: Number.NaN });
  await store.recordBlockSignalSample({ userId: "u-nan-at", score: 0.2, level: "medium", atMs: "not a number" });
  const habits = await store.getHabitsForUser("u-nan-at");
  // Both samples recorded with sensible (positive) timestamps.
  assert.equal(habits.block_signal_history.length, 2);
  for (const entry of habits.block_signal_history) {
    assert.ok(Number.isFinite(entry.at) && entry.at > 0, `bad at: ${entry.at}`);
  }
});

// Codex review on #124 specifically asked: atMs=0 (explicit zero)
// must be honored, but atMs=null / atMs="" must fall back to nowMs().
// Naive Number()-coercion treats them all the same (0). These tests
// pin the distinction.

test("[block-history] atMs=null falls back to nowMs (not 0)", async () => {
  const store = freshStore();
  const before = Date.now();
  await store.recordBlockSignalSample({ userId: "u-null", score: 0.1, level: "low", atMs: null });
  const habits = await store.getHabitsForUser("u-null");
  assert.equal(habits.block_signal_history.length, 1);
  const at = habits.block_signal_history[0].at;
  assert.ok(at >= before, `null atMs should fall back to nowMs (got ${at}, expected >= ${before})`);
  assert.notEqual(at, 0, "null atMs should NOT be recorded as 0");
});

test("[block-history] atMs='' (empty string) falls back to nowMs (not 0)", async () => {
  const store = freshStore();
  const before = Date.now();
  await store.recordBlockSignalSample({ userId: "u-empty", score: 0.1, level: "low", atMs: "" });
  const habits = await store.getHabitsForUser("u-empty");
  assert.equal(habits.block_signal_history.length, 1);
  const at = habits.block_signal_history[0].at;
  assert.ok(at >= before, `"" atMs should fall back to nowMs (got ${at}, expected >= ${before})`);
  assert.notEqual(at, 0, '"" atMs should NOT be recorded as 0');
});

test("[block-history] atMs=undefined falls back to nowMs (not 0)", async () => {
  const store = freshStore();
  const before = Date.now();
  await store.recordBlockSignalSample({ userId: "u-undef", score: 0.1, level: "low", atMs: undefined });
  const habits = await store.getHabitsForUser("u-undef");
  assert.equal(habits.block_signal_history.length, 1);
  const at = habits.block_signal_history[0].at;
  assert.ok(at >= before, `undefined atMs should fall back to nowMs`);
});

test("[block-history] atMs=0 (explicit zero) vs atMs=null are observably different", async () => {
  // Round-trip distinction check: same userId + level, two records,
  // one with atMs:0 and one with atMs:null. Should produce 2 entries
  // with distinct `at` values (debounce only blocks same-level
  // within 60s; null falls back to current ms which is far above 0).
  const storeZero = freshStore();
  await storeZero.recordBlockSignalSample({ userId: "u-distinct", score: 0.1, level: "low", atMs: 0 });
  const habitsZero = await storeZero.getHabitsForUser("u-distinct");
  assert.equal(habitsZero.block_signal_history[0].at, 0);

  const storeNull = freshStore();
  await storeNull.recordBlockSignalSample({ userId: "u-distinct", score: 0.1, level: "low", atMs: null });
  const habitsNull = await storeNull.getHabitsForUser("u-distinct");
  assert.notEqual(habitsNull.block_signal_history[0].at, 0);
});

// ---------- endpoint integration ----------

async function withTestServer(fn, { userId = "u-test" } = {}) {
  const store = freshStore();
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  }
  mountBlockSignalRoute(app, { creativeMemoryStore: store });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[block-history] GET /memory/block-signal appends a sample to the user's history", async () => {
  await withTestServer(async ({ baseURL, store }) => {
    const r = await get(baseURL, "/memory/block-signal");
    assert.equal(r.status, 200);
    const habits = await store.getHabitsForUser("u-test");
    assert.ok(Array.isArray(habits?.block_signal_history));
    assert.equal(habits.block_signal_history.length, 1);
    assert.equal(habits.block_signal_history[0].level, "low");
  });
});

test("[block-history] unauthenticated request returns 401 and appends no history", async () => {
  await withTestServer(
    async ({ baseURL, store }) => {
      const r = await get(baseURL, "/memory/block-signal");
      assert.equal(r.status, 401);
      assert.equal(r.body.error, "user_auth_required");
      const habits = await store.getHabitsForUser("");
      assert.equal(habits, null);
    },
    { userId: null },
  );
});
