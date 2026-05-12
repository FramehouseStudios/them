// T-decompose-phase0-health-route — integration tests.
//
// Verify behavior parity between the extracted helper and what
// index.js used to emit inline. Live Express server, no mocks of
// the helper itself.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountHealthRoutes, buildHealthPayload } from "../lib/health_route.js";

function makeDeps(overrides = {}) {
  return {
    selectMemoryRecordForRead: () => ({ memory: { id: "m-1" }, ip: "127.0.0.1" }),
    buildReadStateMeta: () => ({
      sessionId: "s-1",
      stateVersion: "v-42",
      lastTurnId: "t-99",
      lastUpdatedAt: 1700000000000,
      historyUpdatedAt: 1700000001000,
      memoryUpdatedAt: 1700000002000,
    }),
    deriveBackendRuntimeStatus: () => ({
      status: "ok",
      reasons: [],
      metrics: { windowMs: 60_000, count: 7 },
    }),
    scaleBackplane: { status: () => ({ kind: "in-process", peers: 1 }) },
    applyReadStateHeaders: (res, meta) => {
      // Mirror what index.js does — set a couple of state headers
      // so the test can verify the wiring.
      res.setHeader("x-session-id", meta.sessionId || "");
      res.setHeader("x-state-version", meta.stateVersion || "");
    },
    talkInFlight: () => 3,
    talkInFlightBySession: () => new Map([["s-1", true], ["s-2", true]]),
    API_SCHEMA_VERSION: 1,
    BACKEND_BUILD: "test-build",
    BACKEND_BOOT_ID: "boot-abc",
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountHealthRoutes(app, deps);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.json().catch(() => null) };
}

// ---------- pure helper ----------

test("[health] buildHealthPayload returns the canonical envelope", () => {
  const deps = makeDeps();
  const { payload } = buildHealthPayload({
    req: {},
    nowMs: 1700000000000,
    selectMemoryRecordForRead: deps.selectMemoryRecordForRead,
    buildReadStateMeta: deps.buildReadStateMeta,
    deriveBackendRuntimeStatus: deps.deriveBackendRuntimeStatus,
    scaleBackplane: deps.scaleBackplane,
    talkInFlight: 5,
    talkInFlightBySession: new Map([["a", 1], ["b", 1], ["c", 1]]),
    API_SCHEMA_VERSION: 1,
    BACKEND_BUILD: "x",
    BACKEND_BOOT_ID: "y",
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "ok");
  assert.equal(payload.schema_version, 1);
  assert.equal(payload.backend_build, "x");
  assert.equal(payload.backend_boot_id, "y");
  assert.equal(payload.session_id, "s-1");
  assert.equal(payload.state_version, "v-42");
  assert.equal(payload.last_turn_id, "t-99");
  assert.equal(payload.talk_in_flight, 5);
  assert.equal(payload.talk_sessions_in_flight, 3);
  assert.deepEqual(payload.talk_metrics, { windowMs: 60_000, count: 7 });
});

// ---------- /health endpoint ----------

test("[health] GET /health returns 200 with the canonical fields", async () => {
  await withTestServer(makeDeps(), async ({ baseURL }) => {
    const r = await get(baseURL, "/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.status, "ok");
    assert.equal(r.body.schema_version, 1);
    assert.equal(r.body.backend_build, "test-build");
    assert.equal(r.body.session_id, "s-1");
    assert.equal(r.body.state_version, "v-42");
    assert.equal(r.body.talk_in_flight, 3);
    assert.equal(r.body.talk_sessions_in_flight, 2);
  });
});

test("[health] GET /health sets Cache-Control/Pragma/Expires + x-backend-status", async () => {
  await withTestServer(makeDeps(), async ({ baseURL }) => {
    const r = await get(baseURL, "/health");
    assert.equal(r.headers["cache-control"], "no-store");
    assert.equal(r.headers["pragma"], "no-cache");
    assert.equal(r.headers["expires"], "0");
    assert.equal(r.headers["x-backend-status"], "ok");
  });
});

test("[health] GET /health applies read-state headers via applyReadStateHeaders", async () => {
  await withTestServer(makeDeps(), async ({ baseURL }) => {
    const r = await get(baseURL, "/health");
    assert.equal(r.headers["x-session-id"], "s-1");
    assert.equal(r.headers["x-state-version"], "v-42");
  });
});

// ---------- /bridge is byte-identical to /health ----------

test("[health] GET /bridge returns same envelope as /health", async () => {
  await withTestServer(makeDeps(), async ({ baseURL }) => {
    const h = await get(baseURL, "/health");
    const b = await get(baseURL, "/bridge");
    assert.equal(b.status, h.status);
    assert.deepEqual(b.body, h.body);
  });
});

// ---------- status passthrough ----------

test("[health] status=degraded with reasons surfaces correctly", async () => {
  const deps = makeDeps({
    deriveBackendRuntimeStatus: () => ({
      status: "degraded",
      reasons: ["supplier_health_warning"],
      metrics: { windowMs: 60_000, count: 0 },
    }),
  });
  await withTestServer(deps, async ({ baseURL }) => {
    const r = await get(baseURL, "/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "degraded");
    assert.deepEqual(r.body.reasons, ["supplier_health_warning"]);
    assert.equal(r.headers["x-backend-status"], "degraded");
  });
});

// ---------- mount guards ----------

test("[health] mountHealthRoutes throws without app", () => {
  assert.throws(() => mountHealthRoutes(null, makeDeps()));
});

test("[health] mountHealthRoutes throws when any required dep is missing", () => {
  const partial = { ...makeDeps() };
  delete partial.applyReadStateHeaders;
  const app = express();
  assert.throws(() => mountHealthRoutes(app, partial), /applyReadStateHeaders/);
});

// ---------- live state read ----------

test("[health] talk_in_flight reflects current value at request time", async () => {
  let n = 0;
  const deps = makeDeps({ talkInFlight: () => n });
  await withTestServer(deps, async ({ baseURL }) => {
    n = 7;
    const r1 = await get(baseURL, "/health");
    assert.equal(r1.body.talk_in_flight, 7);
    n = 0;
    const r2 = await get(baseURL, "/health");
    assert.equal(r2.body.talk_in_flight, 0);
  });
});
