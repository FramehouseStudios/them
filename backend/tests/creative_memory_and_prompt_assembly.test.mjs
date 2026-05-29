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
  inferScreenplayTask,
  MEMORY_BLOCK_OPEN,
  MEMORY_BLOCK_CLOSE,
  BLOCK_SIGNAL_BLOCK_OPEN,
  SCREENPLAY_TASK_BLOCK_OPEN,
} from "../lib/prompt_assembly.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-creative-memory-"));
  return createJsonPersistence({ jsonRoot: root });
}

// ---------- creative_memory_store ----------

test("getCreativeMemoryForPrompt returns null for cold user", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  assert.equal(await store.getCreativeMemoryForPrompt({ userId: "cold" }), null);
  assert.equal(await store.hasMemoryForUser("cold"), false);
});

test("recordCharacterMention round-trips", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordCharacterMention({
    userId: "u1",
    characterName: "June",
    voice: "tightly coiled, sparse",
    tags: ["protagonist"],
  });
  const mem = await store.getCreativeMemoryForPrompt({ userId: "u1" });
  assert.ok(mem);
  assert.equal(mem.version, CREATIVE_MEMORY_SCHEMA_VERSION);
  assert.equal(mem.characters.length, 1);
  assert.equal(mem.characters[0].name, "June");
  assert.deepEqual(mem.characters[0].tags, ["protagonist"]);
});

test("recordCharacterMention dedupes by name and merges tags + last_referenced", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordCharacterMention({ userId: "u2", characterName: "Bob", tags: ["antagonist"] });
  await new Promise((r) => setTimeout(r, 5));
  await store.recordCharacterMention({ userId: "u2", characterName: "Bob", tags: ["comic-relief"] });
  const mem = await store.getCreativeMemoryForPrompt({ userId: "u2" });
  assert.equal(mem.characters.length, 1);
  assert.deepEqual(new Set(mem.characters[0].tags), new Set(["antagonist", "comic-relief"]));
  assert.ok(mem.characters[0].last_referenced >= mem.characters[0].first_seen);
});

test("recordToneSignal stores tone and preferredTone", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordToneSignal({
    userId: "u3",
    signal: { emotional_default: "wry", humor_register: "absurd", preferredTone: "hardboiled" },
  });
  const mem = await store.getCreativeMemoryForPrompt({ userId: "u3" });
  assert.equal(mem.tone.emotional_default, "wry");
  assert.equal(mem.tone.humor_register, "absurd");
  assert.equal(mem.style.preferredTone, "hardboiled");
});

test("recordSceneCompletion + recordSceneAttempt update completion rate", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordSceneAttempt({ userId: "u4" });
  await store.recordSceneAttempt({ userId: "u4" });
  await store.recordSceneCompletion({ userId: "u4", scenePageCount: 2.0 });
  const mem = await store.getCreativeMemoryForPrompt({ userId: "u4" });
  assert.equal(mem.habits.page_completion_rate, 0.5);
  assert.equal(mem.habits.preferred_scene_length_pages, 2.0);
});

test("recordSessionEnd buckets session pattern by start hour", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  // 22:30 local = late-night
  const lateNight = new Date();
  lateNight.setHours(22, 30, 0, 0);
  await store.recordSessionEnd({ userId: "u5", sessionDurationMs: 600_000, sessionStartedAt: lateNight.getTime() });
  const mem = await store.getCreativeMemoryForPrompt({ userId: "u5" });
  assert.equal(mem.habits.session_pattern, "late-night");
});

test("recordLexicalFingerprint accumulates and dedupes case-insensitively", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordLexicalFingerprint({ userId: "u6", phrases: ["she stared at the door", "he waited"] });
  await store.recordLexicalFingerprint({ userId: "u6", phrases: ["She Stared At The Door", "she walked away"] });
  const mem = await store.getCreativeMemoryForPrompt({ userId: "u6" });
  assert.deepEqual(mem.style.lexicalFingerprint, ["she stared at the door", "he waited", "she walked away"]);
});

