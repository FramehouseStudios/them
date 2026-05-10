#!/usr/bin/env node
//
// Eval skeleton for the creative memory tier (T08).
//
// Two regression cases:
//   1. memory-absent — cold user; the assembled prompt must NOT
//      include a creative_memory block.
//   2. memory-present — seeded user; the prompt must include a
//      creative_memory block referencing the seeded character and
//      tone signal.
//
// This is a deterministic, fast eval — no LLM call. It guards the
// PROMPT-CONSTRUCTION path. LLM-output evals (does the model use the
// memory?) live in T21 once classification is real.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import {
  buildModelPrompt,
  MEMORY_BLOCK_OPEN,
} from "../lib/prompt_assembly.js";

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-eval-creative-memory-"));
  return path.join(dir, "store.json");
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

async function caseColdUser() {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  const memory = store.getCreativeMemoryForPrompt({ userId: "cold-user" });
  check("memory-absent: getCreativeMemoryForPrompt returns null", memory === null,
    `got: ${JSON.stringify(memory)}`);
  const prompt = buildModelPrompt({
    persona: "You are the companion.",
    creativeMemory: memory,
    userInput: "Write me one line of dialogue.",
  });
  check(
    "memory-absent: prompt has no creative_memory block",
    !prompt.includes(MEMORY_BLOCK_OPEN),
    `prompt:\n${prompt}`,
  );
  check(
    "memory-absent: prompt still contains persona and user input",
    prompt.includes("companion") && prompt.includes("Write me one line"),
  );
}

async function caseSeededUser() {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  await store.recordCharacterMention({
    userId: "seeded-user",
    characterName: "June",
    voice: "tightly coiled",
    tags: ["protagonist"],
  });
  await store.recordToneSignal({
    userId: "seeded-user",
    signal: { emotional_default: "wry", humor_register: "absurd" },
  });
  const memory = store.getCreativeMemoryForPrompt({ userId: "seeded-user" });
  check("memory-present: getCreativeMemoryForPrompt returns a record", memory !== null);
  check("memory-present: characters has June", Array.isArray(memory?.characters) && memory.characters[0]?.name === "June");
  check("memory-present: tone.emotional_default = wry", memory?.tone?.emotional_default === "wry");

  const prompt = buildModelPrompt({
    persona: "You are the companion.",
    creativeMemory: memory,
    userInput: "Write the next beat.",
  });
  check("memory-present: prompt contains creative_memory block", prompt.includes(MEMORY_BLOCK_OPEN));
  check("memory-present: prompt mentions June", prompt.includes("June"));
  check("memory-present: prompt mentions wry tone", prompt.includes("default: wry"));
}

await caseColdUser();
await caseSeededUser();

if (!allOK) {
  console.error("creative memory eval: FAILED");
  process.exit(1);
}
console.log("creative memory eval: OK");
