#!/usr/bin/env node
//
// T-block-signal-history-bounds-eval — pathological-input guard on
// the block-signal history ring buffer (added in PR #103).
//
// The semantic contract today:
//   - cap at 30 entries (newest preserved)
//   - 60-second same-level debounce (skip if last entry has same level
//     and is within 60s)
//   - missing userId is a no-op
//   - non-finite scores coerce to 0
//
// PR #103 already covers the happy paths; this eval pounds the buffer
// with pathological inputs to confirm those invariants hold under
// extreme conditions, where unit tests would be tedious to write but
// a single long script keeps the intent legible.
//
// Deterministic; no LLM; no HTTP.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-eval-bshist-bounds-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

async function ringBufferUnderHeavyAlternation() {
  // Alternate low/medium/high every 100s for 1,000 iterations.
  // Each call is a level change, so the debounce never kicks in; the
  // ring buffer must still cap at 30.
  const store = freshStore();
  const levels = ["low", "medium", "high"];
  for (let i = 0; i < 1000; i += 1) {
    await store.recordBlockSignalSample({
      userId: "u-alt",
      score: 0.1 + (i % 9) / 10,
      level: levels[i % 3],
      atMs: i * 100_000,
    });
  }
  const habits = await store.getHabitsForUser("u-alt");
  check(
    `ring-buffer caps at 30 under 1,000 alternating calls (got ${habits.block_signal_history.length})`,
    habits.block_signal_history.length === 30,
  );
  check(
    "newest entry is from iteration 999",
    habits.block_signal_history[29].at === 999 * 100_000,
  );
}

async function debounceUnderHighFrequencyPolling() {
  // Same level, 500 polls each 100ms apart (50s span — all inside the
  // 60s debounce window). Only the first call should record.
  const store = freshStore();
  for (let i = 0; i < 500; i += 1) {
    await store.recordBlockSignalSample({
      userId: "u-poll",
      score: 0.1,
      level: "low",
      atMs: 1000 + i * 100,
    });
  }
  const habits = await store.getHabitsForUser("u-poll");
  check(
    `debounce holds: only 1 entry recorded under 500 same-level polls inside the 60s window (got ${habits.block_signal_history.length})`,
    habits.block_signal_history.length === 1,
  );
}

async function debounceBoundaryAt59And60Seconds() {
  // Confirm the debounce boundary is strictly < 60s.
  // Note: using atMs=1000 as the baseline (not 0) — atMs=0 is falsy
  // and gets replaced with nowMs() by the store's `Number(atMs) || nowMs()`
  // fallback, which makes 0-based timestamps observably non-deterministic.
  const justUnder = freshStore();
  await justUnder.recordBlockSignalSample({ userId: "u-edge", score: 0.1, level: "low", atMs: 1000 });
  await justUnder.recordBlockSignalSample({ userId: "u-edge", score: 0.1, level: "low", atMs: 60_999 });
  const justUnderHabits = await justUnder.getHabitsForUser("u-edge");
  check(
    `debounce blocks at delta=59_999ms (got ${justUnderHabits.block_signal_history.length} entries; expected 1)`,
    justUnderHabits.block_signal_history.length === 1,
  );

  const atBoundary = freshStore();
  await atBoundary.recordBlockSignalSample({ userId: "u-edge2", score: 0.1, level: "low", atMs: 1000 });
  await atBoundary.recordBlockSignalSample({ userId: "u-edge2", score: 0.1, level: "low", atMs: 61_000 });
  const atBoundaryHabits = await atBoundary.getHabitsForUser("u-edge2");
  check(
    `debounce releases at delta=60_000ms (got ${atBoundaryHabits.block_signal_history.length} entries; expected 2)`,
    atBoundaryHabits.block_signal_history.length === 2,
  );
}

async function missingOrEmptyUserIdIsNoOp() {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "", score: 0.5, level: "low", atMs: 1000 });
  await store.recordBlockSignalSample({ userId: undefined, score: 0.5, level: "low", atMs: 1000 });
  await store.recordBlockSignalSample({ score: 0.5, level: "low", atMs: 1000 });
  const habits = await store.getHabitsForUser("");
  check("missing userId leaves no record behind", habits === null);
}

async function nonFiniteScoreCoercesToZero() {
  const store = freshStore();
  await store.recordBlockSignalSample({ userId: "u-nan", score: Number.NaN, level: "medium", atMs: 1000 });
  await store.recordBlockSignalSample({ userId: "u-nan", score: Number.POSITIVE_INFINITY, level: "high", atMs: 70_000 });
  await store.recordBlockSignalSample({ userId: "u-nan", score: Number.NEGATIVE_INFINITY, level: "low", atMs: 140_000 });
  const habits = await store.getHabitsForUser("u-nan");
  check(
    "non-finite scores all coerce to 0",
    habits.block_signal_history.every((e) => e.score === 0),
    JSON.stringify(habits.block_signal_history),
  );
}

async function multiUserIsolation() {
  // Pounding userA must not leak into userB's buffer.
  const store = freshStore();
  for (let i = 0; i < 50; i += 1) {
    await store.recordBlockSignalSample({
      userId: "u-a",
      score: 0.1,
      level: i % 2 === 0 ? "low" : "high",
      atMs: i * 100_000,
    });
  }
  const habitsA = await store.getHabitsForUser("u-a");
  const habitsB = await store.getHabitsForUser("u-b");
  check("userA accumulated samples", habitsA.block_signal_history.length === 30);
  check("userB has no samples", habitsB === null);
}

await ringBufferUnderHeavyAlternation();
await debounceUnderHighFrequencyPolling();
await debounceBoundaryAt59And60Seconds();
await missingOrEmptyUserIdIsNoOp();
await nonFiniteScoreCoercesToZero();
await multiUserIsolation();

if (!allOK) {
  console.error("block-signal history bounds eval: FAILED");
  process.exit(1);
}
console.log("block-signal history bounds eval: OK");
