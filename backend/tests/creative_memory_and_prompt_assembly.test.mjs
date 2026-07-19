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
  WRITER_BLOCK_MEMORY_BLOCK_OPEN,
  CLEMENTINE_SAFETY_BLOCK_OPEN,
  CLEMENTINE_SAFETY_BLOCK_CLOSE,
  FEATURE_MAP_BLOCK_OPEN,
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

test("clearUserMemory erases only the requested account", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordCharacterMention({
    userId: "writer-a",
    characterName: "Mara",
    voice: "precise and withheld",
    tags: ["protagonist"],
  });
  await store.recordEpisodicMemory({
    userId: "writer-a",
    summary: "Mara hid the affidavit in the courthouse vent.",
    characterNames: ["Mara"],
    tags: ["screenplay"],
  });
  await store.recordCharacterMention({
    userId: "writer-b",
    characterName: "Eli",
    voice: "warm until cornered",
    tags: ["supporting"],
  });

  const receipt = await store.clearUserMemory({ userId: "writer-a" });

  assert.deepEqual(receipt, { ok: true, cleared: true, userId: "writer-a" });
  assert.equal(await store.hasMemoryForUser("writer-a"), false);
  assert.equal(await store.getCreativeMemoryForPrompt({ userId: "writer-a" }), null);
  assert.equal(await store.getCharacterTraits({ userId: "writer-a" }), null);
  assert.equal(await store.hasMemoryForUser("writer-b"), true);
  assert.equal(
    (await store.getCreativeMemoryForPrompt({ userId: "writer-b" })).characters[0].name,
    "Eli"
  );
});

test("forgetMemoryCard durably removes the selected character or episode", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordCharacterMention({ userId: "writer-a", characterName: "Mara" });
  await store.recordCharacterMention({ userId: "writer-a", characterName: "Eli" });
  const firstEpisode = await store.recordEpisodicMemory({
    userId: "writer-a",
    summary: "Mara finds the affidavit.",
    characterNames: ["Mara"],
  });
  await store.recordEpisodicMemory({
    userId: "writer-a",
    summary: "Eli waits at the courthouse.",
    characterNames: ["Eli"],
  });

  const characterReceipt = await store.forgetMemoryCard({
    userId: "writer-a",
    key: "character:mara",
  });
  assert.equal(characterReceipt.forgotten, true);
  assert.deepEqual(
    (await store.getCreativeMemoryForPrompt({ userId: "writer-a" })).characters.map((item) => item.name),
    ["Eli"]
  );

  const episodeReceipt = await store.forgetMemoryCard({
    userId: "writer-a",
    key: `episode:${firstEpisode.memoryId}`,
  });
  const ledger = await store.getCreativeMemoryLedger({ userId: "writer-a" });
  assert.equal(episodeReceipt.forgotten, true);
  assert.equal(ledger.episodicMemories.some((item) => item.id === firstEpisode.memoryId), false);
  assert.equal(ledger.episodicMemories.length, 1);
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

test("getCreativeMemoryForPrompt ranks active feature character bibles above recent filler", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordCharacterMention({
    userId: "u-feature-bible-rank",
    characterName: "Mara",
    tags: ["protagonist"],
    metadata: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
    },
    characterBible: {
      canon: ["Mara is Eli's sister.", "The sealed affidavit can destroy the judge."],
      arc: {
        act: "Act II",
        want: "expose the forged testimony",
        need: "stop hiding behind observation",
        wound: "her father's disappearance",
        falseBelief: "truth will get Eli killed",
        currentTactic: "collecting evidence in silence",
        nextEmotionalTurn: "public courage",
      },
      corrections: ["Authoritative correction for Mara: sister, not mother."],
      correctedTerms: ["mother"],
      correctionReplacements: ["mother -> Eli's sister"],
    },
  });
  for (let index = 0; index < 10; index += 1) {
    await store.recordCharacterMention({
      userId: "u-feature-bible-rank",
      characterName: `Recent ${index}`,
      tags: ["side-character"],
    });
  }

  const mem = await store.getCreativeMemoryForPrompt({
    userId: "u-feature-bible-rank",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Continue Mara's Act II scene where the false belief blocks the affidavit payoff.",
  });

  assert.equal(mem.characters[0].name, "Mara");
  assert.equal(mem.characters[0].bible.arc.falseBelief, "truth will get Eli killed");
  assert.ok(mem.characters.length <= 16);
});

test("creative memory restores only the active project's feature ledger, characters, and episodes", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  await store.recordProjectContinuity({
    userId: "writer-project-scope",
    continuity: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      act: "Act II",
      currentBeat: "Mara finds the sealed affidavit.",
      nextThreeTurns: ["Mara hides the affidavit", "Eli catches the lie", "The judge moves the witness"],
      unresolvedSetups: ["The courthouse vent", "The sister's voicemail"],
      actThreePayoffPath: ["The voicemail becomes public testimony"],
      imageMotifs: ["charcoal dust"],
    },
  });
  await store.recordProjectContinuity({
    userId: "writer-project-scope",
    continuity: {
      projectId: "night-train",
      projectTitle: "Night Train",
      act: "Act III",
      currentBeat: "Mara uncouples the final carriage.",
      unresolvedSetups: ["The brass ticket punch"],
    },
  });
  await store.recordProjectContinuity({
    userId: "writer-project-scope",
    continuity: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      currentBeat: "Eli catches Mara hiding the affidavit.",
      nextThreeTurns: ["Eli demands the truth", "The judge moves the witness"],
      unresolvedSetups: ["The sister's voicemail"],
    },
  });
  await store.recordCharacterMention({
    userId: "writer-project-scope",
    characterName: "Mara",
    metadata: { projectId: "rain-docket", projectTitle: "Rain Docket" },
    characterBible: { arc: { want: "expose the forged testimony" } },
  });
  await store.recordCharacterMention({
    userId: "writer-project-scope",
    characterName: "Mara",
    metadata: { projectId: "night-train", projectTitle: "Night Train" },
    characterBible: { arc: { want: "stop the train before the border" } },
  });
  await store.recordEpisodicMemory({
    userId: "writer-project-scope",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    summary: "Mara hides the affidavit in the courthouse vent.",
    characterNames: ["Mara"],
  });
  await store.recordEpisodicMemory({
    userId: "writer-project-scope",
    projectId: "night-train",
    projectTitle: "Night Train",
    summary: "Mara uncouples the sleeper car.",
    characterNames: ["Mara"],
  });

  const restoredStore = createCreativeMemoryStore({ persistence });
  const rain = await restoredStore.getCreativeMemoryForPrompt({
    userId: "writer-project-scope",
    query: "Continue Mara's next scene.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });

  assert.equal(rain.projectContinuity.act, "Act II");
  assert.equal(rain.projectContinuity.currentBeat, "Eli catches Mara hiding the affidavit.");
  assert.deepEqual(rain.projectContinuity.unresolvedSetups, ["The sister's voicemail"]);
  assert.equal(rain.characters.length, 1);
  assert.equal(rain.characters[0].bible.arc.want, "expose the forged testimony");
  assert.equal(rain.episodicMemories.length, 1);
  assert.match(rain.episodicMemories[0].summary, /affidavit/);
  assert.doesNotMatch(JSON.stringify(rain), /uncouples|brass ticket|stop the train/);
});

test("project continuity keeps corrections and supersedes conflicting replacements", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordProjectContinuity({
    userId: "writer-project-corrections",
    continuity: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      currentBeat: "Mara finds the cassette.",
      correctedTerms: ["cassette"],
      correctionReplacements: ["cassette -> VHS tape"],
    },
  });
  await store.recordProjectContinuity({
    userId: "writer-project-corrections",
    continuity: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      currentBeat: "Mara gives Eli the tape.",
      correctedTerms: [],
      correctionReplacements: [],
    },
  });
  await store.recordProjectContinuity({
    userId: "writer-project-corrections",
    continuity: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      correctedTerms: ["cassette"],
      correctionReplacements: ["cassette -> MiniDV tape"],
    },
  });

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "writer-project-corrections",
    projectId: "rain-docket",
  });
  assert.deepEqual(memory.projectContinuity.correctedTerms, ["cassette"]);
  assert.deepEqual(memory.projectContinuity.correctionReplacements, ["cassette -> MiniDV tape"]);
  assert.doesNotMatch(JSON.stringify(memory.projectContinuity), /VHS tape/);
});

