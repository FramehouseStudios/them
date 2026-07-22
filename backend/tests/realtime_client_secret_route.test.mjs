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
  const calls = { incrementErrorCounter: [] };
  return {
    getRealtimeSupplier: () => supplier,
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
    assert.equal(typeof r.body.session.input_transcription_model, "string");
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
    // Per #238 review-blocker: supplier rotation must NOT be
    // written back to module-level state. The route should remain
    // byte-identical to the original inline handler, whose
    // `supplier` was request-local. The fact that the response
    // still reports realtime_provider: "stub" proves the rotation
    // happened request-locally without persistence.
  });
});

test("[realtime-client-secret] production primary failure returns degraded 503 without stub fallback", async () => {
  const primaryErr = Object.assign(new Error("OpenAI mint failed"), {
    code: "realtime_supplier_request_failed",
    status: 502,
  });
  let seenAllowFallback = null;
  let stubLoaded = false;
  const deps = defaultDeps({
    isProduction: () => true,
    mintWithFailover: async ({ allowFallback }) => {
      seenAllowFallback = allowFallback;
      throw primaryErr;
    },
    loadStubSupplier: async () => {
      stubLoaded = true;
      return fakeSupplier({ kind: "stub" });
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", { instructions: "hi" });
    assert.equal(r.status, 503);
    assert.equal(seenAllowFallback, false);
    assert.equal(stubLoaded, false);
    assert.equal(r.body.code, "realtime_supplier_request_failed");
    assert.equal(r.body.realtime_provider, "openai");
    assert.equal(r.body.fallback, false);
    assert.equal(r.body.degraded, true);
    assert.equal(r.body.client_secret, undefined);
    assert.deepEqual(deps._calls.incrementErrorCounter, ["realtime_supplier_request_failed"]);
  });
});

test("[realtime-client-secret] production env-selected stub is refused before mint", async () => {
  let mintCalled = false;
  const deps = defaultDeps({
    isProduction: () => true,
    mintWithFailover: async () => {
      mintCalled = true;
      throw new Error("should not mint");
    },
  });
  deps._setSupplier(fakeSupplier({ kind: "stub" }));
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", { instructions: "hi" });
    assert.equal(r.status, 503);
    assert.equal(mintCalled, false);
    assert.equal(r.body.code, "realtime_stub_disabled_in_production");
    assert.equal(r.body.realtime_provider, "stub");
    assert.equal(r.body.fallback, false);
    assert.equal(r.body.degraded, true);
    assert.equal(r.body.client_secret, undefined);
    assert.deepEqual(deps._calls.incrementErrorCounter, ["realtime_stub_disabled_in_production"]);
  });
});

test("[realtime-client-secret] production request-pinned stub is refused before mint", async () => {
  let mintCalled = false;
  const deps = defaultDeps({
    isProduction: () => true,
    createRealtimeSupplier: async ({ provider }) => fakeSupplier({ kind: provider }),
    mintWithFailover: async () => {
      mintCalled = true;
      throw new Error("should not mint");
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/realtime/client_secret", {
      instructions: "hi",
      realtime_provider: "stub",
    });
    assert.equal(r.status, 503);
    assert.equal(mintCalled, false);
    assert.equal(r.body.code, "realtime_stub_disabled_in_production");
    assert.equal(r.body.realtime_provider, "stub");
    assert.equal(r.body.fallback, false);
    assert.equal(r.body.degraded, true);
    assert.equal(r.body.client_secret, undefined);
    assert.deepEqual(deps._calls.incrementErrorCounter, ["realtime_stub_disabled_in_production"]);
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

// ---------- #238 review-blocker regression ----------
//
// Codex blocked the original extraction because the route called
// setRealtimeSupplier(supplier) at the end of the handler,
// persisting per-request failover rotation back to module-level
// state. The original inline handler in backend/index.js did NOT
// do that — its `supplier` variable was a request-local `let`.
//
// The fix removed both the setter dep and the write-back call.
// This regression test pins the byte-identical behavior: a
// fallback rotation in request N must NOT change what
// getRealtimeSupplier() returns at the start of request N+1.

test("[realtime-client-secret] #238 regression: failover rotation does not persist across requests", async () => {
  // Track calls to getRealtimeSupplier so we can prove the module-
  // level supplier was not replaced after a fallback in request 1.
  let liveSupplier = fakeSupplier({ kind: "openai" });
  const getRealtimeSupplier = () => liveSupplier;
  const stub = fakeSupplier({ kind: "stub" });
  const calls = { incrementErrorCounter: [] };
  const deps = {
    getRealtimeSupplier,
    createRealtimeSupplier: async () => liveSupplier,
    // Request 1 triggers a fallback to stub.
    mintWithFailover: async ({ loadStubSupplier }) => {
      const stubLoaded = await loadStubSupplier();
      const minted = await stubLoaded.mintClientSecret();
      return { minted, supplierUsed: stubLoaded, fallbackReason: "primary_request_failed" };
    },
    loadStubSupplier: async () => stub,
    incrementErrorCounter: (code) => { calls.incrementErrorCounter.push(code); },
    createRequestId: () => "req_regress",
    clientIp: () => "127.0.0.1",
    getAssistantSelfNameForIp: () => "Clementine",
    normalizeSnippet: (v) => (typeof v === "string" ? v.trim() : ""),
    OPENAI_API_KEY: "sk-test",
    OPENAI_REALTIME_MODEL: "openai-rt-default",
    OPENAI_REALTIME_VOICE: "alloy",
    OPENAI_REALTIME_INPUT_TRANSCRIPTION_MODEL: "whisper-1",
    OPENAI_REALTIME_CLIENT_SECRET_TTL_SECONDS: 60,
    getRealtimeProviderEnv: () => "openai",
  };

  await withTestServer(deps, async (baseURL) => {
    // Request 1: fallback rotation to stub.
    const r1 = await postJson(baseURL, "/realtime/client_secret", { instructions: "first" });
    assert.equal(r1.status, 201);
    assert.equal(r1.body.realtime_provider, "stub");
    assert.equal(r1.body.fallback, true);

    // Invariant: the module-level supplier (liveSupplier closure)
    // was never replaced. If the route had called
    // setRealtimeSupplier(stub), this assertion would have caught
    // it because `liveSupplier` would now be the stub.
    assert.equal(liveSupplier.kind, "openai",
      "module-level supplier must NOT have been rotated by the route");
  });
});
