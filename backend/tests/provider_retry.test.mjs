// T-provider-resilience — unit coverage for the bounded provider retry helper.

import assert from "node:assert/strict";
import { test } from "node:test";

import { withProviderRetry, backoffDelayMs, parseRetryAfterMs } from "../lib/provider_retry.js";

const noSleep = async () => {};
const resp = (status, headers = {}) => ({
  status,
  text: async () => `body-${status}`,
  headers: { get: (n) => headers[String(n).toLowerCase()] ?? null },
});

test("[retry] returns immediately on first success (no retries)", async () => {
  let calls = 0;
  const out = await withProviderRetry(async () => { calls += 1; return resp(200); }, { sleep: noSleep });
  assert.equal(calls, 1);
  assert.equal(out.status, 200);
});

test("[retry] retries a 503 then succeeds", async () => {
  let calls = 0;
  const out = await withProviderRetry(async () => (++calls < 2 ? resp(503) : resp(200)), { sleep: noSleep });
  assert.equal(calls, 2);
  assert.equal(out.status, 200);
});

test("[retry] retries a thrown network error then succeeds", async () => {
  let calls = 0;
  const out = await withProviderRetry(async () => {
    if (++calls < 3) throw new Error("ECONNRESET");
    return resp(200);
  }, { sleep: noSleep, retries: 3 });
  assert.equal(calls, 3);
  assert.equal(out.status, 200);
});

test("[retry] exhausts retries and returns the last retryable response", async () => {
  let calls = 0;
  const out = await withProviderRetry(async () => { calls += 1; return resp(500); }, { retries: 2, sleep: noSleep });
  assert.equal(calls, 3, "1 initial + 2 retries");
  assert.equal(out.status, 500);
});

test("[retry] does NOT retry auth failures (401/403) or validation (400/404/409/422)", async () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    let calls = 0;
    const out = await withProviderRetry(async () => { calls += 1; return resp(status); }, { sleep: noSleep });
    assert.equal(calls, 1, `${status} must not be retried`);
    assert.equal(out.status, status);
  }
});

test("[retry] does not retry a non-retryable error (timeout/abort fails fast)", async () => {
  let calls = 0;
  const abort = new Error("aborted");
  await assert.rejects(
    () => withProviderRetry(async () => { calls += 1; throw abort; }, {
      sleep: noSleep,
      isRetryableError: (e) => e !== abort,
    }),
    (e) => e === abort,
  );
  assert.equal(calls, 1);
});

test("[retry] honors Retry-After (seconds), capped at maxDelayMs", async () => {
  const delays = [];
  let calls = 0;
  await withProviderRetry(async () => (++calls < 2 ? resp(429, { "retry-after": "1" }) : resp(200)), {
    sleep: async (ms) => { delays.push(ms); },
    baseDelayMs: 50, maxDelayMs: 2000,
  });
  assert.equal(delays[0], 1000, "used Retry-After: 1s, not the 50ms backoff");

  delays.length = 0; calls = 0;
  await withProviderRetry(async () => (++calls < 2 ? resp(429, { "retry-after": "600" }) : resp(200)), {
    sleep: async (ms) => { delays.push(ms); },
    baseDelayMs: 50, maxDelayMs: 2000,
  });
  assert.equal(delays[0], 2000, "capped a 600s Retry-After at maxDelayMs so a voice turn can't stall");
});

test("[retry] parseRetryAfterMs handles seconds, HTTP-date, and junk", () => {
  assert.equal(parseRetryAfterMs(resp(429, { "retry-after": "2" })), 2000);
  assert.equal(parseRetryAfterMs(resp(429, {})), null);
  const future = new Date(Date.now() + 5000).toUTCString();
  const ms = parseRetryAfterMs(resp(429, { "retry-after": future }));
  assert.ok(ms > 3000 && ms <= 5000, "HTTP-date parsed to a delta");
});

test("[retry] backoff grows exponentially and is capped", () => {
  assert.equal(backoffDelayMs(0, 200, 2000), 200);
  assert.equal(backoffDelayMs(1, 200, 2000), 400);
  assert.equal(backoffDelayMs(2, 200, 2000), 800);
  assert.equal(backoffDelayMs(10, 200, 2000), 2000);
});

test("[retry] SIDE-EFFECT SAFETY: only the provider call re-runs; side effects run once", async () => {
  // Model a caller: the provider fetch (retried) vs. a downstream side effect
  // (persistence/spend/turn-commit) that must happen exactly once, AFTER a
  // successful provider call — never per retry.
  let providerCalls = 0;
  let sideEffects = 0;
  const providerResult = await withProviderRetry(
    async () => (++providerCalls < 3 ? resp(503) : resp(200)),
    { sleep: noSleep, retries: 3 },
  );
  if (providerResult.status === 200) {
    sideEffects += 1; // e.g. commit turn / meter spend / persist — outside the helper
  }
  assert.equal(providerCalls, 3, "provider call retried");
  assert.equal(sideEffects, 1, "side effect ran exactly once despite retries");
});