test("buildModelPrompt emits durable active-feature continuity before story recall", () => {
  const out = buildModelPrompt({
    persona: "Persona",
    creativeMemory: {
      userId: "writer",
      version: 1,
      projectContinuity: {
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        act: "Act II",
        sceneSummary: "Eli corners Mara beside the records room.",
        currentBeat: "Mara finds the sealed affidavit.",
        logline: "A court artist discovers every verdict has been staged.",
        themeArgument: "Justice begins when performance fails.",
        centralQuestion: "Can Mara expose the court without sacrificing Eli?",
        nextSceneMoves: ["Eli demands the truth", "Mara chooses a protective lie"],
        nextThreeTurns: ["Mara hides it", "Eli catches the lie"],
        beatSequence: ["Affidavit found", "Eli catches the lie"],
        unresolvedSetups: ["The sister's voicemail"],
        actThreePayoffPath: ["The voicemail becomes testimony"],
        characterArcState: "Mara protects Eli by lying.",
        emotionalContinuity: "Mara leaves ashamed but committed.",
        correctedTerms: ["cassette"],
        correctionReplacements: ["cassette -> VHS tape"],
        pageCount: 54,
        targetPages: 108,
      },
      acceptedScenes: [{
        act: "Act II",
        featureSequence: "Midpoint pressure",
        sceneHeading: "INT. ARCHIVE - NIGHT",
        summary: "Mara hides the MiniDV tape behind the vent grille.",
        outcome: "Eli catches her lie and pockets the archive key.",
        characterNames: ["Mara", "Eli"],
        characterArcTurns: ["Mara chooses secrecy over trust"],
        unresolvedSetups: ["The MiniDV tape behind the vent", "The sister's voicemail"],
        actThreePayoffPath: ["The tape and voicemail become public testimony"],
        nextScenePlan: "Eli enters the archive while the judge moves the witness.",
      }],
      acceptedCausalFacts: [
        {
          kind: "revelation",
          fact: "MARA: I forged the public affidavit.",
          sourceAct: "Act II",
          sourceSceneHeading: "INT. ARCHIVE - NIGHT",
          ageInScenes: 3,
        },
        {
          kind: "irreversible_consequence",
          fact: "Mara burns the only sealed copy.",
          sourceAct: "Act II",
          sourceSceneHeading: "INT. ARCHIVE - NIGHT",
          ageInScenes: 3,
        },
      ],
      dueStoryThread: {
        kind: "payoff",
        setup: "The sister's voicemail",
        promisedPayoff: "The voicemail becomes testimony",
        sourceAct: "Act II",
        sourceSceneHeading: "INT. ARCHIVE - NIGHT",
        sourceSceneSummary: "Mara hides the MiniDV tape behind the vent grille.",
        sourceSceneOutcome: "Eli catches her lie and pockets the archive key.",
        ageInScenes: 14,
      },
      characters: [{ name: "Mara", bible: { arc: { wound: "her father's disappearance" } } }],
    },
    userInput: "Continue the screenplay.",
  });

  assert.ok(out.includes("project-continuity:"));
  assert.ok(out.includes("durable active-feature continuity"));
  assert.ok(out.includes("authoritative_corrections: cassette -> VHS tape"));
  assert.ok(out.includes("retired_terms: cassette"));
  assert.ok(out.includes("scene_summary: Eli corners Mara beside the records room."));
  assert.ok(out.includes("current_beat: Mara finds the sealed affidavit."));
  assert.ok(out.includes("logline: A court artist discovers every verdict has been staged."));
  assert.ok(out.includes("theme_argument: Justice begins when performance fails."));
  assert.ok(out.includes("central_question: Can Mara expose the court without sacrificing Eli?"));
  assert.ok(out.includes("next_scene_moves: Eli demands the truth / Mara chooses a protective lie"));
  assert.ok(out.includes("beat_sequence: Affidavit found / Eli catches the lie"));
  assert.ok(out.includes("unresolved_setups: The sister's voicemail"));
  assert.ok(out.includes("act_three_payoff_path: The voicemail becomes testimony"));
  assert.ok(out.includes("page_progress: 54/108"));
  assert.ok(out.includes("accepted-scene-causality:"));
  assert.ok(out.includes("ACCEPTED_SCENE [Act II · Midpoint pressure · INT. ARCHIVE - NIGHT]"));
  assert.ok(out.includes("happened=Mara hides the MiniDV tape behind the vent grille."));
  assert.ok(out.includes("changed=Eli catches her lie and pockets the archive key."));
  assert.ok(out.includes("still_open=The MiniDV tape behind the vent / The sister's voicemail"));
  assert.ok(out.includes("accepted-causal-state:"));
  assert.ok(out.includes("BINDING_FACT [revelation · Act II · INT. ARCHIVE - NIGHT · 3 accepted scenes ago]: MARA: I forged the public affidavit."));
  assert.ok(out.includes("BINDING_FACT [irreversible_consequence · Act II · INT. ARCHIVE - NIGHT · 3 accepted scenes ago]: Mara burns the only sealed copy."));
  assert.ok(out.includes("contradiction_guard: never make a character unknow a revelation"));
  assert.ok(out.indexOf("accepted-scene-causality:") < out.indexOf("accepted-causal-state:"));
  assert.ok(out.indexOf("accepted-causal-state:") < out.indexOf("due-story-thread:"));
  assert.ok(out.includes("promised_payoff=The tape and voicemail become public testimony"));
  assert.ok(out.includes("next_pressure=Eli enters the archive while the judge moves the witness."));
  assert.ok(out.includes("due-story-thread:"));
  assert.ok(out.includes("oldest_due_story_thread: The sister's voicemail"));
  assert.ok(out.includes("promised_payoff: The voicemail becomes testimony"));
  assert.ok(out.includes("planted_in: Act II · INT. ARCHIVE - NIGHT"));
  assert.ok(out.includes("open_for_accepted_scenes: 14"));
  assert.ok(out.indexOf("project-continuity:") < out.indexOf("story-bible-recall:"));
  assert.ok(out.indexOf("project-continuity:") < out.indexOf("accepted-scene-causality:"));
  assert.ok(out.indexOf("accepted-scene-causality:") < out.indexOf("story-bible-recall:"));
  assert.ok(out.indexOf("accepted-scene-causality:") < out.indexOf("due-story-thread:"));
  assert.ok(out.indexOf("due-story-thread:") < out.indexOf("story-bible-recall:"));
});

