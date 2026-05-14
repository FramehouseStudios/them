// T-talk-error-counter-zero-fix — regression test for the
// falsy-zero bug found while writing T-deeper-lib-tests-batch-3
// (#254).
//
// Bug: `earliestStampedAt || now` treats 0 as falsy and falls back
// to `now`, which collapses the rate-per-hour math.
//
// Fix: use `??` so 0 is preserved.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  incrementErrorCounter,
  getErrorCounts,
  resetErrorCounters,
} from "../lib/talk_error_counter.js";

test("[talk-error-counter] first event at time=0 yields a sane errorRatePerHour", () => {
  resetErrorCounters();
  // 6 events over 1 hour starting at t=0. Rate should be ~6/hour.
  for (let i = 0; i < 6; i++) {
    incrementErrorCounter("bursty", { now: i * (10 * 60 * 1000) });
  }
  const snap = getErrorCounts({ now: 60 * 60 * 1000 });
  // Before fix: rate was 6 / (1/3600) = 21600 (off by 3600×).
  // After fix: rate is 6/1 = 6.
  assert.ok(
    snap.errorRatePerHour >= 5 && snap.errorRatePerHour <= 7,
    `expected ~6/hr, got ${snap.errorRatePerHour}`,
  );
});

test("[talk-error-counter] sinceMs preserves earliestStampedAt=0", () => {
  resetErrorCounters();
  incrementErrorCounter("c", { now: 0 });
  const snap = getErrorCounts({ now: 10_000 });
  // Before fix: sinceMs would fall back to 0 via || (correct by
  // accident), but observationStartMs would fall back to 10000.
  // After fix: both honor the actual earliest=0.
  assert.equal(snap.sinceMs, 0);
});
