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

test("getCreativeMemoryForPrompt semantically recalls episodic story memory without exact wording", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-semantic-recall",
    transcript: "My protagonist is named Mara. She hides a cassette under the rain-swollen vent before Eli can see it.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-semantic-recall",
    query: "What should happen with the hidden recording proof?",
  });

  assert.equal(memory?.episodicMemories?.length, 1);
  assert.match(memory.episodicMemories[0].excerpt, /cassette/);
  assert.equal(Object.hasOwn(memory.episodicMemories[0], "semanticFingerprint"), false);
});

test("recordTriggersFromTalkTurn extracts character traits and goals from live talk turns", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-character-bible",
    transcript: "My protagonist is named Mara. Mara is anxious and guarded. Mara wants to find Eli before dawn. Mara protects Eli from the courthouse guards.",
    reply: "",
  });
  assert.equal(summary.characterMentions, 1);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-character-bible",
    query: "What do we know about Mara and Eli?",
  });
  const mara = memory.characters.find((character) => character.name === "Mara");
  assert.ok(mara?.traits, "expected persisted traits for Mara");
  assert.ok(mara.traits.keywords.includes("anxious"));
  assert.ok(mara.traits.keywords.includes("guarded"));
  assert.ok(mara.traits.goals.includes("find Eli before dawn"));
  assert.equal(mara.traits.relationships.Eli, "protects");
});

test("recordTriggersFromTalkTurn learns character voice fingerprints from generated pages", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const reply = [
    "INT. COURTHOUSE HALLWAY - DAY",
    "",
    "MARA",
    "No. Not until you sign it.",
    "",
    "MARA",
    "If I open that door, my sister burns with yours.",
    "",
    "MARA",
    "Look at the receipt.",
    "",
    "ELI",
    "The proof stays buried unless you give me the file.",
  ].join("\n");

  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-voice-fingerprint",
    transcript: "",
    reply,
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_screenplay_output",
  });
  assert.ok(summary.characterMentions >= 2);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-voice-fingerprint",
    query: "Mara and Eli courthouse dialogue",
    projectId: "rain-docket",
  });
  const mara = memory.characters.find((character) => character.name === "MARA");
  assert.ok(mara?.traits?.voice_fingerprint, "expected Mara voice fingerprint");
  assert.ok(mara.traits.voice_fingerprint.tactics.includes("refuses first"));
  assert.ok(mara.traits.voice_fingerprint.tactics.includes("uses conditional pressure"));
  assert.ok(mara.traits.voice_fingerprint.tactics.includes("commands under pressure"));
  assert.ok(mara.traits.voice_fingerprint.emotional_tells.includes("family pressure slips out"));
});

test("recordTriggersFromTalkTurn stores and repairs character bible canon", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-character-canon",
    transcript: "My protagonist is named Mara. Mara is Eli's mother. Mara wants to protect Eli from the courthouse guards.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });

  let memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-character-canon",
    query: "What is Mara's relationship to Eli?",
  });
  let mara = memory.characters.find((character) => character.name === "Mara");
  assert.ok(mara?.bible, "expected persisted character bible for Mara");
  assert.ok(mara.bible.canon.some((item) => /Mara is Eli's mother/.test(item)));
  assert.ok(mara.bible.canon.some((item) => /protect Eli/.test(item)));

  const correctionSummary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-character-canon",
    transcript: "Actually, no, Mara is Eli's sister, not his mother.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });
  assert.equal(correctionSummary.corrections, 1);

  memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-character-canon",
    query: "Continue Mara and Eli.",
  });
  mara = memory.characters.find((character) => character.name === "Mara");
  assert.ok(mara.bible.canon.some((item) => /Mara is Eli's sister/.test(item)));
  assert.ok(mara.bible.canon.every((item) => !/mother/i.test(item)));
  assert.ok(mara.bible.corrections.some((item) => /Authoritative correction/.test(item)));
  assert.ok(mara.bible.correctedTerms.includes("mother"));
  assert.ok(mara.bible.correctionReplacements.includes("mother -> Eli's sister"));
});