test("buildModelPrompt gives explicit writer replacement canon precedence over page evidence", () => {
  const out = buildModelPrompt({
    persona: "Persona",
    creativeMemory: {
      projectContinuity: {
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        act: "Act II",
      },
      acceptedCausalFacts: [{
        kind: "writer_correction",
        fact: "Mara never burns the affidavit. It survives in Eli's ferry locker.",
        authority: "writer_correction",
        sourceCorrectionId: "canon_correction_123",
        replacesFacts: ["Mara burns the only copy of the affidavit."],
        structuredUpdates: ["unresolvedSetups: the affidavit survives in Eli's ferry locker"],
        createdAt: 1_800_000_000_000,
      }],
    },
    userInput: "Continue the screenplay.",
  });

  assert.match(out, /Writer corrections outrank older page evidence/);
  assert.match(
    out,
    /AUTHORITATIVE_WRITER_CANON \[explicit writer correction\]: Mara never burns the affidavit\. It survives in Eli's ferry locker\./
  );
  assert.match(out, /Replaces: Mara burns the only copy of the affidavit\./);
  assert.match(out, /Structured fields: unresolvedSetups: the affidavit survives in Eli's ferry locker/);
  assert.match(out, /never revive what it replaced/);
  assert.doesNotMatch(out, /BINDING_FACT \[writer_correction/);
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

test("recordEpisodicMemory retrieves relevant named-character story memory", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordEpisodicMemory({
    userId: "u-episode-1",
    summary: "Mara hides a cassette under the rain-swollen vent before the courthouse lights die.",
    text: "Mara hides a cassette under the rain-swollen vent. Eli says nobody else knew.",
    characterNames: ["Mara", "Eli"],
    tags: ["screenplay", "evidence"],
    projectTitle: "Rain Docket",
    source: "test",
  });
  await store.recordEpisodicMemory({
    userId: "u-episode-1",
    summary: "June waits in the empty pool for Marcus.",
    text: "June waits by the empty pool.",
    characterNames: ["June"],
    tags: ["screenplay"],
    projectTitle: "Pool Light",
    source: "test",
  });

  const mem = await store.getCreativeMemoryForPrompt({
    userId: "u-episode-1",
    query: "Where were we with Mara and the cassette?",
  });
  assert.equal(mem.episodicMemories.length, 1);
  assert.equal(mem.episodicMemories[0].projectTitle, "Rain Docket");
  assert.deepEqual(mem.episodicMemories[0].characterNames, ["Mara", "Eli"]);
  assert.match(mem.episodicMemories[0].summary, /cassette/);
  assert.equal("text" in mem.episodicMemories[0], false);
});

test("episodic embeddings survive restart and recall paraphrased project memory", async () => {
  const persistence = freshPersistence();
  const embeddingModel = "test-story-embedding";
  const embedTexts = async (inputs) => inputs.map((input) => {
    const text = String(input || "").toLowerCase();
    if (text.includes("affidavit")) return [1, 0, 0];
    if (text.includes("birthday")) return [0, 1, 0];
    return [0, 0, 1];
  });
  const embedQuery = async () => ({
    model: embeddingModel,
    vector: [1, 0, 0],
  });
  const store = createCreativeMemoryStore({
    persistence,
    embedTexts,
    embedQuery,
    embeddingModel,
  });
  await store.recordEpisodicMemory({
    userId: "writer-semantic-recall",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    summary: "Mara seals the affidavit behind a loose courthouse tile.",
    text: "Eli leaves before Mara hides the affidavit where the judge cannot reach it.",
    characterNames: ["Mara", "Eli"],
  });
  await store.recordEpisodicMemory({
    userId: "writer-semantic-recall",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    summary: "Mara misses Eli's birthday dinner.",
    text: "The untouched cake hardens beside the kitchen sink.",
    characterNames: ["Mara", "Eli"],
  });
  await store.recordEpisodicMemory({
    userId: "writer-semantic-recall",
    projectId: "night-train",
    projectTitle: "Night Train",
    summary: "A forged affidavit surfaces in the sleeper car.",
    text: "The conductor locks it inside a brass case.",
  });

  const raw = await persistence.get({ domain: "creative_memory", key: "writer-semantic-recall" });
  assert.equal(raw.episodicMemories.every((memory) => memory.embedding?.model === embeddingModel), true);

  const restoredStore = createCreativeMemoryStore({ persistence, embedQuery, embeddingModel });
  const memory = await restoredStore.getCreativeMemoryForPrompt({
    userId: "writer-semantic-recall",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Which hidden sworn proof could rupture the siblings' trust?",
    maxEpisodicMemories: 1,
  });
  assert.equal(memory.episodicMemories.length, 1);
  assert.match(memory.episodicMemories[0].summary, /affidavit/);
  assert.equal(memory.episodicMemories[0].projectId, "rain-docket");
  assert.equal("embedding" in memory.episodicMemories[0], false);
  assert.equal(memory.episodicSelection.strategy, "hybrid_embedding");
  assert.equal(memory.episodicSelection.semanticUsed, true);
  assert.equal(memory.episodicSelection.embeddedCandidates, 2);
  assert.equal(memory.episodicSelection.missingEmbeddings, 0);
  assert.equal(memory.episodicSelection.coverageRatio, 1);

  const ledger = await restoredStore.getCreativeMemoryLedger({
    userId: "writer-semantic-recall",
  });
  assert.equal(ledger.episodicMemories.some((episode) => "embedding" in episode), false);
});

test("episodic embedding failures keep lexical recall available and back off writes", async () => {
  let embedCalls = 0;
  const store = createCreativeMemoryStore({
    persistence: freshPersistence(),
    embeddingModel: "test-story-embedding",
    embedTexts: async () => {
      embedCalls += 1;
      throw new Error("provider unavailable");
    },
    embedQuery: async () => {
      throw new Error("query provider unavailable");
    },
  });
  await store.recordEpisodicMemory({
    userId: "writer-embedding-fallback",
    summary: "Mara hides the cassette under the courthouse vent.",
    projectId: "rain-docket",
  });
  await store.recordEpisodicMemory({
    userId: "writer-embedding-fallback",
    summary: "Eli waits beside the sealed records room.",
    projectId: "rain-docket",
  });

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "writer-embedding-fallback",
    projectId: "rain-docket",
    query: "Where is the cassette?",
    maxEpisodicMemories: 1,
  });
  assert.equal(embedCalls, 1);
  assert.match(memory.episodicMemories[0].summary, /cassette/);
  assert.equal(memory.episodicSelection.strategy, "deterministic_fallback");
  assert.equal(memory.episodicSelection.semanticUsed, false);
  assert.equal(memory.episodicSelection.backfillQueued, false);
});

test("legacy episodic memories backfill once and upgrade later turns to semantic recall", async () => {
  const persistence = freshPersistence();
  const legacyStore = createCreativeMemoryStore({ persistence });
  await legacyStore.recordEpisodicMemory({
    userId: "writer-legacy-backfill",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    summary: "Mara seals the affidavit behind a loose courthouse tile.",
    text: "The sworn statement proves the judge threatened Eli.",
  });
  await legacyStore.recordEpisodicMemory({
    userId: "writer-legacy-backfill",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    summary: "Mara misses Eli's birthday dinner.",
    text: "The untouched cake hardens beside the kitchen sink.",
  });

  const embeddingModel = "test-story-embedding";
  let embedCalls = 0;
  let releaseEmbeddingBatch = () => {};
  const embeddingGate = new Promise((resolve) => {
    releaseEmbeddingBatch = resolve;
  });
  const upgradedStore = createCreativeMemoryStore({
    persistence,
    embeddingModel,
    embedTexts: async (inputs) => {
      embedCalls += 1;
      await embeddingGate;
      return inputs.map((input) => String(input || "").toLowerCase().includes("affidavit")
        ? [1, 0, 0]
        : [0, 1, 0]);
    },
    embedQuery: async () => ({
      model: embeddingModel,
      vector: [1, 0, 0],
    }),
  });

  const firstMemory = await upgradedStore.getCreativeMemoryForPrompt({
    userId: "writer-legacy-backfill",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Which hidden sworn proof can destroy the judge?",
    maxEpisodicMemories: 1,
  });
  assert.equal(firstMemory.episodicSelection.strategy, "deterministic_fallback");
  assert.equal(firstMemory.episodicSelection.missingEmbeddings, 2);
  assert.equal(firstMemory.episodicSelection.backfillQueued, true);

  const backfillPromise = upgradedStore.backfillEpisodicEmbeddings({
    userId: "writer-legacy-backfill",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });
  releaseEmbeddingBatch();
  const receipt = await backfillPromise;
  assert.equal(receipt.ok, true);
  assert.equal(receipt.updated, 2);
  assert.equal(embedCalls, 1);

  const recalledMemory = await upgradedStore.getCreativeMemoryForPrompt({
    userId: "writer-legacy-backfill",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Which hidden sworn proof can destroy the judge?",
    maxEpisodicMemories: 1,
  });
  assert.equal(recalledMemory.episodicSelection.strategy, "hybrid_embedding");
  assert.equal(recalledMemory.episodicSelection.semanticUsed, true);
  assert.equal(recalledMemory.episodicSelection.coverageRatio, 1);
  assert.match(recalledMemory.episodicMemories[0].summary, /affidavit/);
});

test("getCreativeMemoryForPrompt prioritizes active project memory on broad continuation turns", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordEpisodicMemory({
    userId: "u-episode-project-scope",
    summary: "Mara hides the cassette under the courthouse vent.",
    text: "Rain Docket keeps returning to wet evidence and courthouse power failures.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    tags: ["screenplay"],
  });
  await store.recordEpisodicMemory({
    userId: "u-episode-project-scope",
    summary: "June waits by the empty swimming pool.",
    text: "Pool Light is built around chlorine, silence, and a missing brother.",
    projectId: "pool-light",
    projectTitle: "Pool Light",
    tags: ["screenplay"],
  });

  const mem = await store.getCreativeMemoryForPrompt({
    userId: "u-episode-project-scope",
    projectId: "pool-light",
    query: "continue the next scene",
  });
  assert.equal(mem.episodicMemories[0].projectId, "pool-light");
  assert.match(mem.episodicMemories[0].summary, /June/);
});

test("getCreativeMemoryForPrompt records episodic recall only when prompt path opts in", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  await store.recordEpisodicMemory({
    userId: "u-episode-recall-telemetry",
    summary: "Mara hides the cassette under the courthouse vent.",
    text: "The cassette proves Eli heard the judge threaten the witness.",
    characterNames: ["Mara", "Eli"],
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    tags: ["screenplay", "evidence"],
  });

  let raw = await persistence.get({
    domain: "creative_memory",
    key: "u-episode-recall-telemetry",
  });
  const memoryId = raw.episodicMemories[0].id;
  const initialReferenceCount = raw.episodicMemories[0].referenceCount;
  const initialLastReferencedAt = raw.episodicMemories[0].lastReferencedAt;

  await store.getCreativeMemoryForPrompt({
    userId: "u-episode-recall-telemetry",
    query: "What should happen with the hidden recording proof?",
  });
  raw = await persistence.get({
    domain: "creative_memory",
    key: "u-episode-recall-telemetry",
  });
  assert.equal(raw.episodicMemories[0].referenceCount, initialReferenceCount);
  assert.equal(raw.episodicMemories[0].lastReferencedAt, initialLastReferencedAt);

  const mem = await store.getCreativeMemoryForPrompt({
    userId: "u-episode-recall-telemetry",
    query: "What should happen with the hidden recording proof?",
    recordEpisodicRecall: true,
  });
  assert.equal(mem.episodicMemories[0].id, memoryId);
  assert.equal("semanticFingerprint" in mem.episodicMemories[0], false);

  raw = await persistence.get({
    domain: "creative_memory",
    key: "u-episode-recall-telemetry",
  });
  const recalled = raw.episodicMemories.find((item) => item.id === memoryId);
  assert.equal(recalled.referenceCount, initialReferenceCount + 1);
  assert.ok(recalled.lastReferencedAt >= initialLastReferencedAt);
});

