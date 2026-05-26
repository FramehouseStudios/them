// T-decompose-phase7a-talk-state — integration tests for the four
// talk-pipeline guards extracted into backend/lib/talk_state.js.
//
// Test strategy: each guard factory is exercised on a bare Express
// app with stubbed config + helpers. State assertions read through
// the lib's accessors (talkInFlight, talkInFlightBySessionSize,
// talkIdempotencyCacheSize) or through the __test peek/reset
// affordance. No HTTP server — middleware is called via
// supertest-style request/response stubs OR via express request
// integration where the response shape matters.
//
// #238 invariant inheritance: the regression test at the bottom
// asserts the lib has no setter-shaped exports for the underlying
// state Maps/counter (no setTalkRateLimiter, setTalkIdempotencyCache,
// etc.). The __test namespace is the only sanctioned mutation
// surface — and only the size-rotation operations (clear, peek
// shallow copy) are exposed there.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  createTalkRateLimitGuard,
  createTalkIdempotencyGuard,
  createTalkSessionSerialGuard,
  createTalkConcurrencyGuard,
  createTalkIdempotencyHelpers,
  talkInFlight,
  talkInFlightBySessionSize,
  talkIdempotencyCacheSize,
  __test,
} from "../lib/talk_state.js";

// Reset module-scope state before each test block. Tests must
// not bleed counters/maps across test boundaries.
function resetState() {
  __test.reset();
}

function stubRequest({ headers = {}, requestId = "req_test" } = {}) {
  const lowerHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[String(k).toLowerCase()] = v;
  }
  return {
    requestId,
    headers,
    get(name) {
      const lower = String(name).toLowerCase();
      return lowerHeaders[lower];
    },
    header(name) {
      return this.get(name);
    },
  };
}

function stubResponse() {
  const recorded = {
    statusCode: null,
    body: null,
    headers: {},
    sent: false,
    finished: false,
    closed: false,
    listeners: { finish: [], close: [] },
  };
  return {
    setHeader(name, value) {
      recorded.headers[String(name).toLowerCase()] = String(value);
    },
    getHeader(name) {
      return recorded.headers[String(name).toLowerCase()];
    },
    getHeaders() {
      return { ...recorded.headers };
    },
    status(code) {
      recorded.statusCode = code;
      return this;
    },
    json(body) {
      recorded.body = body;
      recorded.sent = true;
      return this;
    },
    send(body) {
      recorded.body = body;
      recorded.sent = true;
      return this;
    },
    on(event, fn) {
      if (event === "finish" || event === "close") {
        recorded.listeners[event].push(fn);
      }
      return this;
    },
    emit(event) {
      const arr = recorded.listeners[event] || [];
      for (const fn of arr) fn();
    },
    _recorded: recorded,
  };
}

// =====================================================================
// 1. createTalkRateLimitGuard
// =====================================================================

test("createTalkRateLimitGuard requires deps", () => {
  assert.throws(() => createTalkRateLimitGuard({}), /clientIp/);
  assert.throws(
    () => createTalkRateLimitGuard({ clientIp: () => "1", talkRateLimitWindowMs: 60_000 }),
    /talkRateLimitMax/
  );
  assert.throws(
    () => createTalkRateLimitGuard({ clientIp: () => "1", talkRateLimitMax: 5 }),
    /talkRateLimitWindowMs/
  );
});

test("rate-limit guard bucket fairness across keys", () => {
  resetState();
  let clock = 1_000_000;
  const guard = createTalkRateLimitGuard({
    clientIp: (req) => req._ip,
    talkRateLimitWindowMs: 60_000,
    talkRateLimitMax: 2,
    now: () => clock,
  });
  // Two keys, two requests each — both should pass.
  for (const ip of ["1.2.3.4", "5.6.7.8"]) {
    for (let i = 0; i < 2; i += 1) {
      const req = stubRequest();
      req._ip = ip;
      const res = stubResponse();
      let called = false;
      guard(req, res, () => { called = true; });
      assert.equal(called, true, `${ip} request ${i} should call next()`);
      assert.equal(res._recorded.sent, false, `${ip} should not send response`);
    }
  }
});

