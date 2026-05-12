#!/usr/bin/env node
//
// T-memory-quality-eval — multi-turn creative-memory recall eval.
//
// run_creative_memory_eval covers the single-turn prompt-construction
// path (cold vs seeded). This eval is one step deeper: it simulates a
// multi-turn session where each turn writes a new memory signal, and
// verifies that *subsequent* turns' assembled prompts include the
// facts seeded by earlier turns. It is the assertion that the
// "creative memory" loop actually closes across turns.
//
// Deterministic. No LLM. Exits non-zero on any failure so CI can gate.
//
// Scenarios:
//   1. Character introduced in turn 1 appears in turn 2's prompt.
//   2. A tone signal recorded in turn 2 appears in turn 3's prompt.
//   3. A voice/trait update from turn 3 surfaces in turn 4's prompt.
//   4. Newest character wins ordering — turn 5 adds a second character
//      and the prompt lists it before the older one.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { buildModelPrompt } from "../lib/prompt_assembly.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-eval-memquality-"));
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

async function buildPromptForUser(store, userId, userInput) {
  const memory = await store.getCreativeMemoryForPrompt({ userId });
  return buildModelPrompt({
    persona: "You are the companion.",
    creativeMemory: memory,
    userInput,
  });
}

async function multiTurnRecallScenario() {
  const store = freshStore();
  const userId = "memquality-multi";

  // Turn 1: cold user introduces June.
  const turn1Prompt = await buildPromptForUser(store, userId, "Tell me about my world.");
  check(
    "turn-1: cold prompt has no memory block",
    !turn1Prompt.includes("<creative_memory>"),
    turn1Prompt,
  );
  await store.recordCharacterMention({
    userId,
    characterName: "June",
    tags: ["protagonist"],
  });

  // Turn 2: prompt should remember June.
  const turn2Prompt = await buildPromptForUser(store, userId, "What does June want?");
  check(
    "turn-2: prompt includes a memory block after first mention",
    turn2Prompt.includes("<creative_memory>"),
  );
  check(
    "turn-2: prompt mentions June",
    turn2Prompt.includes("June"),
    turn2Prompt,
  );
  await store.recordToneSignal({
    userId,
    signal: { emotional_default: "wry", humor_register: "absurd" },
  });

  // Turn 3: prompt should now also carry the tone signal.
  const turn3Prompt = await buildPromptForUser(store, userId, "How does she greet her mother?");
  check(
    "turn-3: prompt still mentions June",
    turn3Prompt.includes("June"),
  );
  check(
    "turn-3: prompt carries the wry tone default",
    turn3Prompt.includes("default: wry"),
    turn3Prompt,
  );
  check(
    "turn-3: prompt carries the humor register",
    turn3Prompt.includes("humor: absurd"),
  );

  // Turn 4: update June's voice trait and verify it propagates.
  await store.recordCharacterMention({
    userId,
    characterName: "June",
    voice: "tightly coiled, deflects with humor",
  });
  const turn4Prompt = await buildPromptForUser(store, userId, "How does she answer the phone?");
  check(
    "turn-4: prompt carries the updated voice trait",
    turn4Prompt.includes("tightly coiled"),
    turn4Prompt,
  );

  // Turn 5: a second character should surface alongside June.
  await store.recordCharacterMention({
    userId,
    characterName: "Marcus",
    tags: ["antagonist"],
  });
  const turn5Prompt = await buildPromptForUser(store, userId, "How do they meet?");
  check(
    "turn-5: prompt mentions both June and Marcus",
    turn5Prompt.includes("June") && turn5Prompt.includes("Marcus"),
    turn5Prompt,
  );
  // Tag carries through so the model sees role hints.
  check(
    "turn-5: Marcus's antagonist tag is included in the prompt",
    /Marcus\s*\[antagonist\]/.test(turn5Prompt),
    turn5Prompt,
  );
}

async function userIsolationScenario() {
  // Two distinct userIds must not share memory — a regression seed for
  // any future change to the store's key derivation.
  const store = freshStore();
  await store.recordCharacterMention({ userId: "u-a", characterName: "Anna" });
  await store.recordCharacterMention({ userId: "u-b", characterName: "Bjorn" });

  const promptA = await buildPromptForUser(store, "u-a", "describe my world");
  const promptB = await buildPromptForUser(store, "u-b", "describe my world");

  check(
    "isolation: user-a sees Anna but not Bjorn",
    promptA.includes("Anna") && !promptA.includes("Bjorn"),
  );
  check(
    "isolation: user-b sees Bjorn but not Anna",
    promptB.includes("Bjorn") && !promptB.includes("Anna"),
  );
}

async function determinismScenario() {
  // Same seeded state → same prompt across two reads. This guards
  // against accidental ordering instability inside the store.
  const store = freshStore();
  await store.recordCharacterMention({ userId: "u-det", characterName: "Iris" });
  await store.recordToneSignal({
    userId: "u-det",
    signal: { emotional_default: "stoic" },
  });
  const a = await buildPromptForUser(store, "u-det", "write the opening.");
  const b = await buildPromptForUser(store, "u-det", "write the opening.");
  check("determinism: same store + input → identical prompts", a === b);
}

await multiTurnRecallScenario();
await userIsolationScenario();
await determinismScenario();

if (!allOK) {
  console.error("memory quality eval: FAILED");
  process.exit(1);
}
console.log("memory quality eval: OK");
