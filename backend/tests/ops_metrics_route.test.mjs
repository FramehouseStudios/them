// T-decompose-phase1-ops-routes — integration tests for
// `mountOpsMetricsRoute`. Pin the byte-identical response contract
// + required-deps guard.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountOpsMetricsRoute } from "../lib/ops_metrics_route.js";

function fakeRuntime({ status = "up", reasons = [], windowMs = 60000 } = {}) {
  return {
    status,
    reasons,
    metrics: {
      windowMs,
      sampleCount: 10,
      errorRate: 0.0,
      p95TotalMs: 250,
    },
  };
}

function fakeBackplane({ status = "noop" } = {}) {
  return { status, outboxPending: 0, lastTick: 0 };
}

function defaultDeps(overrides = {}) {
  return {
    deriveBackendRuntimeStatus: () => fakeRuntime(),
    scaleBackplaneStatus: () => fakeBackplane(),
    talkMetricsSamples: () => [],
    talkInFlight: () => 0,
    talkInFlightBySessionSize: () => 0,
    talkIdempotencyCacheSize: () => 0,
    TALK_MAX_IN_FLIGHT: 16,
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountOpsMetricsRoute(app, deps);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  const body = await r.json().catch(() => null);
  return { status: r.status, headers: r.headers, body };
}

test("[ops-metrics-route] mount fails without Express app", () => {
  assert.throws(() => mountOpsMetricsRoute(null, defaultDeps()));
  assert.throws(() => mountOpsMetricsRoute({}, defaultDeps()));
});

test("[ops-metrics-route] mount fails when required deps are missing", () => {
  const required = [
    "deriveBackendRuntimeStatus",
    "scaleBackplaneStatus",
    "talkMetricsSamples",
    "talkInFlight",
    "talkInFlightBySessionSize",
    "talkIdempotencyCacheSize",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountOpsMetricsRoute(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
  // TALK_MAX_IN_FLIGHT must be a finite number.
  const app = express();
  assert.throws(
    () => mountOpsMetricsRoute(app, defaultDeps({ TALK_MAX_IN_FLIGHT: NaN })),
    /TALK_MAX_IN_FLIGHT/,
  );
});

test("[ops-metrics-route] returns canonical envelope on cold state", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/ops/metrics");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.status, "up");
    assert.deepEqual(r.body.reasons, []);
    assert.equal(r.body.talk_in_flight, 0);
    assert.equal(r.body.talk_max_in_flight, 16);
    assert.equal(r.body.session_locks, 0);
    assert.equal(r.body.idempotency_entries, 0);
    assert.equal(typeof r.body.scale_backplane, "object");
    assert.equal(r.body.metrics_window_ms, 60000);
    assert.deepEqual(r.body.recent, []);
  });
});

test("[ops-metrics-route] reads live counters via accessor functions", async () => {
  // Mount once, then mutate the live state and confirm the next
  // request sees the new values. This is the contract that prevents
  // accidentally freezing counters at mount time.
  let liveInFlight = 0;
  let liveSessionLocks = 0;
  let liveIdempotency = 0;
  const deps = defaultDeps({
    talkInFlight: () => liveInFlight,
    talkInFlightBySessionSize: () => liveSessionLocks,
    talkIdempotencyCacheSize: () => liveIdempotency,
  });
  await withTestServer(deps, async (baseURL) => {
    const cold = await get(baseURL, "/ops/metrics");
    assert.equal(cold.body.talk_in_flight, 0);
    assert.equal(cold.body.session_locks, 0);
    assert.equal(cold.body.idempotency_entries, 0);
    liveInFlight = 5;
    liveSessionLocks = 12;
    liveIdempotency = 99;
    const hot = await get(baseURL, "/ops/metrics");
    assert.equal(hot.body.talk_in_flight, 5);
    assert.equal(hot.body.session_locks, 12);
    assert.equal(hot.body.idempotency_entries, 99);
  });
});

