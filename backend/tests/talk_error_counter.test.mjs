// T-talk-error-rate-tracker — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  incrementErrorCounter,
  getErrorCounts,
  resetErrorCounters,
  mountTalkErrorRoute,
  TALK_ERROR_COUNTER_SCHEMA_VERSION,
} from "../lib/talk_error_counter.js";

// Tests use the module-singleton, so we reset between tests.

test("[talk-errors] cold state returns empty snapshot", () => {
  resetErrorCounters();
  const s = getErrorCounts();
  assert.equal(s.schemaVersion, TALK_ERROR_COUNTER_SCHEMA_VERSION);
  assert.equal(s.total, 0);
  assert.deepEqual(s.counts, {});
  assert.equal(s.errorRatePerHour, 0);
});

test("[talk-errors] incrementErrorCounter bumps the per-class counter", () => {
  resetErrorCounters();
  incrementErrorCounter("realtime_supplier_unavailable");
  incrementErrorCounter("realtime_supplier_unavailable");
  incrementErrorCounter("realtime_supplier_request_failed");
  const s = getErrorCounts();
  assert.equal(s.total, 3);
  assert.equal(s.counts.realtime_supplier_unavailable, 2);
  assert.equal(s.counts.realtime_supplier_request_failed, 1);
});

test("[talk-errors] empty / non-string class collapses into 'unknown'", () => {
  resetErrorCounters();
  incrementErrorCounter("");
  incrementErrorCounter(null);
  incrementErrorCounter(undefined);
  const s = getErrorCounts();
  assert.equal(s.counts.unknown, 3);
});

test("[talk-errors] lastOccurrence records the most recent timestamp per class", () => {
  resetErrorCounters();
  incrementErrorCounter("mint_failed", { now: 1000 });
  incrementErrorCounter("mint_failed", { now: 2000 });
  const s = getErrorCounts();
  assert.equal(s.lastOccurrence.mint_failed, 2000);
});

test("[talk-errors] since filter scopes counts to the window", () => {
  resetErrorCounters();
  incrementErrorCounter("a", { now: 1000 });
  incrementErrorCounter("b", { now: 2000 });
  incrementErrorCounter("c", { now: 3000 });
  // since=2000 should keep only b + c.
  const s = getErrorCounts({ since: 2000, now: 4000 });
  assert.equal(s.total, 2);
  assert.ok(s.counts.b);
  assert.ok(s.counts.c);
  assert.equal(s.counts.a, undefined);
});

test("[talk-errors] errorRatePerHour is non-zero once errors exist", () => {
  resetErrorCounters();
  // 10 errors over a 30-minute window.
  const start = 1_700_000_000_000;
  for (let i = 0; i < 10; i += 1) {
    incrementErrorCounter("supplier_timeout", { now: start + i * 60_000 });
  }
  const s = getErrorCounts({ now: start + 30 * 60_000 });
  assert.equal(s.total, 10);
  // 10 errors / 30min ≈ 20 per hour
  assert.ok(s.errorRatePerHour > 0);
});

test("[talk-errors] resetErrorCounters clears everything", () => {
  incrementErrorCounter("a");
  incrementErrorCounter("b");
  resetErrorCounters();
  const s = getErrorCounts();
  assert.equal(s.total, 0);
  assert.deepEqual(s.counts, {});
});

// ---------- endpoint integration ----------

async function withTestServer(fn) {
  const app = express();
  mountTalkErrorRoute(app);
  const server = app.listen(0);
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

test("[talk-errors] GET /talk/errors returns the snapshot", async () => {
  resetErrorCounters();
  incrementErrorCounter("supplier_unavailable");
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/errors");
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 1);
    assert.equal(r.body.counts.supplier_unavailable, 1);
  });
});

test("[talk-errors] GET /talk/errors?sinceMs= filters the window", async () => {
  resetErrorCounters();
  incrementErrorCounter("old_class", { now: 1000 });
  incrementErrorCounter("new_class", { now: 5000 });
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/errors?sinceMs=2000");
    assert.equal(r.status, 200);
    assert.equal(r.body.counts.new_class, 1);
    assert.equal(r.body.counts.old_class, undefined);
  });
});

test("[talk-errors] GET /talk/errors cold returns zero-state envelope", async () => {
  resetErrorCounters();
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/errors");
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 0);
  });
});

test("[talk-errors] mountTalkErrorRoute requires an Express app", () => {
  assert.throws(() => mountTalkErrorRoute(null));
});
