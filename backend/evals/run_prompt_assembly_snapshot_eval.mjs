#!/usr/bin/env node
//
// T-prompt-assembly-snapshot-eval — canonical block-ordering snapshot.
//
// buildModelPrompt() concatenates labelled blocks in a fixed order:
//
//   persona → <creative_memory> → <session> → <block_signal> → userInput
//
// Several downstream concerns depend on that ordering (model
// attention, the prompt-regression baseline, iOS prompt previews).
// This eval pins the order with a deterministic fixture and a literal
// expected string, so a refactor that re-orders blocks (or sneaks in
// a new one) fails fast and forces a deliberate decision.
//
// Deterministic, no LLM, no I/O. Should be wired into the eval gate.

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

const fixture = {
  persona: "You are the companion.",
  creativeMemory: {
    characters: [{ name: "June", voice: "wry", tags: ["protagonist"], last_referenced: 1 }],
    tone: { emotional_default: "wry" },
  },
  sessionContext: { projectId: "p-1", versionId: "v-1", scene: "ext. rooftop" },
  blockCoaching: "Try a quick switch-perspective prompt.",
  userInput: "Write the next beat.",
};

const expected = [
  "You are the companion.",
  "",
  "<creative_memory>",
  "recurring-characters:",
  "  - June [protagonist] — wry",
  "tone:",
  "  default: wry",
  "</creative_memory>",
  "",
  "<session>",
  "  project: p-1",
  "  version: v-1",
  "  scene: ext. rooftop",
  "</session>",
  "",
  "<block_signal>",
  "Try a quick switch-perspective prompt.",
  "</block_signal>",
  "",
  "Write the next beat.",
].join("\n");

const actual = buildModelPrompt(fixture);

check(
  "snapshot: prompt matches the canonical block layout",
  actual === expected,
  `--- expected ---\n${expected}\n--- actual ---\n${actual}`,
);

// Sanity: the block boundary tags appear in the canonical order.
const indexOfPersona = actual.indexOf("You are the companion");
const indexOfMemory = actual.indexOf("<creative_memory>");
const indexOfSession = actual.indexOf("<session>");
const indexOfBlockSignal = actual.indexOf("<block_signal>");
const indexOfUserInput = actual.indexOf("Write the next beat");

check(
  "ordering: persona < memory < session < block-signal < userInput",
  indexOfPersona >= 0 &&
    indexOfPersona < indexOfMemory &&
    indexOfMemory < indexOfSession &&
    indexOfSession < indexOfBlockSignal &&
    indexOfBlockSignal < indexOfUserInput,
);

// A cold-fixture variant: only persona + userInput, no extra blocks.
const cold = buildModelPrompt({
  persona: "P",
  userInput: "U",
});
check(
  "cold: just persona + user input, no tag markup",
  cold === "P\n\nU",
  cold,
);

// Optional blocks: any combination drops out cleanly.
const memoryOnly = buildModelPrompt({
  persona: "P",
  creativeMemory: { tone: { emotional_default: "wry" } },
  userInput: "U",
});
check(
  "memory-only: prompt has no <session> or <block_signal>",
  memoryOnly.includes("<creative_memory>") &&
    !memoryOnly.includes("<session>") &&
    !memoryOnly.includes("<block_signal>"),
);

if (!allOK) {
  console.error("prompt assembly snapshot eval: FAILED");
  process.exit(1);
}
console.log("prompt assembly snapshot eval: OK");
