// T-realtime-supplier-failover — unit tests for the mintWithFailover
// helper. The helper is small and pure (it just orchestrates the
// primary + stub supplier calls), so we can exercise every branch
// without spinning up the full backend.

import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { test } from "node:test";

import {
  mintWithFailover,
  shouldAttemptFallback,
  NON_FALLBACK_CODES,
} from "../lib/realtime_supplier_failover.js";
import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

function makeOkSupplier(kind = "openai", value = "secret-abc") {
  return {
    kind,
    async mintClientSecret() {
      return { value, expiresAt: Date.now() + 60_000, sessionConfig: { type: "realtime", model: "m" } };
    },
  };
}

function makeFailingSupplier(kind = "openai", code = "realtime_supplier_request_failed") {
  return {
    kind,
    async mintClientSecret() {
      const e = new Error(`${kind} mint failed`);
      e.code = code;
      throw e;
    },
  };
}

async function createFailingRealtimeEndpoint() {
  const server = http.createServer((_req, res) => {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "forced realtime supplier failure" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = Number(server.address()?.port || 0);
  return {
    url: `http://127.0.0.1:${port}/client_secrets`,
    close: async () => {
      server.close();
      await once(server, "close").catch(() => {});
    },
  };
}

// Day 1 Backend Exposure Lock: /realtime/* now requires authenticated
// identity. Tests that hit the live failover route need a real bearer
// token from a signup round-trip.
async function signupAndGetToken(server, email = "realtime-failover@example.com") {
  const signup = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email, password: "failover-password-123" },
  });
  assert.equal(signup.status, 201, "auth/signup should succeed");
  return String(signup.json?.access_token || signup.json?.token || "");
}

// ---------- shouldAttemptFallback ----------

test("[failover] shouldAttemptFallback returns false when allowFallback is false", () => {
  assert.equal(shouldAttemptFallback(false, { code: "anything" }), false);
});

test("[failover] shouldAttemptFallback returns false for 400-class codes (unknown_provider)", () => {
  assert.equal(shouldAttemptFallback(true, { code: "realtime_supplier_unknown_provider" }), false);
});

test("[failover] shouldAttemptFallback returns true for generic 502-class failures", () => {
  assert.equal(shouldAttemptFallback(true, { code: "realtime_supplier_request_failed" }), true);
  assert.equal(shouldAttemptFallback(true, {}), true);
});

test("[failover] NON_FALLBACK_CODES is a non-empty Set", () => {
  assert.ok(NON_FALLBACK_CODES instanceof Set);
  assert.ok(NON_FALLBACK_CODES.size >= 1);
});

// ---------- mintWithFailover happy path ----------

test("[failover] primary success returns no fallback", async () => {
  const primary = makeOkSupplier("openai");
  const r = await mintWithFailover({
    primarySupplier: primary,
    mintParams: { instructions: "x" },
    allowFallback: true,
    loadStubSupplier: async () => { throw new Error("should not be called"); },
  });
  assert.equal(r.fallbackReason, null);
  assert.equal(r.supplierUsed, primary);
  assert.equal(r.minted.value, "secret-abc");
});

// ---------- mintWithFailover policy gates ----------

test("[failover] primary failure WITHOUT allowFallback rethrows", async () => {
  const primary = makeFailingSupplier("openai");
  await assert.rejects(
    () => mintWithFailover({
      primarySupplier: primary,
      mintParams: {},
      allowFallback: false,
      loadStubSupplier: async () => makeOkSupplier("stub"),
    }),
    (e) => e.code === "realtime_supplier_request_failed",
  );
});

test("[failover] 400-class failures (unknown_provider) do NOT trigger fallback", async () => {
  const primary = makeFailingSupplier("nope", "realtime_supplier_unknown_provider");
  await assert.rejects(
    () => mintWithFailover({
      primarySupplier: primary,
      mintParams: {},
      allowFallback: true,
      loadStubSupplier: async () => makeOkSupplier("stub"),
    }),
    (e) => e.code === "realtime_supplier_unknown_provider",
  );
});

// ---------- mintWithFailover successful fallback ----------

test("[failover] primary failure with allowFallback falls back to stub", async () => {
  const primary = makeFailingSupplier("openai", "realtime_supplier_response_invalid");
  const stub = makeOkSupplier("stub", "stub-secret");
  const r = await mintWithFailover({
    primarySupplier: primary,
    mintParams: {},
    allowFallback: true,
    loadStubSupplier: async () => stub,
  });
  assert.equal(r.fallbackReason, "realtime_supplier_response_invalid");
  assert.equal(r.supplierUsed, stub);
  assert.equal(r.minted.value, "stub-secret");
  assert.equal(r.primaryKind, "openai");
});

test("[failover] fallbackReason defaults to a string when primary error has no code", async () => {
  const primary = {
    kind: "openai",
    async mintClientSecret() { throw new Error("no code attached"); },
  };
  const r = await mintWithFailover({
    primarySupplier: primary,
    mintParams: {},
    allowFallback: true,
    loadStubSupplier: async () => makeOkSupplier("stub"),
  });
  assert.equal(typeof r.fallbackReason, "string");
  assert.ok(r.fallbackReason.length > 0);
});