test("getCreativeMemoryLedger exposes superseded episodic history without prompt internals", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordTriggersFromTalkTurn({
    userId: "u-episode-ledger",
    transcript: "My protagonist is named Mara. Mara hides a cassette under the courthouse vent before Eli can see it.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });
  await store.recordTriggersFromTalkTurn({
    userId: "u-episode-ledger",
    transcript: "Actually, no, Mara hides a VHS tape under the courthouse vent, not a cassette.",
    reply: "",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });

  const ledger = await store.getCreativeMemoryLedger({
    userId: "u-episode-ledger",
    includeSuperseded: true,
  });
  assert.ok(ledger?.episodicMemories?.length >= 2);
  const stale = ledger.episodicMemories.find((memory) => memory.supersededAt);
  assert.ok(stale);
  assert.equal(stale.supersededTerms.includes("cassette"), true);
  assert.equal("text" in stale, false);
  assert.equal("semanticFingerprint" in stale, false);

  const activeOnly = await store.getCreativeMemoryLedger({
    userId: "u-episode-ledger",
    includeSuperseded: false,
  });
  assert.equal(activeOnly.episodicMemories.some((memory) => memory.supersededAt), false);
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

test("buildModelPrompt always carries Clementine safety and truthfulness contract", () => {
  const out = buildModelPrompt({
    persona: "You are Clementine.",
    userInput: "Help me write a thriller scene.",
  });
  assert.ok(out.includes(CLEMENTINE_SAFETY_BLOCK_OPEN));
  assert.ok(out.includes("do not claim certainty"));
  assert.ok(out.includes("never invent user history"));
  assert.ok(out.includes("do not help users lie"));
  assert.ok(out.includes("do not provide instructions"));
  assert.ok(out.includes("fictional conflict, danger, crime, and violence are allowed as screenplay material"));
  assert.ok(out.includes("non-instructional"));
  assert.ok(out.includes(CLEMENTINE_SAFETY_BLOCK_CLOSE));
  assert.ok(out.indexOf("You are Clementine.") < out.indexOf(CLEMENTINE_SAFETY_BLOCK_OPEN));
  assert.ok(out.indexOf(CLEMENTINE_SAFETY_BLOCK_CLOSE) < out.indexOf("Help me write a thriller scene."));
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

test("buildModelPrompt emits retrieved episodic screenplay memory", () => {
  const out = buildModelPrompt({
    persona: "Persona",
    creativeMemory: {
      userId: "u",
      version: 1,
      updatedAt: 0,
      episodicMemories: [
        {
          summary: "Mara hides the cassette before the courthouse lights die.",
          excerpt: "Eli says nobody else knew about the cassette.",
          characterNames: ["Mara", "Eli"],
          tags: ["screenplay", "evidence"],
          projectTitle: "Rain Docket",
        },
      ],
    },
    userInput: "Continue Mara's scene.",
  });
  assert.ok(out.includes("episodic-memory:"));
  assert.ok(out.includes("Mara, Eli: Mara hides the cassette"));
  assert.ok(out.includes("project=Rain Docket"));
  assert.ok(out.includes("tags=screenplay,evidence"));
  assert.ok(out.includes("Eli says nobody else knew"));
  assert.ok(out.includes("durable user/project memories retrieved for this turn"));
  assert.ok(out.includes("treat CORRECTION items as overriding older conflicting memory"));
  assert.ok(out.includes("do not invent memories not listed here"));
});

test("buildModelPrompt marks correction memories as authoritative repairs", () => {
  const out = buildModelPrompt({
    persona: "Persona",
    creativeMemory: {
      userId: "u",
      version: 1,
      updatedAt: 0,
      episodicMemories: [
        {
          summary: "Correction for Mara: Mara hides a VHS tape, not a cassette.",
          excerpt: "Actually, no, Mara hides a VHS tape under the vent.",
          characterNames: ["Mara"],
          tags: ["screenplay", "correction"],
          projectTitle: "Rain Docket",
        },
      ],
    },
    userInput: "Continue the scene.",
  });
  assert.ok(out.includes("CORRECTION: Mara: Correction for Mara"));
  assert.ok(out.includes("tags=screenplay,correction"));
});

test("buildModelPrompt distinguishes writer canon from generated draft continuity", () => {
  const out = buildModelPrompt({
    persona: "Persona",
    creativeMemory: {
      episodicMemories: [
        {
          summary: "Mara finds the affidavit behind the courthouse tile.",
          source: "talk_screenplay_output",
          tags: ["screenplay", "generated-pages"],
        },
        {
          summary: "Mara uses the affidavit during the public hearing.",
          source: "talk_screenplay_output",
          tags: ["screenplay", "generated-pages", "accepted-pages"],
        },
        {
          summary: "The ending image is Mara opening the courtroom doors.",
          source: "talk_turn",
          tags: ["screenplay", "user-note"],
        },
        {
          summary: "They discussed moving the midpoint into the hearing.",
          source: "talk_turn",
          tags: ["screenplay"],
        },
      ],
    },
    userInput: "Continue the feature.",
  });

  assert.ok(out.includes("DRAFT_PAGE: Mara finds the affidavit"));
  assert.ok(out.includes("ACCEPTED_PAGE: Mara uses the affidavit"));
  assert.ok(out.includes("USER_NOTE: The ending image"));
  assert.ok(out.includes("CONVERSATION_CONTEXT: They discussed"));
  assert.ok(out.includes("CONVERSATION_CONTEXT is a recall clue, not canon"));
  assert.ok(out.includes("ACCEPTED_PAGE was committed into Studio"));
  assert.ok(out.includes("Current project continuity and user corrections win every conflict"));
});

test("buildModelPrompt emits character bible canon and corrections", () => {
  const out = buildModelPrompt({
    persona: "Persona",
    creativeMemory: {
      userId: "u",
      version: 1,
      updatedAt: 0,
      characters: [
        {
          name: "Mara",
          last_referenced: 10,
          bible: {
            canon: ["Mara is Eli's sister.", "Mara wants to protect Eli."],
            arc: {
              act: "Act II",
              want: "expose the forged testimony",
              need: "stop hiding behind observation",
              wound: "her father's disappearance",
              falseBelief: "truth will get Eli killed",
              relationshipPressure: "with Eli: protecting him by lying",
              currentTactic: "collecting evidence in silence",
              nextEmotionalTurn: "public courage",
            },
            corrections: ["Authoritative correction for Mara: Mara is Eli's sister, not his mother."],
            correctedTerms: ["mother"],
            correctionReplacements: ["mother -> Eli's sister"],
            authoritativeFields: [{
              field: "falseBelief",
              value: "truth will get Eli killed",
              sourceCorrectionId: "canon_correction_123",
            }],
          },
        },
      ],
    },
    userInput: "Continue Mara's scene.",
  });
  assert.ok(out.includes("recurring-characters:"));
  assert.ok(out.includes("- Mara"));
  assert.ok(out.includes("bible: canon: Mara is Eli's sister."));
  assert.ok(out.includes("Mara wants to protect Eli."));
  assert.ok(out.includes("arc: act=Act II; want=expose the forged testimony"));
  assert.ok(out.includes("need=stop hiding behind observation"));
  assert.ok(out.includes("wound=her father's disappearance"));
  assert.ok(out.includes("false_belief=truth will get Eli killed"));
  assert.ok(out.includes("relationship_pressure=with Eli: protecting him by lying"));
  assert.ok(out.includes("current_tactic=collecting evidence in silence"));
  assert.ok(out.includes("next_emotional_turn=public courage"));
  assert.ok(out.includes("corrections: Authoritative correction for Mara"));
  assert.ok(out.includes("corrected_terms: mother -> Eli's sister"));
  assert.ok(out.includes("authoritative_fields: falseBelief=truth will get Eli killed"));
  assert.ok(out.includes("story-bible-recall:"));
  assert.ok(out.includes("durable character/story bible for this feature"));
  assert.ok(out.includes("Mara: want=expose the forged testimony"));
  assert.ok(out.includes("false_belief=truth will get Eli killed"));
  assert.ok(out.includes("corrected_terms=mother -> Eli's sister"));
  assert.ok(out.includes("authoritative_fields=falseBelief=truth will get Eli killed"));
});

test("buildModelPrompt orders blocks: persona → memory → session → user", () => {
  const out = buildModelPrompt({
    persona: "PERSONA-MARK",
    creativeMemory: { userId: "u", version: 1, updatedAt: 0, style: { preferredTone: "wry" } },
    sessionContext: { projectId: "P1" },
    userInput: "USER-MARK",
  });
  const personaIdx = out.indexOf("PERSONA-MARK");
  const safetyIdx = out.indexOf(CLEMENTINE_SAFETY_BLOCK_OPEN);
  const memoryIdx = out.indexOf(MEMORY_BLOCK_OPEN);
  const sessionIdx = out.indexOf("<session>");
  const userIdx = out.indexOf("USER-MARK");
  assert.ok(personaIdx >= 0 && safetyIdx > personaIdx && memoryIdx > safetyIdx && sessionIdx > memoryIdx && userIdx > sessionIdx);
});

test("[screenplay-task] inferScreenplayTask routes core Clementine writing jobs", () => {
  assert.equal(inferScreenplayTask("Rewrite this scene with more subtext.").intent, "rewrite_scene");
  assert.equal(inferScreenplayTask("Make this scene more expert and faster.").intent, "rewrite_scene");
  assert.equal(inferScreenplayTask("Elevate this passage with a professional pass.").intent, "rewrite_scene");
  assert.equal(inferScreenplayTask("Continue the script from this moment.").intent, "continue_script");
  assert.equal(inferScreenplayTask("Help me finish this feature film.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("I need help finishing this feature-length screenplay.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Help me shape act two of the whole movie.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Help me build the entire feature from Act 1 to Act 2 to Act 3.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Help me build the entire feature from Act 1 to Act 2 to Act 3.").requestedAct, "Act I -> Act II -> Act III");
  assert.equal(inferScreenplayTask("Help me build the entire feature from Act 1 to Act 2 to Act 3.").featureScope, "whole_feature");
  assert.equal(inferScreenplayTask("Map Act I, Act II, and Act III so I can complete the full script.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Help me write act three of my feature screenplay.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Work with me to finish the movie all the way to the final image.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Take us into act three from the all-is-lost aftermath.").intent, "finish_feature");
  assert.equal(inferScreenplayTask("Make act two smarter and faster.").intent, "rewrite_scene");
  assert.equal(inferScreenplayTask("Give me scene doctor notes.").intent, "scene_doctor");
  assert.equal(inferScreenplayTask("Punch up the dialogue.").intent, "dialogue_punchup");
  assert.equal(inferScreenplayTask("Fix the emotional continuity.").intent, "emotional_continuity");
  assert.equal(inferScreenplayTask("I'm stuck and don't know where to go with this scene.").intent, "momentum_rescue");
  assert.equal(inferScreenplayTask("I have writer's block and need ideas to move the story forward.").intent, "momentum_rescue");
  assert.equal(inferScreenplayTask("The story slowed down and I need a better next move.").intent, "momentum_rescue");
  assert.match(
    inferScreenplayTask("I have writer's block and need ideas to move the story forward.").storyDiagnostic.likelyProblem,
    /next dramatic engine/i
  );
  assert.match(
    inferScreenplayTask("My second act is dragging and the middle feels static.").storyDiagnostic.actObligation,
    /Act II/
  );
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
      act: "Act II",
      sceneObjective: "June must decide whether to betray the only person still protecting her.",
      currentBeat: "June sees the motel receipt.",
      nextThreeTurns: [
        "The missing cassette plays the wrong memory.",
        "Marcus forces June into a public choice.",
      ],
      beatSequence: ["Receipt reveal", "Marcus lies badly", "June pockets the key"],
      characterFocus: ["June", "Marcus"],
      unresolvedSetups: ["The missing cassette has not paid off yet."],
      continuityNotes: ["The outline says this scene should turn trust into suspicion."],
      correctedTerms: ["cassette"],
      correctionReplacements: ["cassette -> VHS tape"],
      emotionalContinuity: "Carry the fear from the previous diner scene into suspicion here.",
      pageCount: 47,
      targetPages: 110,
      actProgress: {
        currentAct: "Act II",
        currentActKey: "act2",
        currentSequence: "Act II - Midpoint Pressure",
        currentObligation: "Turn the motel receipt into a trap.",
        pageProgress: "47/110",
        actOneStatus: "complete",
        actTwoStatus: "active",
        actThreeStatus: "pending",
        nextActBridge: "Turn the active Act II tactic into a cost that points directly toward Act III.",
        completionFocus: "Spend next remembered turn first: The missing cassette plays the wrong memory.",
      },
      draftExcerpt: "INT. DINER - NIGHT\n\nJUNE waits with her coat still on.",
    },
    screenplayTask: inferScreenplayTask("Continue the script."),
    userInput: "Continue the script.",
  });

  assert.ok(out.includes("<session>"));
  assert.ok(out.includes("phase: scene_draft"));
  assert.ok(out.includes("pack: Feature sprint"));
  assert.ok(out.includes("feature_continuity:"));
  assert.ok(out.includes("act: Act II"));
  assert.ok(out.includes("estimated_page_count: 47"));
  assert.ok(out.includes("target_pages: 110"));
  assert.ok(out.includes("act_progress:"));
  assert.ok(out.includes("current_act: Act II"));
  assert.ok(out.includes("current_act_key: act2"));
  assert.ok(out.includes("current_sequence: Act II - Midpoint Pressure"));
  assert.ok(out.includes("page_progress: 47/110"));
  assert.ok(out.includes("act_i: complete"));
  assert.ok(out.includes("act_ii: active"));
  assert.ok(out.includes("act_iii: pending"));
  assert.ok(out.includes("completion_focus: Spend next remembered turn first: The missing cassette plays the wrong memory."));
  assert.ok(out.includes("current_scene_objective: June must decide whether to betray"));
  assert.ok(out.includes("current_beat: June sees the motel receipt."));
  assert.ok(out.includes("next_three_turns:"));
  assert.ok(out.includes("- The missing cassette plays the wrong memory."));
  assert.ok(out.includes("continuation_memory_contract:"));
  assert.ok(out.includes("first_turn_to_spend: The missing cassette plays the wrong memory."));
  assert.ok(out.includes("make this first remembered turn the immediate story engine"));
  assert.ok(out.includes("Preserve the concrete nouns from first_turn_to_spend"));
  assert.ok(out.includes("beat_sequence:"));
  assert.ok(out.includes("- Marcus lies badly"));
  assert.ok(out.includes("character_focus:"));
  assert.ok(out.includes("- June"));
  assert.ok(out.includes("unresolved_setups:"));
  assert.ok(out.includes("missing cassette"));
  assert.ok(out.includes("continuity_notes:"));
  assert.ok(out.includes("trust into suspicion"));
  assert.ok(out.includes("correction_memory_contract:"));
  assert.ok(out.includes("authoritative_replacements: cassette -> VHS tape"));
  assert.ok(out.includes("retired_terms: cassette"));
  assert.ok(out.includes("apply before older Story Spine, Character Bible, draft, or episodic memory"));
  assert.ok(out.includes("emotional_handoff: Carry the fear"));
  assert.ok(out.includes("draft_excerpt:"));
  assert.ok(out.includes("    INT. DINER - NIGHT"));
  assert.ok(out.includes("intent: continue_script"));
  assert.ok(out.includes(FEATURE_MAP_BLOCK_OPEN));
  assert.ok(out.includes("current_position: p47 / 110"));
  assert.ok(out.includes("current_sequence: Act II - Midpoint Pressure"));
  assert.ok(out.includes("coming_next:"));
  assert.ok(out.includes("Act II - Reversal Fallout"));
  assert.ok(out.includes("feature-length continuity"));
  assert.ok(out.includes("continuation memory contract"));
  assert.ok(out.includes("feature compass"));
  assert.ok(out.includes("Silently lock the feature compass before pages"));
  assert.ok(out.includes("Spend first_turn_to_spend and its concrete nouns before inventing a lane"));
  assert.ok(out.includes("whole-feature authorship"));
  assert.ok(out.includes("act engine"));
  assert.ok(out.includes("expert page engine"));
  assert.ok(out.includes("subtext engine"));
  assert.ok(out.includes("speed discipline"));
  assert.ok(out.includes("emotionally present"));
  assert.ok(out.includes("living co-writer"));
  assert.ok(out.includes("never corporate"));
  assert.ok(out.includes("clean playable Fountain"));
  assert.ok(out.includes("mode_guidance: Continue directly from the supplied draft excerpt."));
});

test("[feature-film-map] finish_feature prompt carries act-to-act completion brain", () => {
  const out = buildModelPrompt({
    persona: "PERSONA",
    sessionContext: {
      projectId: "feature-1",
      act: "Act II",
      pageCount: 78,
      targetPages: 110,
      logline: "A public defender exposes a coastal cover-up before her sister takes the fall.",
      themeArgument: "Truth is only love if it costs you something.",
      centralQuestion: "Can Mara tell the truth before it destroys the person she protects?",
      protagonistWant: "Win the public case.",
      protagonistNeed: "Stop mistaking control for loyalty.",
      antagonisticForce: "A town that survives by burying evidence.",
      endingImage: "The empty pool filled with rainwater at dawn.",
      currentBeat: "The false victory collapses into public betrayal.",
      emotionalContinuity: "Carry humiliation into a colder, more honest resolve.",
      actPressureState: "The all-is-lost lane must convert humiliation into a painful truth.",
      characterArcState: "Mara has to stop confusing control with loyalty.",
      lastSceneOutcome: "The city hall betrayal destroys her safe public strategy.",
      nextThreeTurns: [
        "Mara loses the public case.",
        "The sister's voicemail reframes the cover-up.",
        "Mara chooses exposure over protection.",
      ],
      actThreePayoffPath: [
        "Voicemail pays off as testimony.",
        "Empty pool image returns at dawn.",
      ],
      unresolvedSetups: [
        "The sister's voicemail has not paid off.",
        "The opening image of the empty pool still needs its mirror.",
      ],
      unresolvedStoryThreads: ["Who buried the first report?", "Why the sister lied"],
      characterArcTurns: ["Mara must sacrifice control to tell the truth."],
      imageMotifs: ["empty pool", "broken microphone"],
      draftExcerpt: "INT. CITY HALL - NIGHT\n\nMARA cannot make the microphone work.",
    },
    screenplayTask: inferScreenplayTask("Help me finish the entire feature from Act 1 to Act 2 to Act 3."),
    userInput: "Help me finish the entire feature from Act 1 to Act 2 to Act 3.",
  });

  assert.ok(out.includes(FEATURE_MAP_BLOCK_OPEN));
  assert.ok(out.includes("operating_principle: Clementine thinks like a whole-feature screenwriter"));
  assert.ok(out.includes("act_ladder:"));
  assert.ok(out.includes("act_bridge_ladder:"));
  assert.ok(out.includes("feature_compass:"));
  assert.ok(out.includes("before_pages: silently lock act, sequence, scene job"));
  assert.ok(out.includes("completion_output: for whole-feature requests"));
  assert.ok(out.includes("expert_scene_execution:"));
  assert.ok(out.includes("turn_engine: each scene must change leverage"));
  assert.ok(out.includes("speed_protocol: when the user asks for pages"));
  assert.ok(out.includes("act_aware_page_engine:"));
  assert.ok(out.includes("scene_math: objective + obstacle + pressure clock + tactic + reversal + residue + exit image."));
  assert.ok(out.includes("active_act: Act II"));
  assert.ok(out.includes("page_job: break false tactics through escalating tests"));
  assert.ok(out.includes("act_sequence_runway:"));
  assert.ok(out.includes("Act I - Opening Image / Ordinary World"));
  assert.ok(out.includes("Act II - Midpoint Pressure"));
  assert.ok(out.includes("Act III - Climax / Final Image"));
  assert.ok(out.includes("Act I: wound, want, catalyst, debate, irreversible choice"));
  assert.ok(out.includes("Act II: tests, reversals, midpoint truth, escalating cost"));
  assert.ok(out.includes("Act III: synthesis, final plan, climax under maximum pressure, final image"));
  assert.ok(out.includes("story_spine:"));
  assert.ok(out.includes("theme_argument: Truth is only love"));
  assert.ok(out.includes("central_question: Can Mara tell the truth"));
  assert.ok(out.includes("ending_image: The empty pool filled with rainwater"));
  assert.ok(out.includes("continuity_assets:"));
  assert.ok(out.includes("emotional_handoff: Carry humiliation"));
  assert.ok(out.includes("act_pressure_state: The all-is-lost lane must convert humiliation"));
  assert.ok(out.includes("character_arc_state: Mara has to stop confusing control with loyalty."));
  assert.ok(out.includes("last_scene_outcome: The city hall betrayal destroys her safe public strategy."));
  assert.ok(out.includes("next_three_turns:"));
  assert.ok(out.includes("Mara chooses exposure over protection."));
  assert.ok(out.includes("act_three_payoff_path:"));
  assert.ok(out.includes("Voicemail pays off as testimony."));
  assert.ok(out.includes("unresolved_setups_to_track:"));
  assert.ok(out.includes("unresolved_story_threads:"));
  assert.ok(out.includes("Who buried the first report?"));
  assert.ok(out.includes("character_arc_turns:"));
  assert.ok(out.includes("Mara must sacrifice control to tell the truth."));
  assert.ok(out.includes("image_motifs:"));
  assert.ok(out.includes("broken microphone"));
  assert.ok(out.includes("current_position: p78 / 110"));
  assert.ok(out.includes("current_sequence: Act II - Collapse / All Is Lost"));
  assert.ok(out.includes("active_act_label: Act II"));
  assert.ok(out.includes("due_now:"));
  assert.ok(out.includes("confront the need beneath the want"));
  assert.ok(out.includes("next_page_moves:"));
  assert.ok(out.includes("Cash in the most dangerous unresolved setup."));
  assert.ok(out.includes("coming_next:"));
  assert.ok(out.includes("Act III - Break Into Three / Final Plan"));
  assert.ok(out.includes("feature_completion_protocol:"));
  assert.ok(out.includes("current sequence, next three turns, Act III payoff path"));
  assert.ok(out.includes("Never solve Act III by adding information the movie has not earned"));
  assert.ok(out.includes("mode_guidance: Operate at feature scale. Locate the current act/sequence"));
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

test("[screenplay-task] task block carries Clementine feature-writing mode contracts", () => {
  const finishFeature = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: inferScreenplayTask("Help me finish the whole feature screenplay."),
    userInput: "Help me finish the whole feature screenplay.",
  });
  assert.ok(finishFeature.includes("momentum: when the writer is stuck or broad"));
  assert.ok(finishFeature.includes("expert page engine"));
  assert.ok(finishFeature.includes("act-aware rendering"));
  assert.ok(finishFeature.includes("speed discipline"));
  assert.ok(finishFeature.includes("mode_guidance: Operate at feature scale"));
  assert.ok(finishFeature.includes("next three turns"));
  assert.ok(finishFeature.includes("Act III payoff path"));
  assert.ok(finishFeature.includes("unresolved promises"));
  assert.ok(finishFeature.includes("When memory contains a next-turn runway, turn the first remembered turn into playable behavior"));

  const sceneDoctor = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: inferScreenplayTask("Scene doctor this breakup scene."),
    userInput: "Scene doctor this breakup scene.",
  });
  assert.ok(sceneDoctor.includes("mode_guidance: Diagnose with surgical brevity"));
  assert.ok(sceneDoctor.includes("highest-leverage fix"));

  const momentumRescue = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: inferScreenplayTask("Help me get unstuck and find the next beat."),
    userInput: "Help me get unstuck and find the next beat.",
  });
  assert.ok(momentumRescue.includes("intent: momentum_rescue"));
  assert.ok(momentumRescue.includes("mode_guidance: Do not turn stuckness into a lecture."));
  assert.ok(momentumRescue.includes("story_momentum_playbook:"));
  assert.ok(momentumRescue.includes("choose engine"));
  assert.ok(momentumRescue.includes("reversal, revelation, deadline"));
  assert.ok(momentumRescue.includes("story_rescue_framework:"));
  assert.ok(momentumRescue.includes("pressure triage"));
  assert.ok(momentumRescue.includes("memory priority: spend the first remembered next turn"));
  assert.ok(momentumRescue.includes("block-to-beat formula"));
  assert.ok(momentumRescue.includes("micro-beat proof"));
  assert.ok(momentumRescue.includes("writer_block_contract:"));
  assert.ok(momentumRescue.includes("Never answer with generic encouragement alone."));
  assert.ok(momentumRescue.includes("Spend remembered story state before proposing a new plot lane."));
  assert.ok(momentumRescue.includes("Every rescue must answer: what does the character do now"));
  assert.ok(momentumRescue.includes("Use named characters, objects, setups, motifs, and act pressure"));
  assert.ok(momentumRescue.includes("character pressure: solve plot through character behavior"));
  assert.ok(momentumRescue.includes("specificity rule: use remembered names, objects, promises, and images"));
  assert.ok(momentumRescue.includes("story_diagnostic:"));
  assert.ok(momentumRescue.includes("likely_scene_problem:"));
  assert.ok(momentumRescue.includes("strongest_pressure_engine:"));
  assert.ok(momentumRescue.includes("next_beat_ladder:"));
  assert.ok(momentumRescue.includes("storytelling_concepts:"));
  assert.ok(momentumRescue.includes("scene engine: a scene moves when a character wants"));
  assert.ok(momentumRescue.includes("story_move_library:"));
  assert.ok(momentumRescue.includes("objective_pressure: if the scene feels inactive"));
  assert.ok(momentumRescue.includes("information_pressure: if the page has facts instead of drama"));
  assert.ok(momentumRescue.includes("choice_pressure: if possibilities feel endless"));
  assert.ok(momentumRescue.includes("payoff_pressure: if the ending feels vague"));
  assert.ok(momentumRescue.includes("image_pressure: if the page feels abstract"));
  assert.ok(momentumRescue.includes("story_rescue_lenses:"));
  assert.ok(momentumRescue.includes("want_obstacle_cost: give the character a visible objective"));
  assert.ok(momentumRescue.includes("reversal_engine: make the apparent win"));
  assert.ok(momentumRescue.includes("choice_closure: close one door"));
  assert.ok(momentumRescue.includes("response_contract: apply the diagnostic silently"));
  assert.ok(momentumRescue.includes("one decisive next move"));
});

