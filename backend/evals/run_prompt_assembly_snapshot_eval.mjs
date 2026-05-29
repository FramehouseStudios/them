#!/usr/bin/env node
//
// T-prompt-assembly-snapshot-eval — canonical block-ordering snapshot.
//
// buildModelPrompt() concatenates labelled blocks in a fixed order:
//
//   persona → <creative_memory> → <session> → <accepted_twists> → <screenplay_task> → <block_signal> → userInput
//
// Several downstream concerns depend on that ordering (model
// attention, the prompt-regression baseline, iOS prompt previews).
// This eval pins the core order with a deterministic fixture and a
// literal expected string, then separately verifies the optional
// screenplay-task insertion point.
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
  acceptedTwists: [
    {
      twist: {
        id: "tw-1",
        label: "False Victory",
        hook: "The apparent win costs June the only witness.",
        severity: "high",
      },
      beatId: "midpoint",
      acceptedAtMs: 1,
    },
  ],
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
  "<accepted_twists>",
  "- False Victory @midpoint (high): The apparent win costs June the only witness.",
  "</accepted_twists>",
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
const indexOfAcceptedTwists = actual.indexOf("<accepted_twists>");
const indexOfBlockSignal = actual.indexOf("<block_signal>");
const indexOfUserInput = actual.indexOf("Write the next beat");

check(
  "ordering: persona < memory < session < accepted-twists < block-signal < userInput",
  indexOfPersona >= 0 &&
    indexOfPersona < indexOfMemory &&
    indexOfMemory < indexOfSession &&
    indexOfSession < indexOfAcceptedTwists &&
    indexOfAcceptedTwists < indexOfBlockSignal &&
    indexOfBlockSignal < indexOfUserInput,
);

const taskActual = buildModelPrompt({
  ...fixture,
  screenplayTask: {
    intent: "finish_feature",
    label: "Finish Feature",
    output: "Help the writer finish the larger script.",
  },
});
const taskIndexOfAcceptedTwists = taskActual.indexOf("<accepted_twists>");
const taskIndexOfScreenplayTask = taskActual.indexOf("<screenplay_task>");
const taskIndexOfBlockSignal = taskActual.indexOf("<block_signal>");
check(
  "ordering: optional screenplay-task sits between accepted-twists and block-signal",
  taskIndexOfAcceptedTwists >= 0 &&
    taskIndexOfAcceptedTwists < taskIndexOfScreenplayTask &&
    taskIndexOfScreenplayTask < taskIndexOfBlockSignal,
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

// Drop-out: empty acceptedTwists array → no <accepted_twists> block.
const twistsEmpty = buildModelPrompt({
  persona: "P",
  acceptedTwists: [],
  userInput: "U",
});
check(
  "drop-out: empty acceptedTwists array does not emit a block",
  !twistsEmpty.includes("<accepted_twists>"),
);

// Drop-out: acceptedTwists present but blockCoaching empty → accepted_twists
// appears, block_signal does not. Confirms the two new blocks are
// independent.
const twistsOnly = buildModelPrompt({
  persona: "P",
  acceptedTwists: [{ twist: { id: "tw-x", label: "Reversal", severity: "medium", hook: "He chooses to leave." } }],
  userInput: "U",
});
check(
  "drop-out: acceptedTwists alone emits <accepted_twists> but not <block_signal>",
  twistsOnly.includes("<accepted_twists>") && !twistsOnly.includes("<block_signal>"),
);

// Drop-out: blockCoaching present but acceptedTwists null → block_signal
// appears, accepted_twists does not. Symmetric of above.
const coachingOnly = buildModelPrompt({
  persona: "P",
  blockCoaching: "Try a quick switch-perspective prompt.",
  userInput: "U",
});
check(
  "drop-out: blockCoaching alone emits <block_signal> but not <accepted_twists>",
  coachingOnly.includes("<block_signal>") && !coachingOnly.includes("<accepted_twists>"),
);

// Determinism: same fixture → same prompt, twice.
const a = buildModelPrompt(fixture);
const b = buildModelPrompt(fixture);
check(
  "determinism: same fixture → same prompt across calls",
  a === b,
);

if (!allOK) {
  console.error("prompt assembly snapshot eval: FAILED");
  process.exit(1);
}
console.log("prompt assembly snapshot eval: OK");