// ---------- mintWithFailover when fallback also fails ----------

test("[failover] stub load failure throws supplier_fallback_failed with original cause", async () => {
  const primary = makeFailingSupplier("openai");
  await assert.rejects(
    () => mintWithFailover({
      primarySupplier: primary,
      mintParams: {},
      allowFallback: true,
      loadStubSupplier: async () => { throw new Error("npm cache corrupt"); },
    }),
    (e) => e.code === "supplier_fallback_failed" && e.cause?.code === "realtime_supplier_request_failed",
  );
});

test("[failover] stub mint failure throws supplier_fallback_failed with original cause", async () => {
  const primary = makeFailingSupplier("openai");
  const brokenStub = makeFailingSupplier("stub", "stub_unavailable");
  await assert.rejects(
    () => mintWithFailover({
      primarySupplier: primary,
      mintParams: {},
      allowFallback: true,
      loadStubSupplier: async () => brokenStub,
    }),
    (e) => e.code === "supplier_fallback_failed" && e.cause?.code === "realtime_supplier_request_failed",
  );
});

// ---------- mintWithFailover input validation ----------

test("[failover] rejects when primarySupplier is missing mintClientSecret", async () => {
  await assert.rejects(
    () => mintWithFailover({
      primarySupplier: { kind: "openai" },
      mintParams: {},
      allowFallback: false,
    }),
    (e) => e.code === "realtime_supplier_invalid",
  );
});

test("[failover] rejects when allowFallback=true but loadStubSupplier is missing", async () => {
  const primary = makeFailingSupplier();
  await assert.rejects(
    () => mintWithFailover({
      primarySupplier: primary,
      mintParams: {},
      allowFallback: true,
      // no loadStubSupplier
    }),
    (e) => e.code === "realtime_supplier_invalid",
  );
});

// ---------- mintParams are forwarded ----------

test("[failover] mintParams are forwarded to the supplier", async () => {
  let received = null;
  const primary = {
    kind: "openai",
    async mintClientSecret(params) {
      received = params;
      return { value: "v", expiresAt: 1, sessionConfig: {} };
    },
  };
  await mintWithFailover({
    primarySupplier: primary,
    mintParams: { instructions: "INST", voice: "alloy", model: "gpt-4o", ttlSeconds: 60 },
    allowFallback: false,
  });
  assert.deepEqual(received, { instructions: "INST", voice: "alloy", model: "gpt-4o", ttlSeconds: 60 });
});

// ---------- production route policy ----------

test("[failover-route] unpinned provider falls back to stub when OpenAI mint fails", async () => {
  const upstream = await createFailingRealtimeEndpoint();
  const server = await startBackend({
    env: {
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_REALTIME_ENDPOINT: upstream.url,
      REALTIME_PROVIDER: "openai",
    },
  });
  try {
    const token = await signupAndGetToken(server, "failover-unpinned@example.com");
    const r = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      json: { instructions: "Keep it spare.", voice: "marin" },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json?.realtime_provider, "stub");
    assert.equal(r.json?.fallback, true);
    assert.equal(r.json?.fallback_reason, "realtime_supplier_request_failed");
    assert.equal(r.json?.primary_supplier, "openai");
    assert.ok(r.json?.client_secret?.value);
  } finally {
    await server.stop();
    await upstream.close();
  }
});

test("[failover-route] pinned provider does not fall back", async () => {
  const upstream = await createFailingRealtimeEndpoint();
  const server = await startBackend({
    env: {
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_REALTIME_ENDPOINT: upstream.url,
      REALTIME_PROVIDER: "openai",
    },
  });
  try {
    const token = await signupAndGetToken(server, "failover-pinned@example.com");
    const r = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      json: { provider: "openai", instructions: "Keep it spare." },
    });
    assert.equal(r.status, 500);
    assert.equal(r.json?.realtime_provider, "openai");
    assert.equal(r.json?.code, "realtime_supplier_request_failed");
    assert.equal(r.json?.fallback, undefined);
  } finally {
    await server.stop();
    await upstream.close();
  }
});

test("[failover-route] production primary failure returns degraded 503 without stub success", async () => {
  const upstream = await createFailingRealtimeEndpoint();
  const server = await startBackend({
    env: {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:1/them",
      SCALE_BACKPLANE_ENABLED: "0",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_REALTIME_ENDPOINT: upstream.url,
      REALTIME_PROVIDER: "openai",
    },
  });
  try {
    const token = await signupAndGetToken(server, "failover-production@example.com");
    const r = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      json: { instructions: "Keep it spare.", voice: "marin" },
    });
    assert.equal(r.status, 503);
    assert.equal(r.json?.realtime_provider, "openai");
    assert.equal(r.json?.code, "realtime_supplier_request_failed");
    assert.equal(r.json?.fallback, false);
    assert.equal(r.json?.degraded, true);
    assert.equal(r.json?.client_secret, undefined);
  } finally {
    await server.stop();
    await upstream.close();
  }
});
