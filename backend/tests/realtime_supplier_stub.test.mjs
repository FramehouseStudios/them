// T-deeper-lib-tests-batch-3 — direct test coverage for
// backend/lib/realtime_supplier_stub.js.
//
// This is the deterministic fallback supplier wired into the
// realtime failover ladder (#231 v1_realtime_failover_smoke
// exercises it indirectly). It has no test file today — this
// closes the gap.
//
// Determinism: every mint call uses Date.now() and randomUUID()
// internally, so the *value* and *expiresAt* fields are not
// deterministic across calls. The *shape* and *clamping* of TTL
// is fully deterministic — we test the shape and the clamp
// boundaries.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createStubRealtimeSupplier } from "../lib/realtime_supplier_stub.js";

// ---------- factory shape ----------

test("[realtime-supplier-stub] createStubRealtimeSupplier returns the canonical surface", () => {
  const s = createStubRealtimeSupplier();
  assert.equal(s.kind, "stub");
  assert.equal(typeof s.buildSessionConfig, "function");
  assert.equal(typeof s.mintClientSecret, "function");
});

test("[realtime-supplier-stub] createStubRealtimeSupplier accepts no args", () => {
  assert.doesNotThrow(() => createStubRealtimeSupplier());
  assert.doesNotThrow(() => createStubRealtimeSupplier({}));
});

// ---------- buildSessionConfig ----------

test("[realtime-supplier-stub] buildSessionConfig fills defaults when args missing", () => {
  const s = createStubRealtimeSupplier();
  const cfg = s.buildSessionConfig();
  assert.equal(cfg.type, "realtime");
  assert.equal(cfg.model, "stub-realtime-1");
  assert.equal(cfg.audio.output.voice, "stub-voice");
});

test("[realtime-supplier-stub] buildSessionConfig honors per-call model + voice overrides", () => {
  const s = createStubRealtimeSupplier();
  const cfg = s.buildSessionConfig({ model: "custom-model", voice: "custom-voice" });
  assert.equal(cfg.model, "custom-model");
  assert.equal(cfg.audio.output.voice, "custom-voice");
});

test("[realtime-supplier-stub] buildSessionConfig omits instructions when blank", () => {
  const s = createStubRealtimeSupplier();
  const cfg = s.buildSessionConfig({});
  assert.ok(!("instructions" in cfg), "instructions should be absent on blank input");
});

test("[realtime-supplier-stub] buildSessionConfig includes instructions when present", () => {
  const s = createStubRealtimeSupplier();
  const cfg = s.buildSessionConfig({ instructions: "Stay in character." });
  assert.equal(cfg.instructions, "Stay in character.");
});

test("[realtime-supplier-stub] buildSessionConfig honors constructor defaults", () => {
  const s = createStubRealtimeSupplier({ defaultModel: "alt-model", defaultVoice: "alt-voice" });
  const cfg = s.buildSessionConfig();
  assert.equal(cfg.model, "alt-model");
  assert.equal(cfg.audio.output.voice, "alt-voice");
});

// ---------- mintClientSecret happy path ----------

test("[realtime-supplier-stub] mintClientSecret returns the canonical envelope shape", async () => {
  const s = createStubRealtimeSupplier();
  const mint = await s.mintClientSecret({ instructions: "test", voice: "v", model: "m" });
  assert.equal(typeof mint.value, "string");
  assert.ok(mint.value.startsWith("stub_secret_"));
  assert.equal(typeof mint.expiresAt, "number");
  assert.ok(mint.expiresAt > 0);
  assert.equal(mint.sessionConfig.type, "realtime");
  assert.equal(mint.sessionConfig.model, "m");
  assert.equal(mint.sessionConfig.audio.output.voice, "v");
  assert.equal(mint.sessionConfig.instructions, "test");
  assert.equal(mint.raw.provider, "stub");
});

test("[realtime-supplier-stub] mintClientSecret returns unique values across calls", async () => {
  const s = createStubRealtimeSupplier();
  const a = await s.mintClientSecret({});
  const b = await s.mintClientSecret({});
  assert.notEqual(a.value, b.value, "stub should issue a fresh secret value per call");
});

// ---------- TTL clamping ----------

test("[realtime-supplier-stub] mintClientSecret clamps TTL to default when ttlSeconds=null", async () => {
  const s = createStubRealtimeSupplier({ defaultTtlSeconds: 60 });
  const before = Math.floor(Date.now() / 1000);
  const mint = await s.mintClientSecret({ ttlSeconds: null });
  // expiresAt should be ~ before + 60.
  assert.ok(mint.expiresAt >= before + 59 && mint.expiresAt <= before + 61);
});

test("[realtime-supplier-stub] mintClientSecret clamps low TTL to min (30s)", async () => {
  const s = createStubRealtimeSupplier({ defaultTtlSeconds: 60 });
  const before = Math.floor(Date.now() / 1000);
  const mint = await s.mintClientSecret({ ttlSeconds: 5 });
  // 5 < min(30) → clamped to 30.
  assert.ok(mint.expiresAt >= before + 29 && mint.expiresAt <= before + 31);
});

test("[realtime-supplier-stub] mintClientSecret clamps high TTL to max (300s)", async () => {
  const s = createStubRealtimeSupplier({ defaultTtlSeconds: 60 });
  const before = Math.floor(Date.now() / 1000);
  const mint = await s.mintClientSecret({ ttlSeconds: 10_000 });
  // 10000 > max(300) → clamped to 300.
  assert.ok(mint.expiresAt >= before + 299 && mint.expiresAt <= before + 301);
});

// ---------- simulateError ----------

test("[realtime-supplier-stub] mintClientSecret throws when simulateError is set", async () => {
  const s = createStubRealtimeSupplier({
    simulateError: { code: "simulated_failure", status: 503, message: "for tests" },
  });
  await assert.rejects(
    () => s.mintClientSecret({}),
    (err) => {
      assert.equal(err.code, "simulated_failure");
      assert.equal(err.status, 503);
      assert.match(err.message, /for tests/);
      return true;
    },
  );
});

test("[realtime-supplier-stub] mintClientSecret simulateError uses defaults when fields missing", async () => {
  const s = createStubRealtimeSupplier({ simulateError: {} });
  await assert.rejects(
    () => s.mintClientSecret({}),
    (err) => {
      assert.equal(err.code, "realtime_supplier_request_failed");
      assert.equal(err.status, 502);
      return true;
    },
  );
});
