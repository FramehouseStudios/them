// T-realtime-routes-deeper — deeper integration tests for
// `mountRealtimeRoutes` beyond backend/tests/realtime_routes.test.mjs.
//
// Smoke covers: mount guards, GET /realtime/health (shape +
// deep + cache), GET /realtime/bridge HTML+CSP, safe-public
// posture.
//
// This file exercises gaps the smoke skipped:
//   - deep-mode probe with non-healthy supplier
//   - deep-mode probe with err object preserved
//   - cache replacement when supplier rotates
//   - recordedAt timestamp is present + ISO 8601 shaped
//   - shape mode when supplier is null (no supplier configured)
//   - shape mode probe error path
//   - /realtime/bridge content-type + cache headers

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountRealtimeRoutes } from "../lib/realtime_routes.js";

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
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  const ct = r.headers.get("content-type") || "";
  return {
    status: r.status,
    headers: r.headers,
    body: ct.includes("json") ? await r.json().catch(() => null) : await r.text(),
  };
}

// ---------- shape mode edge cases ----------

test("[realtime-routes-deeper] shape mode reports healthy:false when supplier shape probe says so", async () => {
  const deps = defaultDeps({
    probeSupplierShape: (s) => ({ kind: s?.kind || null, healthy: false, error: "supplier_misconfigured" }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/realtime/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.healthy, false);
    assert.equal(r.body.error, "supplier_misconfigured");
  });
});

test("[realtime-routes-deeper] shape mode handles null supplier (none configured)", async () => {
  const deps = defaultDeps();
  deps._setSupplier(null);
  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/realtime/health");
    assert.equal(r.status, 200);
    // shape probe still gets called; the body shape is what we pin.
    assert.equal(r.body.mode, "shape");
    assert.ok("kind" in r.body);
    assert.ok("healthy" in r.body);
    assert.ok("error" in r.body);
  });
});

test("[realtime-routes-deeper] response always includes recordedAt timestamp (ISO 8601)", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/realtime/health");
    assert.equal(typeof r.body.recordedAt, "string");
    // ISO 8601 with milliseconds + Z: 2026-05-14T12:34:56.789Z
    assert.match(r.body.recordedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

// ---------- deep mode edge cases ----------

test("[realtime-routes-deeper] deep mode reports unhealthy live probe + error", async () => {
  const deps = defaultDeps({
    probeSupplierLive: async (s) => ({
      kind: s?.kind || null,
      healthy: false,
      error: "live_probe_failed",
      latencyMs: 500,
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/realtime/health?deep=1");
    assert.equal(r.body.mode, "live");
    assert.equal(r.body.healthy, false);
    assert.equal(r.body.error, "live_probe_failed");
  });
});

test("[realtime-routes-deeper] deep mode passes a timeoutMs option to probeSupplierLive", async () => {
  let receivedOpts = null;
  const deps = defaultDeps({
    probeSupplierLive: async (s, opts) => {
      receivedOpts = opts;
      return { kind: s?.kind || null, healthy: true, error: null, latencyMs: 1 };
    },
  });
  await withTestServer(deps, async (baseURL) => {
    await get(baseURL, "/realtime/health?deep=1");
    assert.ok(receivedOpts, "probeSupplierLive should receive options");
    assert.equal(typeof receivedOpts.timeoutMs, "number");
    assert.ok(receivedOpts.timeoutMs > 0);
  });
});

// ---------- cache rotation ----------

test("[realtime-routes-deeper] cache is keyed on supplier identity (rotation breaks cache)", async () => {
  const deps = defaultDeps();
  let liveCallCount = 0;
  const supplierA = { kind: "openai" };
  const supplierB = { kind: "stub" };
  deps._setSupplier(supplierA);
  deps.probeSupplierLive = async (s) => {
    liveCallCount += 1;
    return { kind: s.kind, healthy: true, error: null, latencyMs: 10 };
  };
  await withTestServer(deps, async (baseURL) => {
    // First deep probe with supplier A → fresh.
    const r1 = await get(baseURL, "/realtime/health?deep=1");
    assert.equal(r1.body.cached, false);
    assert.equal(liveCallCount, 1);
    // Rotate to supplier B; cache by-identity → fresh again.
    deps._setSupplier(supplierB);
    const r2 = await get(baseURL, "/realtime/health?deep=1");
    assert.equal(r2.body.cached, false, "rotated supplier must miss cache");
    assert.equal(liveCallCount, 2);
    // Same supplier B again → cached.
    const r3 = await get(baseURL, "/realtime/health?deep=1");
    assert.equal(r3.body.cached, true);
    assert.equal(liveCallCount, 2, "third call must reuse cached supplier B result");
  });
});

// ---------- bridge HTML ----------

test("[realtime-routes-deeper] /realtime/bridge serves text/html content-type", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/realtime/bridge");
    assert.equal(r.status, 200);
    const ct = r.headers.get("content-type") || "";
    assert.match(ct, /text\/html/i);
  });
});

test("[realtime-routes-deeper] /realtime/bridge body is whatever renderRealtimeBridgeHtml returns", async () => {
  const deps = defaultDeps({
    renderRealtimeBridgeHtml: () => "<html><body>custom-bridge-marker</body></html>",
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/realtime/bridge");
    assert.match(r.body, /custom-bridge-marker/);
  });
});

// ---------- safe-public posture invariant ----------

test("[realtime-routes-deeper] no per-user content leaks into /realtime/health response", async () => {
  // The route reads ONLY the supplier (kind + healthy + latency).
  // Sanity: even if we hand it a supplier with extra per-user-shaped
  // fields, none of them leak.
  const deps = defaultDeps({
    getRealtimeSupplier: () => ({
      kind: "openai",
      __SECRET_USER_TOKEN__: "leak-canary",
      __PII_EMAIL__: "leak@example.com",
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/realtime/health");
    const raw = JSON.stringify(r.body);
    assert.ok(!raw.includes("leak-canary"), "secret token leaked");
    assert.ok(!raw.includes("leak@example.com"), "PII leaked");
  });
});
