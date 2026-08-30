import assert from "node:assert/strict";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

async function signup(server, email) {
  const r = await apiRequest(server, "/auth/signup", {
    method: "POST",
    json: { email, password: "rate-budget-password-123" },
  });
  assert.equal(r.status, 201, `signup failed: ${r.text}`);
  return String(r.json?.access_token || "");
}

test("[day2-rate-limit] /auth/* is rate limited before repeated brute-force attempts", async () => {
  const server = await startBackend({
    env: {
      AUTH_RATE_LIMIT_MAX: "1",
      AUTH_RATE_LIMIT_WINDOW_MS: "60000",
    },
  });
  try {
    const first = await apiRequest(server, "/auth/login", {
      method: "POST",
      json: { email: "missing@example.com", password: "nope-nope-nope" },
    });
    assert.notEqual(first.status, 429);

    const second = await apiRequest(server, "/auth/login", {
      method: "POST",
      json: { email: "missing@example.com", password: "nope-nope-nope" },
    });
    assert.equal(second.status, 429);
    assert.equal(second.json?.error, "rate_limited");
    assert.equal(second.json?.route_class, "auth");
  } finally {
    await server.stop();
  }
});

test("[day2-rate-limit] /realtime/client_secret is rate limited per authenticated user", async () => {
  const server = await startBackend({
    env: {
      REALTIME_PROVIDER: "stub",
      AUTH_RATE_LIMIT_MAX: "20",
      REALTIME_RATE_LIMIT_MAX: "1",
      REALTIME_RATE_LIMIT_WINDOW_MS: "60000",
      PROVIDER_DAILY_BUDGET_LIMIT: "20",
    },
  });
  try {
    const aliceToken = await signup(server, "rate-alice@example.com");
    const bobToken = await signup(server, "rate-bob@example.com");

    const first = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      headers: { Authorization: "Bearer " + aliceToken },
      json: { instructions: "test", voice: "marin" },
    });
    assert.equal(first.status, 201, first.text);

    const denied = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      headers: { Authorization: "Bearer " + aliceToken },
      json: { instructions: "test", voice: "marin" },
    });
    assert.equal(denied.status, 429);
    assert.equal(denied.json?.error, "rate_limited");
    assert.equal(denied.json?.route_class, "realtime_mint");

    const bobAllowed = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      headers: { Authorization: "Bearer " + bobToken },
      json: { instructions: "test", voice: "marin" },
    });
    assert.equal(bobAllowed.status, 201, "same IP but different user should have an isolated bucket");
  } finally {
    await server.stop();
  }
});

test("[day2-budget] provider daily budget returns support-safe 429", async () => {
  const server = await startBackend({
    env: {
      REALTIME_PROVIDER: "stub",
      AUTH_RATE_LIMIT_MAX: "20",
      REALTIME_RATE_LIMIT_MAX: "20",
      PROVIDER_DAILY_BUDGET_LIMIT: "1",
    },
  });
  try {
    const token = await signup(server, "budget-alice@example.com");
    const first = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      json: { instructions: "test", voice: "marin" },
    });
    assert.equal(first.status, 201, first.text);

    const denied = await apiRequest(server, "/realtime/client_secret", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      json: { instructions: "test", voice: "marin" },
    });
    assert.equal(denied.status, 429);
    assert.equal(denied.json?.stage, "provider_budget");
    assert.equal(denied.json?.error, "provider_budget_exceeded");
    assert.equal(denied.json?.daily_limit, 1);
    assert.ok(!denied.text.includes("test"), "budget response must not echo prompt content");
  } finally {
    await server.stop();
  }
});
