// Day 2: Rate Limits And Spend Guard — real-HTTP enforcement proof.
//
// Spawns the real backend with TIGHT exposure limits (overriding the
// harness's open defaults) and asserts the guards bite over actual
// HTTP, per the audit schedule exit criterion ("real HTTP requests,
// not only unit tests"). Each case uses its own backend so limiter
// state never leaks across tests.

import assert from "node:assert/strict";
import { test } from "node:test";

import { apiRequest, startBackend } from "./helpers/backend_test_server.mjs";

test("[day2-int] brute-force on /auth is rate limited (429 + Retry-After)", async () => {
  const server = await startBackend({
    env: {
      EXPOSURE_AUTH_RATE_CAPACITY: "3",
      EXPOSURE_AUTH_RATE_REFILL_PER_MIN: "1", // ~no refill within the test
    },
  });
  try {
    const body = { email: "nobody@example.com", password: "wrong-password-xyz" };
    // Capacity = 3: first 3 attempts pass the limiter (login itself
    // fails auth, but that is the route's job, not the limiter's).
    for (let i = 0; i < 3; i += 1) {
      const r = await apiRequest(server, "/auth/login", { method: "POST", json: body });
      assert.notEqual(r.status, 429, `attempt ${i + 1} must not be rate limited yet`);
    }
    const limited = await apiRequest(server, "/auth/login", { method: "POST", json: body });
    assert.equal(limited.status, 429, "4th rapid /auth/login must be rate limited");
    assert.equal(limited.json?.code, "rate_limited");
    assert.ok(
      Number(limited.headers.get("retry-after")) >= 1,
      "Retry-After header must be set on 429",
    );
  } finally {
    await server.stop();
  }
});

test("[day2-int] rotating a spoofed X-User-Id cannot evade the IP limit", async () => {
  const server = await startBackend({
    env: {
      EXPOSURE_AUTH_RATE_CAPACITY: "2",
      EXPOSURE_AUTH_RATE_REFILL_PER_MIN: "1",
    },
  });
  try {
    const body = { email: "nobody2@example.com", password: "wrong-password-xyz" };
    for (let i = 0; i < 2; i += 1) {
      const r = await apiRequest(server, "/auth/login", {
        method: "POST",
        json: body,
        headers: { "X-User-Id": "spoofed-victim-" + i },
      });
      assert.notEqual(r.status, 429);
    }
    const limited = await apiRequest(server, "/auth/login", {
      method: "POST",
      json: body,
      headers: { "X-User-Id": "spoofed-victim-final" },
    });
    assert.equal(
      limited.status,
      429,
      "rotating X-User-Id must not mint a fresh bucket — keyed by trusted IP",
    );
  } finally {
    await server.stop();
  }
});

test("[day2-int] authenticated provider-cost path is daily-budget capped (402)", async () => {
  const server = await startBackend({
    env: {
      // Auth open (we need a signup), provider budget tight.
      PROVIDER_DAILY_BUDGET_MAX: "2",
    },
  });
  try {
    const signup = await apiRequest(server, "/auth/signup", {
      method: "POST",
      json: { email: "spender@example.com", password: "spender-password-123" },
    });
    assert.equal(signup.status, 201, "signup must succeed");
    const auth = { Authorization: "Bearer " + signup.json.token };

    // Budget middleware runs before the /visual/context handler, so the
    // 402 fires on the request that exceeds the cap regardless of what
    // the downstream handler would have returned.
    const visualBody = { image_data_url: "", transcript: "hello" };
    const r1 = await apiRequest(server, "/visual/context", { method: "POST", headers: auth, json: visualBody });
    const r2 = await apiRequest(server, "/visual/context", { method: "POST", headers: auth, json: visualBody });
    assert.notEqual(r1.status, 402, "request 1 within budget");
    assert.notEqual(r2.status, 402, "request 2 within budget");
    const r3 = await apiRequest(server, "/visual/context", { method: "POST", headers: auth, json: visualBody });
    assert.equal(r3.status, 402, "request 3 exceeds the daily provider budget");
    assert.equal(r3.json?.code, "daily_provider_budget_exhausted");
    assert.equal(r3.json?.daily_limit, 2);
    assert.ok(/Z$/.test(String(r3.json?.reset_at || "")), "reset_at is an ISO timestamp");
  } finally {
    await server.stop();
  }
});

test("[day2-int] public probes and non-guarded paths are unaffected", async () => {
  const server = await startBackend({
    env: {
      EXPOSURE_REALTIME_RATE_CAPACITY: "1",
      EXPOSURE_REALTIME_RATE_REFILL_PER_MIN: "1",
    },
  });
  try {
    // /realtime/health is a public probe — must never be rate limited
    // even with capacity 1 and many rapid hits.
    for (let i = 0; i < 6; i += 1) {
      const r = await apiRequest(server, "/realtime/health");
      assert.notEqual(r.status, 429, `health probe ${i + 1} must not be rate limited`);
    }
    // /health (top-level) is outside the guarded surface entirely.
    const h = await apiRequest(server, "/health");
    assert.notEqual(h.status, 429);
  } finally {
    await server.stop();
  }
});