test("rate-limit guard burst within limit allowed", () => {
  resetState();
  const guard = createTalkRateLimitGuard({
    clientIp: () => "10.0.0.1",
    talkRateLimitWindowMs: 60_000,
    talkRateLimitMax: 3,
    now: () => 2_000_000,
  });
  for (let i = 0; i < 3; i += 1) {
    const res = stubResponse();
    let called = false;
    guard(stubRequest(), res, () => { called = true; });
    assert.equal(called, true);
  }
});

test("rate-limit guard isolates authenticated users sharing an IP", () => {
  resetState();
  const guard = createTalkRateLimitGuard({
    clientIp: () => "10.0.0.9",
    talkRateLimitWindowMs: 60_000,
    talkRateLimitMax: 1,
    now: () => 2_500_000,
  });

  const alice = stubRequest();
  alice.authUser = { id: "alice" };
  const bob = stubRequest();
  bob.authUser = { id: "bob" };

  guard(alice, stubResponse(), () => {});

  const deniedAlice = stubResponse();
  let deniedAliceNext = false;
  guard(alice, deniedAlice, () => { deniedAliceNext = true; });
  assert.equal(deniedAliceNext, false);
  assert.equal(deniedAlice._recorded.statusCode, 429);

  const allowedBob = stubResponse();
  let allowedBobNext = false;
  guard(bob, allowedBob, () => { allowedBobNext = true; });
  assert.equal(allowedBobNext, true, "bob should not share alice's talk bucket");
  assert.equal(allowedBob._recorded.sent, false);
});

test("rate-limit guard over-limit returns 429 with Retry-After", () => {
  resetState();
  const guard = createTalkRateLimitGuard({
    clientIp: () => "10.0.0.2",
    talkRateLimitWindowMs: 60_000,
    talkRateLimitMax: 2,
    now: () => 3_000_000,
  });
  // 2 OK
  guard(stubRequest(), stubResponse(), () => {});
  guard(stubRequest(), stubResponse(), () => {});
  // 3rd over the cap
  const res = stubResponse();
  let nextCalled = false;
  guard(stubRequest(), res, () => { nextCalled = true; });
  assert.equal(nextCalled, false, "should not call next() on over-limit");
  assert.equal(res._recorded.statusCode, 429);
  assert.equal(res._recorded.body.stage, "rate_limit");
  assert.match(res._recorded.headers["retry-after"], /^\d+$/);
  assert.ok(Number(res._recorded.headers["retry-after"]) >= 1);
});

test("rate-limit guard prunes stale buckets at scale", () => {
  resetState();
  let clock = 4_000_000;
  const guard = createTalkRateLimitGuard({
    clientIp: (req) => req._ip,
    talkRateLimitWindowMs: 1_000,
    talkRateLimitMax: 1,
    now: () => clock,
  });
  // Fill >= 512 stale buckets, then advance time and trigger cleanup.
  for (let i = 0; i < 600; i += 1) {
    const req = stubRequest();
    req._ip = `key${i}`;
    guard(req, stubResponse(), () => {});
  }
  const beforeSize = __test.peekRateBuckets().size;
  assert.ok(beforeSize >= 600, `expected >=600 buckets, got ${beforeSize}`);
  clock += 60_000; // all buckets stale
  const req = stubRequest();
  req._ip = "fresh-key";
  guard(req, stubResponse(), () => {});
  const afterSize = __test.peekRateBuckets().size;
  assert.ok(afterSize < beforeSize, `expected pruning to shrink size (before=${beforeSize} after=${afterSize})`);
});

test("rate-limit guard reads supplied clientIp + clock", () => {
  resetState();
  let clientIpCalls = 0;
  let nowCalls = 0;
  const guard = createTalkRateLimitGuard({
    clientIp: (req) => { clientIpCalls += 1; return req._ip; },
    talkRateLimitWindowMs: 60_000,
    talkRateLimitMax: 10,
    now: () => { nowCalls += 1; return 5_000_000; },
  });
  const req = stubRequest();
  req._ip = "9.9.9.9";
  guard(req, stubResponse(), () => {});
  assert.ok(clientIpCalls >= 1);
  assert.ok(nowCalls >= 1);
});

// =====================================================================
// 2. createTalkIdempotencyGuard
// =====================================================================

