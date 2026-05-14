// T-decompose-phase5b1-realtime-client-secret — integration tests
// for `mountRealtimeClientSecretRoute`. Cover the 4 mint paths
// + error envelope shapes + required-deps guard.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountRealtimeClientSecretRoute, CLIENT_SECRET_BODY_LIMIT } from "../lib/realtime_client_secret_route.js";

function fakeSupplier({ kind = "openai", mintImpl, shouldThrow = null, sessionConfig = null } = {}) {
  return {
    kind,
    async mintClientSecret() {
      if (shouldThrow) throw shouldThrow;
      return mintImpl ? mintImpl() : {
        value: `${kind}_token_xyz`,
        expiresAt: Date.now() + 60_000,
        sessionConfig: sessionConfig || { type: "realtime", model: "openai-rt", voice: "alloy" },
      };
    },
    buildSessionConfig({ model, voice, instructions }) {
      return { type: "realtime", model: model || "fallback-model", voice: voice || "alloy", instructions };
    },
  };
}

function defaultDeps(overrides = {}) {
  let supplier = fakeSupplier({ kind: "openai" });
  const calls = { incrementErrorCounter: [], setRealtimeSupplier: [] };
  return {
    getRealtimeSupplier: () => supplier,
    setRealtimeSupplier: (s) => { calls.setRealtimeSupplier.push(s?.kind); supplier = s; },
    createRealtimeSupplier: async () => supplier,
    mintWithFailover: async ({ primarySupplier, mintParams, allowFallback, loadStubSupplier }) => {
      const minted = await primarySupplier.mintClientSecret(mintParams);
      return { minted, supplierUsed: primarySupplier, fallbackReason: null };
    },
    loadStubSupplier: async () => fakeSupplier({ kind: "stub" }),
    incrementErrorCounter: (code) => { calls.incrementErrorCounter.push(code); },
    createRequestId: () => "req_test_abc",
    clientIp: () => "127.0.0.1",
    getAssistantSelfNameForIp: () => "Clementine",
    normalizeSnippet: (v, _max) => (typeof v === "string" ? v.trim() : ""),
    OPENAI_API_KEY: "sk-test",
    OPENAI_REALTIME_MODEL: "openai-rt-default",
    OPENAI_REALTIME_VOICE: "alloy",
    OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL: "whisper-1",
    OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS: 60,
    getRealtimeProviderEnv: () => "openai",
    _calls: calls,
    _setSupplier: (s) => { supplier = s; },
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountRealtimeClientSecretRoute(app, deps);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

async function postJson(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[realtime-client-secret] CLIENT_SECRET_BODY_LIMIT exported as 512kb", () => {
  assert.equal(CLIENT_SECRET_BODY_LIMIT, "512kb");
});

test("[realtime-client-secret] mount fails without Express app", () => {
  assert.throws(() => mountRealtimeClientSecretRoute(null, defaultDeps()));
});

test("[realtime-client-secret] mount fails when required deps are missing", () => {
  const required = [
    "getRealtimeSupplier",
    "setRealtimeSupplier",
    "createRealtimeSupplier",
    "mintWithFailover",
    "loadStubSupplier",
    "incrementErrorCounter",
    "createRequestId",
    "clientIp",
    "getAssistantSelfNameForIp",
    "normalizeSnippet",
    "getRealtimeProviderEnv",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountRealtimeClientSecretRoute(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
});

test("[realtime-client-secret] primary_ok: 201 with canonical envelope", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", { instructions: "hi", voice: "alloy" });
    assert.equal(r.status, 201);
    assert.equal(r.body.transport, "webrtc_ephemeral");
    assert.equal(r.body.assistant_name, "Clementine");
    assert.equal(r.body.realtime_provider, "openai");
    assert.equal(r.body.fallback, undefined); // no fallback key on happy path
    assert.ok(r.body.client_secret?.value);
    assert.ok(r.body.client_secret?.expires_at);
    assert.equal(r.body.session.type, "realtime");
    assert.ok(Array.isArray(r.body.session.output_modalities));
    assert.ok(r.body.issued_at);
  });
});

