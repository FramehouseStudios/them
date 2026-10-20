import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MAX_SPOKEN_STREAK,
  DEFAULT_WINDOW_MS,
  readLowConfidenceRepeatPolicy,
  advanceLowConfidenceRepeatStreak,
  resetLowConfidenceRepeatStreak,
  shouldSpeakLowConfidenceRepeatPrompt,
} from "../lib/low_confidence_repeat_streak.js";

test("[low-confidence-streak] policy defaults and env overrides", () => {
  const defaults = readLowConfidenceRepeatPolicy({});
  assert.equal(defaults.maxSpokenStreak, DEFAULT_MAX_SPOKEN_STREAK);
  assert.equal(defaults.windowMs, DEFAULT_WINDOW_MS);

  const custom = readLowConfidenceRepeatPolicy({
    LOW_CONFIDENCE_REPEAT_PROMPT_MAX_STREAK: "1",
    LOW_CONFIDENCE_REPEAT_PROMPT_WINDOW_MS: "30000",
  });
  assert.equal(custom.maxSpokenStreak, 1);
  assert.equal(custom.windowMs, 30_000);

  const junk = readLowConfidenceRepeatPolicy({
    LOW_CONFIDENCE_REPEAT_PROMPT_MAX_STREAK: "-4",
    LOW_CONFIDENCE_REPEAT_PROMPT_WINDOW_MS: "abc",
  });
  assert.equal(junk.maxSpokenStreak, DEFAULT_MAX_SPOKEN_STREAK);
  assert.equal(junk.windowMs, DEFAULT_WINDOW_MS);

  const zero = readLowConfidenceRepeatPolicy({ LOW_CONFIDENCE_REPEAT_PROMPT_MAX_STREAK: "0" });
  assert.equal(zero.maxSpokenStreak, 0, "0 means never speak the clarification");
  assert.equal(readLowConfidenceRepeatPolicy({ LOW_CONFIDENCE_REPEAT_PROMPT_WINDOW_MS: "10" }).windowMs, 1_000);
});

test("[low-confidence-streak] consecutive prompts inside the window count up, outside it restart", () => {
  const memory = {};
  const t0 = 1_000_000;
  assert.equal(advanceLowConfidenceRepeatStreak(memory, t0, 15_000), 1);
  assert.equal(advanceLowConfidenceRepeatStreak(memory, t0 + 4_500, 15_000), 2);
  assert.equal(advanceLowConfidenceRepeatStreak(memory, t0 + 9_000, 15_000), 3);
  assert.equal(memory.lowConfidenceRepeatCount, 3);
  assert.equal(memory.lastLowConfidenceRepeatAt, t0 + 9_000);
  assert.equal(memory.lastUpdatedAt, t0 + 9_000);

  assert.equal(advanceLowConfidenceRepeatStreak(memory, t0 + 9_000 + 15_001, 15_000), 1);
  assert.equal(advanceLowConfidenceRepeatStreak(null, t0), 1, "no memory still yields a spoken first prompt");
});

test("[low-confidence-streak] the echo loop goes silent after the spoken budget", () => {
  const policy = readLowConfidenceRepeatPolicy({});
  const memory = {};
  const spoken = [];
  let now = 5_000_000;
  for (let i = 0; i < 6; i += 1) {
    const streak = advanceLowConfidenceRepeatStreak(memory, now, policy.windowMs);
    spoken.push(shouldSpeakLowConfidenceRepeatPrompt(streak, policy));
    now += 4_500;
  }
  assert.deepEqual(spoken, [true, true, false, false, false, false]);
});

test("[low-confidence-streak] a usable transcript resets the streak exactly once", () => {
  const memory = {};
  advanceLowConfidenceRepeatStreak(memory, 10_000, 15_000);
  advanceLowConfidenceRepeatStreak(memory, 12_000, 15_000);
  assert.equal(resetLowConfidenceRepeatStreak(memory, 13_000), true);
  assert.equal(memory.lowConfidenceRepeatCount, 0);
  assert.equal(memory.lastLowConfidenceRepeatAt, 0);
  assert.equal(memory.lastUpdatedAt, 13_000);
  assert.equal(resetLowConfidenceRepeatStreak(memory, 14_000), false, "no write when already clear");
  assert.equal(memory.lastUpdatedAt, 13_000);
  assert.equal(resetLowConfidenceRepeatStreak(undefined), false);
  assert.equal(advanceLowConfidenceRepeatStreak(memory, 14_500, 15_000), 1, "streak restarts after a reset");
});