test("[screenplay-task] momentum rescue gets a dedicated writer-block memory runway", () => {
  const task = inferScreenplayTask("I'm stuck in act two and need the next beat.");
  const sessionContext = {
    projectId: "rain-docket",
    act: "Act II",
    featureSequence: "Midpoint trap",
    currentBeat: "Mara pockets the reel and realizes Marcus lied.",
    featureObligation: "Break Mara's safe investigative tactic.",
    actPressureState: "The win must turn into a public trap.",
    characterArcState: "Mara still edits pain into control.",
    protagonistWant: "expose the forged testimony",
    protagonistNeed: "stop hiding behind observation",
    characterFocus: ["Mara", "Marcus"],
    nextThreeTurns: [
      "The reel plays the wrong memory.",
      "Marcus forces a public choice.",
      "Mara burns her safe edit.",
    ],
    unresolvedSetups: ["missing reel", "sealed affidavit"],
    unresolvedStoryThreads: ["Why Marcus protected the fixer"],
    actThreePayoffPath: ["The reel exposes the fixer."],
    imageMotifs: ["blank frame"],
    correctedTerms: ["wrong memory"],
    correctionReplacements: ["wrong memory -> hidden confession"],
  };
  const creativeMemory = {
    episodicMemories: [
      {
        summary: "Mara promised Eli she would not edit the truth again.",
        tags: ["user-note"],
        source: "talk_turn",
      },
      {
        excerpt: "Mara puts the public affidavit on the record.",
        tags: ["screenplay", "generated-pages", "accepted-pages"],
        source: "talk_screenplay_output",
      },
      {
        excerpt: "A generated alternate where Marcus burns the courthouse.",
        tags: ["screenplay", "generated-pages"],
        source: "talk_screenplay_output",
      },
    ],
  };
  const out = buildModelPrompt({
    persona: "PERSONA",
    sessionContext,
    creativeMemory,
    screenplayTask: task,
    userInput: "I'm stuck in act two and need the next beat.",
  });

  assert.ok(out.includes(WRITER_BLOCK_MEMORY_BLOCK_OPEN));
  assert.ok(out.includes("directive: The writer is blocked; use this available project state before inventing a new lane."));
  assert.ok(out.includes("position: Act II / Midpoint trap"));
  assert.ok(out.includes("character_engine: Mara; want=expose the forged testimony; need=stop hiding behind observation"));
  assert.ok(out.includes("strongest_remembered_next_turn: The reel plays the wrong memory."));
  assert.ok(out.includes("open_setup_to_pressure: missing reel"));
  assert.ok(out.includes("unresolved_story_thread: Why Marcus protected the fixer"));
  assert.ok(out.includes("act_three_payoff_seed: The reel exposes the fixer."));
  assert.ok(out.includes("accepted_page_anchor: Mara puts the public affidavit on the record."));
  assert.ok(out.includes("retrieved_story_memory: Mara promised Eli she would not edit the truth again."));
  assert.ok(!out.includes("accepted_page_anchor: A generated alternate where Marcus burns the courthouse."));
  assert.ok(out.includes("correction_contract: replace wrong memory -> hidden confession"));
  assert.ok(out.includes("best_next_beat: Have Mara pursue this now: expose the forged testimony."));
  assert.ok(out.includes("rescue_engine_selection:"));
  assert.ok(out.includes("primary_engine: remembered_next_turn"));
  assert.ok(out.includes("pressure_stack: remembered_next_turn -> open_setup -> character_arc_pressure -> act_obligation -> payoff_seed -> image_transformation"));
  assert.ok(out.includes("beat_formula: because Mara pockets the reel and realizes Marcus lied, force this move"));
  assert.ok(out.includes("scene_machine: objective -> opposition -> tactic shift -> reversal/cost -> changed relationship -> exit image."));
  assert.ok(out.includes("the cure for writer's block is not more premise"));
  assert.ok(out.includes("ranked_rescue_moves:"));
  assert.ok(out.includes("selection_method: score act fit, remembered continuity, character pressure"));
  assert.ok(out.includes("rank_1: engine=reversal_pressure"));
  assert.ok(out.includes("evidence=accepted_page: Mara puts the public affidavit on the record."));
  assert.ok(out.includes("remembered_next_turn: The reel plays the wrong memory."));
  assert.ok(out.includes("success_check=The apparent gain changes into a cost"));
  assert.ok(out.includes("selection_rule: execute rank_1 unless it conflicts with a writer correction"));
  assert.ok(out.includes("Convert it into one decisive playable next beat"));
  assert.ok(out.includes("Lead with rank_1"));
  assert.ok(out.indexOf(WRITER_BLOCK_MEMORY_BLOCK_OPEN) < out.indexOf(SCREENPLAY_TASK_BLOCK_OPEN));

  const parts = buildModelPromptParts({ sessionContext, screenplayTask: task, creativeMemory });
  assert.ok(parts.writerBlockMemoryBlock.includes("character_arc_pressure: Mara still edits pain into control."));
  assert.ok(parts.writerBlockMemoryBlock.includes("best_next_beat: Have Mara pursue this now: expose the forged testimony"));
  assert.ok(parts.writerBlockMemoryBlock.includes("correction_contract: replace wrong memory -> hidden confession"));
  assert.ok(parts.writerBlockMemoryBlock.includes("primary_engine: remembered_next_turn"));
  assert.ok(parts.writerBlockMemoryBlock.includes("ranked_rescue_moves:"));
});

