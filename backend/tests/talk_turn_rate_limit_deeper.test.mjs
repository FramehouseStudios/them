// T-talk-turn-rate-limit-deeper — deeper rate-limiter coverage
// beyond backend/tests/talk_turn_rate_limit.test.mjs.
//
// Smoke covers: basic attempt/refill/deny, capacity, schema version.
//
// This file exercises gaps the smoke skipped:
//   - LRU eviction triggers at capCacheEntries
//   - Per-key isolation (one key's exhaustion doesn't deny another)
//   - retryAfterMs math at boundary conditions
//   - Refill is continuous (not bursty)
//   - reset() clears all buckets
//   - inspect() returns null for unknown keys
//   - Factory rejects invalid config

import assert from "node:assert/strict";
import { test } from "node:test";

import { createTalkTurnRateLimiter } from "../lib/talk_turn_rate_limit.js";

// ---------- LRU eviction ----------

test("[talk-turn-rate-limit-deeper] LRU eviction kicks in at capCacheEntries", () => {
  const cap = 5;
  let nowMs = 1_000;
  const limiter = createTalkTurnRateLimiter({
    refillPerSec: 1,
    capacity: 10,
    capCacheEntries: cap,
    nowFn: () => nowMs,
  });
  // Touch 6 keys (each one increments nowMs so lastSeen differs).
  for (let i = 0; i < cap + 1; i++) {
    nowMs += 100;
    limiter.attempt(`key_${i}`);
  }
  // Cap is 5, we created 6 — exactly 1 should have been evicted.
  // The oldest (key_0, last seen first) should be gone.
  assert.equal(limiter.size(), cap);
  assert.equal(limiter.inspect("key_0"), null);
  assert.notEqual(limiter.inspect(`key_${cap}`), null);
});

// ---------- per-key isolation ----------

test("[talk-turn-rate-limit-deeper] one exhausted key does not deny another", () => {
  let nowMs = 1_000;
  const limiter = createTalkTurnRateLimiter({
    refillPerSec: 0.1, // slow
    capacity: 3,
    nowFn: () => nowMs,
  });
  // Drain key_a.
  for (let i = 0; i < 3; i++) limiter.attempt("key_a");
  // The 4th attempt on a is denied.
  assert.equal(limiter.attempt("key_a").allowed, false);
  // key_b should be fresh.
  assert.equal(limiter.attempt("key_b").allowed, true);
});

// ---------- retryAfterMs ----------

test("[talk-turn-rate-limit-deeper] retryAfterMs is positive when denied", () => {
  let nowMs = 1_000;
  const limiter = createTalkTurnRateLimiter({
    refillPerSec: 1,
    capacity: 2,
    nowFn: () => nowMs,
  });
  limiter.attempt("k");
  limiter.attempt("k");
  const denied = limiter.attempt("k");
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "rate_limited");
  assert.ok(denied.retryAfterMs > 0, `expected positive retryAfterMs, got ${denied.retryAfterMs}`);
});

test("[talk-turn-rate-limit-deeper] retryAfterMs ≈ 1/refillPerSec seconds when fully exhausted", () => {
  let nowMs = 1_000;
  const limiter = createTalkTurnRateLimiter({
    refillPerSec: 2, // 1 token = 500ms
    capacity: 1,
    nowFn: () => nowMs,
  });
  limiter.attempt("k"); // drain to 0
  const denied = limiter.attempt("k");
  // Need 1 full token at 2/sec = 500ms.
  assert.ok(denied.retryAfterMs >= 400 && denied.retryAfterMs <= 600,
    `expected ~500ms, got ${denied.retryAfterMs}`);
});

// ---------- refill continuity ----------

test("[talk-turn-rate-limit-deeper] refill accumulates continuously between attempts", () => {
  let nowMs = 1_000;
  const limiter = createTalkTurnRateLimiter({
    refillPerSec: 1,
    capacity: 5,
    nowFn: () => nowMs,
  });
  // Drain.
  for (let i = 0; i < 5; i++) limiter.attempt("k");
  // After 2 seconds, 2 tokens should have refilled.
  nowMs += 2_000;
  const result = limiter.attempt("k");
  assert.equal(result.allowed, true);
  // Consumed 1 of the 2 refilled tokens → 1 left.
  assert.equal(result.remaining, 1);
});

test("[talk-turn-rate-limit-deeper] refill clamps at capacity", () => {
  let nowMs = 1_000;
  const limiter = createTalkTurnRateLimiter({
    refillPerSec: 1,
    capacity: 3,
    nowFn: () => nowMs,
  });
  limiter.attempt("k"); // 2 left
  nowMs += 100_000; // huge gap — but capacity caps at 3.
  const result = limiter.attempt("k");
  // Consumed 1 — remaining should be 2 (refilled to capacity 3, then -1).
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 2);
});

// ---------- reset + inspect + empty key ----------

test("[talk-turn-rate-limit-deeper] reset clears all buckets", () => {
  const limiter = createTalkTurnRateLimiter({ refillPerSec: 1, capacity: 5 });
  limiter.attempt("a");
  limiter.attempt("b");
  assert.equal(limiter.size(), 2);
  limiter.reset();
  assert.equal(limiter.size(), 0);
  assert.equal(limiter.inspect("a"), null);
});

test("[talk-turn-rate-limit-deeper] inspect returns null for unknown key", () => {
  const limiter = createTalkTurnRateLimiter({ refillPerSec: 1, capacity: 5 });
  assert.equal(limiter.inspect("never_attempted"), null);
});

test("[talk-turn-rate-limit-deeper] empty key returns missing_key reason", () => {
  const limiter = createTalkTurnRateLimiter({ refillPerSec: 1, capacity: 5 });
  const r1 = limiter.attempt("");
  const r2 = limiter.attempt(null);
  const r3 = limiter.attempt(undefined);
  assert.equal(r1.allowed, false);
  assert.equal(r1.reason, "missing_key");
  assert.equal(r2.allowed, false);
  assert.equal(r3.allowed, false);
});

// ---------- factory validation ----------

test("[talk-turn-rate-limit-deeper] factory rejects invalid refillPerSec", () => {
  assert.throws(() => createTalkTurnRateLimiter({ refillPerSec: 0 }), /positive/);
  assert.throws(() => createTalkTurnRateLimiter({ refillPerSec: -1 }), /positive/);
  assert.throws(() => createTalkTurnRateLimiter({ refillPerSec: NaN }), /positive/);
});

test("[talk-turn-rate-limit-deeper] factory rejects invalid capacity", () => {
  assert.throws(() => createTalkTurnRateLimiter({ refillPerSec: 1, capacity: 0 }), /positive/);
  assert.throws(() => createTalkTurnRateLimiter({ refillPerSec: 1, capacity: -1 }), /positive/);
});
