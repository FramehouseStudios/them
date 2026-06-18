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
      beatSequence: ["Receipt reveal", "Marcus lies badly", "June pockets the key"],
      characterFocus: ["June", "Marcus"],
      unresolvedSetups: ["The missing cassette has not paid off yet."],
      continuityNotes: ["The outline says this scene should turn trust into suspicion."],
      emotionalContinuity: "Carry the fear from the previous diner scene into suspicion here.",
      pageCount: 47,
      targetPages: 110,
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
  assert.ok(out.includes("current_scene_objective: June must decide whether to betray"));
  assert.ok(out.includes("current_beat: June sees the motel receipt."));
  assert.ok(out.includes("beat_sequence:"));
  assert.ok(out.includes("- Marcus lies badly"));
  assert.ok(out.includes("character_focus:"));
  assert.ok(out.includes("- June"));
  assert.ok(out.includes("unresolved_setups:"));
  assert.ok(out.includes("missing cassette"));
  assert.ok(out.includes("continuity_notes:"));
  assert.ok(out.includes("trust into suspicion"));
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
  assert.ok(out.includes("feature compass"));
  assert.ok(out.includes("Silently lock the feature compass before pages"));
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
  assert.ok(out.includes("Every 1-2 pages should alter leverage, information, relationship, tactic, or emotional cost."));
  assert.ok(out.includes("If a page explains emotion, replace it with behavior, subtext, image, or consequence."));
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
  assert.ok(out.includes("act_sequence_obligation_stack:"));
  assert.ok(out.includes("active_lane: Act II - Collapse / All Is Lost (p71-85)"));
  assert.ok(out.includes("due_now: Pay off planted dread"));
  assert.ok(out.includes("remembered_act_pressure: The all-is-lost lane must convert humiliation"));
  assert.ok(out.includes("changed_behavior_due: Mara has to stop confusing control with loyalty."));
  assert.ok(out.includes("memory_obligations:"));
  assert.ok(out.includes("setup_to_carry_or_pay: The sister's voicemail has not paid off."));
  assert.ok(out.includes("bridge_pressure: All Is Lost -> Act III"));
  assert.ok(out.includes("next_sequence_handoff: Act III - Break Into Three / Final Plan"));
  assert.ok(out.includes("page_turn_contract:"));
  assert.ok(out.includes("due_now:"));
  assert.ok(out.includes("confront the need beneath the want"));
  assert.ok(out.includes("next_page_moves:"));
  assert.ok(out.includes("Cash in the most dangerous unresolved setup."));
  assert.ok(out.includes("coming_next:"));
  assert.ok(out.includes("Act III - Break Into Three / Final Plan"));
  assert.ok(out.includes("feature_completion_protocol:"));
  assert.ok(out.includes("current sequence, next three turns, Act III payoff path"));
  assert.ok(out.includes("For Act I -> Act II -> Act III requests"));
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
  assert.ok(momentumRescue.includes("one decisive next move"));
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
  assert.ok(out.includes("If feature memory supplies next_three_turns, act_pressure_state, character_arc_state"));
  assert.ok(out.includes("Use the first remembered next turn as the immediate page engine"));
  assert.ok(out.includes("Beat-to-page continuation: convert the first remembered turn into objective"));
  assert.ok(out.includes("For Act I / Act II / Act III whole-feature asks"));
  assert.ok(out.includes("If a requested act spans multiple sequences"));
  assert.ok(out.includes("Avoid cinematic vapor: no vague tension"));
  assert.ok(out.includes("write the next playable Fountain pages immediately"));
  assert.ok(out.includes("start Fountain pages immediately with no diagnosis or strategy note"));
  assert.ok(out.includes("Feature workflow context:"));
  assert.ok(!out.includes("keep diagnosis to one sentence"));
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
  assert.ok(out.includes("If feature memory supplies next_three_turns, act_pressure_state, character_arc_state"));
  assert.ok(out.includes("Use the first remembered next turn as the immediate page engine"));
  assert.ok(out.includes("Beat-to-page continuation: convert the first remembered turn into objective"));
  assert.ok(out.includes("For Act I / Act II / Act III whole-feature asks"));
  assert.ok(out.includes("If a requested act spans multiple sequences"));
  assert.ok(out.includes("Avoid cinematic vapor: no vague tension"));
  assert.ok(out.includes("Start from the active draft/scene state; do not restart"));
  assert.ok(out.includes("start Fountain pages immediately with no diagnosis or strategy note"));
  assert.ok(out.includes("page_batch_execution_plan:"));
  assert.ok(out.includes("requested_pages: 10"));
  assert.ok(out.includes("target_act: Act II"));
  assert.ok(out.includes("starting_position: p47 / 110"));
  assert.ok(out.includes("active_sequence_pressure: Act II - Midpoint Pressure"));
  assert.ok(out.includes("act_sequence_obligation_stack:"));
  assert.ok(out.includes("active_lane: Act II - Midpoint Pressure (p41-55)"));
  assert.ok(out.includes("pressure_now: Drive toward a midpoint reversal"));
  assert.ok(out.includes("due_now: The midpoint must raise stakes"));
  assert.ok(out.includes("bridge_pressure: Act IIa -> Midpoint"));
  assert.ok(out.includes("next_sequence_handoff: Act II - Reversal Fallout"));
  assert.ok(out.includes("page_turn_contract:"));
  assert.ok(out.includes("act_aware_page_engine:"));
  assert.ok(out.includes("active_sequence_job: Act II - Midpoint Pressure"));
  assert.ok(out.includes("Do not repeat the premise as a string of similar tests."));
  assert.ok(out.includes("Dialogue batches must carry subtext through tactic"));
  assert.ok(out.includes("Long exchanges need visible turns"));
  assert.ok(out.includes("delivery: write clean Fountain pages first"));
  assert.ok(out.includes("write playable Fountain immediately with no diagnosis"));
  assert.ok(out.includes("write playable Fountain first with no diagnosis, strategy note"));
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
  assert.ok(out.includes("act_sequence_obligation_stack:"));
  assert.ok(out.includes("active_act: Act III"));
  assert.ok(out.includes("active_lane: Act III - Climax / Final Image (p99-110)"));
  assert.ok(out.includes("due_now: The climax should make the inner arc visible"));
  assert.ok(out.includes("changed_behavior_due: Mara can only win by choosing public truth over private control."));
  assert.ok(out.includes("memory_obligations:"));
  assert.ok(out.includes("act_three_payoff: The sister's voicemail becomes testimony."));
  assert.ok(out.includes("setup_to_carry_or_pay: The opening empty-pool image still needs its transformed mirror."));
  assert.ok(out.includes("final_image_pressure: The empty pool filled with rainwater at dawn."));
  assert.ok(out.includes("bridge_pressure: Act III -> Final Image"));
  assert.ok(out.includes("final_image_handoff: resolve the central question through changed behavior"));
  assert.ok(out.includes("page_turn_contract:"));
  assert.ok(out.includes("final_act_rule: Act III pages must resolve through changed behavior and final image contrast"));
  assert.ok(out.includes("Aim Act III pages at the remembered payoff path"));
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