test("[screenplay-task] writer block rescue spends the oldest accepted-scene promise first", () => {
  const task = inferScreenplayTask("I'm stuck. What should happen next?");
  const out = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: task,
    userInput: "I'm stuck. What should happen next?",
    sessionContext: {
      projectId: "rain-docket",
      act: "Act II",
      featureSequence: "Bad Guys Close In",
      currentBeat: "Mara reaches the hearing with no leverage.",
      protagonistWant: "expose who altered the verdict",
      protagonistNeed: "risk the truth in public",
      characterFocus: ["Mara", "Judge Vale"],
      nextThreeTurns: ["Vale calls the surprise witness."],
      unresolvedSetups: ["The sealed affidavit"],
      unresolvedStoryThreads: ["Who altered the verdict?"],
      actThreePayoffPath: ["The public record finally names Vale."],
    },
    creativeMemory: {
      acceptedScenes: [{
        act: "Act II",
        sceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
        summary: "Mara hides the red locket before the bailiff enters.",
        outcome: "The locket survives the search.",
        nextScenePlan: "Mara carries the locket into the hearing.",
      }],
      acceptedCausalFacts: [{
        kind: "irreversible_consequence",
        fact: "Mara burns the only sealed affidavit.",
        sourceAct: "Act II",
        sourceSceneHeading: "INT. RECORDS ROOM - NIGHT",
        ageInScenes: 8,
      }],
      dueStoryThread: {
        kind: "payoff",
        setup: "The red locket hidden in the courthouse clock.",
        promisedPayoff: "Mara uses the locket to expose who altered the verdict.",
        sourceAct: "Act II",
        sourceSceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
        sourceSceneSummary: "Mara hides the red locket before the bailiff enters.",
        sourceSceneOutcome: "The locket survives the search.",
        ageInScenes: 17,
      },
    },
  });

  assert.ok(out.includes("oldest_due_story_thread: The red locket hidden in the courthouse clock."));
  assert.ok(out.includes("due_thread_promised_payoff: Mara uses the locket to expose who altered the verdict."));
  assert.ok(out.includes("due_thread_source: Act II / INT. COURTHOUSE CLOCK TOWER - NIGHT"));
  assert.ok(out.includes("due_thread_age_in_accepted_scenes: 17"));
  assert.ok(out.includes("open_setup_to_pressure: The red locket hidden in the courthouse clock."));
  assert.ok(out.includes("accepted_page_anchor: The locket survives the search."));
  assert.ok(out.includes("binding_causal_fact: irreversible_consequence: Mara burns the only sealed affidavit."));
  assert.ok(out.includes("Treat binding_causal_fact as accepted canon"));
  assert.ok(out.includes("primary_engine: oldest_due_story_thread"));
  assert.ok(out.includes("rank_1: engine=payoff_pressure"));
  assert.ok(out.includes("evidence=due_story_thread: The red locket hidden in the courthouse clock."));
  assert.ok(out.includes("Mara uses the locket to expose who altered the verdict."));
});

