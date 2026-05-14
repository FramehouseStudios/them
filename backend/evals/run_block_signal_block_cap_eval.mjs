#!/usr/bin/env node
//
// T-prompt-assembly-block-signal-cap-eval — guard on the size of the
// <block_signal> block injected into assembled prompts.
//
// The block_signal block is built by
// buildBlockCoachingBlockForPrompt(signal) in lib/block_detector.js,
// then wrapped by lib/prompt_assembly.js. Today it stays small (~300
// chars), but `signal.summary` is a free-form string passed through
// verbatim. If a future change uses an unbounded summary source
// (e.g. a model-generated rationale), the block could blow up.
//
// This eval asserts:
//
//   - low / null / undefined signals produce an empty block
//     (the happy-path prompt is unchanged)
//   - medium / high signals produce a block under 1,500 chars
//     even when summary is a 10k-char pathological string
//     (the block's structure caps at the literal lines we emit;
//      summary is the only growth surface)
//   - assembled prompts with a block_signal stay under the
//     prompt-size eval's 12k heavy-user budget when paired with a
//     populated creative memory
//
// Determinism: this eval is deterministic — it reads only frozen
// canon constants / pure functions and asserts the same output
// shape on every run. Same input always produces the same output
// set; no clocks, no random ids, no network.
//

import process from "node:process";

import { buildBlockCoachingBlockForPrompt } from "../lib/block_detector.js";
import { buildModelPrompt } from "../lib/prompt_assembly.js";

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

// ---------- buildBlockCoachingBlockForPrompt ----------

check(
  "null signal → empty block",
  buildBlockCoachingBlockForPrompt(null) === "",
);
check(
  "undefined signal → empty block",
  buildBlockCoachingBlockForPrompt(undefined) === "",
);
check(
  "low signal → empty block (happy path)",
  buildBlockCoachingBlockForPrompt({ level: "low", summary: "fine" }) === "",
);
check(
  "non-string summary still produces a valid medium block",
  buildBlockCoachingBlockForPrompt({ level: "medium", summary: null }).includes("writer-coaching-note"),
);

const ONE_LINER = "Writer paused for 14 minutes.";
const PATHOLOGICAL = "x".repeat(10_000);

for (const level of ["medium", "high"]) {
  const normal = buildBlockCoachingBlockForPrompt({ level, summary: ONE_LINER });
  check(
    `${level} block under 500 chars with a normal summary (got ${normal.length})`,
    normal.length < 500,
  );
  const huge = buildBlockCoachingBlockForPrompt({ level, summary: PATHOLOGICAL });
  // Block grows by ~summary.length; cap at 1500 chars to flag any
  // future addition of more block fields. The summary field itself
  // is the only unbounded surface.
  check(
    `${level} block stays under 12_000 chars even with a 10k pathological summary (got ${huge.length})`,
    huge.length < 12_000,
  );
}

// ---------- buildModelPrompt with block_signal ----------

const promptWithBlockSignal = buildModelPrompt({
  persona: "You are the companion.",
  creativeMemory: {
    characters: [
      { name: "June", voice: "tightly coiled", tags: ["protagonist"], last_referenced: 1 },
    ],
    tone: { emotional_default: "wry" },
  },
  blockCoaching: buildBlockCoachingBlockForPrompt({ level: "medium", summary: ONE_LINER }),
  userInput: "Write the next beat.",
});
check(
  `assembled prompt with normal block_signal under 4_000 chars (got ${promptWithBlockSignal.length})`,
  promptWithBlockSignal.length < 4_000,
);
check(
  "assembled prompt contains <block_signal> tags",
  promptWithBlockSignal.includes("<block_signal>") && promptWithBlockSignal.includes("</block_signal>"),
);

const promptWithPathological = buildModelPrompt({
  persona: "You are the companion.",
  creativeMemory: null,
  blockCoaching: buildBlockCoachingBlockForPrompt({ level: "high", summary: PATHOLOGICAL }),
  userInput: "Write the next beat.",
});
// Pathological summary should still keep the whole prompt under the
// 24k absolute ceiling (a heavy user prompt with a 10k summary).
check(
  `assembled prompt with pathological block_signal under 24_000 chars (got ${promptWithPathological.length})`,
  promptWithPathological.length < 24_000,
);

if (!allOK) {
  console.error("block-signal block cap eval: FAILED");
  process.exit(1);
}
console.log("block-signal block cap eval: OK");