test("getCreativeMemoryForPrompt strips empty containers", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordCharacterMention({ userId: "u7", characterName: "Alice" });
  const mem = await store.getCreativeMemoryForPrompt({ userId: "u7" });
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

test("[screenplay-task] inferScreenplayTask routes core Clementine writing jobs", () => {
  assert.equal(inferScreenplayTask("Rewrite this scene with more subtext.").intent, "rewrite_scene");
  assert.equal(inferScreenplayTask("Continue the script from this moment.").intent, "continue_script");
  assert.equal(inferScreenplayTask("Help me finish this feature film.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("I need help finishing this feature-length screenplay.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Help me shape act two of the whole movie.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Give me scene doctor notes.").intent, "scene_doctor");
  assert.equal(inferScreenplayTask("Punch up the dialogue.").intent, "dialogue_punchup");
  assert.equal(inferScreenplayTask("Fix the emotional continuity.").intent, "emotional_continuity");
});

test("[screenplay-task] inferScreenplayTask handles targeted Clementine Studio modes", () => {
  assert.equal(inferScreenplayTask("Replace that line with something sharper.").intent, "rewrite_scene");
  assert.equal(inferScreenplayTask("Keep writing from here without restarting the scene.").intent, "continue_script");
  assert.equal(inferScreenplayTask("Take it from here into the next page.").intent, "continue_script");
  assert.equal(inferScreenplayTask("Scene doctor this kitchen confrontation and tell me what's not working.").intent, "scene_doctor");
  assert.equal(inferScreenplayTask("Punch up this exchange so it has more subtext.").intent, "dialogue_punchup");
});

test("[screenplay-task] buildModelPrompt carries draft context for continuation and rewrite turns", () => {
  const out = buildModelPrompt({
    persona: "PERSONA",
    sessionContext: {
      projectId: "proj-7",
      versionId: "v3",
      phase: "scene_draft",
      pack: "Feature sprint",
      draftExcerpt: "INT. DINER - NIGHT\n\nJUNE waits with her coat still on.",
    },
    screenplayTask: inferScreenplayTask("Continue the script."),
    userInput: "Continue the script.",
  });

  assert.ok(out.includes("<session>"));
  assert.ok(out.includes("phase: scene_draft"));
  assert.ok(out.includes("pack: Feature sprint"));
  assert.ok(out.includes("draft_excerpt:"));
  assert.ok(out.includes("    INT. DINER - NIGHT"));
  assert.ok(out.includes("intent: continue_script"));
  assert.ok(out.includes("feature-length continuity"));
  assert.ok(out.includes("emotionally present"));
  assert.ok(out.includes("clean playable Fountain"));
});

test("[screenplay-task] buildModelPrompt injects task block before user input", () => {
  const out = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: inferScreenplayTask("Write a scene where June walks into the diner."),
    userInput: "Write a scene where June walks into the diner.",
  });
  assert.ok(out.includes(SCREENPLAY_TASK_BLOCK_OPEN));
  assert.ok(out.includes("intent: write_scene"));
  assert.ok(out.indexOf(SCREENPLAY_TASK_BLOCK_OPEN) < out.indexOf("Write a scene where June"));
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

// ---------- T-prompt-wire-traits-and-twists ----------

test("[prompt-wire] characters with traits emit an indented `traits:` line", () => {
  const out = buildModelPrompt({
    creativeMemory: {
      userId: "u", version: 1, updatedAt: 0,
      characters: [{
        name: "JUNE",
        last_referenced: 1,
        tags: ["lead"],
        traits: {
          keywords: ["anxious", "tender"],
          speech_style: { pace: "terse", syntax: "fragmented" },
          emotional_default: "anxious",
          goals: ["find Marcus"],
        },
      }],
    },
    userInput: "x",
  });
  assert.ok(out.includes("- JUNE"));
  assert.ok(/traits: .*emotion: anxious/.test(out));
  assert.ok(out.includes("speech: terse / fragmented"));
});

test("[prompt-wire] characters without traits emit no traits line (no regression)", () => {
  const out = buildModelPrompt({
    creativeMemory: {
      userId: "u", version: 1, updatedAt: 0,
      characters: [{ name: "CAL", last_referenced: 1, tags: [] }],
    },
    userInput: "x",
  });
  assert.ok(out.includes("- CAL"));
  assert.ok(!out.includes("traits:"));
});

test("[prompt-wire] characters with empty traits object emit no traits line", () => {
  const out = buildModelPrompt({
    creativeMemory: {
      userId: "u", version: 1, updatedAt: 0,
      characters: [{
        name: "ELLA",
        last_referenced: 1,
        traits: { keywords: [], goals: [], relationships: {} },
      }],
    },
    userInput: "x",
  });
  assert.ok(!out.includes("traits:"));
});

test("[prompt-wire] acceptedTwists produces an <accepted_twists> block when present", () => {
  const out = buildModelPrompt({
    persona: "you are a writing partner",
    creativeMemory: null,
    acceptedTwists: [
      {
        twist: { id: "t1", label: "False Victory", hook: "The win was paid for by the wrong person.", severity: "high" },
        beatId: "midpoint",
        acceptedAtMs: 1,
      },
    ],
    userInput: "next scene",
  });
  assert.ok(out.includes("<accepted_twists>"));
  assert.ok(out.includes("False Victory"));
  assert.ok(out.includes("@midpoint"));
  assert.ok(out.includes("</accepted_twists>"));
});

test("[prompt-wire] empty/missing acceptedTwists emits no block", () => {
  const out1 = buildModelPrompt({ persona: "P", userInput: "x" });
  assert.ok(!out1.includes("accepted_twists"));
  const out2 = buildModelPrompt({ persona: "P", userInput: "x", acceptedTwists: [] });
  assert.ok(!out2.includes("accepted_twists"));
});

test("[prompt-wire] block order: persona → memory → session → accepted_twists → block_signal → user", () => {
  const out = buildModelPrompt({
    persona: "PERSONA",
    creativeMemory: {
      userId: "u", version: 1, updatedAt: 0,
      characters: [{ name: "JUNE", last_referenced: 1 }],
    },
    sessionContext: { projectId: "proj-1" },
    acceptedTwists: [
      { twist: { id: "t1", label: "Twist A", hook: "Hook A", severity: "medium" }, beatId: "midpoint", acceptedAtMs: 1 },
    ],
    blockCoaching: "Keep the ask small.",
    userInput: "USER",
  });
  const personaIdx = out.indexOf("PERSONA");
  const memoryIdx = out.indexOf(MEMORY_BLOCK_OPEN);
  const sessionIdx = out.indexOf("<session>");
  const twistsIdx = out.indexOf("<accepted_twists>");
  const blockSignalIdx = out.indexOf(BLOCK_SIGNAL_BLOCK_OPEN);
  const userIdx = out.indexOf("USER");
  assert.ok(personaIdx >= 0 && personaIdx < memoryIdx);
  assert.ok(memoryIdx < sessionIdx);
  assert.ok(sessionIdx < twistsIdx);
  assert.ok(twistsIdx < blockSignalIdx);
  assert.ok(blockSignalIdx < userIdx);
});

test("[prompt-wire] buildModelPromptParts surfaces acceptedTwistsBlock", () => {
  const parts = buildModelPromptParts({
    persona: "P",
    acceptedTwists: [
      { twist: { id: "t1", label: "T", hook: "H", severity: "low" }, beatId: "need", acceptedAtMs: 1 },
    ],
    userInput: "U",
  });
  assert.ok(parts.acceptedTwistsBlock.includes("<accepted_twists>"));
  assert.ok(parts.acceptedTwistsBlock.includes("T"));
});
