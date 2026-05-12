#!/usr/bin/env node
//
// T-prompt-size-eval — budget guard on assembled model prompts.
//
// As creative memory accumulates (characters, traits, tone, habits,
// session context, block coaching), the assembled prompt grows. If
// no one watches that growth, a heavy user's prompt can silently
// exceed the model's context budget or the realtime supplier's per-
// request size limit. This eval pins the budget in code.
//
// Budgets (chars, conservative — well below any 8k-token model
// context limit when assuming ~4 chars/token):
//
//   - cold user (no memory)                          <  2_000
//   - light user (1 character + tone)                <  4_000
//   - heavy user (50 characters + tone + habits +
//     session context + block coaching note)         < 12_000
//
// Heavy is bounded by serializeCharacters' top-8 cap. If a future
// change removes the cap or grows per-character serialization, this
// eval will fail and force an explicit decision.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { buildModelPrompt } from "../lib/prompt_assembly.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-eval-promptsize-"));
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

const PERSONA = "You are the companion. Co-write with the user.";
const USER_INPUT = "Write the next beat of my screenplay.";

async function coldUser() {
  const store = freshStore();
  const memory = await store.getCreativeMemoryForPrompt({ userId: "cold" });
  const prompt = buildModelPrompt({ persona: PERSONA, creativeMemory: memory, userInput: USER_INPUT });
  check(
    `cold user prompt under 2,000 chars (got ${prompt.length})`,
    prompt.length < 2000,
    prompt,
  );
}

async function lightUser() {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "light", characterName: "June", voice: "tightly coiled" });
  await store.recordToneSignal({
    userId: "light",
    signal: { emotional_default: "wry", humor_register: "absurd" },
  });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "light" });
  const prompt = buildModelPrompt({ persona: PERSONA, creativeMemory: memory, userInput: USER_INPUT });
  check(
    `light user prompt under 4,000 chars (got ${prompt.length})`,
    prompt.length < 4000,
    prompt,
  );
  check(
    "light user prompt actually contains the memory block",
    prompt.includes("<creative_memory>"),
  );
}

async function heavyUser() {
  const store = freshStore();
  const userId = "heavy";
  // 50 distinct characters with voice + tags. serializeCharacters caps
  // its output at 8, but the underlying store keeps all 50.
  for (let i = 0; i < 50; i += 1) {
    await store.recordCharacterMention({
      userId,
      characterName: `Char${i.toString().padStart(2, "0")}`,
      voice: `voice variant ${i} — careful, deliberate, with a tendency to circle the point`,
      tags: [`tag-a-${i}`, `tag-b-${i}`, `tag-c-${i}`],
    });
  }
  await store.recordToneSignal({
    userId,
    signal: {
      emotional_default: "wry",
      humor_register: "absurd",
      violence_tolerance: "low",
    },
  });
  const memory = await store.getCreativeMemoryForPrompt({ userId });
  const prompt = buildModelPrompt({
    persona: PERSONA,
    creativeMemory: memory,
    sessionContext: { projectId: "proj-001", versionId: "v17", scene: "ext. rooftop — dawn" },
    blockCoaching: "Note: writer paused for 14 minutes. Try a quick switch-perspective prompt.",
    userInput: USER_INPUT,
  });
  check(
    `heavy user prompt under 12,000 chars (got ${prompt.length})`,
    prompt.length < 12000,
    `prompt sample:\n${prompt.slice(0, 600)}...`,
  );
  // serializeCharacters caps at 8 — confirm we don't blow that.
  const charLines = (prompt.match(/^\s*-\s+Char\d{2}/gm) || []).length;
  check(
    `heavy user prompt lists at most 8 characters (got ${charLines})`,
    charLines <= 8,
  );
}

async function determinism() {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "d", characterName: "Iris" });
  const a = buildModelPrompt({
    persona: PERSONA,
    creativeMemory: await store.getCreativeMemoryForPrompt({ userId: "d" }),
    userInput: USER_INPUT,
  });
  const b = buildModelPrompt({
    persona: PERSONA,
    creativeMemory: await store.getCreativeMemoryForPrompt({ userId: "d" }),
    userInput: USER_INPUT,
  });
  check("determinism: same input → same prompt", a === b);
  check("determinism: same input → same size", a.length === b.length);
}

await coldUser();
await lightUser();
await heavyUser();
await determinism();

if (!allOK) {
  console.error("prompt size eval: FAILED");
  process.exit(1);
}
console.log("prompt size eval: OK");