function stubScaleBackplane() {
  return {
    _idempotency: new Map(),
    _sessionLocks: new Map(),
    async getIdempotency(key) {
      return this._idempotency.get(key) || null;
    },
    async setIdempotency(key, value /* , ttlMs */) {
      this._idempotency.set(key, value);
    },
    async deleteIdempotency(key) {
      this._idempotency.delete(key);
    },
    async acquireSessionLock(key, requestId /* , ttlMs */) {
      if (this._sessionLocks.has(key)) return { ok: false };
      this._sessionLocks.set(key, requestId);
      return { ok: true };
    },
    async releaseSessionLock(key /* , requestId */) {
      this._sessionLocks.delete(key);
    },
    status() {
      return { mode: "stub" };
    },
  };
}

test("idempotency guard cache miss calls next()", async () => {
  resetState();
  const metrics = [];
  const guard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: true,
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "ip:1.2.3.4",
    scaleBackplane: stubScaleBackplane(),
    recordTalkMetric: (m) => metrics.push(m),
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
    now: () => 6_000_000,
    logger: { log: () => {} },
  });
  const req = stubRequest({ headers: { "X-Idempotency-Key": "abc" } });
  const res = stubResponse();
  let nextCalled = false;
  await guard(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.talkIdempotency, {
    cacheKey: "ip:1.2.3.4|abc",
    key: "abc",
    sessionKey: "ip:1.2.3.4",
  });
  assert.equal(talkIdempotencyCacheSize(), 1);
});

test("idempotency guard cache hit returns cached response with replay header", async () => {
  resetState();
  const metrics = [];
  const cache = stubScaleBackplane();
  // Seed a completed record via the lib's helpers (no direct Map access).
  const helpers = createTalkIdempotencyHelpers({
    scaleBackplane: cache,
    talkIdempotencyEnabled: true,
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
  });
  // Pre-populate by running the guard once, then completing via commitSuccess.
  const guard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: true,
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "sess:1",
    scaleBackplane: cache,
    recordTalkMetric: (m) => metrics.push(m),
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
    now: () => 7_000_000,
    logger: { log: () => {} },
  });
  const req1 = stubRequest({ headers: { "Idempotency-Key": "k1" } });
  await guard(req1, stubResponse(), () => {});
  helpers.commitSuccess(req1, {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: Buffer.from('{"ok":true}'),
  });
  // Second request with same key should replay.
  const req2 = stubRequest({ headers: { "Idempotency-Key": "k1" } });
  const res2 = stubResponse();
  let nextCalled = false;
  await guard(req2, res2, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res2._recorded.statusCode, 200);
  assert.equal(res2._recorded.headers["x-idempotency-replay"], "1");
  const replayMetrics = metrics.filter((m) => m.talkStatus === "idempotency_replay");
  assert.equal(replayMetrics.length, 1, "expected exactly one replay metric");
  assert.equal(replayMetrics[0].statusCode, 208);
  assert.equal(replayMetrics[0].lane, "guard");
});

test("idempotency guard pending duplicate returns 409 with Retry-After: 1", async () => {
  resetState();
  const metrics = [];
  const cache = stubScaleBackplane();
  const guard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: true,
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "sess:1",
    scaleBackplane: cache,
    recordTalkMetric: (m) => metrics.push(m),
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
    now: () => 8_000_000,
    logger: { log: () => {} },
  });
  const req1 = stubRequest({ headers: { "Idempotency-Key": "k2" } });
  await guard(req1, stubResponse(), () => {});
  // 2nd in-flight with same key should see "pending" and 409.
  const req2 = stubRequest({ headers: { "Idempotency-Key": "k2" } });
  const res2 = stubResponse();
  let nextCalled = false;
  await guard(req2, res2, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res2._recorded.statusCode, 409);
  assert.equal(res2._recorded.body.stage, "idempotency");
  assert.equal(res2._recorded.body.key, "k2");
  assert.equal(res2._recorded.headers["retry-after"], "1");
  const pendingMetrics = metrics.filter((m) => m.talkStatus === "idempotency_pending");
  assert.equal(pendingMetrics.length, 1);
});

test("idempotency guard with no header calls next()", async () => {
  resetState();
  const guard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: true,
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "sess:1",
    scaleBackplane: stubScaleBackplane(),
    recordTalkMetric: () => {},
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
    now: () => 9_000_000,
  });
  const req = stubRequest();
  let nextCalled = false;
  await guard(req, stubResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.talkIdempotency, undefined);
});

