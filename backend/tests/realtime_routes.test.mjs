// T-decompose-phase5a-realtime-reads — integration tests for the
// 2 read-only `/realtime/*` routes via `mountRealtimeRoutes`.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountRealtimeRoutes } from "../lib/realtime_routes.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function defaultDeps(overrides = {}) {
  let supplier = { kind: "openai" };
  const cache = new Map();
  return {
    getRealtimeSupplier: () => supplier,
    probeSupplierShape: (s) => ({ kind: s?.kind || null, healthy: Boolean(s), error: null }),
    probeSupplierLive: async (s, _opts) => ({ kind: s?.kind || null, healthy: true, error: null, latencyMs: 42 }),
    realtimeHealthCache: cache,
    renderRealtimeBridgeHtml: () => "<html><body>bridge</body></html>",
    _setSupplier: (s) => { supplier = s; },
    _cache: cache,
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountRealtimeRoutes(app, deps);
  const server = listenEphemeral(app);
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
  return { status: r.status, headers: r.headers, body: r.headers.get("content-type")?.includes("json") ? await r.json().catch(() => null) : await r.text() };
}

test("[realtime-routes] mount fails without Express app", () => {
  assert.throws(() => mountRealtimeRoutes(null, defaultDeps()));
});

test("[realtime-routes] mount fails when required deps are missing", () => {
  const required = [
    "getRealtimeSupplier",
    "probeSupplierShape",
    "probeSupplierLive",
    "realtimeHealthCache",
    "renderRealtimeBridgeHtml",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountRealtimeRoutes(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
});

test("[realtime-routes] mount rejects a cache without get/set", () => {
  const deps = defaultDeps({ realtimeHealthCache: {} });
  const app = express();
  assert.throws(
    () => mountRealtimeRoutes(app, deps),
    /realtimeHealthCache/,
  );
});

test("[realtime-routes] GET /realtime/health returns shape mode by default", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/realtime/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.schemaVersion, 1);
    assert.equal(r.body.mode, "shape");
    assert.equal(r.body.kind, "openai");
    assert.equal(r.body.healthy, true);
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
});

test("[realtime-routes] GET /realtime/health?deep=1 returns live probe + caches", async () => {
  const deps = defaultDeps();
  let liveProbeCalls = 0;
  deps.probeSupplierLive = async (s) => {
    liveProbeCalls += 1;
    return { kind: s?.kind, healthy: true, error: null, latencyMs: 100 };
  };
  await withTestServer(deps, async (baseURL) => {
    const r1 = await get(baseURL, "/realtime/health?deep=1");
    assert.equal(r1.body.mode, "live");
    assert.equal(r1.body.cached, false);
    assert.equal(r1.body.latencyMs, 100);
    // Second call uses cached value
    const r2 = await get(baseURL, "/realtime/health?deep=1");
    assert.equal(r2.body.cached, true);
    assert.equal(r2.body.latencyMs, 100);
    assert.equal(liveProbeCalls, 1);
  });
});

test("[realtime-routes] GET /realtime/health reads supplier live via accessor", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r1 = await get(baseURL, "/realtime/health");
    assert.equal(r1.body.kind, "openai");
    deps._setSupplier({ kind: "stub" });
    const r2 = await get(baseURL, "/realtime/health");
    assert.equal(r2.body.kind, "stub");
  });
});

test("[realtime-routes] GET /realtime/bridge returns HTML with the right CSP", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/realtime/bridge");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.match(r.headers.get("content-type"), /text\/html/);
    const csp = r.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /api\.openai\.com/);
    assert.match(csp, /connect-src 'self' https:\/\/api\.openai\.com/);
    assert.match(csp, /media-src blob: data:/);
    assert.equal(r.body, "<html><body>bridge</body></html>");
  });
});

test("[realtime-routes] safe-public posture: no per-user content", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/realtime/health");
    const raw = JSON.stringify(r.body);
    const forbidden = ["@", "Bearer ", "userId", "user_id", "sessionId", "session_id", "transcript", "prompt"];
    for (const needle of forbidden) {
      assert.equal(raw.includes(needle), false, `realtime/health leaked: ${needle}`);
    }
  });
});
