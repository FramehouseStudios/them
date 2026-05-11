// T-realtime-supplier-health — unit tests.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  probeSupplierShape,
  probeSupplierLive,
  createSupplierHealthCache,
  CACHE_TTL_MS,
} from "../lib/realtime_supplier_health.js";

function makeGoodSupplier(kind = "stub") {
  return {
    kind,
    buildSessionConfig() { return { type: "realtime", model: "m", audio: { output: { voice: "v" } }, instructions: "" }; },
    async mintClientSecret() {
      return { value: "secret-abc", expiresAt: Date.now() + 60_000, sessionConfig: { type: "realtime", model: "m" } };
    },
  };
}

function makeSlowSupplier(delayMs) {
  return {
    kind: "stub",
    buildSessionConfig() { return { type: "realtime" }; },
    async mintClientSecret() {
      await new Promise((r) => setTimeout(r, delayMs));
      return { value: "v", expiresAt: 1, sessionConfig: {} };
    },
  };
}

// ---------- probeSupplierShape ----------

test("[supplier-health] shape probe rejects missing supplier", () => {
  assert.equal(probeSupplierShape(null).healthy, false);
  assert.equal(probeSupplierShape(undefined).healthy, false);
});

test("[supplier-health] shape probe rejects supplier missing kind", () => {
  const r = probeSupplierShape({ mintClientSecret() {}, buildSessionConfig() {} });
  assert.equal(r.healthy, false);
  assert.equal(r.error, "supplier_kind_missing");
});

test("[supplier-health] shape probe rejects supplier missing mintClientSecret", () => {
  const r = probeSupplierShape({ kind: "openai", buildSessionConfig() {} });
  assert.equal(r.healthy, false);
  assert.match(r.error, /mintClientSecret/);
});

test("[supplier-health] shape probe rejects supplier missing buildSessionConfig", () => {
  const r = probeSupplierShape({ kind: "openai", mintClientSecret() {} });
  assert.equal(r.healthy, false);
  assert.match(r.error, /buildSessionConfig/);
});

test("[supplier-health] shape probe rejects supplier whose buildSessionConfig throws", () => {
  const r = probeSupplierShape({
    kind: "openai",
    mintClientSecret() {},
    buildSessionConfig() { throw new Error("kaboom"); },
  });
  assert.equal(r.healthy, false);
  assert.match(r.error, /buildSessionConfig_threw/);
});

test("[supplier-health] shape probe accepts a well-formed supplier", () => {
  const r = probeSupplierShape(makeGoodSupplier("openai"));
  assert.equal(r.healthy, true);
  assert.equal(r.kind, "openai");
  assert.equal(r.error, null);
});

// ---------- probeSupplierLive ----------

test("[supplier-health] live probe returns shape failure when supplier is malformed", async () => {
  const r = await probeSupplierLive(null);
  assert.equal(r.healthy, false);
});

test("[supplier-health] live probe records latency on success", async () => {
  const r = await probeSupplierLive(makeGoodSupplier());
  assert.equal(r.healthy, true);
  assert.equal(r.kind, "stub");
  assert.ok(Number.isFinite(r.latencyMs) && r.latencyMs >= 0);
});

test("[supplier-health] live probe respects the timeout", async () => {
  const slow = makeSlowSupplier(500);
  const r = await probeSupplierLive(slow, { timeoutMs: 100 });
  assert.equal(r.healthy, false);
  assert.equal(r.error, "supplier_probe_timeout");
  // We should not wait the full 500ms.
  assert.ok(r.latencyMs < 400, `latency=${r.latencyMs}`);
});

test("[supplier-health] live probe rejects an invalid mint response", async () => {
  const broken = {
    kind: "stub",
    buildSessionConfig() { return {}; },
    async mintClientSecret() { return null; },
  };
  const r = await probeSupplierLive(broken);
  assert.equal(r.healthy, false);
  assert.equal(r.error, "supplier_mint_invalid_response");
});

// ---------- cache ----------

test("[supplier-health] cache stores and retrieves a result keyed by kind", () => {
  const cache = createSupplierHealthCache();
  const supplier = makeGoodSupplier("openai");
  assert.equal(cache.get(supplier), null);
  cache.set(supplier, { healthy: true, kind: "openai" });
  assert.deepEqual(cache.get(supplier), { healthy: true, kind: "openai" });
});

test("[supplier-health] cache invalidates when supplier.kind changes", () => {
  const cache = createSupplierHealthCache();
  const openai = makeGoodSupplier("openai");
  const stub = makeGoodSupplier("stub");
  cache.set(openai, { healthy: true, kind: "openai" });
  assert.equal(cache.get(stub), null);
});

test("[supplier-health] cache expires after ttl", async () => {
  const cache = createSupplierHealthCache({ ttlMs: 30 });
  const supplier = makeGoodSupplier();
  cache.set(supplier, { healthy: true, kind: "stub" });
  assert.ok(cache.get(supplier));
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cache.get(supplier), null);
});

test("[supplier-health] cache exposes inspect + clear", () => {
  const cache = createSupplierHealthCache();
  const supplier = makeGoodSupplier();
  cache.set(supplier, { healthy: true, kind: "stub" });
  assert.ok(cache.inspect());
  cache.clear();
  assert.equal(cache.inspect(), null);
});

test("[supplier-health] CACHE_TTL_MS is at least 10 seconds (sanity floor)", () => {
  assert.ok(CACHE_TTL_MS >= 10_000);
});
