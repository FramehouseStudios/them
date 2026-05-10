// Unit tests for T08: creative_memory_store + prompt_assembly.
// Exercises both modules without touching index.js or the live
// /talk pipeline. Wiring tests live in the follow-up commit that
// edits handleTalkRequest.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createCreativeMemoryStore,
  CREATIVE_MEMORY_SCHEMA_VERSION,
} from "../lib/creative_memory_store.js";
import {
  buildModelPrompt,
  buildModelPromptParts,
  MEMORY_BLOCK_OPEN,
  MEMORY_BLOCK_CLOSE,
} from "../lib/prompt_assembly.js";

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-creative-memory-"));
  return path.join(dir, "creative_memory_store.json");
}

// ---------- creative_memory_store ----------

test("getCreativeMemoryForPrompt returns null for cold user", () => {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  assert.equal(store.getCreativeMemoryForPrompt({ userId: "cold" }), null);
  assert.equal(store.hasMemoryForUser("cold"), false);
});

test("recordCharacterMention round-trips", async () => {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  await store.recordCharacterMention({
    userId: "u1",
    characterName: "June",
    voice: "tightly coiled, sparse",
    tags: ["protagonist"],
  });
  const mem = store.getCreativeMemoryForPrompt({ userId: "u1" });
  assert.ok(mem);
  assert.equal(mem.version, CREATIVE_MEMORY_SCHEMA_VERSION);
  assert.equal(mem.characters.length, 1);
  assert.equal(mem.characters[0].name, "June");
  assert.deepEqual(mem.characters[0].tags, ["protagonist"]);
});

test("recordCharacterMention dedupes by name and merges tags + last_referenced", async () => {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  await store.recordCharacterMention({ userId: "u2", characterName: "Bob", tags: ["antagonist"] });
  await new Promise((r) => setTimeout(r, 5));
  await store.recordCharacterMention({ userId: "u2", characterName: "Bob", tags: ["comic-relief"] });
  const mem = store.getCreativeMemoryForPrompt({ userId: "u2" });
  assert.equal(mem.characters.length, 1);
  assert.deepEqual(new Set(mem.characters[0].tags), new Set(["antagonist", "comic-relief"]));
  assert.ok(mem.characters[0].last_referenced >= mem.characters[0].first_seen);
});

test("recordToneSignal stores tone and preferredTone", async () => {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  await store.recordToneSignal({
    userId: "u3",
    signal: { emotional_default: "wry", humor_register: "absurd", preferredTone: "hardboiled" },
  });
  const mem = store.getCreativeMemoryForPrompt({ userId: "u3" });
  assert.equal(mem.tone.emotional_default, "wry");
  assert.equal(mem.tone.humor_register, "absurd");
  assert.equal(mem.style.preferredTone, "hardboiled");
});

test("recordSceneCompletion + recordSceneAttempt update completion rate", async () => {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  await store.recordSceneAttempt({ userId: "u4" });
  await store.recordSceneAttempt({ userId: "u4" });
  await store.recordSceneCompletion({ userId: "u4", scenePageCount: 2.0 });
  const mem = store.getCreativeMemoryForPrompt({ userId: "u4" });
  assert.equal(mem.habits.page_completion_rate, 0.5);
  assert.equal(mem.habits.preferred_scene_length_pages, 2.0);
});

test("recordSessionEnd buckets session pattern by start hour", async () => {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  // 22:30 local = late-night
  const lateNight = new Date();
  lateNight.setHours(22, 30, 0, 0);
  await store.recordSessionEnd({ userId: "u5", sessionDurationMs: 600_000, sessionStartedAt: lateNight.getTime() });
  const mem = store.getCreativeMemoryForPrompt({ userId: "u5" });
  assert.equal(mem.habits.session_pattern, "late-night");
});

test("recordLexicalFingerprint accumulates and dedupes case-insensitively", async () => {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  await store.recordLexicalFingerprint({ userId: "u6", phrases: ["she stared at the door", "he waited"] });
  await store.recordLexicalFingerprint({ userId: "u6", phrases: ["She Stared At The Door", "she walked away"] });
  const mem = store.getCreativeMemoryForPrompt({ userId: "u6" });
  assert.deepEqual(mem.style.lexicalFingerprint, ["she stared at the door", "he waited", "she walked away"]);
});

