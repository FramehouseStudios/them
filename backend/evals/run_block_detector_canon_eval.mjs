#!/usr/bin/env node
//
// T-block-detector-canon-eval — pin the canonical block-signal
// envelope, level thresholds, and SIGNAL_WEIGHTS map.
//
// iOS T35 (block-signal nudge surface) and T53 (block-signal
// history sparkline) both read the envelope from
// `computeBlockSignal()`. Renaming a level (`medium` → `mid`) or
// dropping a signal weight key would silently regress both surfaces.
//
// This eval pins:
//   - SCHEMA_VERSION === 1
//   - SIGNAL_WEIGHTS canonical key set + frozen + sums to 1.0
//   - LEVEL_LOW_MAX / LEVEL_MEDIUM_MAX are 0 < x < 1 and ordered
//   - computeBlockSignal({ habits: {}, nowMs }) returns the canonical
//     envelope: { schemaVersion, score, level, signals[], summary,
//     habitsObserved{} }
//   - level is always one of {"low", "medium", "high"}
//   - score is in [0, 1]

import process from "node:process";

import {
  computeBlockSignal,
  buildBlockCoachingBlockForPrompt,
  BLOCK_SIGNAL_SCHEMA_VERSION,
  SIGNAL_WEIGHTS,
  LEVEL_LOW_MAX,
  LEVEL_MEDIUM_MAX,
} from "../lib/block_detector.js";

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

const CANONICAL_WEIGHT_KEYS = [
  "scene_completion_gap",
  "attempt_completion_dropoff",
  "short_turn_ratio",
  "talk_turn_gap",
];
const ALLOWED_LEVELS = new Set(["low", "medium", "high"]);

check("BLOCK_SIGNAL_SCHEMA_VERSION === 1", BLOCK_SIGNAL_SCHEMA_VERSION === 1);

check("SIGNAL_WEIGHTS is frozen", Object.isFrozen(SIGNAL_WEIGHTS));
const weightKeys = Object.keys(SIGNAL_WEIGHTS).sort();
check(
  "SIGNAL_WEIGHTS has exactly the canonical key set",
  JSON.stringify(weightKeys) === JSON.stringify([...CANONICAL_WEIGHT_KEYS].sort()),
  `actual: ${weightKeys.join(", ")}`,
);
const weightSum = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
check(
  `SIGNAL_WEIGHTS values sum to 1.0 (got ${weightSum.toFixed(4)})`,
  Math.abs(weightSum - 1.0) < 1e-9,
);

check("LEVEL_LOW_MAX ∈ (0, 1)", LEVEL_LOW_MAX > 0 && LEVEL_LOW_MAX < 1);
check("LEVEL_MEDIUM_MAX ∈ (0, 1)", LEVEL_MEDIUM_MAX > 0 && LEVEL_MEDIUM_MAX < 1);
check("LEVEL_LOW_MAX < LEVEL_MEDIUM_MAX", LEVEL_LOW_MAX < LEVEL_MEDIUM_MAX);

// Envelope shape — cold input.
const cold = computeBlockSignal({ habits: {}, nowMs: 1_700_000_000_000 });
check("cold envelope has schemaVersion === 1", cold?.schemaVersion === 1);
check(`cold envelope score in [0,1] (got ${cold?.score})`,
  Number.isFinite(cold?.score) && cold.score >= 0 && cold.score <= 1);
check(`cold envelope level is "low" (got "${cold?.level}")`, cold?.level === "low");
check("cold envelope signals is array", Array.isArray(cold?.signals));
check("cold envelope summary is string", typeof cold?.summary === "string");
check("cold envelope has habitsObserved object", cold?.habitsObserved && typeof cold.habitsObserved === "object");

// Probe various inputs to exercise all three levels.
const stuckHigh = computeBlockSignal({
  habits: {
    last_scene_attempt_at: 1_700_000_000_000 - 4 * 24 * 60 * 60 * 1000,
    last_scene_completion_at: 1_700_000_000_000 - 20 * 24 * 60 * 60 * 1000,
    last_talk_turn_at: 1_700_000_000_000 - 5 * 60 * 60 * 1000,
    scenes_attempted: 10,
    scenes_completed: 1,
    recent_short_turns: 7,
  },
  nowMs: 1_700_000_000_000,
});
check(
  `stuck high score elevates above low (got ${stuckHigh.score})`,
  stuckHigh.score > LEVEL_LOW_MAX,
);
check(
  `stuck high level ∈ {low, medium, high} (got "${stuckHigh.level}")`,
  ALLOWED_LEVELS.has(stuckHigh.level),
);

// buildBlockCoachingBlockForPrompt empty path.
check(
  "buildBlockCoachingBlockForPrompt(null) === ''",
  buildBlockCoachingBlockForPrompt(null) === "",
);
check(
  "buildBlockCoachingBlockForPrompt(low) === ''",
  buildBlockCoachingBlockForPrompt({ level: "low", summary: "fine" }) === "",
);
check(
  "buildBlockCoachingBlockForPrompt(medium) includes coaching-note marker",
  buildBlockCoachingBlockForPrompt({ level: "medium", summary: "x" }).includes("writer-coaching-note"),
);

if (!allOK) {
  console.error("block-detector canon eval: FAILED");
  process.exit(1);
}
console.log("block-detector canon eval: OK");