test("idempotency guard disabled passes through", async () => {
  resetState();
  const guard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: false, // disabled
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "sess:1",
    scaleBackplane: stubScaleBackplane(),
    recordTalkMetric: () => {},
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
  });
  const req = stubRequest({ headers: { "Idempotency-Key": "x" } });
  let nextCalled = false;
  await guard(req, stubResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("idempotency guard finish handler removes unresolved pending", async () => {
  resetState();
  const cache = stubScaleBackplane();
  const guard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: true,
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "sess:1",
    scaleBackplane: cache,
    recordTalkMetric: () => {},
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
    now: () => 10_000_000,
    logger: { log: () => {} },
  });
  const req = stubRequest({ headers: { "Idempotency-Key": "kf" } });
  const res = stubResponse();
  await guard(req, res, () => {});
  assert.equal(talkIdempotencyCacheSize(), 1);
  res.emit("finish");
  assert.equal(talkIdempotencyCacheSize(), 0, "finish on unresolved pending should evict cache entry");
});

// =====================================================================
// 3. createTalkSessionSerialGuard
// =====================================================================

test("session-serial guard: first request acquires lock + calls next()", async () => {
  resetState();
  const metrics = [];
  const guard = createTalkSessionSerialGuard({
    isSpeculativePrepareRequest: () => false,
    talkSessionSerialEnabled: true,
    resolveTalkSessionKey: () => "sess:s1",
    scaleBackplane: stubScaleBackplane(),
    recordTalkMetric: (m) => metrics.push(m),
    createRequestId: () => "req-1",
    sttTimeoutMs: 5_000,
    chatTimeoutMs: 5_000,
    ttsTimeoutMs: 5_000,
  });
  const req = stubRequest();
  let nextCalled = false;
  await guard(req, stubResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(talkInFlightBySessionSize(), 1);
});

test("session-serial guard: same-session local lock returns 409", async () => {
  resetState();
  const metrics = [];
  const guard = createTalkSessionSerialGuard({
    isSpeculativePrepareRequest: () => false,
    talkSessionSerialEnabled: true,
    resolveTalkSessionKey: () => "sess:s2",
    scaleBackplane: stubScaleBackplane(),
    recordTalkMetric: (m) => metrics.push(m),
    createRequestId: () => "req-x",
    sttTimeoutMs: 5_000,
    chatTimeoutMs: 5_000,
    ttsTimeoutMs: 5_000,
  });
  await guard(stubRequest(), stubResponse(), () => {});
  // Same session lock — second request should be rejected with 409.
  const res2 = stubResponse();
  let nextCalled = false;
  await guard(stubRequest(), res2, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res2._recorded.statusCode, 409);
  assert.equal(res2._recorded.body.stage, "busy_session");
  assert.equal(res2._recorded.headers["retry-after"], "1");
  const busyMetrics = metrics.filter((m) => m.talkStatus === "session_busy");
  assert.equal(busyMetrics.length, 1);
});

test("session-serial guard: distributed-lock denial returns 409 distributed", async () => {
  resetState();
  const metrics = [];
  const sb = stubScaleBackplane();
  sb.acquireSessionLock = async () => ({ ok: false }); // distributed denial
  const guard = createTalkSessionSerialGuard({
    isSpeculativePrepareRequest: () => false,
    talkSessionSerialEnabled: true,
    resolveTalkSessionKey: () => "sess:s3",
    scaleBackplane: sb,
    recordTalkMetric: (m) => metrics.push(m),
    createRequestId: () => "req-y",
    sttTimeoutMs: 5_000,
    chatTimeoutMs: 5_000,
    ttsTimeoutMs: 5_000,
  });
  const res = stubResponse();
  let nextCalled = false;
  await guard(stubRequest(), res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._recorded.statusCode, 409);
  assert.equal(res._recorded.body.stage, "busy_session");
  assert.equal(res._recorded.headers["retry-after"], "1");
  const distMetrics = metrics.filter((m) => m.talkStatus === "session_busy_distributed");
  assert.equal(distMetrics.length, 1);
});

test("session-serial guard: different sessions don't block each other", async () => {
  resetState();
  let keyIdx = 0;
  const keys = ["sess:a", "sess:b"];
  const guard = createTalkSessionSerialGuard({
    isSpeculativePrepareRequest: () => false,
    talkSessionSerialEnabled: true,
    resolveTalkSessionKey: () => keys[keyIdx++ % keys.length],
    scaleBackplane: stubScaleBackplane(),
    recordTalkMetric: () => {},
    createRequestId: () => "req-z",
    sttTimeoutMs: 5_000,
    chatTimeoutMs: 5_000,
    ttsTimeoutMs: 5_000,
  });
  await guard(stubRequest(), stubResponse(), () => {});
  let nextCalled = false;
  await guard(stubRequest(), stubResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(talkInFlightBySessionSize(), 2);
});

test("session-serial guard: release on finish + close", async () => {
  resetState();
  const guard = createTalkSessionSerialGuard({
    isSpeculativePrepareRequest: () => false,
    talkSessionSerialEnabled: true,
    resolveTalkSessionKey: () => "sess:rel",
    scaleBackplane: stubScaleBackplane(),
    recordTalkMetric: () => {},
    createRequestId: () => "req-rel",
    sttTimeoutMs: 5_000,
    chatTimeoutMs: 5_000,
    ttsTimeoutMs: 5_000,
  });
  const res = stubResponse();
  await guard(stubRequest(), res, () => {});
  assert.equal(talkInFlightBySessionSize(), 1);
  res.emit("finish");
  assert.equal(talkInFlightBySessionSize(), 0);

  // close after a fresh acquire should also release.
  const res2 = stubResponse();
  await guard(stubRequest(), res2, () => {});
  assert.equal(talkInFlightBySessionSize(), 1);
  res2.emit("close");
  assert.equal(talkInFlightBySessionSize(), 0);
});

test("session-serial guard: speculative prepare bypasses", async () => {
  resetState();
  const guard = createTalkSessionSerialGuard({
    isSpeculativePrepareRequest: () => true, // always speculative
    talkSessionSerialEnabled: true,
    resolveTalkSessionKey: () => "sess:spec",
    scaleBackplane: stubScaleBackplane(),
    recordTalkMetric: () => {},
    createRequestId: () => "req-spec",
    sttTimeoutMs: 5_000,
    chatTimeoutMs: 5_000,
    ttsTimeoutMs: 5_000,
  });
  let nextCalled = false;
  await guard(stubRequest(), stubResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(talkInFlightBySessionSize(), 0);
});

// =====================================================================
// 4. createTalkConcurrencyGuard
// =====================================================================

test("concurrency guard: N concurrent allowed, N+1 rejected with 503", () => {
  resetState();
  const metrics = [];
  const guard = createTalkConcurrencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkMaxInFlight: 2,
    recordTalkMetric: (m) => metrics.push(m),
  });
  for (let i = 0; i < 2; i += 1) {
    let nextCalled = false;
    guard(stubRequest(), stubResponse(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  }
  assert.equal(talkInFlight(), 2);
  const res = stubResponse();
  let nextCalled = false;
  guard(stubRequest(), res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res._recorded.statusCode, 503);
  assert.equal(res._recorded.body.stage, "busy");
  assert.equal(res._recorded.headers["retry-after"], "1");
  const busyMetrics = metrics.filter((m) => m.talkStatus === "global_busy");
  assert.equal(busyMetrics.length, 1);
});

test("concurrency guard: counter decrements on finish", () => {
  resetState();
  const guard = createTalkConcurrencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkMaxInFlight: 4,
    recordTalkMetric: () => {},
  });
  const res = stubResponse();
  guard(stubRequest(), res, () => {});
  assert.equal(talkInFlight(), 1);
  res.emit("finish");
  assert.equal(talkInFlight(), 0);
});

test("concurrency guard: counter decrements on close (even without finish)", () => {
  resetState();
  const guard = createTalkConcurrencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkMaxInFlight: 4,
    recordTalkMetric: () => {},
  });
  const res = stubResponse();
  guard(stubRequest(), res, () => {});
  assert.equal(talkInFlight(), 1);
  res.emit("close");
  assert.equal(talkInFlight(), 0);
});

