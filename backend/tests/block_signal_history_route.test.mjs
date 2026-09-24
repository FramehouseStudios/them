// T-block-signal-history-route — unit + integration tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import {
  mountBlockSignalHistoryRoute,
  summarizeHistory,
  BLOCK_SIGNAL_HISTORY_SCHEMA_VERSION,
} from "../lib/block_signal_history_route.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-bshist-route-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

// ---------- summarizer ----------

test("[bs-history-route] empty/undefined yields zero envelope", () => {
  assert.equal(summarizeHistory(undefined).counts.total, 0);
  assert.equal(summarizeHistory([]).counts.total, 0);
});

test("[bs-history-route] counts by level + tracks newest/oldest", () => {
  const s = summarizeHistory([
    { at: 100, score: 0.1, level: "low" },
    { at: 200, score: 0.5, level: "medium" },
    { at: 300, score: 0.9, level: "high" },
    { at: 400, score: 0.6, level: "medium" },
  ]);
  assert.equal(s.counts.total, 4);
  assert.equal(s.counts.byLevel.low, 1);
  assert.equal(s.counts.byLevel.medium, 2);
  assert.equal(s.counts.byLevel.high, 1);
  assert.equal(s.newestAt, 400);
  assert.equal(s.oldestAt, 100);
});

test("[bs-history-route] non-object entries are filtered", () => {
  const s = summarizeHistory([null, undefined, "foo", { at: 1, score: 0, level: "low" }]);
  assert.equal(s.counts.total, 1);
});

test("[bs-history-route] non-finite at/score coerced; missing level defaults to low", () => {
  const s = summarizeHistory([{ at: NaN, score: NaN }]);
  assert.equal(s.counts.total, 1);
  assert.equal(s.entries[0].at, 0);
  assert.equal(s.entries[0].score, 0);
  assert.equal(s.entries[0].level, "low");
});

// ---------- endpoint integration ----------

async function withTestServer(fn, { userId = "u-test", seed = null } = {}) {
  const store = freshStore();
  if (seed) await seed(store);
  const app = express();
  if (userId !== null) {
    app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  }
  mountBlockSignalHistoryRoute(app, { creativeMemoryStore: store });
  const server = listenEphemeral(app);
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

test("[bs-history-route] GET cold user → zero envelope", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/memory/block-signal/history");
    assert.equal(r.status, 200);
    assert.equal(r.body.schemaVersion, BLOCK_SIGNAL_HISTORY_SCHEMA_VERSION);
    assert.equal(r.body.counts.total, 0);
  });
});

test("[bs-history-route] GET reflects recorded samples", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/memory/block-signal/history");
      assert.equal(r.status, 200);
      assert.equal(r.body.counts.total, 3);
      assert.equal(r.body.counts.byLevel.low, 1);
      assert.equal(r.body.counts.byLevel.medium, 1);
      assert.equal(r.body.counts.byLevel.high, 1);
      assert.equal(r.body.newestAt, 600_000);
    },
    {
      seed: async (store) => {
        // 60+s apart to bypass debounce, varied levels.
        await store.recordBlockSignalSample({ userId: "u-test", score: 0.1, level: "low", atMs: 1000 });
        await store.recordBlockSignalSample({ userId: "u-test", score: 0.5, level: "medium", atMs: 300_000 });
        await store.recordBlockSignalSample({ userId: "u-test", score: 0.9, level: "high", atMs: 600_000 });
      },
    },
  );
});

test("[bs-history-route] GET unauthenticated returns 401", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/memory/block-signal/history");
      assert.equal(r.status, 401);
      assert.equal(r.body.error, "user_auth_required");
    },
    { userId: null },
  );
});

test("[bs-history-route] mountBlockSignalHistoryRoute requires an Express app", () => {
  assert.throws(() => mountBlockSignalHistoryRoute(null, { creativeMemoryStore: {} }));
});

test("[bs-history-route] mountBlockSignalHistoryRoute requires a store", () => {
  const app = express();
  assert.throws(() => mountBlockSignalHistoryRoute(app, {}));
});