test("[screenplay-task] story diagnostics make blocked and continuation turns act-aware", () => {
  const actTwoStall = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: inferScreenplayTask("My second act is dragging and the middle feels static."),
    userInput: "My second act is dragging and the middle feels static.",
  });
  assert.ok(actTwoStall.includes("story_diagnostic:"));
  assert.ok(actTwoStall.includes("likely_scene_problem: repeated tactic / static middle"));
  assert.ok(actTwoStall.includes("strongest_pressure_engine: force a reversal or new leverage"));
  assert.ok(actTwoStall.includes("act_obligation: Act II"));
  assert.ok(actTwoStall.includes("sequence engine: each beat should force a new tactic"));
  assert.ok(actTwoStall.includes("story_move_library:"));
  assert.ok(actTwoStall.includes("reversal_pressure: make the current tactic appear to work"));
  assert.ok(actTwoStall.includes("relationship_pressure: make the plot solution damage"));
  assert.ok(actTwoStall.includes("obstacle_pressure: put the want against a person"));
  assert.ok(actTwoStall.includes("story_rescue_lenses:"));
  assert.ok(actTwoStall.includes("reversal_engine: make the apparent win"));
  assert.ok(actTwoStall.includes("relationship_cost: make the next move solve a plot problem"));

  const continuation = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: inferScreenplayTask("What should happen next after Mara finds the tape?"),
    userInput: "What should happen next after Mara finds the tape?",
  });
  assert.ok(continuation.includes("intent: continue_script"));
  assert.ok(continuation.includes("likely_scene_problem: missing turn / no exit image"));
  assert.ok(continuation.includes("end the beat on a decision, reveal, reversal, cost, or image"));
  assert.ok(continuation.includes("next_beat_ladder:"));
  assert.ok(continuation.includes("story_move_library:"));
  assert.ok(continuation.includes("information_pressure: if the page has facts instead of drama"));
  assert.ok(continuation.includes("choice_pressure: if possibilities feel endless"));
  assert.ok(continuation.includes("secret_exposure: turn withheld information into public pressure"));
  assert.ok(continuation.includes("choice_closure: close one door"));

  const actThreeBlock = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: inferScreenplayTask("I'm stuck in Act III and can't land the ending."),
    userInput: "I'm stuck in Act III and can't land the ending.",
  });
  assert.ok(actThreeBlock.includes("intent: momentum_rescue"));
  assert.ok(actThreeBlock.includes("act_obligation: Act III"));
  assert.ok(actThreeBlock.includes("payoff_pressure: if the ending feels vague"));
  assert.ok(actThreeBlock.includes("image_pressure: if the page feels abstract"));
  assert.ok(actThreeBlock.includes("choice_pressure: if possibilities feel endless"));
});

test("[screenplay-task] inferScreenplayTask recognizes feature-scale page requests", () => {
  const actTwoBatch = inferScreenplayTask("Write the next ten pages of act two.");
  assert.equal(actTwoBatch.intent, "finish_feature");
  assert.equal(actTwoBatch.requestedPages, 10);
  assert.equal(actTwoBatch.requestedAct, "Act II");
  assert.equal(actTwoBatch.featureScope, "page_batch");

  const actThree = inferScreenplayTask("Continue the final sequence into act three.");
  assert.equal(actThree.intent, "finish_feature");
  assert.equal(actThree.requestedAct, "Act III");
  assert.equal(actThree.featureScope, "act_target");

  const blockedActTwo = inferScreenplayTask("I'm stuck. Write the next five pages of Act II.");
  assert.equal(blockedActTwo.intent, "finish_feature");
  assert.equal(blockedActTwo.writerBlocked, true);
  const blockedPrompt = buildModelPrompt({
    sessionContext: { act: "Act II", currentBeat: "June finds the forged receipt." },
    screenplayTask: blockedActTwo,
    userInput: "I'm stuck. Write the next five pages of Act II.",
  });
  assert.ok(blockedPrompt.includes("writer_block_to_pages:"));
});