test("recordTriggersFromTalkTurn persists structured feature continuity for cold-session recall", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-project-continuity",
    transcript: "Continue Mara after she finds the affidavit.",
    reply: "Mara folds the affidavit into her coat as Eli enters.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    projectContinuity: {
      act: "Act II",
      featureSequence: "Midpoint pressure",
      currentBeat: "Mara finds the sealed affidavit.",
      nextThreeTurns: ["Mara hides it", "Eli catches the lie", "The judge moves the witness"],
      unresolvedSetups: ["The sister's voicemail"],
      unresolvedStoryThreads: ["Who forged the first report?"],
      actThreePayoffPath: ["The voicemail becomes testimony"],
      characterArcState: "Mara protects Eli by lying.",
      emotionalContinuity: "Mara is ashamed but newly committed.",
    },
  });
  assert.equal(summary.projectContinuityRecorded, true);

  const restored = createCreativeMemoryStore({ persistence });
  const memory = await restored.getCreativeMemoryForPrompt({
    userId: "u-trig-project-continuity",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "What comes next?",
  });
  assert.equal(memory.projectContinuity.act, "Act II");
  assert.equal(memory.projectContinuity.characterArcState, "Mara protects Eli by lying.");
  assert.deepEqual(memory.projectContinuity.unresolvedSetups, ["The sister's voicemail"]);
  assert.deepEqual(memory.projectContinuity.actThreePayoffPath, ["The voicemail becomes testimony"]);
});

test("recordTriggersFromTalkTurn stores and repairs act-level character arc state", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-character-arc",
    transcript: [
      "My protagonist is named Mara.",
      "Act II: Mara wants to expose the forged testimony.",
      "Mara needs to stop hiding behind observation.",
      "Mara's wound is her father's disappearance.",
      "Mara's false belief is that perfect proof can keep everyone safe.",
      "Mara's relationship pressure with Eli is protecting him by lying.",
      "Mara's current tactic is collecting evidence in silence.",
      "Mara's next emotional turn is public courage.",
    ].join(" "),
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });

  let memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-character-arc",
    query: "Continue Mara's Act II arc.",
  });
  let mara = memory.characters.find((character) => character.name === "Mara");
  assert.equal(mara.bible.arc.act, "Act II");
  assert.equal(mara.metadata.projectId, "rain-docket");
  assert.equal(mara.metadata.projectTitle, "Rain Docket");
  assert.equal(mara.bible.arc.want, "expose the forged testimony");
  assert.equal(mara.bible.arc.need, "stop hiding behind observation");
  assert.equal(mara.bible.arc.wound, "her father's disappearance");
  assert.equal(mara.bible.arc.falseBelief, "perfect proof can keep everyone safe");
  assert.equal(mara.bible.arc.relationshipPressure, "with Eli: protecting him by lying");
  assert.equal(mara.bible.arc.currentTactic, "collecting evidence in silence");
  assert.equal(mara.bible.arc.nextEmotionalTurn, "public courage");

  const correctionSummary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-character-arc",
    transcript: "Actually, no, Mara's false belief is that truth will get Eli killed, not that perfect proof can keep everyone safe.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });
  assert.equal(correctionSummary.corrections, 1);

  memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-character-arc",
    query: "Continue Mara's Act II arc.",
  });
  mara = memory.characters.find((character) => character.name === "Mara");
  assert.equal(mara.bible.arc.falseBelief, "truth will get Eli killed");
  assert.equal(mara.bible.arc.want, "expose the forged testimony");
  assert.equal(mara.bible.arc.need, "stop hiding behind observation");
  assert.ok(!JSON.stringify(mara.bible.arc).includes("perfect proof can keep everyone safe"));
  assert.ok(mara.bible.correctionReplacements.includes("perfect proof can keep everyone safe -> truth will get Eli killed"));
});

test("recordTriggersFromTalkTurn persists corrections and retrieves them before older conflicting memory", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-correction",
    transcript: "My protagonist is named Mara. Mara hides a cassette under the rain-swollen vent before Eli can see it.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });
  const correctionSummary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-correction",
    transcript: "Actually, no, Mara hides a VHS tape under the rain-swollen vent, not a cassette.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });
  assert.equal(correctionSummary.corrections, 1);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-correction",
    projectId: "rain-docket",
    query: "Continue Mara and the cassette.",
  });
  assert.ok(memory?.episodicMemories?.length >= 1);
  const top = memory.episodicMemories[0];
  assert.ok(top.tags.includes("correction"));
  assert.match(top.summary, /Correction for Mara/);
  assert.match(top.excerpt, /VHS tape/);
  assert.equal(memory.episodicMemories.some((episode) => {
    return !episode.tags.includes("correction") && /cassette/i.test(`${episode.summary} ${episode.excerpt}`);
  }), false);

  const raw = await persistence.get({
    domain: "creative_memory",
    key: "u-trig-correction",
  });
  const stale = raw.episodicMemories.find((episode) => {
    return !episode.tags.includes("correction") && /cassette/i.test(`${episode.summary} ${episode.excerpt}`);
  });
  assert.ok(stale, "expected original stale episode to remain for audit/history");
  assert.ok(stale.tags.includes("superseded"));
  assert.ok(stale.supersededAt > 0);
  assert.equal(stale.supersededTerms.includes("cassette"), true);
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
