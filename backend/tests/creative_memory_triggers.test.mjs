// T08w-triggers: tests for recordTriggersFromTalkTurn.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";

// Post-T08-postgres: store takes a persistence handle. Each test gets a
// fresh JSON-file-backed adapter rooted in a tmp dir so tests are isolated.
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-triggers-"));
  return createJsonPersistence({ jsonRoot: root });
}

test("recordTriggersFromTalkTurn skips with no userId", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const r = await store.recordTriggersFromTalkTurn({ userId: null, transcript: "hello" });
  assert.equal(r.skipped, true);
});

test("recordTriggersFromTalkTurn extracts character cue lines from screenplay-formatted reply", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const reply = `INT. KITCHEN - NIGHT

JUNE
Where were you?

BOB
Out.

MRS. AARONS
You should both be ashamed.
`;
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-1",
    transcript: "",
    reply,
  });
  assert.ok(summary.characterMentions >= 3, `got ${summary.characterMentions}`);
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-trig-1" });
  const names = memory.characters.map((c) => c.name).sort();
  assert.ok(names.includes("JUNE"));
  assert.ok(names.includes("BOB"));
  assert.ok(names.includes("MRS. AARONS"));
});

test("recordTriggersFromTalkTurn skips scene-heading words like INT EXT FADE", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const reply = `INT
something
EXT
something else
FADE
out
JUNE
real character`;
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-2",
    transcript: "",
    reply,
  });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-trig-2" });
  const names = (memory?.characters || []).map((c) => c.name);
  assert.ok(names.includes("JUNE"));
  assert.equal(names.includes("INT"), false);
  assert.equal(names.includes("EXT"), false);
  assert.equal(names.includes("FADE"), false);
});

test("recordTriggersFromTalkTurn dedupes character mentions within one turn", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const reply = `JUNE
hi
JUNE
again
JUNE
once more`;
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-3",
    transcript: "",
    reply,
  });
  assert.equal(summary.characterMentions, 1);
});

test("recordTriggersFromTalkTurn captures lexical phrases from user transcript", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-4",
    transcript: "She stares out the window. He waits in the doorway. Nothing moves yet.",
    reply: "",
  });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-trig-4" });
  assert.ok(memory.style?.lexicalFingerprint?.length >= 1);
});

test("recordTriggersFromTalkTurn stores spoken named-character story memory for later recall", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-voice-memory",
    transcript: "My protagonist is named Mara. She hides a cassette under the rain-swollen vent before Eli can see it.",
    reply: "",
  });
  assert.equal(summary.characterMentions, 1);
  assert.equal(summary.episodicMemories, 1);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-voice-memory",
    query: "Continue Mara and the cassette.",
  });
  const names = (memory?.characters || []).map((c) => c.name);
  assert.ok(names.includes("Mara"));
  assert.equal(memory?.episodicMemories?.length, 1);
  assert.match(memory.episodicMemories[0].summary, /Mara/);
  assert.match(memory.episodicMemories[0].excerpt, /cassette/);
});

test("recordTriggersFromTalkTurn stores generated screenplay pages with project metadata", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const reply = `INT. PLANETARIUM - NIGHT

MARA
The sky is lying to us.

Eli watches the burned star map curl in her hand.`;
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-page-memory",
    transcript: "Continue the Rain Docket planetarium scene.",
    reply,
    projectId: "feature-rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_screenplay_output",
  });
  assert.equal(summary.episodicMemories, 1);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-page-memory",
    query: "Rain Docket Mara planetarium burned star map",
  });
  assert.equal(memory?.episodicMemories?.length, 1);
  const episode = memory.episodicMemories[0];
  assert.equal(episode.projectId, "feature-rain-docket");
  assert.equal(episode.projectTitle, "Rain Docket");
  assert.equal(episode.source, "talk_screenplay_output");
  assert.match(episode.excerpt, /PLANETARIUM/);
  assert.deepEqual(episode.characterNames, ["MARA"]);
});

test("recordTriggersFromTalkTurn stores explicit project memory without named characters", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-project-fact",
    transcript: "Remember for Black Salt: the lighthouse is not haunted; it is a coded weather station, and the ending image is a child turning off the beacon.",
    reply: "",
    projectId: "black-salt",
    projectTitle: "Black Salt",
    source: "talk_turn",
  });
  assert.equal(summary.characterMentions, 0);
  assert.equal(summary.episodicMemories, 1);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-project-fact",
    projectId: "black-salt",
    query: "continue the beacon ending at the weather station",
  });
  assert.equal(memory?.episodicMemories?.length, 1);
  assert.equal(memory.episodicMemories[0].projectTitle, "Black Salt");
  assert.match(memory.episodicMemories[0].summary, /Project memory for Black Salt/);
  assert.match(memory.episodicMemories[0].excerpt, /coded weather station/);
  assert.ok(memory.episodicMemories[0].tags.includes("user-note"));
});

test("recordTriggersFromTalkTurn caps at 8 character mentions per turn", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const lines = [];
  for (let i = 1; i <= 12; i += 1) lines.push(`CHAR${i}\nspeaks line ${i}`);
  const reply = lines.join("\n");
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-5",
    transcript: "",
    reply,
  });
  assert.equal(summary.characterMentions, 8);
});

test("recordTriggersFromTalkTurn records session pattern when sessionStartedAt is set", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const morning = new Date();
  morning.setHours(8, 0, 0, 0);
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-6",
    transcript: "She walks the dog at sunrise.",
    reply: "",
    sessionStartedAt: morning.getTime(),
    sessionDurationMs: 300_000,
  });
  const memory = await store.getCreativeMemoryForPrompt({ userId: "u-trig-6" });
  assert.equal(memory?.habits?.session_pattern, "morning");
});

test("recordTriggersFromTalkTurn never throws on garbage input", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  // Should silently no-op, not throw.
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-7",
    transcript: null,
    reply: undefined,
  });
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-8",
    transcript: 12345,
    reply: { not: "a string" },
  });
  // No exception means pass.
  assert.ok(true);
});
