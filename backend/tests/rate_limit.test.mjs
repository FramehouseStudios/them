import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { createRateLimiter, BYPASS_HEADER } from "../lib/rate_limit.js";

function makeLimiter(overrides = {}) {
  let nowMs = 0;
  const limiter = createRateLimiter({
    buckets: {
      auth: { capacity: 3, windowMs: 1000 },
      realtime_mint: { capacity: 2, windowMs: 1000 },
      default: { capacity: 5, windowMs: 1000 },
    },
    now: () => nowMs,
    isProduction: () => true,
    ...overrides,
  });
  return {
    limiter,
    setNow(t) { nowMs = t; },
    advance(ms) { nowMs += ms; },
  };
}

test("[rate_limit] consume() returns allowed=true until capacity exhausted", () => {
  const { limiter } = makeLimiter();
  for (let i = 0; i < 3; i++) {
    assert.equal(limiter.consume("k1", "auth").allowed, true, `req ${i + 1} should be allowed`);
  }
  const denied = limiter.consume("k1", "auth");
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterMs > 0, "retryAfterMs should be > 0");
});

test("[rate_limit] tokens refill over time", () => {
  const { limiter, advance } = makeLimiter();
  for (let i = 0; i < 3; i++) limiter.consume("k1", "auth");
  assert.equal(limiter.consume("k1", "auth").allowed, false);
  advance(1100); // > 1s window
  assert.equal(limiter.consume("k1", "auth").allowed, true);
});

test("[rate_limit] different keys are isolated", () => {
  const { limiter } = makeLimiter();
  for (let i = 0; i < 3; i++) limiter.consume("alice", "auth");
  assert.equal(limiter.consume("alice", "auth").allowed, false);
  assert.equal(limiter.consume("bob", "auth").allowed, true);
});

test("[rate_limit] different route classes are isolated", () => {
  const { limiter } = makeLimiter();
  for (let i = 0; i < 3; i++) limiter.consume("k1", "auth");
  assert.equal(limiter.consume("k1", "auth").allowed, false);
  assert.equal(limiter.consume("k1", "realtime_mint").allowed, true);
});

test("[rate_limit] unknown class falls back to default", () => {
  const { limiter } = makeLimiter();
  for (let i = 0; i < 5; i++) {
    assert.equal(limiter.consume("k", "unknown_class").allowed, true);
  }
  assert.equal(limiter.consume("k", "unknown_class").allowed, false);
});

test("[rate_limit] maxKeys evicts LRU entries", () => {
  let nowMs = 0;
  const limiter = createRateLimiter({
    buckets: { default: { capacity: 1, windowMs: 1000 } },
    maxKeys: 3,
    now: () => nowMs,
    isProduction: () => true,
  });
  for (let i = 0; i < 10; i++) limiter.consume(`k${i}`, "default");
  assert.equal(limiter.size, 3, "only last 3 keys retained");
});

test("[rate_limit] middleware returns 429 with Retry-After header", async () => {
  const app = express();
  const limiter = createRateLimiter({
    buckets: { auth: { capacity: 1, windowMs: 60_000 } },
    isProduction: () => true,
  });
  app.post("/login", limiter.middleware("auth"), (req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const r1 = await fetch(`http://127.0.0.1:${port}/login`, { method: "POST" });
    assert.equal(r1.status, 200);
    const r2 = await fetch(`http://127.0.0.1:${port}/login`, { method: "POST" });
    assert.equal(r2.status, 429);
    assert.ok(Number(r2.headers.get("retry-after")) > 0);
    const body = await r2.json();
    assert.equal(body.error, "rate_limited");
    assert.equal(body.route_class, "auth");
  } finally {
    server.close();
  }
});

test("[rate_limit] bypass header honored in non-production", async () => {
  const app = express();
  const limiter = createRateLimiter({
    buckets: { auth: { capacity: 1, windowMs: 60_000 } },
    isProduction: () => false,
  });
  app.post("/login", limiter.middleware("auth"), (req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  try {
    const port = server.address().port;
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`http://127.0.0.1:${port}/login`, {
        method: "POST",
        headers: { [BYPASS_HEADER]: "1" },
      });
      assert.equal(r.status, 200, `bypass should allow request ${i + 1}`);
    }
  } finally {
    server.close();
  }
});

test("[rate_limit] bypass header IGNORED in production", async () => {
  const app = express();
  const limiter = createRateLimiter({
    buckets: { auth: { capacity: 1, windowMs: 60_000 } },
    isProduction: () => true,
  });
  app.post("/login", limiter.middleware("auth"), (req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  try {
    const port = server.address().port;
    await fetch(`http://127.0.0.1:${port}/login`, {
      method: "POST",
      headers: { [BYPASS_HEADER]: "1" },
    });
    const r2 = await fetch(`http://127.0.0.1:${port}/login`, {
      method: "POST",
      headers: { [BYPASS_HEADER]: "1" },
    });
    assert.equal(r2.status, 429, "production must not honor bypass");
  } finally {
    server.close();
  }
});

test("[rate_limit] user-id keying takes precedence over IP", () => {
  const { limiter } = makeLimiter();
  const reqAlice = { userId: "alice", headers: { "x-forwarded-for": "1.1.1.1" } };
  const reqBob = { userId: "bob", headers: { "x-forwarded-for": "1.1.1.1" } };
  for (let i = 0; i < 3; i++) {
    const res = limiter.consume(limiter.keyFor(reqAlice, "auth"), "auth");
    assert.equal(res.allowed, true);
  }
  // Alice is exhausted; Bob (same IP, different user) should still pass.
  assert.equal(limiter.consume(limiter.keyFor(reqAlice, "auth"), "auth").allowed, false);
  assert.equal(limiter.consume(limiter.keyFor(reqBob, "auth"), "auth").allowed, true);
});
