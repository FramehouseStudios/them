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
    source: "talk_screenplay_output",
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
    source: "talk_screenplay_output",
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
    source: "talk_screenplay_output",
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

test("assistant proposals cannot rewrite user-authored character canon", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordTriggersFromTalkTurn({
    userId: "u-trig-canon-authority",
    transcript: "My protagonist is named Mara. Mara is Eli's mother. Mara wants to keep Eli alive through the hearing.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });

  const proposal = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-canon-authority",
    transcript: "What other relationship would raise the stakes in this story?",
    reply: "Actually, no, Mara is Eli's sister, not his mother.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_turn",
  });
  assert.equal(proposal.corrections, 0);
  assert.equal(proposal.characterMentions, 0);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-canon-authority",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "What is Mara's relationship to Eli?",
  });
  const mara = memory.characters.find((character) => character.name === "Mara");
  assert.ok(mara.bible.canon.some((item) => /Mara is Eli's mother/.test(item)));
  assert.ok(mara.bible.canon.every((item) => !/sister/i.test(item)));
  assert.deepEqual(mara.bible.correctedTerms, []);
  assert.equal(memory.episodicMemories.every((episode) => {
    return !/sister/i.test(`${episode.summary} ${episode.excerpt}`);
  }), true);
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
      sceneSummary: "Eli corners Mara beside the sealed records room.",
      currentBeat: "Mara finds the sealed affidavit.",
      centralQuestion: "Can Mara expose the court without sacrificing Eli?",
      nextSceneMoves: ["Eli demands the truth", "Mara chooses a protective lie"],
      nextThreeTurns: ["Mara hides it", "Eli catches the lie", "The judge moves the witness"],
      beatSequence: ["Affidavit found", "Eli catches the lie", "Witness moved"],
      unresolvedSetups: ["The sister's voicemail"],
      unresolvedStoryThreads: ["Who forged the first report?"],
      actThreePayoffPath: ["The voicemail becomes testimony"],
      characterArcState: "Mara protects Eli by lying.",
      emotionalContinuity: "Mara is ashamed but newly committed.",
      continuityNotes: ["Authoritative correction: VHS tape, not cassette."],
      correctedTerms: ["cassette"],
      correctionReplacements: ["cassette -> VHS tape"],
      pageCount: 54,
      targetPages: 108,
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
  assert.equal(memory.projectContinuity.sceneSummary, "Eli corners Mara beside the sealed records room.");
  assert.equal(memory.projectContinuity.centralQuestion, "Can Mara expose the court without sacrificing Eli?");
  assert.deepEqual(memory.projectContinuity.nextSceneMoves, ["Eli demands the truth", "Mara chooses a protective lie"]);
  assert.deepEqual(memory.projectContinuity.beatSequence, ["Affidavit found", "Eli catches the lie", "Witness moved"]);
  assert.equal(memory.projectContinuity.characterArcState, "Mara protects Eli by lying.");
  assert.deepEqual(memory.projectContinuity.unresolvedSetups, ["The sister's voicemail"]);
  assert.deepEqual(memory.projectContinuity.actThreePayoffPath, ["The voicemail becomes testimony"]);
  assert.deepEqual(memory.projectContinuity.correctedTerms, ["cassette"]);
  assert.deepEqual(memory.projectContinuity.correctionReplacements, ["cassette -> VHS tape"]);
  assert.equal(memory.projectContinuity.pageCount, 54);
  assert.equal(memory.projectContinuity.targetPages, 108);
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

test("realtime commits durably restore project-scoped character arcs without reviving corrected beliefs", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const staleRainArc = {
    character: "Mara",
    act: "Act II",
    want: "expose the forged testimony",
    need: "stop hiding behind observation",
    wound: "her father's disappearance",
    falseBelief: "perfect proof can keep everyone safe",
    relationshipPressure: "protecting Eli by lying",
    currentTactic: "collecting evidence in silence",
    nextEmotionalTurn: "public courage",
  };

  const first = await store.recordTriggersFromTalkTurn({
    userId: "u-realtime-structured-arc",
    transcript: "Keep moving from the current pressure point.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    characterArcMemories: [staleRainArc],
    source: "realtime_turn_commit",
  });
  assert.equal(first.structuredCharacterBibles, 1);

  await store.recordTriggersFromTalkTurn({
    userId: "u-realtime-structured-arc",
    transcript: "Actually, no, Mara's false belief is that truth will get Eli killed, not that perfect proof can keep everyone safe.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "realtime_turn_commit",
  });

  const staleClientSync = await store.recordTriggersFromTalkTurn({
    userId: "u-realtime-structured-arc",
    transcript: "Continue the next scene.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    characterArcMemories: [staleRainArc],
    source: "realtime_turn_commit",
  });
  assert.equal(staleClientSync.structuredCharacterBibles, 1);

  await store.recordTriggersFromTalkTurn({
    userId: "u-realtime-structured-arc",
    transcript: "Keep the train sequence moving.",
    projectId: "night-train",
    projectTitle: "Night Train",
    characterArcMemories: [{
      character: "Mara",
      act: "Act III",
      want: "stop the train before the border",
      wound: "the derailment she caused as a child",
      falseBelief: "escape is the same thing as freedom",
    }],
    source: "realtime_turn_commit",
  });

  const restored = createCreativeMemoryStore({ persistence });
  const rain = await restored.getCreativeMemoryForPrompt({
    userId: "u-realtime-structured-arc",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Continue Mara's Act II false-belief turn.",
  });
  const mara = rain.characters.find((character) => character.name === "Mara");
  assert.equal(rain.characters.length, 1);
  assert.equal(mara.bible.arc.act, "Act II");
  assert.equal(mara.bible.arc.want, "expose the forged testimony");
  assert.equal(mara.bible.arc.need, "stop hiding behind observation");
  assert.equal(mara.bible.arc.wound, "her father's disappearance");
  assert.equal(mara.bible.arc.falseBelief, "truth will get Eli killed");
  assert.equal(mara.bible.arc.relationshipPressure, "protecting Eli by lying");
  assert.equal(mara.bible.arc.currentTactic, "collecting evidence in silence");
  assert.equal(mara.bible.arc.nextEmotionalTurn, "public courage");
  assert.equal(mara.bible.canon.every((item) => !item.includes("perfect proof can keep everyone safe")), true);
  assert.ok(mara.bible.correctionReplacements.includes("perfect proof can keep everyone safe -> truth will get Eli killed"));
  assert.doesNotMatch(JSON.stringify(rain), /stop the train|derailment|escape is the same thing/);
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

test("a directly committed Studio page is stored as accepted without a prior draft-memory row", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const page = `INT. ARCHIVE - NIGHT

MARA
The affidavit was never sealed.

She hands the original to Eli.`;
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-realtime-accepted-page",
    transcript: "Write the archive confrontation.",
    reply: page,
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    acceptedPageText: page,
    source: "talk_screenplay_output",
  });

  assert.equal(summary.acceptedPagesPromoted, 0);
  assert.equal(summary.acceptedPagesRecorded, 1);
  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-realtime-accepted-page",
    projectId: "rain-docket",
    query: "Mara archive affidavit Eli",
  });
  assert.equal(memory.episodicMemories.length, 1);
  assert.equal(memory.episodicMemories[0].tags.includes("accepted-pages"), true);
});