test("concurrency guard: speculative prepare bypasses counter", () => {
  resetState();
  const guard = createTalkConcurrencyGuard({
    isSpeculativePrepareRequest: () => true,
    talkMaxInFlight: 1,
    recordTalkMetric: () => {},
  });
  let nextCalled = false;
  guard(stubRequest(), stubResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(talkInFlight(), 0);
});

test("concurrency guard: release is idempotent (finish + close fire only once)", () => {
  resetState();
  const guard = createTalkConcurrencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkMaxInFlight: 4,
    recordTalkMetric: () => {},
  });
  const res = stubResponse();
  guard(stubRequest(), res, () => {});
  assert.equal(talkInFlight(), 1);
  res.emit("finish");
  res.emit("close"); // should not double-decrement
  assert.equal(talkInFlight(), 0);
});

// =====================================================================
// Cross-cutting: live accessors match the actual state after a sequence
// of guard runs. This is the "/ops/metrics integration" test from the
// design note's test matrix — it doesn't spin up the route, but it
// verifies the accessors return the same numbers the route would
// surface (idempotency_entries, session_locks, talk_in_flight).
// =====================================================================

test("ops/metrics integration: accessors match live state after a turn sequence", async () => {
  resetState();
  const sb = stubScaleBackplane();
  const rateGuard = createTalkRateLimitGuard({
    clientIp: () => "1.1.1.1",
    talkRateLimitWindowMs: 60_000,
    talkRateLimitMax: 10,
  });
  const idemGuard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: true,
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "sess:mix",
    scaleBackplane: sb,
    recordTalkMetric: () => {},
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
    logger: { log: () => {} },
  });
  const serialGuard = createTalkSessionSerialGuard({
    isSpeculativePrepareRequest: () => false,
    talkSessionSerialEnabled: true,
    resolveTalkSessionKey: () => "sess:mix",
    scaleBackplane: sb,
    recordTalkMetric: () => {},
    createRequestId: () => "req-mix",
    sttTimeoutMs: 5_000,
    chatTimeoutMs: 5_000,
    ttsTimeoutMs: 5_000,
  });
  const concGuard = createTalkConcurrencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkMaxInFlight: 4,
    recordTalkMetric: () => {},
  });

  // Two distinct idempotency keys + one in-flight concurrency increment.
  const req1 = stubRequest({ headers: { "Idempotency-Key": "kA" } });
  const res1 = stubResponse();
  await idemGuard(req1, res1, () => {});
  rateGuard(req1, res1, () => {});
  await serialGuard(req1, res1, () => {});
  concGuard(req1, res1, () => {});

  // Pre-finish: accessors should reflect live counters.
  assert.equal(talkIdempotencyCacheSize(), 1);
  assert.equal(talkInFlightBySessionSize(), 1);
  assert.equal(talkInFlight(), 1);

  // Finish releases session + concurrency counters; idempotency
  // pending entry is also cleared on finish.
  res1.emit("finish");
  assert.equal(talkInFlightBySessionSize(), 0);
  assert.equal(talkInFlight(), 0);
  // Pending was removed via the finish handler.
  assert.equal(talkIdempotencyCacheSize(), 0);
});

