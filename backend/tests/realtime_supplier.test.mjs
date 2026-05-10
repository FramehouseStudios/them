// T13: realtime supplier interface contract tests.
// Same suite runs against every implementation so a future real
// second supplier (ElevenLabs / Anthropic / etc.) just adds a
// factory entry and the same tests apply.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  KNOWN_PROVIDERS,
  isKnownProvider,
  createRealtimeSupplier,
} from "../lib/realtime_supplier.js";
import { createOpenAIRealtimeSupplier } from "../lib/realtime_supplier_openai.js";
import { createStubRealtimeSupplier } from "../lib/realtime_supplier_stub.js";

// ---------- factory + provider names ----------

test("KNOWN_PROVIDERS lists the supported names", () => {
  assert.deepEqual([...KNOWN_PROVIDERS].sort(), ["openai", "stub"]);
});

test("isKnownProvider matches case-insensitive", () => {
  assert.equal(isKnownProvider("openai"), true);
  assert.equal(isKnownProvider("OpenAI"), true);
  assert.equal(isKnownProvider("stub"), true);
  assert.equal(isKnownProvider("nope"), false);
});

test("createRealtimeSupplier defaults to openai when REALTIME_PROVIDER is unset", async () => {
  const oldProvider = process.env.REALTIME_PROVIDER;
  delete process.env.REALTIME_PROVIDER;
  try {
    const s = await createRealtimeSupplier({
      apiKey: "test-key",
      fetchImpl: async () => ({ ok: true, status: 200, async text() { return "{}"; } }),
    });
    assert.equal(s.kind, "openai");
  } finally {
    if (oldProvider !== undefined) process.env.REALTIME_PROVIDER = oldProvider;
  }
});

test("createRealtimeSupplier returns stub when provider=stub", async () => {
  const s = await createRealtimeSupplier({ provider: "stub" });
  assert.equal(s.kind, "stub");
});

test("createRealtimeSupplier rejects unknown provider names with a typed error", async () => {
  await assert.rejects(
    () => createRealtimeSupplier({ provider: "no-such-provider" }),
    (err) => err.code === "realtime_supplier_unknown_provider",
  );
});

// ---------- shared contract: applied to every implementation ----------

function makeImplementations() {
  return [
    {
      name: "openai",
      // Stub fetchImpl that returns a well-formed OpenAI-shaped response.
      create: () => createOpenAIRealtimeSupplier({
        apiKey: "test-key",
        fetchImpl: async (_url, _init) => ({
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              value: "openai-secret-abc",
              expires_at: Math.floor(Date.now() / 1000) + 60,
            });
          },
        }),
      }),
    },
    {
      name: "stub",
      create: () => createStubRealtimeSupplier(),
    },
  ];
}

for (const impl of makeImplementations()) {
  test(`[${impl.name}] mintClientSecret returns { value, expiresAt, sessionConfig }`, async () => {
    const supplier = impl.create();
    const r = await supplier.mintClientSecret({
      instructions: "be helpful",
      voice: "marin",
      model: undefined,
      ttlSeconds: 60,
    });
    assert.ok(typeof r.value === "string" && r.value.length > 0);
    assert.ok(Number.isFinite(r.expiresAt) && r.expiresAt > 0);
    assert.ok(r.sessionConfig && typeof r.sessionConfig === "object");
    assert.equal(r.sessionConfig.type, "realtime");
    assert.ok(r.sessionConfig.model);
    assert.ok(r.sessionConfig.audio?.output?.voice);
  });

  test(`[${impl.name}] buildSessionConfig is callable without minting`, async () => {
    const supplier = impl.create();
    const cfg = supplier.buildSessionConfig({
      instructions: "x",
      voice: "marin",
      model: undefined,
    });
    assert.equal(cfg.type, "realtime");
    assert.equal(cfg.instructions, "x");
  });

  test(`[${impl.name}] kind is a non-empty string`, () => {
    const supplier = impl.create();
    assert.ok(typeof supplier.kind === "string" && supplier.kind.length > 0);
  });
}

// ---------- OpenAI-specific failure paths ----------

test("[openai] mintClientSecret rejects with realtime_supplier_unauthorized when API key missing", async () => {
  const supplier = createOpenAIRealtimeSupplier({ apiKey: "", fetchImpl: () => ({}) });
  await assert.rejects(
    () => supplier.mintClientSecret({}),
    (err) => err.code === "realtime_supplier_unauthorized" && err.status === 503,
  );
});

test("[openai] mintClientSecret propagates non-OK responses with original status", async () => {
  const supplier = createOpenAIRealtimeSupplier({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: false, status: 401, async text() { return "Unauthorized"; } }),
  });
  await assert.rejects(
    () => supplier.mintClientSecret({}),
    (err) => err.code === "realtime_supplier_request_failed" && err.status === 401,
  );
});

test("[openai] mintClientSecret rejects with realtime_supplier_response_invalid when payload is malformed", async () => {
  const supplier = createOpenAIRealtimeSupplier({
    apiKey: "test-key",
    fetchImpl: async () => ({ ok: true, status: 200, async text() { return "{}"; } }),
  });
  await assert.rejects(
    () => supplier.mintClientSecret({}),
    (err) => err.code === "realtime_supplier_response_invalid",
  );
});

// ---------- Stub-specific simulated-error path ----------

test("[stub] mintClientSecret simulates errors when configured", async () => {
  const supplier = createStubRealtimeSupplier({
    simulateError: { code: "realtime_supplier_request_failed", status: 503, message: "stubby" },
  });
  await assert.rejects(
    () => supplier.mintClientSecret({}),
    (err) => err.code === "realtime_supplier_request_failed"
      && err.status === 503
      && /stubby/.test(err.message),
  );
});

test("[stub] mintClientSecret returns unique secrets across calls", async () => {
  const supplier = createStubRealtimeSupplier();
  const a = await supplier.mintClientSecret({});
  const b = await supplier.mintClientSecret({});
  assert.notEqual(a.value, b.value);
});