test("accepted Studio scenes restore a correction-safe causal ledger scoped to one project", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const firstPage = `INT. ARCHIVE - NIGHT

MARA slides the cassette into a courthouse vent.

ELI
What are you hiding?`;
  const first = await store.recordTriggersFromTalkTurn({
    userId: "u-accepted-scene-ledger",
    transcript: "Commit the archive scene.",
    reply: firstPage,
    acceptedPageText: firstPage,
    acceptedSceneContext: {
      writeId: "write-archive-1",
      anchorSceneId: "scene-archive",
      documentRevisionId: "rev-17",
    },
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    projectContinuity: {
      act: "Act II",
      featureSequence: "Midpoint pressure",
      sceneSummary: "Mara hides the cassette in the courthouse vent.",
      lastSceneOutcome: "Eli now knows Mara is lying to him.",
      nextScenePlan: "Eli follows Mara into the hearing.",
      characterFocus: ["Mara", "Eli"],
      characterArcTurns: ["Mara chooses secrecy over trust"],
      unresolvedSetups: ["The cassette in the vent", "The sister's voicemail"],
      actThreePayoffPath: ["The cassette and voicemail become public testimony"],
      pageCount: 54,
    },
    source: "talk_screenplay_output",
  });
  assert.equal(first.acceptedScenesRecorded, 1);

  const revisedPage = `INT. ARCHIVE - NIGHT

MARA hides the cassette behind the vent grille as Eli enters.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-accepted-scene-ledger",
    transcript: "Replace the archive scene with this tighter version.",
    reply: revisedPage,
    acceptedPageText: revisedPage,
    acceptedSceneContext: {
      writeId: "write-archive-2",
      anchorSceneId: "scene-archive",
      documentRevisionId: "rev-18",
    },
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    projectContinuity: {
      act: "Act II",
      featureSequence: "Midpoint pressure",
      sceneSummary: "Mara hides the cassette behind the archive vent grille.",
      lastSceneOutcome: "Eli catches the protective lie but not the evidence.",
      nextScenePlan: "Eli tests Mara's lie during the hearing.",
      characterFocus: ["Mara", "Eli"],
      unresolvedSetups: ["The cassette behind the vent", "The sister's voicemail"],
      actThreePayoffPath: ["The cassette and voicemail become public testimony"],
      pageCount: 55,
    },
    source: "talk_screenplay_output",
  });

  const hallwayPage = `INT. COURTHOUSE HALLWAY - DAY

ELI watches Mara lie to the judge and pockets her dropped key.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-accepted-scene-ledger",
    transcript: "Commit the hallway consequence.",
    reply: hallwayPage,
    acceptedPageText: hallwayPage,
    acceptedSceneContext: { anchorSceneId: "scene-hallway", writeId: "write-hallway-1" },
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    projectContinuity: {
      act: "Act II",
      featureSequence: "Bad guys close in",
      sceneSummary: "Eli pockets Mara's archive key after she lies to the judge.",
      lastSceneOutcome: "Eli can now reach the hidden evidence before Mara.",
      nextScenePlan: "The judge moves the witness while Eli enters the archive.",
      characterFocus: ["Mara", "Eli"],
      unresolvedSetups: ["The cassette behind the vent", "The sister's voicemail"],
      actThreePayoffPath: ["The cassette and voicemail become public testimony"],
      pageCount: 58,
    },
    source: "talk_screenplay_output",
  });

  const trainPage = `INT. SLEEPER CAR - NIGHT

MARA pulls the emergency brake.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-accepted-scene-ledger",
    transcript: "Commit the train scene.",
    reply: trainPage,
    acceptedPageText: trainPage,
    acceptedSceneContext: { anchorSceneId: "scene-train" },
    projectId: "night-train",
    projectTitle: "Night Train",
    projectContinuity: {
      act: "Act III",
      sceneSummary: "Mara pulls the emergency brake before the border.",
      unresolvedSetups: ["The brass ticket punch"],
    },
    source: "talk_screenplay_output",
  });

  await store.recordProjectContinuity({
    userId: "u-accepted-scene-ledger",
    continuity: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      correctedTerms: ["cassette"],
      correctionReplacements: ["cassette -> MiniDV tape"],
    },
  });

  const restored = createCreativeMemoryStore({ persistence });
  const ledger = await restored.getCreativeMemoryLedger({ userId: "u-accepted-scene-ledger" });
  const rainProject = ledger.projects.find((project) => project.projectId === "rain-docket");
  assert.equal(rainProject.acceptedScenes.length, 2);
  assert.equal(rainProject.acceptedScenes[0].sceneHeading, "INT. COURTHOUSE HALLWAY - DAY");
  assert.equal(rainProject.acceptedScenes[1].sceneHeading, "INT. ARCHIVE - NIGHT");
  assert.doesNotMatch(JSON.stringify(rainProject.acceptedScenes), /cassette/i);
  assert.match(JSON.stringify(rainProject.acceptedScenes), /MiniDV tape/);
  assert.doesNotMatch(JSON.stringify(rainProject.unresolvedSetups), /cassette/i);
  assert.match(JSON.stringify(rainProject.unresolvedSetups), /MiniDV tape/);

  const memory = await restored.getCreativeMemoryForPrompt({
    userId: "u-accepted-scene-ledger",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Continue the voicemail testimony payoff after Eli takes Mara's key.",
  });
  assert.equal(memory.acceptedScenes.length, 2);
  assert.equal(memory.acceptedScenes[0].sceneHeading, "INT. COURTHOUSE HALLWAY - DAY");
  assert.equal(memory.acceptedScenes[1].sceneHeading, "INT. ARCHIVE - NIGHT");
  assert.equal(Object.hasOwn(memory.acceptedScenes[0], "id"), false);
  assert.doesNotMatch(JSON.stringify(memory), /emergency brake|brass ticket|border/);
  assert.doesNotMatch(JSON.stringify(memory.acceptedScenes), /cassette/i);
  assert.match(JSON.stringify(memory.acceptedScenes), /MiniDV tape/);
  assert.doesNotMatch(JSON.stringify(memory.projectContinuity.unresolvedSetups), /cassette/i);
  assert.match(JSON.stringify(memory.projectContinuity.unresolvedSetups), /MiniDV tape/);
});

test("accepted Studio pages extract exact correction-safe decisions, revelations, relationship changes, and consequences", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const page = `INT. COURTHOUSE STEPS - DAY