// =====================================================================
// #238 invariant inheritance: lib must not export setter-shaped
// access to module state. Only the named per-entry helpers
// (createTalkIdempotencyHelpers + the guard factories) mutate state.
// Test fails LOUDLY if a future change exports a setter pattern.
// =====================================================================

test("#238 invariant: no setter-shaped exports for module state", async () => {
  const mod = await import("../lib/talk_state.js");
  const forbiddenNames = [
    "setTalkRateBuckets",
    "setTalkIdempotencyCache",
    "setTalkInFlightBySession",
    "setTalkInFlight",
    "talkRateBuckets",          // raw map exposure is also forbidden
    "talkIdempotencyCache",
    "talkInFlightBySession",
    "rotateTalkIdempotencyCache",
    "replaceTalkRateBuckets",
  ];
  for (const name of forbiddenNames) {
    assert.equal(
      mod[name],
      undefined,
      `talk_state.js must not export "${name}" (rule: no setter for module state)`
    );
  }
});

test("#238 invariant: __test surface exposes peek copies, not the live Map", () => {
  resetState();
  const peek1 = __test.peekIdempotencyCache();
  const peek2 = __test.peekIdempotencyCache();
  assert.notStrictEqual(peek1, peek2, "peek should return a fresh copy each time");
  peek1.set("inject", { status: "completed" });
  // Mutating the peek copy must NOT leak into the lib's real state.
  assert.equal(talkIdempotencyCacheSize(), 0);
});