test("[screenplay-task] inferScreenplayTask recognizes Feature Compass continuation briefs", () => {
  const compassBrief = `
Continue the feature as feature-film screenplay pages.

Write 3-5 pages in Fountain format only. Continue directly from the current draft position.
Current act: Act II
Scene target: INT. COURTHOUSE HALLWAY - NIGHT

Feature workflow context:
- Writer's immediate direction: continue
- Current feature position: Act II (Scene 7/14); 42 pages drafted.
- Latest accepted page batch: Latest: L210-L248, 39 lines
- Next required scene: INT. COURTHOUSE HALLWAY - NIGHT.
`;
  const task = inferScreenplayTask(compassBrief);
  assert.equal(task.intent, "finish_feature");
  assert.equal(task.requestedPages, 5);
  assert.equal(task.requestedAct, "Act II");
  assert.equal(task.featureScope, "page_batch");

  const out = buildModelPrompt({
    persona: "PERSONA",
    screenplayTask: task,
    userInput: compassBrief,
  });
  assert.ok(out.includes("intent: finish_feature"));
  assert.ok(out.includes("requested_page_batch: 5"));
  assert.ok(out.includes("page_batch_contract:"));
  assert.ok(out.includes("Begin with playable Fountain text; do not preface with diagnosis"));
  assert.ok(out.includes("Page velocity: the first non-empty line must be a scene heading"));
  assert.ok(out.includes("Dialogue must be tactical and subtextual"));
  assert.ok(out.includes("Interleave dialogue with visible action, discovery, consequence, or tactic shifts"));
  assert.ok(out.includes("Continuity: start from the active draft state, spend the first remembered next turn"));
  assert.ok(out.includes("Feature-page triad: turn a win or plan into a reversal/cost"));
  assert.ok(out.includes("Act conversion: Act I burns a safe exit"));
  assert.ok(out.includes("Writer-block-to-pages: convert the strongest rescue engine into pages without a pep talk"));
  assert.ok(out.includes("Avoid cinematic vapor: every beat needs concrete behavior or consequence"));
  assert.ok(out.includes("start Fountain pages immediately with no diagnosis or strategy note"));
  assert.ok(out.includes("Feature workflow context:"));
  assert.ok(!out.includes("keep diagnosis to one sentence"));
  assert.ok(out.length < 12_000);
});

test("[screenplay-task] feature page requests carry a concrete page-batch execution contract", () => {
  const out = buildModelPrompt({
    persona: "PERSONA",
    sessionContext: {
      projectId: "feature-batch-1",
      act: "Act II",
      pageCount: 47,
      targetPages: 110,
      currentBeat: "June realizes the receipt makes the win a trap.",
      protagonistWant: "prove the motel ledger was forged",
      protagonistNeed: "trust someone before the case destroys her",
      featureObligation: "Break June's safe investigative tactic.",
      actPressureState: "The midpoint must turn private proof into public cost.",
      characterArcState: "June still believes control can keep everyone safe.",
      nextThreeTurns: ["The receipt exposes the wrong witness.", "June chooses public risk."],
      unresolvedSetups: ["receipt", "motel ledger"],
      unresolvedStoryThreads: ["Who moved the witness?"],
      characterArcTurns: ["June must stop confusing control with care."],
      actThreePayoffPath: ["The ledger returns as courtroom proof."],
      imageMotifs: ["flickering motel sign"],
      characterFocus: ["June", "Detective"],
      emotionalContinuity: "Carry private suspicion into public pressure.",
      draftExcerpt: "INT. MOTEL ROOM - NIGHT\n\nJUNE folds the receipt.",
    },
    screenplayTask: inferScreenplayTask("Write the next ten pages of act two."),
    userInput: "Write the next ten pages of act two.",
  });

  assert.ok(out.includes("feature_scope: page_batch"));
  assert.ok(out.includes("requested_act: Act II"));
  assert.ok(out.includes("requested_page_batch: 10"));
  assert.ok(out.includes("page_batch_contract:"));
  assert.ok(out.includes("Begin with playable Fountain text; do not preface with diagnosis"));
  assert.ok(out.includes("Page velocity: the first non-empty line must be a scene heading"));
  assert.ok(out.includes("Dialogue must be tactical and subtextual"));
  assert.ok(out.includes("Interleave dialogue with visible action, discovery, consequence, or tactic shifts"));
  assert.ok(out.includes("Continuity: start from the active draft state, spend the first remembered next turn"));
  assert.ok(out.includes("Feature-page triad: turn a win or plan into a reversal/cost"));
  assert.ok(out.includes("Act conversion: Act I burns a safe exit"));
  assert.ok(out.includes("Writer-block-to-pages: convert the strongest rescue engine into pages without a pep talk"));
  assert.ok(out.includes("Avoid cinematic vapor: every beat needs concrete behavior or consequence"));
  assert.ok(out.includes("start Fountain pages immediately with no diagnosis or strategy note"));
  assert.ok(out.includes("page_batch_execution_plan:"));
  assert.ok(out.includes("requested_pages: 10"));
  assert.ok(out.includes("target_act: Act II"));
  assert.ok(out.includes("starting_position: p47 / 110"));
  assert.ok(out.includes("active_sequence_pressure: Act II - Midpoint Pressure"));
  assert.ok(out.includes("structural_obligation_due_now: The midpoint must raise stakes"));
  assert.ok(out.includes("turn_budget: 2-4 escalating scene turns"));
  assert.ok(out.includes("continuity: treat the draft excerpt as the live previous page"));
  assert.ok(out.includes("act_aware_page_engine:"));
  assert.ok(out.includes("active_sequence_job: Act II - Midpoint Pressure"));
  assert.ok(out.includes("next_three_turns:"));
  assert.ok(out.includes("The receipt exposes the wrong witness."));
  assert.ok(out.includes("unresolved_setups_to_track:"));
  assert.ok(out.includes("motel ledger"));
  assert.ok(out.includes("delivery: write clean Fountain pages first"));
  assert.ok(out.includes("write playable Fountain immediately with no diagnosis"));
  assert.ok(!out.includes("writer_block_to_pages:"));
  assert.ok(!out.includes("keep diagnosis to one sentence"));
  assert.ok(!out.includes("give one concise strategy note then write playable Fountain"));
  assert.ok(out.includes("end_condition: finish the batch on a decision, reveal, cost, or image"));
});

test("[screenplay-task] act three page requests carry payoff and final-image obligations", () => {
  const out = buildModelPrompt({
    persona: "PERSONA",
    sessionContext: {
      projectId: "feature-act-three-1",
      act: "Act III",
      pageCount: 100,
      targetPages: 110,
      endingImage: "The empty pool filled with rainwater at dawn.",
      characterArcState: "Mara can only win by choosing public truth over private control.",
      actPressureState: "The final sequence must turn the old need into changed behavior.",
      actThreePayoffPath: [
        "The sister's voicemail becomes testimony.",
        "The broken microphone becomes the public proof.",
      ],
      unresolvedSetups: [
        "The opening empty-pool image still needs its transformed mirror.",
        "The buried first report has not been exposed.",
      ],
      draftExcerpt: "INT. COURTHOUSE - NIGHT\n\nMARA looks at the dead microphone.",
    },
    screenplayTask: inferScreenplayTask("Write the next 5 pages of act three."),
    userInput: "Write the next 5 pages of act three.",
  });

  assert.ok(out.includes("feature_scope: page_batch"));
  assert.ok(out.includes("requested_act: Act III"));
  assert.ok(out.includes("requested_page_batch: 5"));
  assert.ok(out.includes("page_batch_execution_plan:"));
  assert.ok(out.includes("active_act: Act III"));
  assert.ok(out.includes("current_sequence: Act III - Climax / Final Image (p99-110)"));
  assert.ok(out.includes("structural_obligation_due_now: The climax should make the inner arc visible"));
  assert.ok(out.includes("character_arc_state: Mara can only win by choosing public truth over private control."));
  assert.ok(out.includes("act_three_payoff_path:"));
  assert.ok(out.includes("The sister's voicemail becomes testimony."));
  assert.ok(out.includes("unresolved_setups_to_track:"));
  assert.ok(out.includes("The opening empty-pool image still needs its transformed mirror."));
  assert.ok(out.includes("ending_image: The empty pool filled with rainwater at dawn."));
  assert.ok(out.includes("Act III pages must spend planted setups through changed behavior"));
  assert.ok(out.includes("Never solve Act III by adding information the movie has not earned"));
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
  assert.ok(parts.safetyContractBlock.includes(CLEMENTINE_SAFETY_BLOCK_OPEN));
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
          voice_fingerprint: {
            tactics: ["refuses first", "weaponizes facts"],
            silence: "cuts lines short and lets silence carry threat",
            emotional_tells: ["fixates on evidence"],
          },
        },
      }],
    },
    userInput: "x",
  });
  assert.ok(out.includes("- JUNE"));
  assert.ok(/traits: .*emotion: anxious/.test(out));
  assert.ok(out.includes("speech: terse / fragmented"));
  assert.ok(out.includes("voice_fingerprint: tactics=refuses first, weaponizes facts"));
  assert.ok(out.includes("silence=cuts lines short and lets silence carry threat"));
  assert.ok(out.includes("tells=fixates on evidence"));
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
  const safetyIdx = out.indexOf(CLEMENTINE_SAFETY_BLOCK_OPEN);
  const memoryIdx = out.indexOf(MEMORY_BLOCK_OPEN);
  const sessionIdx = out.indexOf("<session>");
  const twistsIdx = out.indexOf("<accepted_twists>");
  const blockSignalIdx = out.indexOf(BLOCK_SIGNAL_BLOCK_OPEN);
  const userIdx = out.indexOf("USER");
  assert.ok(personaIdx >= 0 && personaIdx < safetyIdx);
  assert.ok(safetyIdx < memoryIdx);
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