MARA
I admit I forged the affidavit.

Mara burns the only copy before the cameras arrive.

ELI
I choose the case over us.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-accepted-causal-facts",
    transcript: "Commit the courthouse steps scene.",
    reply: page,
    acceptedPageText: page,
    acceptedSceneContext: { anchorSceneId: "scene-courthouse-steps" },
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    projectContinuity: {
      act: "Act II",
      sceneSummary: "Mara confesses before destroying the evidence, and Eli chooses the case.",
    },
    source: "talk_screenplay_output",
  });

  let ledger = await store.getCreativeMemoryLedger({ userId: "u-accepted-causal-facts" });
  let scene = ledger.projects[0].acceptedScenes[0];
  assert.ok(scene.revelations.includes("MARA: I admit I forged the affidavit."));
  assert.ok(scene.irreversibleConsequences.includes("Mara burns the only copy before the cameras arrive."));
  assert.ok(scene.decisions.includes("ELI: I choose the case over us."));
  assert.ok(scene.relationshipChanges.includes("ELI: I choose the case over us."));

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-accepted-causal-facts",
    projectId: "rain-docket",
    query: "Continue after Mara's confession, the burned affidavit, and Eli choosing the case.",
  });
  assert.ok(memory.acceptedCausalFacts.some((item) => (
    item.kind === "revelation" && item.fact === "MARA: I admit I forged the affidavit."
  )));
  assert.ok(memory.acceptedCausalFacts.some((item) => (
    item.kind === "irreversible_consequence" &&
    item.fact === "Mara burns the only copy before the cameras arrive." &&
    item.sourceSceneHeading === "INT. COURTHOUSE STEPS - DAY" &&
    item.sourceAct === "Act II"
  )));

  await store.recordProjectContinuity({
    userId: "u-accepted-causal-facts",
    continuity: {
      projectId: "rain-docket",
      correctedTerms: ["affidavit"],
      correctionReplacements: ["affidavit -> deposition"],
    },
  });
  ledger = await store.getCreativeMemoryLedger({ userId: "u-accepted-causal-facts" });
  scene = ledger.projects[0].acceptedScenes[0];
  assert.doesNotMatch(JSON.stringify(scene), /affidavit/i);
  assert.match(JSON.stringify(scene), /deposition/i);
});

