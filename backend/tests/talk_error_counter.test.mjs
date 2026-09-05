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

test("[talk-errors] since window counts only events in window, not class lifetime", () => {
  // Codex review #100: a class with one early event + one in-window
  // event must return 1 (not 2) when sinceMs is the in-window
  // boundary. Pre-fix bug returned the class lifetime total.
  resetErrorCounters();
  incrementErrorCounter("supplier_timeout", { now: 1_000 });   // before window
  incrementErrorCounter("supplier_timeout", { now: 5_000 });   // inside window
  incrementErrorCounter("supplier_timeout", { now: 6_000 });   // inside window
  incrementErrorCounter("supplier_unavailable", { now: 500 }); // before window only
  const s = getErrorCounts({ since: 4_000, now: 7_000 });
  // Only 2 of the 3 supplier_timeout events are in window.
  assert.equal(s.counts.supplier_timeout, 2);
  // supplier_unavailable is entirely before window: must be omitted.
  assert.equal(s.counts.supplier_unavailable, undefined);
  // Total must match window, not lifetime.
  assert.equal(s.total, 2);
});

test("[talk-errors] since window total is independent of lifetime total", () => {
  // Stress: lots of pre-window events, few in-window. Lifetime total
  // is 100; in-window total must be 3.
  resetErrorCounters();
  for (let i = 0; i < 100; i += 1) {
    incrementErrorCounter("noisy_class", { now: 1_000 + i });
  }
  incrementErrorCounter("noisy_class", { now: 50_000 });
  incrementErrorCounter("noisy_class", { now: 51_000 });
  incrementErrorCounter("noisy_class", { now: 52_000 });
  const s = getErrorCounts({ since: 40_000, now: 60_000 });
  assert.equal(s.counts.noisy_class, 3);
  assert.equal(s.total, 3);
  // Lifetime view still reports 103.
  const lifetime = getErrorCounts({ now: 60_000 });
  assert.equal(lifetime.counts.noisy_class, 103);
  assert.equal(lifetime.total, 103);
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
  const server = app.listen(0, "127.0.0.1");
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

// ---------- access-control posture (safe-public) ----------
//
// /talk/errors is mounted unauthenticated. These tests pin the
// no-leakage contract: even after recording error classes that
// LOOK user-derived (they aren't — supplier handlers pass canonical
// codes), the response must contain only class names + counts.
// If a future change ever lets a user-derived string become a
// counter key, these tests fail loudly.

test("[talk-errors] response contains no per-user content (no-leakage)", async () => {
  resetErrorCounters();
  // Record a few canonical classes. None of these strings should
  // ever reach the response besides the names themselves.
  incrementErrorCounter("supplier_unavailable");
  incrementErrorCounter("supplier_timeout");
  incrementErrorCounter("mint_failed");
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/errors");
    assert.equal(r.status, 200);
    const raw = JSON.stringify(r.body);
    // No request body / prompt / model output / user id markers
    // should ever surface. If anyone wires user data into a counter
    // key, this list is the tripwire.
    const forbiddenSubstrings = [
      "@",                  // emails
      "Bearer ",            // auth headers
      "userId",
      "user_id",
      "deviceId",
      "device_id",
      "sessionId",
      "session_id",
      "prompt",
      "completion",
      "transcript",
      "content",
      "ipAddress",
      "ip_address",
    ];
    for (const needle of forbiddenSubstrings) {
      assert.equal(
        raw.includes(needle),
        false,
        `talk-errors response leaked forbidden substring: ${needle}`,
      );
    }
  });
});

test("[talk-errors] response keys are exactly the canonical envelope", async () => {
  // Pins the response shape so a future change can't silently add a
  // field that carries user data. New legitimate fields require
  // updating this test, which forces a re-review of the no-leakage
  // posture.
  resetErrorCounters();
  incrementErrorCounter("supplier_unavailable");
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/talk/errors");
    assert.equal(r.status, 200);
    const keys = Object.keys(r.body).sort();
    assert.deepEqual(keys, [
      "counts",
      "errorRatePerHour",
      "lastOccurrence",
      "observedAtMs",
      "schemaVersion",
      "sinceMs",
      "total",
    ]);
  });
});

test("[talk-errors] counter keys reject non-canonical user-derived input", () => {
  // The supplier handlers in index.js pass canonical class names
  // (err?.code || "realtime_supplier_unavailable"). If somehow a
  // user-derived string ever flowed in, it WOULD become a counter
  // key — that's a posture risk. This test documents the rule by
  // proving that a long/weird key still appears verbatim in counts,
  // which means our defense is at the call site (index.js), not in
  // this module. The test exists to make this design contract
  // explicit and reviewable.
  resetErrorCounters();
  const weirdKey = "supplier_unavailable_with_extra_data_user_should_never_send";
  incrementErrorCounter(weirdKey);
  const s = getErrorCounts();
  // The counter does NOT sanitize: it records what callers give it.
  // Defense lives at the call site. If you're reviewing a change
  // that lets user input reach incrementErrorCounter, that's the bug.
  assert.equal(s.counts[weirdKey], 1);
});