test("[realtime-client-secret] primary_fail_fallback_ok: 201 with fallback keys", async () => {
  const deps = defaultDeps({
    mintWithFailover: async ({ loadStubSupplier }) => {
      const stub = await loadStubSupplier();
      const minted = await stub.mintClientSecret();
      return { minted, supplierUsed: stub, fallbackReason: "primary_request_failed" };
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", { instructions: "hi" });
    assert.equal(r.status, 201);
    assert.equal(r.body.fallback, true);
    assert.equal(r.body.fallback_reason, "primary_request_failed");
    assert.equal(r.body.primary_supplier, "openai");
    assert.equal(r.body.realtime_provider, "stub");
    // Supplier rotation must have been pushed back.
    assert.deepEqual(deps._calls.setRealtimeSupplier, ["stub"]);
  });
});

test("[realtime-client-secret] primary_fail_fallback_fail: 502 with fallback_attempted", async () => {
  const wrapped = Object.assign(new Error("stub also failed"), {
    code: "supplier_fallback_failed",
    cause: Object.assign(new Error("primary failed"), { code: "realtime_supplier_request_failed", status: 502 }),
  });
  const deps = defaultDeps({
    mintWithFailover: async () => { throw wrapped; },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", { instructions: "hi" });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, "realtime_supplier_request_failed");
    assert.equal(r.body.fallback, false);
    assert.equal(r.body.fallback_attempted, true);
    assert.equal(r.body.fallback_error, "stub also failed");
    assert.deepEqual(deps._calls.incrementErrorCounter, ["supplier_fallback_failed"]);
  });
});

test("[realtime-client-secret] pinned_provider_fail: 502 without fallback path", async () => {
  const primaryErr = Object.assign(new Error("primary boom"), {
    code: "realtime_supplier_request_failed",
    status: 502,
  });
  const deps = defaultDeps({
    mintWithFailover: async () => { throw primaryErr; },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", {
      instructions: "hi",
      realtime_provider: "openai", // pinned
    });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, "realtime_supplier_request_failed");
    // No fallback_attempted key on pinned-failure path.
    assert.equal(r.body.fallback_attempted, undefined);
    assert.deepEqual(deps._calls.incrementErrorCounter, ["realtime_supplier_request_failed"]);
  });
});

test("[realtime-client-secret] supplier_load_fail: 503 + unknown_provider 400", async () => {
  // Force a reload path by passing a different provider than the
  // current supplier.kind.
  const unknownErr = Object.assign(new Error("nope"), { code: "realtime_supplier_unknown_provider", status: 503 });
  const deps = defaultDeps({
    createRealtimeSupplier: async () => { throw unknownErr; },
  });
  // Set the current supplier to one that does NOT match "openai"
  // so a reload is forced.
  deps._setSupplier(fakeSupplier({ kind: "stub" }));
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", {
      instructions: "hi",
      realtime_provider: "openai",
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, "realtime_supplier_unknown_provider");
    assert.deepEqual(deps._calls.incrementErrorCounter, ["realtime_supplier_unknown_provider"]);
  });
});

test("[realtime-client-secret] invalid mint payload: 502 with realtime_supplier_response_invalid", async () => {
  const deps = defaultDeps({
    mintWithFailover: async ({ primarySupplier }) => {
      // Empty value triggers the invalid path.
      return {
        minted: { value: "", expiresAt: 0 },
        supplierUsed: primarySupplier,
        fallbackReason: null,
      };
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", { instructions: "hi" });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, "realtime_supplier_response_invalid");
    assert.deepEqual(deps._calls.incrementErrorCounter, ["realtime_supplier_response_invalid"]);
  });
});

test("[realtime-client-secret] reads supplier live via getRealtimeSupplier", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r1 = await postJson(baseURL, "/realtime/client_secret", { instructions: "first" });
    assert.equal(r1.body.realtime_provider, "openai");
    deps._setSupplier(fakeSupplier({ kind: "stub" }));
    const r2 = await postJson(baseURL, "/realtime/client_secret", { instructions: "second" });
    assert.equal(r2.body.realtime_provider, "stub");
  });
});

test("[realtime-client-secret] sets Cache-Control: no-store", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const raw = await fetch(`${baseURL}/realtime/client_secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instructions: "hi" }),
    });
    assert.equal(raw.headers.get("cache-control"), "no-store");
  });
});