// =====================================================================
// Idempotency helpers (commitSuccess / clearPending) — used by the
// talk handler in backend/index.js until Phase 7b.
// =====================================================================

test("idempotency helpers commitSuccess marks pending as completed", async () => {
  resetState();
  const sb = stubScaleBackplane();
  const helpers = createTalkIdempotencyHelpers({
    scaleBackplane: sb,
    talkIdempotencyEnabled: true,
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
  });
  const guard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: true,
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "sess:h",
    scaleBackplane: sb,
    recordTalkMetric: () => {},
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
    logger: { log: () => {} },
  });
  const req = stubRequest({ headers: { "Idempotency-Key": "ch" } });
  await guard(req, stubResponse(), () => {});
  helpers.commitSuccess(req, {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: Buffer.from('{"x":1}'),
  });
  const peek = __test.peekIdempotencyCache();
  const entry = [...peek.values()][0];
  assert.equal(entry.status, "completed");
  assert.equal(entry.statusCode, 200);
  assert.ok(Buffer.isBuffer(entry.body));
});

test("idempotency helpers clearPending removes pending but keeps completed", async () => {
  resetState();
  const sb = stubScaleBackplane();
  const helpers = createTalkIdempotencyHelpers({
    scaleBackplane: sb,
    talkIdempotencyEnabled: true,
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
  });
  const guard = createTalkIdempotencyGuard({
    isSpeculativePrepareRequest: () => false,
    talkIdempotencyEnabled: true,
    normalizeIdempotencyKey: (v) => String(v || "").trim(),
    resolveTalkSessionKey: () => "sess:cp",
    scaleBackplane: sb,
    recordTalkMetric: () => {},
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
    logger: { log: () => {} },
  });
  const req = stubRequest({ headers: { "Idempotency-Key": "cp" } });
  await guard(req, stubResponse(), () => {});
  assert.equal(talkIdempotencyCacheSize(), 1);
  helpers.clearPending(req, { keepCompleted: true });
  // Pending should be wiped because keepCompleted only protects completed.
  assert.equal(talkIdempotencyCacheSize(), 0);
});

test("idempotency helpers disabled: commitSuccess no-ops", async () => {
  resetState();
  const sb = stubScaleBackplane();
  const helpers = createTalkIdempotencyHelpers({
    scaleBackplane: sb,
    talkIdempotencyEnabled: false,
    talkIdempotencyTtlMs: 60_000,
    talkIdempotencyMaxEntries: 256,
  });
  const fakeReq = { talkIdempotency: { cacheKey: "no-real-key" } };
  // Should not throw, should not touch the cache.
  helpers.commitSuccess(fakeReq, { statusCode: 200, body: Buffer.from("x") });
  assert.equal(talkIdempotencyCacheSize(), 0);
});

// =====================================================================
// Factory required-deps guards
// =====================================================================

test("createTalkIdempotencyGuard requires scaleBackplane methods", () => {
  assert.throws(
    () => createTalkIdempotencyGuard({
      isSpeculativePrepareRequest: () => false,
      normalizeIdempotencyKey: (v) => v,
      resolveTalkSessionKey: () => "x",
      recordTalkMetric: () => {},
      scaleBackplane: {},
      talkIdempotencyTtlMs: 1,
      talkIdempotencyMaxEntries: 1,
    }),
    /scaleBackplane/
  );
});

test("createTalkSessionSerialGuard requires positive timeout deps", () => {
  assert.throws(
    () => createTalkSessionSerialGuard({
      isSpeculativePrepareRequest: () => false,
      resolveTalkSessionKey: () => "x",
      scaleBackplane: stubScaleBackplane(),
      recordTalkMetric: () => {},
      createRequestId: () => "r",
      sttTimeoutMs: -1,
      chatTimeoutMs: 0,
      ttsTimeoutMs: 0,
    }),
    /sttTimeoutMs/
  );
});

test("createTalkConcurrencyGuard requires positive talkMaxInFlight", () => {
  assert.throws(
    () => createTalkConcurrencyGuard({
      isSpeculativePrepareRequest: () => false,
      talkMaxInFlight: 0,
      recordTalkMetric: () => {},
    }),
    /talkMaxInFlight/
  );
});