test("an explicit writer retcon durably retires the matched accepted causal fact", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const page = `INT. COURTHOUSE STEPS - DAY

MARA
I admit I forged the affidavit.

Mara burns the only copy before the cameras arrive.

ELI
I choose the case over us.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-durable-canon-retcon",
    transcript: "Commit the courthouse steps scene.",
    reply: page,
    acceptedPageText: page,
    acceptedSceneContext: { anchorSceneId: "scene-courthouse-steps" },
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    projectContinuity: {
      act: "Act II",
      sceneSummary: "Mara confesses, burns the affidavit, and Eli chooses the case.",
    },
    source: "talk_screenplay_output",
  });

  const correction = await store.recordTriggersFromTalkTurn({
    userId: "u-durable-canon-retcon",
    transcript: "Actually, Mara never burns the affidavit. The affidavit survives, and Mara hides it in Eli's ferry locker.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_turn",
  });
  assert.equal(correction.acceptedCanonFactsRetired, 1);
  assert.equal(correction.corrections, 1);

  const restored = createCreativeMemoryStore({ persistence });
  const ledger = await restored.getCreativeMemoryLedger({ userId: "u-durable-canon-retcon" });
  const project = ledger.projects.find((item) => item.projectId === "rain-docket");
  assert.ok(project.correctedTerms.some((item) => /burns the only copy/i.test(item)));
  assert.doesNotMatch(JSON.stringify(project.acceptedScenes), /burns the only copy/i);
  assert.match(JSON.stringify(project.acceptedScenes), /I admit I forged the affidavit/);
  assert.match(JSON.stringify(project.acceptedScenes), /I choose the case over us/);

  const memory = await restored.getCreativeMemoryForPrompt({
    userId: "u-durable-canon-retcon",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Continue after Mara hides the surviving affidavit in Eli's ferry locker.",
  });
  assert.equal(memory.acceptedCausalFacts.some((item) => /burns the only copy/i.test(item.fact)), false);
  assert.equal(memory.projectContinuity.sceneSummary, undefined);
  assert.ok(memory.acceptedCausalFacts.some((item) => /I admit I forged the affidavit/i.test(item.fact)));
  assert.ok(memory.episodicMemories.some((item) => (
    item.tags.includes("correction") && /ferry locker/i.test(item.excerpt)
  )));
  assert.equal(memory.episodicMemories.some((item) => /burns the only copy/i.test(item.excerpt)), false);
});

test("accepted scene history spans a full feature and retrieves an early setup near the ending", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  for (let index = 0; index < 100; index += 1) {
    await store.recordProjectContinuity({
      userId: "u-feature-scene-history",
      continuity: {
        projectId: "feature-100",
        projectTitle: "The Long Return",
        act: index >= 70 ? "Act III" : "Act II",
        ...(index === 4 ? {
          unresolvedSetups: ["The red locket inside the courthouse clock"],
        } : {}),
        ...(index === 99 ? {
          actThreePayoffPath: ["Nora uses the red locket to expose the forged verdict"],
        } : {}),
        acceptedScenes: [{
          anchorSceneId: `scene-${index}`,
          sceneHeading: `INT. LOCATION ${index} - NIGHT`,
          act: index >= 70 ? "Act III" : "Act II",
          summary: index === 4
            ? "Nora hides the red locket inside the courthouse clock."
            : `Nora crosses story threshold ${index}.`,
          unresolvedSetups: index === 4 ? ["The red locket inside the courthouse clock"] : [],
          irreversibleConsequences: index === 4
            ? ["Nora burns the only copy of the original verdict"]
            : [],
          acceptedAt: index + 1,
        }],
      },
    });
  }

  const ledger = await store.getCreativeMemoryLedger({ userId: "u-feature-scene-history" });
  assert.equal(ledger.projects[0].acceptedScenes.length, 96);
  assert.equal(ledger.projects[0].acceptedScenes[0].sceneHeading, "INT. LOCATION 99 - NIGHT");
  assert.equal(ledger.projects[0].acceptedScenes[95].sceneHeading, "INT. LOCATION 4 - NIGHT");

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-feature-scene-history",
    projectId: "feature-100",
    query: "Pay off the red locket hidden in the courthouse clock during the ending.",
  });
  assert.equal(memory.acceptedScenes[0].sceneHeading, "INT. LOCATION 99 - NIGHT");
  assert.equal(memory.acceptedScenes.some((scene) => scene.sceneHeading === "INT. LOCATION 4 - NIGHT"), true);
  assert.deepEqual(memory.dueStoryThread, {
    kind: "payoff",
    setup: "The red locket inside the courthouse clock",
    promisedPayoff: "Nora uses the red locket to expose the forged verdict",
    sourceSceneHeading: "INT. LOCATION 4 - NIGHT",
    sourceSceneSummary: "Nora hides the red locket inside the courthouse clock.",
    sourceAct: "Act II",
    ageInScenes: 95,
    acceptedSceneCount: 96,
  });
  assert.ok(memory.acceptedCausalFacts.some((item) => (
    item.kind === "irreversible_consequence" &&
    item.fact === "Nora burns the only copy of the original verdict" &&
    item.sourceSceneHeading === "INT. LOCATION 4 - NIGHT" &&
    item.ageInScenes === 95
  )));
});

test("due story threads require accepted-scene provenance and never pair unrelated payoffs", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordProjectContinuity({
    userId: "u-unproven-due-thread",
    continuity: {
      projectId: "unproven-feature",
      unresolvedSetups: ["The red locket"],
      actThreePayoffPath: ["The voicemail becomes testimony"],
    },
  });
  const unproven = await store.getCreativeMemoryForPrompt({
    userId: "u-unproven-due-thread",
    projectId: "unproven-feature",
  });
  assert.equal(unproven.dueStoryThread, undefined);

  await store.recordProjectContinuity({
    userId: "u-unrelated-due-payoffs",
    continuity: {
      projectId: "causal-feature",
      act: "Act II",
      unresolvedSetups: ["The red locket inside the courthouse clock", "The brass key"],
      actThreePayoffPath: ["The voicemail becomes testimony", "The ticket stops the train"],
      acceptedScenes: [{
        sceneHeading: "INT. CLOCK TOWER - NIGHT",
        act: "Act II",
        summary: "Nora hides the red locket inside the courthouse clock.",
        unresolvedSetups: ["The red locket inside the courthouse clock"],
        acceptedAt: 10,
      }],
    },
  });
  const causal = await store.getCreativeMemoryForPrompt({
    userId: "u-unrelated-due-payoffs",
    projectId: "causal-feature",
  });
  assert.equal(causal.dueStoryThread.kind, "setup");
  assert.equal(causal.dueStoryThread.setup, "The red locket inside the courthouse clock");
  assert.equal(causal.dueStoryThread.promisedPayoff, undefined);
  assert.equal(causal.dueStoryThread.sourceSceneHeading, "INT. CLOCK TOWER - NIGHT");
  assert.doesNotMatch(JSON.stringify(causal.dueStoryThread), /voicemail|ticket|train/i);
});

test("committed Studio pages promote only the matching project's generated draft", async () => {
  const persistence = freshPersistence();
  const page = `INT. PLANETARIUM - NIGHT

MARA
The sky is lying to us.

Eli watches the burned star map curl in her hand.`;
  const store = createCreativeMemoryStore({ persistence });
  for (const [projectId, projectTitle] of [
    ["rain-docket", "Rain Docket"],
    ["night-train", "Night Train"],
  ]) {
    await store.recordTriggersFromTalkTurn({
      userId: "u-trig-accepted-page",
      transcript: "Continue the planetarium scene.",
      reply: page,
      projectId,
      projectTitle,
      source: "talk_screenplay_output",
    });
  }

  const raw = await persistence.get({
    domain: "creative_memory",
    key: "u-trig-accepted-page",
  });
  assert.equal(raw.episodicMemories.length, 2);
  assert.equal(raw.episodicMemories.every((episode) => episode.contentHash?.length === 64), true);

  const before = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-accepted-page",
    projectId: "rain-docket",
    query: "planetarium burned star map",
  });
  assert.equal(before.episodicMemories[0].tags.includes("accepted-pages"), false);
  assert.equal(Object.hasOwn(before.episodicMemories[0], "contentHash"), false);
  const ledger = await store.getCreativeMemoryLedger({ userId: "u-trig-accepted-page" });
  assert.equal(ledger.episodicMemories.some((episode) => Object.hasOwn(episode, "contentHash")), false);

  const restored = createCreativeMemoryStore({ persistence });
  const promotion = await restored.recordTriggersFromTalkTurn({
    userId: "u-trig-accepted-page",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    acceptedPageText: page,
  });
  assert.equal(promotion.acceptedPagesPromoted, 1);
  assert.equal(promotion.episodicMemories, 0);

  const accepted = await restored.getCreativeMemoryForPrompt({
    userId: "u-trig-accepted-page",
    projectId: "rain-docket",
    query: "planetarium burned star map",
  });
  const otherProject = await restored.getCreativeMemoryForPrompt({
    userId: "u-trig-accepted-page",
    projectId: "night-train",
    query: "planetarium burned star map",
  });
  assert.equal(accepted.episodicMemories[0].tags.includes("accepted-pages"), true);
  assert.equal(otherProject.episodicMemories[0].tags.includes("accepted-pages"), false);

  const beforeIdempotent = await persistence.get({
    domain: "creative_memory",
    key: "u-trig-accepted-page",
  });
  const idempotent = await restored.promoteAcceptedGeneratedPageMemory({
    userId: "u-trig-accepted-page",
    projectId: "rain-docket",
    acceptedPageText: page,
  });
  const afterIdempotent = await persistence.get({
    domain: "creative_memory",
    key: "u-trig-accepted-page",
  });
  assert.deepEqual(idempotent, { ok: true, promoted: 0, reason: "already_accepted" });
  assert.equal(afterIdempotent.updatedAt, beforeIdempotent.updatedAt);
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
    source: "talk_screenplay_output",
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
