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
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-eval-creative-memory-"));
  return createJsonPersistence({ jsonRoot: root });
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
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "cold-user" });
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
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
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
  const memory = await store.getCreativeMemoryForPrompt({ userId: "seeded-user" });
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

async function caseSemanticLegacyBackfill() {
  const persistence = freshPersistence();
  const legacyStore = createCreativeMemoryStore({ persistence });
  await legacyStore.recordEpisodicMemory({
    userId: "semantic-user",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    summary: "Mara seals the affidavit behind a loose courthouse tile.",
    text: "The sworn statement proves the judge threatened Eli.",
  });
  await legacyStore.recordEpisodicMemory({
    userId: "semantic-user",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    summary: "Mara misses Eli's birthday dinner.",
    text: "The untouched cake hardens beside the kitchen sink.",
  });

  const legacyMemory = await legacyStore.getCreativeMemoryForPrompt({
    userId: "semantic-user",
    projectId: "rain-docket",
    query: "Which hidden sworn proof can expose the judge?",
    maxEpisodicMemories: 1,
  });
  check(
    "semantic-backfill: legacy recall remains available before migration",
    legacyMemory?.episodicSelection?.strategy === "deterministic_fallback",
  );

  const embeddingModel = "eval-story-embedding";
  const upgradedStore = createCreativeMemoryStore({
    persistence,
    embeddingModel,
    embedTexts: async (inputs) => inputs.map((input) =>
      String(input || "").toLowerCase().includes("affidavit") ? [1, 0, 0] : [0, 1, 0]),
    embedQuery: async () => ({ model: embeddingModel, vector: [1, 0, 0] }),
  });
  const receipt = await upgradedStore.backfillEpisodicEmbeddings({
    userId: "semantic-user",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });
  check(
    "semantic-backfill: persisted legacy episodes receive embeddings",
    receipt.ok === true && receipt.updated === 2,
    `receipt: ${JSON.stringify(receipt)}`,
  );

  const recalled = await upgradedStore.getCreativeMemoryForPrompt({
    userId: "semantic-user",
    projectId: "rain-docket",
    query: "Which hidden sworn proof can expose the judge?",
    maxEpisodicMemories: 1,
  });
  check(
    "semantic-backfill: later turn uses hybrid semantic recall",
    recalled?.episodicSelection?.strategy === "hybrid_embedding" &&
      recalled?.episodicSelection?.coverageRatio === 1,
    `selection: ${JSON.stringify(recalled?.episodicSelection)}`,
  );
  check(
    "semantic-backfill: paraphrase retrieves the affidavit memory",
    /affidavit/i.test(recalled?.episodicMemories?.[0]?.summary || ""),
    `memory: ${JSON.stringify(recalled?.episodicMemories?.[0])}`,
  );
}

await caseColdUser();
await caseSeededUser();
await caseSemanticLegacyBackfill();

if (!allOK) {
  console.error("creative memory eval: FAILED");
  process.exit(1);
}
console.log("creative memory eval: OK");
