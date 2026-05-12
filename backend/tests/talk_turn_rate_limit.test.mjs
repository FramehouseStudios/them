// T-talk-turn-rate-limit-helper — unit tests for the token-bucket
// rate limiter. Deterministic via injected nowFn.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createTalkTurnRateLimiter } from "../lib/talk_turn_rate_limit.js";

function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
}

test("[rate-limit] first call returns allowed with full capacity minus one", () => {
  const clock = makeClock();
  const rl = createTalkTurnRateLimiter({ capacity: 10, refillPerSec: 1, nowFn: clock.now });
  const r = rl.attempt("user-1");
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 9);
});

test("[rate-limit] burst exhaustion → rate_limited with retryAfterMs", () => {
  const clock = makeClock();
  const rl = createTalkTurnRateLimiter({ capacity: 3, refillPerSec: 1, nowFn: clock.now });
  for (let i = 0; i < 3; i += 1) assert.equal(rl.attempt("u").allowed, true);
  const denied = rl.attempt("u");
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "rate_limited");
  assert.ok(denied.retryAfterMs > 0);
  assert.ok(denied.retryAfterMs <= 1000);
});

test("[rate-limit] refill replenishes tokens over time", () => {
  const clock = makeClock();
  const rl = createTalkTurnRateLimiter({ capacity: 5, refillPerSec: 1, nowFn: clock.now });
  // Drain the bucket.
  for (let i = 0; i < 5; i += 1) rl.attempt("u");
  assert.equal(rl.attempt("u").allowed, false);
  // Advance 2 seconds → bucket should have ~2 tokens.
  clock.advance(2000);
  assert.equal(rl.attempt("u").allowed, true);
  assert.equal(rl.attempt("u").allowed, true);
  assert.equal(rl.attempt("u").allowed, false);
});

test("[rate-limit] capacity cap holds — refill doesn't exceed capacity", () => {
  const clock = makeClock();
  const rl = createTalkTurnRateLimiter({ capacity: 2, refillPerSec: 1, nowFn: clock.now });
  rl.attempt("u"); // 1 left
  // Advance an hour — bucket should be back at full (capacity), not infinity.
  clock.advance(3_600_000);
  // Should be allowed twice (capacity = 2), then denied.
  assert.equal(rl.attempt("u").allowed, true);
  assert.equal(rl.attempt("u").allowed, true);
  assert.equal(rl.attempt("u").allowed, false);
});

test("[rate-limit] missing key is rejected explicitly", () => {
  const rl = createTalkTurnRateLimiter();
  assert.equal(rl.attempt("").allowed, false);
  assert.equal(rl.attempt("").reason, "missing_key");
  assert.equal(rl.attempt(null).allowed, false);
  assert.equal(rl.attempt(undefined).allowed, false);
});

test("[rate-limit] per-key isolation: draining A doesn't affect B", () => {
  const rl = createTalkTurnRateLimiter({ capacity: 2, refillPerSec: 1 });
  rl.attempt("A");
  rl.attempt("A");
  assert.equal(rl.attempt("A").allowed, false);
  assert.equal(rl.attempt("B").allowed, true);
});

test("[rate-limit] LRU eviction respects capCacheEntries", () => {
  const clock = makeClock();
  const rl = createTalkTurnRateLimiter({
    capacity: 1,
    refillPerSec: 1,
    capCacheEntries: 3,
    nowFn: clock.now,
  });
  rl.attempt("a"); clock.advance(1);
  rl.attempt("b"); clock.advance(1);
  rl.attempt("c"); clock.advance(1);
  assert.equal(rl.size(), 3);
  rl.attempt("d"); // forces eviction of oldest ("a")
  assert.equal(rl.size(), 3);
  assert.equal(rl.inspect("a"), null, "expected 'a' evicted");
  assert.ok(rl.inspect("d"));
});

test("[rate-limit] inspect returns null for unknown keys", () => {
  const rl = createTalkTurnRateLimiter();
  assert.equal(rl.inspect("never-seen"), null);
});

test("[rate-limit] reset clears all bucket state", () => {
  const rl = createTalkTurnRateLimiter({ capacity: 2, refillPerSec: 1 });
  rl.attempt("u");
  rl.attempt("u");
  assert.equal(rl.attempt("u").allowed, false);
  rl.reset();
  assert.equal(rl.attempt("u").allowed, true);
});

test("[rate-limit] invalid config throws", () => {
  assert.throws(() => createTalkTurnRateLimiter({ refillPerSec: 0 }));
  assert.throws(() => createTalkTurnRateLimiter({ refillPerSec: -1 }));
  assert.throws(() => createTalkTurnRateLimiter({ refillPerSec: NaN }));
  assert.throws(() => createTalkTurnRateLimiter({ capacity: 0 }));
  assert.throws(() => createTalkTurnRateLimiter({ capacity: -5 }));
});

test("[rate-limit] deterministic with same clock + keys", () => {
  const seq = (clock) => {
    const rl = createTalkTurnRateLimiter({ capacity: 3, refillPerSec: 1, nowFn: clock.now });
    const out = [];
    for (let i = 0; i < 5; i += 1) {
      out.push(rl.attempt("u").allowed);
      clock.advance(200);
    }
    return out;
  };
  const a = seq(makeClock());
  const b = seq(makeClock());
  assert.deepEqual(a, b);
});