test("getCreativeMemoryForPrompt strips empty containers", async () => {
  const store = createCreativeMemoryStore({ filePath: tempStorePath() });
  await store.recordCharacterMention({ userId: "u7", characterName: "Alice" });
  const mem = store.getCreativeMemoryForPrompt({ userId: "u7" });
  // tone, habits should be absent because they were never written.
  assert.equal("tone" in mem, false);
  assert.equal("habits" in mem, false);
  assert.equal("characters" in mem, true);
});

// ---------- prompt_assembly ----------

test("buildModelPrompt emits no memory block when memory is null", () => {
  const out = buildModelPrompt({
    persona: "You are the companion.",
    creativeMemory: null,
    userInput: "Write the next beat.",
  });
  assert.ok(!out.includes(MEMORY_BLOCK_OPEN));
  assert.ok(out.startsWith("You are the companion."));
  assert.ok(out.endsWith("Write the next beat."));
});

test("buildModelPrompt emits no memory block when memory is empty", () => {
  const out = buildModelPrompt({
    persona: "x",
    creativeMemory: { userId: "u", version: 1, updatedAt: 0 },
    userInput: "y",
  });
  assert.ok(!out.includes(MEMORY_BLOCK_OPEN));
});

test("buildModelPrompt emits memory block when style is present", () => {
  const out = buildModelPrompt({
    persona: "Persona",
    creativeMemory: {
      userId: "u",
      version: 1,
      updatedAt: 0,
      style: { preferredTone: "wry" },
    },
    userInput: "User says hi.",
  });
  assert.ok(out.includes(MEMORY_BLOCK_OPEN));
  assert.ok(out.includes("tone: wry"));
  assert.ok(out.includes(MEMORY_BLOCK_CLOSE));
});

test("buildModelPrompt orders blocks: persona → memory → session → user", () => {
  const out = buildModelPrompt({
    persona: "PERSONA-MARK",
    creativeMemory: { userId: "u", version: 1, updatedAt: 0, style: { preferredTone: "wry" } },
    sessionContext: { projectId: "P1" },
    userInput: "USER-MARK",
  });
  const personaIdx = out.indexOf("PERSONA-MARK");
  const memoryIdx = out.indexOf(MEMORY_BLOCK_OPEN);
  const sessionIdx = out.indexOf("<session>");
  const userIdx = out.indexOf("USER-MARK");
  assert.ok(personaIdx >= 0 && memoryIdx > personaIdx && sessionIdx > memoryIdx && userIdx > sessionIdx);
});

test("buildModelPrompt is deterministic (same inputs → same output)", () => {
  const args = {
    persona: "P",
    creativeMemory: { userId: "u", version: 1, updatedAt: 0, tone: { humor_register: "dry" } },
    userInput: "X",
  };
  const a = buildModelPrompt(args);
  const b = buildModelPrompt(args);
  assert.equal(a, b);
});

test("buildModelPromptParts returns the inspectable parts", () => {
  const parts = buildModelPromptParts({
    persona: "P",
    creativeMemory: { userId: "u", version: 1, updatedAt: 0, characters: [{ name: "Alice", tags: ["lead"] }] },
    userInput: "U",
  });
  assert.equal(parts.persona, "P");
  assert.ok(parts.memoryBlock.includes("Alice"));
  assert.equal(parts.userInput, "U");
});

test("buildModelPrompt caps recurring-characters at 8 entries", () => {
  const characters = Array.from({ length: 20 }, (_, i) => ({
    name: `Char${i}`,
    last_referenced: i,
    tags: [],
  }));
  const out = buildModelPrompt({
    creativeMemory: { userId: "u", version: 1, updatedAt: 0, characters },
    userInput: "x",
  });
  // Most-recent-first: Char19 .. Char12 — check 8 names appear, others do not
  for (let i = 12; i <= 19; i += 1) {
    assert.ok(out.includes(`Char${i}`), `expected Char${i} in output`);
  }
  assert.ok(!out.includes("Char11"));
});