test("[ops-metrics-route] sets Cache-Control + x-backend-status headers", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/ops/metrics");
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-backend-status"), "up");
  });
});

test("[ops-metrics-route] reflects degraded runtime status in header + body", async () => {
  const deps = defaultDeps({
    deriveBackendRuntimeStatus: () => fakeRuntime({
      status: "degraded",
      reasons: ["at_capacity", "high_error_rate"],
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/ops/metrics");
    assert.equal(r.headers.get("x-backend-status"), "degraded");
    assert.equal(r.body.status, "degraded");
    assert.deepEqual(r.body.reasons, ["at_capacity", "high_error_rate"]);
  });
});

test("[ops-metrics-route] caps recent samples at 32", async () => {
  // Feed 50 samples; expect only the last 32 in the response.
  const samples = [];
  for (let i = 0; i < 50; i += 1) {
    samples.push({
      at: 1000 + i,
      statusCode: 200,
      totalMs: 100,
      sttMs: 10,
      chatMs: 50,
      ttsMs: 30,
      streamAudio: i % 2 === 0,
      chatStreamUsed: i % 3 === 0,
      talkStatus: "ok",
      lane: "live",
      model: "model-a",
    });
  }
  const deps = defaultDeps({ talkMetricsSamples: () => samples });
  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/ops/metrics");
    assert.equal(r.body.recent.length, 32);
    // First sample in response = sample index 18 (50 - 32).
    assert.equal(r.body.recent[0].at, 1018);
    assert.equal(r.body.recent[31].at, 1049);
  });
});

test("[ops-metrics-route] normalizes boolean flags to 0/1", async () => {
  const samples = [{
    at: 1000,
    statusCode: 200,
    totalMs: 100,
    sttMs: 10,
    chatMs: 50,
    ttsMs: 30,
    streamAudio: true,
    chatStreamUsed: false,
    talkStatus: "ok",
    lane: "live",
    model: "model-a",
    screenplayMode: true,
    screenplayRequestedTarget: "page",
    screenplayFinalTarget: "page",
    screenplayOutputSource: "studio_target",
    screenplayOutcome: "accepted_repaired_page",
    screenplayAuthoritative: true,
    screenplayReplyRepaired: true,
  }];
  await withTestServer(defaultDeps({ talkMetricsSamples: () => samples }), async (baseURL) => {
    const r = await get(baseURL, "/ops/metrics");
    assert.equal(r.body.recent[0].stream_audio, 1);
    assert.equal(r.body.recent[0].chat_stream_used, 0);
    assert.equal(r.body.recent[0].screenplay_mode, 1);
    assert.equal(r.body.recent[0].screenplay_requested_target, "page");
    assert.equal(r.body.recent[0].screenplay_final_target, "page");
    assert.equal(r.body.recent[0].screenplay_output_source, "studio_target");
    assert.equal(r.body.recent[0].screenplay_outcome, "accepted_repaired_page");
    assert.equal(r.body.recent[0].screenplay_authoritative, 1);
    assert.equal(r.body.recent[0].screenplay_reply_repaired, 1);
  });
});

test("[ops-metrics-route] safe-public posture: no per-user content", async () => {
  // Feed counters + samples that would NEVER carry user data in
  // production. Then scan the response for the kinds of substrings
  // that indicate user-derived data has leaked. Tripwire for future
  // changes.
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/ops/metrics");
    const raw = JSON.stringify(r.body);
    const forbidden = [
      "@", "Bearer ", "userId", "user_id", "deviceId",
      "device_id", "sessionId", "session_id", "prompt",
      "completion", "transcript", "content", "ipAddress",
      "ip_address",
    ];
    for (const needle of forbidden) {
      assert.equal(
        raw.includes(needle),
        false,
        `/ops/metrics leaked forbidden substring: ${needle}`,
      );
    }
  });
});
