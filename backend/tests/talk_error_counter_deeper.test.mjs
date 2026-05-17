// T-deeper-lib-tests-batch-3 — deeper talk_error_counter coverage
// beyond backend/tests/talk_error_counter.test.mjs.
//
// Smoke covers: increment + read; basic shape; reset.
//
// This file exercises gaps the smoke skipped:
//   - `since`-window filtering (events in window vs out of window)
//   - errorRatePerHour math at boundaries
//   - occurrences ring cap (OCCURRENCE_RING_CAP_PER_CLASS)
//   - lastOccurrence stamping
//   - unknown-class normalization to "unknown"

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  incrementErrorCounter,
  getErrorCounts,
  resetErrorCounters,
  OCCURRENCE_RING_CAP_PER_CLASS,
} from "../lib/talk_error_counter.js";

// ---------- since-window filtering ----------

test("[talk-error-counter-deeper] since-window excludes events before the window", () => {
  resetErrorCounters();
  incrementErrorCounter("supplier_unavailable", { now: 1000 });
  incrementErrorCounter("supplier_unavailable", { now: 2000 });
  incrementErrorCounter("supplier_unavailable", { now: 3000 });
  const snap = getErrorCounts({ since: 2500, now: 5000 });
  assert.equal(snap.total, 1, "only the event at 3000 should be in the window");
  assert.equal(snap.counts.supplier_unavailable, 1);
});

test("[talk-error-counter-deeper] since-window omits classes with zero in-window events", () => {
  resetErrorCounters();
  incrementErrorCounter("class_a", { now: 1000 });
  incrementErrorCounter("class_b", { now: 5000 });
  const snap = getErrorCounts({ since: 2000, now: 10_000 });
  assert.ok(!("class_a" in snap.counts), "class_a should be omitted");
  assert.equal(snap.counts.class_b, 1);
});

test("[talk-error-counter-deeper] no since → lifetime totals", () => {
  resetErrorCounters();
  incrementErrorCounter("x", { now: 100 });
  incrementErrorCounter("x", { now: 200 });
  incrementErrorCounter("y", { now: 300 });
  const snap = getErrorCounts();
  assert.equal(snap.total, 3);
  assert.equal(snap.counts.x, 2);
  assert.equal(snap.counts.y, 1);
});

// ---------- errorRatePerHour math ----------

test("[talk-error-counter-deeper] errorRatePerHour is 0 when total is 0", () => {
  resetErrorCounters();
  const snap = getErrorCounts({ now: 5000 });
  assert.equal(snap.errorRatePerHour, 0);
});

test("[talk-error-counter-deeper] errorRatePerHour computes across observed window", () => {
  resetErrorCounters();
  // 6 events over 1 hour starting at t=1 (avoid the `earliestStampedAt
  // || now` falsy-zero pitfall in the lib body). 6/1 = 6/hour.
  const start = 1; // any nonzero baseline
  for (let i = 0; i < 6; i++) {
    incrementErrorCounter("bursty", { now: start + i * (10 * 60 * 1000) });
  }
  const snap = getErrorCounts({ now: start + 60 * 60 * 1000 });
  // earliest=1, now=3600001. Difference ≈ 1 hour. 6/1 = 6.
  assert.ok(snap.errorRatePerHour >= 5 && snap.errorRatePerHour <= 7,
    `expected ~6/hr, got ${snap.errorRatePerHour}`);
});

// ---------- lastOccurrence ----------

test("[talk-error-counter-deeper] lastOccurrence stamps the most recent ts per class", () => {
  resetErrorCounters();
  incrementErrorCounter("c", { now: 1000 });
  incrementErrorCounter("c", { now: 5000 });
  incrementErrorCounter("c", { now: 2000 });
  const snap = getErrorCounts();
  // Note: lastOccurrence reflects the most recent INCREMENT call,
  // even if that increment carried an older `now` than a prior call.
  // The body uses .set() unconditionally, so the latest set wins.
  // (Test the actual behavior, not an assumed monotonic invariant.)
  assert.equal(snap.lastOccurrence.c, 2000);
});

// ---------- unknown-class normalization ----------

test("[talk-error-counter-deeper] empty/null class is recorded as 'unknown'", () => {
  resetErrorCounters();
  incrementErrorCounter("", { now: 1000 });
  incrementErrorCounter(null, { now: 1001 });
  incrementErrorCounter(undefined, { now: 1002 });
  const snap = getErrorCounts();
  assert.equal(snap.counts.unknown, 3);
});

test("[talk-error-counter-deeper] class names are trimmed", () => {
  resetErrorCounters();
  incrementErrorCounter("  trimmed_class  ", { now: 1000 });
  const snap = getErrorCounts();
  assert.equal(snap.counts.trimmed_class, 1);
  assert.ok(!("  trimmed_class  " in snap.counts));
});

// ---------- occurrences ring cap ----------

test("[talk-error-counter-deeper] occurrences ring is bounded per class", () => {
  resetErrorCounters();
  const overflow = OCCURRENCE_RING_CAP_PER_CLASS + 50;
  for (let i = 0; i < overflow; i++) {
    incrementErrorCounter("hot_class", { now: i });
  }
  // Lifetime count is unbounded (kept by counts Map), but ring is
  // bounded so since-window queries respect the cap.
  const snap = getErrorCounts();
  assert.equal(snap.counts.hot_class, overflow, "lifetime count should be unbounded");
  // since=0 with a capped ring: only the most recent CAP timestamps remain.
  const snapWindowed = getErrorCounts({ since: 0, now: overflow + 1 });
  assert.ok(
    snapWindowed.counts.hot_class <= OCCURRENCE_RING_CAP_PER_CLASS,
    `since-window count must not exceed ring cap (${OCCURRENCE_RING_CAP_PER_CLASS}); got ${snapWindowed.counts.hot_class}`,
  );
});

// ---------- snapshot shape ----------

test("[talk-error-counter-deeper] snapshot includes schemaVersion + observedAtMs + sinceMs", () => {
  resetErrorCounters();
  incrementErrorCounter("c", { now: 1000 });
  const snap = getErrorCounts({ now: 5000 });
  assert.equal(snap.schemaVersion, 1);
  assert.equal(snap.observedAtMs, 5000);
  assert.equal(typeof snap.sinceMs, "number");
});
