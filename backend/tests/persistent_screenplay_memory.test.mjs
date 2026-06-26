import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RUN_SERVER = "0";
process.env.OUTBOX_SNAPSHOT_ENABLED = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

const {
  buildMemoryAddendum,
  buildMemoryCards,
  buildMemoryStateVersion,
  buildSessionContinuitySnapshot,
  buildCreativeMemoryRecallQuery,
  buildCreativeMemoryPromptTrace,
  buildScreenplayProjectMemoryRecordFromStudioMeta,
  createEmptyEmotionMemory,
  sanitizeScreenplayProjectMemoryItems,
  updateMemoryCardInMemory,
  updateSessionAfterReply,
  wrapSystemPromptWithCreativeMemory,
} = await import("../index.js");
const {
  sanitizePersistedSessionMemory,
} = await import("../lib/memory_store.js");

function withMockedNow(nowTs, fn) {
  const realNow = Date.now;
  Date.now = () => nowTs;
  try {
    return fn();
  } finally {
    Date.now = realNow;
  }
}

test("[persistent-screenplay-memory] screenplay Studio metadata becomes durable project memory", () => {
  const firstTs = 1_800_000_000_000;
  const secondTs = firstTs + 2_000;
  let memory = createEmptyEmotionMemory();
  memory.turns = 12;
  memory.lastUpdatedAt = 42;

  memory = withMockedNow(firstTs, () => updateSessionAfterReply(
    memory,
    "Continue the courthouse hallway scene into the midpoint reversal.",
    "INT. COURTHOUSE HALLWAY - NIGHT\n\nMARA stops walking when the bailiff says her father is here.",
    false,
    {
      screenplayProjectId: "feature-alpha",
      screenplayProjectTitle: "Mercy Court",
      screenplayDocumentRevisionId: "rev-12",
      screenplayTarget: "page",
      screenplayPromptSource: "typed",
      screenplayWriteId: "write-1",
      screenplayAnchorLine: 44,
      screenplayAnchorEndLine: 44,
      screenplayAnchorSceneLabel: "Courthouse Hallway",
      screenplayAct: "Act II",
      screenplaySceneObjective: "Mara must choose whether to expose the forged testimony.",
      screenplayCurrentBeat: "Mara sees the bailiff pocket the missing evidence.",
      screenplayFeatureSequence: "Midpoint trap",
      screenplayFeatureObligation: "Force the protagonist to act instead of investigate.",
      screenplayActPressureState: "The midpoint truth must move Mara from observer to actor.",
      screenplayCharacterArcState: "Mara still believes control can protect everyone.",
      screenplayLastSceneOutcome: "The bailiff reveal makes the investigation personally dangerous.",
      screenplayNextScenePlan: "Pay off the father reveal with a private confrontation.",
      screenplayNextThreeTurns: [
        "Father reveal corners Mara.",
        "Private corridor choice exposes the lie.",
        "Mara burns the safe legal tactic.",
      ],
      screenplayActThreePayoffPath: [
        "Mara uses the sealed affidavit publicly.",
        "The sister stops hiding.",
        "Final courtroom image answers the opening lie.",
      ],
      screenplayBeatSequence: ["Bailiff hides the evidence."],
      screenplayCharacterFocus: ["Mara", "Bailiff", "Father"],
      screenplayUnresolvedSetups: ["Forged testimony", "Missing evidence"],
      screenplayUnresolvedStoryThreads: ["Who forged the testimony?", "Why the father vanished"],
      screenplayCharacterArcTurns: ["Mara must stop investigating from a distance."],
      screenplayImageMotifs: ["missing evidence envelope", "courthouse fluorescents"],
      screenplayContinuityNotes: ["Mara distrusts the courthouse staff."],
      screenplayEmotionalContinuity: "Suspicion hardens into resolve.",
      screenplayInsertedText: "INT. COURTHOUSE HALLWAY - NIGHT\n\nMARA stops walking.",
      screenplayPageCount: 47,
      screenplayTargetPages: 105,
    }
  ));

  assert.equal(memory.screenplayProjectMemory.length, 1);
  const first = memory.screenplayProjectMemory[0];
  assert.equal(first.projectId, "feature-alpha");
  assert.equal(first.projectTitle, "Mercy Court");
  assert.equal(first.act, "Act II");
  assert.equal(first.sceneLabel, "Courthouse Hallway");
  assert.equal(first.currentBeat, "Mara sees the bailiff pocket the missing evidence.");
  assert.equal(first.nextScenePlan, "Pay off the father reveal with a private confrontation.");
  assert.equal(first.actPressureState, "The midpoint truth must move Mara from observer to actor.");
  assert.equal(first.characterArcState, "Mara still believes control can protect everyone.");
  assert.equal(first.lastSceneOutcome, "The bailiff reveal makes the investigation personally dangerous.");
  assert.deepEqual(first.nextThreeTurns, [
    "Father reveal corners Mara.",
    "Private corridor choice exposes the lie.",
    "Mara burns the safe legal tactic.",
  ]);
  assert.deepEqual(first.actThreePayoffPath, [
    "Mara uses the sealed affidavit publicly.",
    "The sister stops hiding.",
    "Final courtroom image answers the opening lie.",
  ]);
  assert.deepEqual(first.unresolvedStoryThreads, ["Who forged the testimony?", "Why the father vanished"]);
  assert.deepEqual(first.characterArcTurns, ["Mara must stop investigating from a distance."]);
  assert.deepEqual(first.imageMotifs, ["missing evidence envelope", "courthouse fluorescents"]);
  assert.deepEqual(first.characterFocus, ["Mara", "Bailiff", "Father"]);
  assert.equal(first.writeCount, 1);
  assert.equal(first.interactionCount, 1);
  assert.equal(first.updatedAt, firstTs);
  assert.match(first.lastWritePreview, /COURTHOUSE HALLWAY/);

  const prompt = buildMemoryAddendum(memory);
  assert.match(prompt, /screenplay_project_memory=count:1\/8/);
  assert.match(prompt, /act:Act II/);
  assert.match(prompt, /current_beat:Mara sees the bailiff/);
  assert.match(prompt, /open_setups:Forged testimony/);
  assert.match(prompt, /next_three_turns:Father reveal corners Mara/);
  assert.match(prompt, /act3_payoff_path:Mara uses the sealed affidavit publicly/);
  assert.match(prompt, /story_threads:Who forged the testimony/);
  assert.match(prompt, /character_arc:Mara still believes control/);

  memory.turns = 13;
  memory = withMockedNow(secondTs, () => updateSessionAfterReply(
    memory,
    "Now keep going and make the father reveal more emotionally loaded.",
    "FATHER\nI came because the lie finally had your face on it.",
    false,
    {
      screenplayProjectId: "feature-alpha",
      screenplayProjectTitle: "Mercy Court",
      screenplayDocumentRevisionId: "rev-13",
      screenplayTarget: "page",
      screenplayPromptSource: "voice",
      screenplayWriteId: "write-2",
      screenplayAnchorSceneLabel: "Courthouse Hallway",
      screenplayAct: "Act II",
      screenplayCurrentBeat: "The father reveal corners Mara emotionally.",
      screenplayCharacterArcState: "Mara's control fractures into public courage.",
      screenplayNextScenePlan: "Move into a private corridor confrontation that redefines the case.",
      screenplayNextThreeTurns: ["Private corridor confrontation redefines the case."],
      screenplayBeatSequence: ["Father turns the lie public."],
      screenplayCharacterFocus: ["Father", "Clerk"],
      screenplayUnresolvedSetups: ["Father's sealed affidavit"],
      screenplayUnresolvedStoryThreads: ["Who leaked the sealed affidavit?"],
      screenplayContinuityNotes: ["Do not soften Mara's public humiliation."],
      screenplayEmotionalContinuity: "Resolve fractures into grief, then reforms as courage.",
      screenplayInsertedText: "FATHER\nI came because the lie finally had your face on it.",
    }
  ));

  assert.equal(memory.screenplayProjectMemory.length, 1);
  const merged = memory.screenplayProjectMemory[0];
  assert.equal(merged.projectId, "feature-alpha");
  assert.equal(merged.projectTitle, "Mercy Court");
  assert.equal(merged.documentRevisionId, "rev-13");
  assert.equal(merged.currentBeat, "The father reveal corners Mara emotionally.");
  assert.equal(merged.nextScenePlan, "Move into a private corridor confrontation that redefines the case.");
  assert.equal(merged.writeCount, 2);
  assert.equal(merged.interactionCount, 2);
  assert.equal(merged.updatedAt, secondTs);
  assert.match(merged.lastWritePreview, /lie finally had your face/);
  assert.deepEqual(merged.beatSequence, [
    "Father turns the lie public.",
    "Bailiff hides the evidence.",
  ]);
  assert.equal(merged.characterArcState, "Mara's control fractures into public courage.");
  assert.deepEqual(merged.nextThreeTurns, [
    "Private corridor confrontation redefines the case.",
    "Father reveal corners Mara.",
    "Private corridor choice exposes the lie.",
  ]);
  assert.deepEqual(merged.actThreePayoffPath, [
    "Mara uses the sealed affidavit publicly.",
    "The sister stops hiding.",
    "Final courtroom image answers the opening lie.",
  ]);
  assert.deepEqual(merged.characterFocus, ["Father", "Clerk", "Mara", "Bailiff"]);
  assert.deepEqual(merged.unresolvedSetups, [
    "Father's sealed affidavit",
    "Forged testimony",
    "Missing evidence",
  ]);
  assert.deepEqual(merged.unresolvedStoryThreads, [
    "Who leaked the sealed affidavit?",
    "Who forged the testimony?",
    "Why the father vanished",
  ]);
  assert.deepEqual(merged.continuityNotes, [
    "Do not soften Mara's public humiliation.",
    "Mara distrusts the courthouse staff.",
  ]);

  const cards = buildMemoryCards(memory, [], 12);
  const projectCard = cards.find((card) => card.source === "screenplay_project");
  assert.ok(projectCard);
  assert.equal(projectCard.key, "feature-alpha");
  assert.equal(projectCard.projectId, "feature-alpha");
  assert.equal(projectCard.projectTitle, "Mercy Court");
  assert.equal(projectCard.title, "Mercy Court");
  assert.equal(projectCard.editable, true);
  assert.deepEqual(projectCard.characterNames, ["Father", "Clerk", "Mara", "Bailiff"]);
  assert.match(projectCard.summary, /The father reveal corners Mara emotionally/);
  assert.match(projectCard.referenceHint, /private corridor confrontation/);
  assert.equal(projectCard.storySpine.currentBeat, "The father reveal corners Mara emotionally.");
  assert.deepEqual(projectCard.storySpine.nextThreeTurns, [
    "Private corridor confrontation redefines the case.",
    "Father reveal corners Mara.",
    "Private corridor choice exposes the lie.",
  ]);
  assert.deepEqual(projectCard.storySpine.unresolvedStoryThreads, [
    "Who leaked the sealed affidavit?",
    "Who forged the testimony?",
    "Why the father vanished",
  ]);
  assert.deepEqual(projectCard.storySpine.actThreePayoffPath, [
    "Mara uses the sealed affidavit publicly.",
    "The sister stops hiding.",
    "Final courtroom image answers the opening lie.",
  ]);
});

test("[persistent-screenplay-memory] Story Spine cards can be corrected from Memories", () => {
  const nowTs = 1_800_000_030_000;
  const memory = createEmptyEmotionMemory();
  memory.screenplayProjectMemory = sanitizeScreenplayProjectMemoryItems([
    {
      projectId: "feature-alpha",
      projectTitle: "Mercy Court",
      act: "Act II",
      featureSequence: "Midpoint trap",
      currentBeat: "Mara hides from the bailiff.",
      nextScenePlan: "Continue the hallway chase.",
      nextThreeTurns: ["Bailiff blocks the exit."],
      unresolvedSetups: ["Missing evidence"],
      unresolvedStoryThreads: ["Who forged the testimony?"],
      characterFocus: ["Mara", "Bailiff"],
      continuityNotes: ["Mara distrusts the courthouse staff."],
      updatedAt: nowTs - 10_000,
      createdAt: nowTs - 20_000,
    },
  ]);

  const mutation = updateMemoryCardInMemory(
    memory,
    {
      cardId: "screenplay-project-feature-alpha",
      key: "feature-alpha",
      title: "Mercy Court",
      summary: "Mara chooses public courage instead of hiding.",
      reason: "The protagonist is no longer avoiding the fight.",
      storySpine: {
        projectTitle: "Mercy Court",
        currentBeat: "Mara chooses public courage instead of hiding.",
        actPressureState: "The midpoint must make Mara act in public.",
        nextScenePlan: "Push into the private corridor confrontation with her father.",
        nextThreeTurns: [
          "Father confronts Mara with the sealed affidavit.",
          "Mara burns the safe legal tactic.",
          "The courthouse lie becomes public.",
        ],
        unresolvedSetups: ["Father's sealed affidavit"],
        unresolvedStoryThreads: ["Who leaked the sealed affidavit?"],
        characterFocus: ["Mara", "Father"],
      },
    },
    nowTs
  );

  assert.equal(mutation.ok, true);
  assert.equal(mutation.cardId, "screenplay-project-feature-alpha");
  assert.equal(memory.screenplayProjectMemory.length, 1);
  const corrected = memory.screenplayProjectMemory[0];
  assert.equal(corrected.projectTitle, "Mercy Court");
  assert.equal(corrected.currentBeat, "Mara chooses public courage instead of hiding.");
  assert.equal(corrected.actPressureState, "The midpoint must make Mara act in public.");
  assert.equal(corrected.nextScenePlan, "Push into the private corridor confrontation with her father.");
  assert.deepEqual(corrected.nextThreeTurns, [
    "Father confronts Mara with the sealed affidavit.",
    "Mara burns the safe legal tactic.",
    "The courthouse lie becomes public.",
  ]);
  assert.deepEqual(corrected.characterFocus, ["Mara", "Father", "Bailiff"]);
  assert.match(corrected.continuityNotes.join(" | "), /User corrected Story Spine memory/);

  const [card] = buildMemoryCards(memory, [], 1);
  assert.equal(card.source, "screenplay_project");
  assert.equal(card.editable, true);
  assert.equal(card.title, "Mercy Court");
  assert.equal(card.storySpine.currentBeat, "Mara chooses public courage instead of hiding.");
  assert.deepEqual(card.storySpine.nextThreeTurns, [
    "Father confronts Mara with the sealed affidavit.",
    "Mara burns the safe legal tactic.",
    "The courthouse lie becomes public.",
  ]);
  assert.match(buildMemoryAddendum(memory), /Mara chooses public courage/);
});

test("[persistent-screenplay-memory] buildMemoryCards exposes structured character bible cards", () => {
  const cards = buildMemoryCards(
    createEmptyEmotionMemory(),
    [],
    12,
    {
      updatedAt: 1_800_000_000_000,
      characters: [
        {
          name: "Mara",
          voice: "guarded, precise, dry under pressure",
          first_seen: 1_799_999_000_000,
          last_referenced: 1_800_000_000_000,
          tags: ["protagonist"],
          bible: {
            canon: ["Mara is Eli's sister.", "Mara wants to protect Eli."],
            corrections: ["Authoritative correction for Mara: sister, not mother."],
            correctedTerms: ["mother"],
            correctionReplacements: ["mother -> Eli's sister"],
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
          },
        },
      ],
    },
  );

  const card = cards.find((item) => item.source === "character_bible");
  assert.ok(card);
  assert.equal(card.id, "character-mara");
  assert.equal(card.key, "character:Mara");
  assert.equal(card.editable, true);
  assert.equal(card.character_bible.character, "Mara");
  assert.deepEqual(card.character_bible.canon, [
    "Mara is Eli's sister.",
    "Mara wants to protect Eli.",
  ]);
  assert.equal(card.character_bible.arc.false_belief, "truth will get Eli killed");
  assert.equal(card.character_bible.arc.next_emotional_turn, "public courage");
  assert.deepEqual(card.character_bible.correction_replacements, ["mother -> Eli's sister"]);
  assert.match(card.summary, /Want: expose the forged testimony/);
});

test("[persistent-screenplay-memory] buildMemoryCards exposes episodic correction repair ledger", () => {
  const cards = buildMemoryCards(
    createEmptyEmotionMemory(),
    [],
    12,
    {
      updatedAt: 1_800_000_000_000,
      episodicMemories: [
        {
          id: "episode_correction",
          summary: "Correction for Mara: Mara hides a VHS tape, not a cassette.",
          excerpt: "Actually, no, it is a VHS tape under the courthouse vent.",
          projectId: "rain-docket",
          projectTitle: "Rain Docket",
          characterNames: ["Mara"],
          tags: ["screenplay", "correction"],
          createdAt: 1_800_000_000_000,
          updatedAt: 1_800_000_000_000,
          lastReferencedAt: 1_800_000_000_100,
          referenceCount: 3,
        },
        {
          id: "episode_old",
          summary: "Mara hides the cassette under the courthouse vent.",
          excerpt: "The cassette proves Eli heard the judge threaten the witness.",
          projectId: "rain-docket",
          projectTitle: "Rain Docket",
          characterNames: ["Mara", "Eli"],
          tags: ["screenplay", "superseded"],
          supersededAt: 1_800_000_000_200,
          supersededByMemoryId: "episode_correction",
          supersededReason: "Actually, no, it is a VHS tape under the courthouse vent.",
          supersededTerms: ["cassette"],
          createdAt: 1_799_999_999_000,
          updatedAt: 1_799_999_999_000,
          lastReferencedAt: 1_799_999_999_000,
          referenceCount: 1,
        },
      ],
    },
  );

  const correction = cards.find((card) => card.source === "episodic_correction");
  assert.ok(correction);
  assert.equal(correction.id, "episode-episode_correction");
  assert.equal(correction.is_correction_memory, true);
  assert.equal(correction.is_superseded, false);
  assert.deepEqual(correction.character_names, ["Mara"]);
  assert.equal(correction.project_title, "Rain Docket");
  assert.equal(correction.reference_count, 3);
  assert.match(correction.reason, /Authoritative correction/);

  const superseded = cards.find((card) => card.source === "episodic_superseded");
  assert.ok(superseded);
  assert.equal(superseded.is_superseded, true);
  assert.equal(superseded.superseded_by_memory_id, "episode_correction");
  assert.equal(superseded.superseded_at, 1_800_000_000_200);
  assert.deepEqual(superseded.superseded_terms, ["cassette"]);
  assert.match(superseded.reason, /no longer used in prompts/);
});

test("[persistent-screenplay-memory] distills durable context from sparse draft excerpts", () => {
  const draftExcerpt = [
    "INT. ROOFTOP - NIGHT",
    "",
    "Mara hides the cassette under the rain-swollen vent.",
    "",
    "ELI",
    "You said nobody else knew.",
    "",
    "MARA",
    "Now somebody does.",
    "",
    "She watches the courthouse lights blink out below them.",
  ].join("\n");

  const record = buildScreenplayProjectMemoryRecordFromStudioMeta(
    {
      screenplayProjectId: "feature-draft-only",
      screenplayTarget: "page",
      screenplayDraftExcerpt: draftExcerpt,
      screenplayPageCount: 61,
      screenplayTargetPages: 108,
    },
    {
      reply: "",
      nowTs: 1_800_000_100_000,
    }
  );

  assert.ok(record);
  assert.equal(record.projectId, "feature-draft-only");
  assert.equal(record.act, "Act II");
  assert.equal(record.featureSequence, "Act II - Reversal Fallout");
  assert.equal(record.featureObligation, "The protagonist's old tactics should stop working.");
  assert.equal(record.actPressureState, "Current sequence obligation: The protagonist's old tactics should stop working.");
  assert.equal(record.sceneLabel, "INT. ROOFTOP - NIGHT");
  assert.equal(record.currentBeat, "She watches the courthouse lights blink out below them.");
  assert.equal(record.lastSceneOutcome, "She watches the courthouse lights blink out below them.");
  assert.equal(record.characterArcState, "Mara is under pressure from: She watches the courthouse lights blink out below them.");
  assert.match(record.nextScenePlan, /Continue from "She watches the courthouse lights blink out below them/);
  assert.match(record.sceneSummary, /Mara hides the cassette/);
  assert.deepEqual(record.beatSequence, [
    "Mara hides the cassette under the rain-swollen vent.",
    "She watches the courthouse lights blink out below them.",
  ]);
  assert.deepEqual(record.characterFocus, ["Eli", "Mara"]);
  assert.deepEqual(record.nextThreeTurns, [
    "Force the consequence of: She watches the courthouse lights blink out below them.",
    "Make Mara choose a tactic under pressure.",
    "Complicate or pay off cassette.",
  ]);
  assert.deepEqual(record.unresolvedSetups, [
    "Mara hides the cassette under the rain-swollen vent.",
  ]);
  assert.deepEqual(record.unresolvedStoryThreads, [
    "Who else knows about cassette?",
  ]);
  assert.deepEqual(record.characterArcTurns, [
    "Mara is under pressure from: She watches the courthouse lights blink out below them.",
  ]);
  assert.ok(record.imageMotifs.includes("cassette"));
  assert.ok(record.imageMotifs.includes("rain-swollen vent"));
  assert.match(record.lastWritePreview, /rain-swollen vent/);

  let memory = createEmptyEmotionMemory();
  memory = updateSessionAfterReply(
    memory,
    "Pick up from this rooftop page.",
    "",
    false,
    {
      screenplayProjectId: "feature-draft-only",
      screenplayTarget: "page",
      screenplayDraftExcerpt: draftExcerpt,
      screenplayPageCount: 61,
      screenplayTargetPages: 108,
    }
  );

  assert.equal(memory.screenplayProjectMemory.length, 1);
  const prompt = buildMemoryAddendum(memory);
  assert.match(prompt, /scene:INT\. ROOFTOP - NIGHT/);
  assert.match(prompt, /current_beat:She watches the courthouse lights blink out below them/);
  assert.match(prompt, /characters:Eli, Mara/);
  assert.match(prompt, /act_pressure:Current sequence obligation/);
  assert.match(prompt, /story_threads:Who else knows about cassette/);
  assert.match(prompt, /arc_turns:Mara is under pressure from/);
  assert.match(prompt, /image_motifs:cassette/);

  const nonPageRecord = buildScreenplayProjectMemoryRecordFromStudioMeta(
    {
      screenplayProjectId: "feature-draft-only",
      screenplayDraftExcerpt: draftExcerpt,
    },
    {
      reply: "The scene is working because the secret now has a visible cost.",
      nowTs: 1_800_000_101_000,
    }
  );
  assert.match(nonPageRecord.lastWritePreview, /rain-swollen vent/);
  assert.doesNotMatch(nonPageRecord.lastWritePreview, /scene is working/);
});

test("[persistent-screenplay-memory] correction turns repair stale project continuity", () => {
  const firstTs = 1_800_000_500_000;
  const secondTs = firstTs + 2_000;
  let memory = createEmptyEmotionMemory();

  memory = withMockedNow(firstTs, () => updateSessionAfterReply(
    memory,
    "Continue the rain vent scene.",
    "INT. ROOFTOP - NIGHT\n\nMara hides the cassette under the rain-swollen vent.",
    false,
    {
      screenplayProjectId: "rain-docket",
      screenplayTarget: "page",
      screenplayAct: "Act II",
      screenplayCurrentBeat: "Mara hides the cassette under the rain-swollen vent.",
      screenplayNextThreeTurns: [
        "Mara retrieves the cassette.",
        "Eli hears the cassette clicking.",
      ],
      screenplayUnresolvedSetups: ["The cassette under the vent has not paid off."],
      screenplayImageMotifs: ["cassette", "rain-swollen vent"],
      screenplayInsertedText: "INT. ROOFTOP - NIGHT\n\nMara hides the cassette under the rain-swollen vent.",
    }
  ));

  assert.equal(memory.screenplayProjectMemory.length, 1);
  assert.match(buildMemoryAddendum(memory), /cassette/);

  memory = withMockedNow(secondTs, () => updateSessionAfterReply(
    memory,
    "Actually, no, Mara hides a VHS tape under the rain-swollen vent, not a cassette.",
    "Got it. I will treat the VHS tape as canon.",
    false,
    {
      screenplayProjectId: "rain-docket",
      screenplayTarget: "voice_pin",
      screenplayAct: "Act II",
    }
  ));

  const repaired = memory.screenplayProjectMemory[0];
  assert.equal(repaired.projectId, "rain-docket");
  assert.match(repaired.currentBeat, /VHS tape/);
  assert.doesNotMatch(repaired.currentBeat, /cassette/i);
  assert.match(repaired.nextScenePlan, /VHS tape/);
  assert.deepEqual(repaired.correctedTerms, ["cassette"]);
  assert.deepEqual(repaired.correctionReplacements, ["cassette -> VHS tape"]);
  assert.ok(repaired.continuityNotes.some((note) => /Authoritative user correction/.test(note)));
  assert.ok(repaired.continuityNotes.some((note) => /not a cassette/i.test(note)));
  assert.ok(repaired.nextThreeTurns.every((item) => !/cassette/i.test(item)));
  assert.ok(repaired.unresolvedSetups.every((item) => !/cassette/i.test(item)));
  assert.ok(repaired.imageMotifs.every((item) => !/^cassette$/i.test(item)));

  const prompt = buildMemoryAddendum(memory);
  assert.match(prompt, /VHS tape/);
  assert.match(prompt, /corrected_terms:cassette -> VHS tape/);

  memory = withMockedNow(secondTs + 1_000, () => updateSessionAfterReply(
    memory,
    "Correction: it stays a VHS tape, not a cassette.",
    "Yes. VHS tape stays canon.",
    false,
    {
      screenplayProjectId: "rain-docket",
      screenplayTarget: "voice_pin",
      screenplayAct: "Act II",
    }
  ));

  assert.deepEqual(memory.screenplayProjectMemory[0].correctionReplacements, ["cassette -> VHS tape"]);
  assert.doesNotMatch(buildMemoryAddendum(memory), /VHS tape -> VHS tape/);
});

test("[persistent-screenplay-memory] keeps story spine memory even before scene context exists", () => {
  const memory = {
    ...createEmptyEmotionMemory(),
    screenplayProjectMemory: sanitizeScreenplayProjectMemoryItems([
      {
        projectId: "feature-spine",
        logline: "A grieving projectionist rebuilds a lost film to solve the disappearance of her sister.",
        themeArgument: "Memory only heals when it becomes action.",
        centralQuestion: "Can Mara stop preserving the past long enough to save someone living?",
        protagonistWant: "Recover the missing final reel.",
        protagonistNeed: "Choose connection over control.",
        antagonisticForce: "A studio fixer erasing every witness.",
        endingImage: "The repaired reel burns while Mara watches the sunrise without flinching.",
        updatedAt: 1_800_000_200_000,
      },
    ]),
    screenplayProjectMemoryUpdatedAt: 1_800_000_200_000,
  };

  assert.equal(memory.screenplayProjectMemory.length, 1);
  const prompt = buildMemoryAddendum(memory);
  assert.match(prompt, /logline:A grieving projectionist/);
  assert.match(prompt, /theme:Memory only heals/);
  assert.match(prompt, /central_question:Can Mara stop preserving/);
  assert.match(prompt, /want:Recover the missing final reel/);
  assert.match(prompt, /need:Choose connection over control/);
  assert.match(prompt, /opposition:A studio fixer/);
  assert.match(prompt, /ending_image:The repaired reel burns/);
});

test("[persistent-screenplay-memory] screenplay memory changes state version and survives persistence sanitization", () => {
  const base = createEmptyEmotionMemory();
  base.turns = 4;
  base.lastUpdatedAt = 100;
  const before = buildMemoryStateVersion(base);
  const withProject = {
    ...base,
    screenplayProjectMemory: sanitizeScreenplayProjectMemoryItems([
      {
        projectId: "feature-beta",
        act: "Act III",
        currentBeat: "The protagonist returns to the opening image changed.",
        nextScenePlan: "Write the climax aftermath without explaining the theme.",
        updatedAt: 200,
      },
    ]),
    screenplayProjectMemoryUpdatedAt: 200,
  };
  const after = buildMemoryStateVersion(withProject);
  assert.notEqual(after, before);

  const sanitized = sanitizePersistedSessionMemory({
    screenplayProjectMemory: [
      {
        projectId: "  feature-beta  ",
        act: "Act III",
        actPressureState: "Pay off the opening lie through changed behavior.",
        characterArcState: "June can finally ask for help without bargaining.",
        lastSceneOutcome: "The climax leaves her alone with the burned reel.",
        nextSceneMoves: ["Image payoff", "Silent choice", "New equilibrium"],
        nextThreeTurns: ["Face the empty theater", "Let the sister speak", "Choose dawn over the reel"],
        actThreePayoffPath: ["Burn the false reel", "Name the real witness"],
        unresolvedStoryThreads: ["Who receives the final print?"],
        characterArcTurns: ["June stops preserving the dead at the cost of the living."],
        imageMotifs: ["burned reel", "sunrise on blank screen"],
        continuityNotes: ["Do not undo the cost of the climax."],
        updatedAt: 200,
      },
      null,
      { projectId: "" },
    ],
    screenplayProjectMemoryUpdatedAt: "200",
  });

  assert.equal(sanitized.screenplayProjectMemory.length, 1);
  assert.equal(sanitized.screenplayProjectMemory[0].projectId, "feature-beta");
  assert.equal(sanitized.screenplayProjectMemory[0].actPressureState, "Pay off the opening lie through changed behavior.");
  assert.equal(sanitized.screenplayProjectMemory[0].characterArcState, "June can finally ask for help without bargaining.");
  assert.equal(sanitized.screenplayProjectMemory[0].lastSceneOutcome, "The climax leaves her alone with the burned reel.");
  assert.deepEqual(sanitized.screenplayProjectMemory[0].nextSceneMoves, [
    "Image payoff",
    "Silent choice",
    "New equilibrium",
  ]);
  assert.deepEqual(sanitized.screenplayProjectMemory[0].nextThreeTurns, [
    "Face the empty theater",
    "Let the sister speak",
    "Choose dawn over the reel",
  ]);
  assert.deepEqual(sanitized.screenplayProjectMemory[0].actThreePayoffPath, [
    "Burn the false reel",
    "Name the real witness",
  ]);
  assert.deepEqual(sanitized.screenplayProjectMemory[0].unresolvedStoryThreads, [
    "Who receives the final print?",
  ]);
  assert.deepEqual(sanitized.screenplayProjectMemory[0].characterArcTurns, [
    "June stops preserving the dead at the cost of the living.",
  ]);
  assert.deepEqual(sanitized.screenplayProjectMemory[0].imageMotifs, [
    "burned reel",
    "sunrise on blank screen",
  ]);
  assert.equal(sanitized.screenplayProjectMemoryUpdatedAt, 200);
});

test("[persistent-screenplay-memory] prompt builder rebuilds feature context from durable project memory", async () => {
  const memory = {
    ...createEmptyEmotionMemory(),
    screenplayProjectMemory: sanitizeScreenplayProjectMemoryItems([
      {
        projectId: "feature-gamma",
        documentRevisionId: "rev-77",
        act: "Act II",
        sceneLabel: "Courthouse Hallway",
        sceneObjective: "Mara must decide whether to expose the forged testimony.",
        currentBeat: "The father reveal corners Mara emotionally.",
        featureSequence: "Midpoint trap",
        featureObligation: "Force the protagonist to act instead of investigate.",
        actPressureState: "Act II must turn evidence into a public cost.",
        characterArcState: "Mara is learning that truth without exposure is another kind of control.",
        lastSceneOutcome: "The father reveal collapses Mara's private strategy.",
        nextScenePlan: "Move into a private corridor confrontation that redefines the case.",
        nextThreeTurns: [
          "Father names the lie.",
          "Mara chooses public exposure.",
          "The forged testimony points at the judge.",
        ],
        actThreePayoffPath: [
          "Mara spends the sealed affidavit in open court.",
          "The sister's silence becomes testimony.",
        ],
        characterFocus: ["Mara", "Father"],
        unresolvedSetups: ["Forged testimony", "Missing evidence"],
        unresolvedStoryThreads: ["Who forged the testimony?", "Why Father stayed gone"],
        characterArcTurns: ["Mara must choose exposure over control."],
        imageMotifs: ["sealed affidavit", "flickering hallway light"],
        continuityNotes: ["Mara distrusts the courthouse staff."],
        emotionalContinuity: "Resolve fractures into grief, then reforms as courage.",
        lastWritePreview: "FATHER\nI came because the lie finally had your face on it.",
        pageCount: 47,
        targetPages: 105,
        updatedAt: 300,
      },
    ]),
    screenplayProjectMemoryUpdatedAt: 300,
  };

  const prompt = await wrapSystemPromptWithCreativeMemory(
    "PERSONA",
    { body: {} },
    {
      screenplayTaskHint: "Continue the script from here.",
      memory,
    }
  );

  assert.ok(prompt.includes("<session>"));
  assert.ok(prompt.includes("project: feature-gamma"));
  assert.ok(prompt.includes("version: rev-77"));
  assert.ok(prompt.includes("scene: Courthouse Hallway"));
  assert.ok(prompt.includes("current_scene_objective: Mara must decide whether to expose"));
  assert.ok(prompt.includes("current_beat: The father reveal corners Mara emotionally."));
  assert.ok(prompt.includes("feature_sequence: Midpoint trap"));
  assert.ok(prompt.includes("structural_obligation_due_now: Force the protagonist to act"));
  assert.ok(prompt.includes("act_pressure_state: Act II must turn evidence into a public cost."));
  assert.ok(prompt.includes("character_arc_state: Mara is learning that truth without exposure"));
  assert.ok(prompt.includes("last_scene_outcome: The father reveal collapses Mara's private strategy."));
  assert.ok(prompt.includes("persistent_memory_brief: position: Act II / Midpoint trap"));
  assert.ok(prompt.includes("next three turns: Father names the lie. / Mara chooses public exposure."));
  assert.ok(prompt.includes("Act III payoff path: Mara spends the sealed affidavit in open court"));
  assert.ok(prompt.includes("arc turns: Mara must choose exposure over control."));
  assert.ok(prompt.includes("image motifs: sealed affidavit / flickering hallway light"));
  assert.ok(prompt.includes("open setups: Forged testimony / Missing evidence"));
  assert.ok(prompt.includes("story threads: Who forged the testimony? / Why Father stayed gone"));
  assert.ok(prompt.includes("next_scene_plan: Move into a private corridor confrontation"));
  assert.ok(prompt.includes("next_three_turns:"));
  assert.ok(prompt.includes("- The forged testimony points at the judge."));
  assert.ok(prompt.includes("act_three_payoff_path:"));
  assert.ok(prompt.includes("The sister's silence becomes testimony."));
  assert.ok(prompt.includes("character_focus:"));
  assert.ok(prompt.includes("- Father"));
  assert.ok(prompt.includes("unresolved_story_threads:"));
  assert.ok(prompt.includes("Why Father stayed gone"));
  assert.ok(prompt.includes("character_arc_turns:"));
  assert.ok(prompt.includes("Mara must choose exposure over control."));
  assert.ok(prompt.includes("image_motifs:"));
  assert.ok(prompt.includes("flickering hallway light"));
  assert.ok(prompt.includes("unresolved_setups:"));
  assert.ok(prompt.includes("Missing evidence"));
  assert.ok(prompt.includes("draft_excerpt:"));
  assert.ok(prompt.includes("    FATHER"));
  assert.ok(prompt.includes("<feature_film_map>"));
  assert.ok(prompt.includes("current_position: p47 / 105"));
  assert.ok(prompt.includes("current_sequence: Act II - Midpoint Pressure"));
  assert.ok(prompt.includes("<screenplay_task>"));
  assert.ok(prompt.includes("intent: continue_script"));
});

test("[persistent-screenplay-memory] vague writer block turns use durable Story Spine runway", async () => {
  const memory = {
    ...createEmptyEmotionMemory(),
    screenplayProjectMemory: sanitizeScreenplayProjectMemoryItems([
      {
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        documentRevisionId: "rev-block-9",
        act: "Act II",
        featureSequence: "Midpoint trap",
        currentBeat: "Mara realizes the sealed affidavit points at the judge.",
        featureObligation: "Turn private proof into public cost.",
        actPressureState: "The midpoint must make private evidence useless.",
        characterArcState: "Mara still believes control can keep Eli safe.",
        lastSceneOutcome: "Mara wins the affidavit, then discovers the judge already buried it.",
        nextScenePlan: "Force Mara into a courthouse hallway choice that exposes the lie publicly.",
        nextThreeTurns: [
          "Father names the lie.",
          "Mara chooses public exposure.",
          "The sealed affidavit becomes dangerous.",
        ],
        unresolvedSetups: ["sealed affidavit", "missing sketchbook"],
        unresolvedStoryThreads: ["Why Marcus protected the fixer"],
        actThreePayoffPath: ["The affidavit becomes courtroom testimony."],
        characterFocus: ["Mara", "Father"],
        imageMotifs: ["courthouse fluorescents"],
        lastWritePreview: "MARA\nIf I say it out loud, they own it.",
        updatedAt: 500,
      },
    ]),
    screenplayProjectMemoryUpdatedAt: 500,
  };

  const prompt = await wrapSystemPromptWithCreativeMemory(
    "PERSONA",
    { body: {} },
    {
      screenplayTaskHint: "I'm stuck.",
      memory,
    }
  );

  assert.ok(prompt.includes("<session>"));
  assert.ok(prompt.includes("project: rain-docket"));
  assert.ok(prompt.includes("current_beat: Mara realizes the sealed affidavit points at the judge."));
  assert.ok(prompt.includes("next_three_turns:"));
  assert.ok(prompt.includes("- Mara chooses public exposure."));
  assert.ok(prompt.includes("<writer_block_memory>"));
  assert.ok(prompt.includes("strongest_remembered_next_turn: Father names the lie."));
  assert.ok(prompt.includes("open_setup_to_pressure: sealed affidavit"));
  assert.ok(prompt.includes("unresolved_story_thread: Why Marcus protected the fixer"));
  assert.ok(prompt.includes("act_three_payoff_seed: The affidavit becomes courtroom testimony."));
  assert.ok(prompt.includes("intent: momentum_rescue"));
  assert.ok(prompt.includes("writer_block_contract:"));
});

test("[persistent-screenplay-memory] non-screenplay turns do not inject project memory", async () => {
  const memory = {
    ...createEmptyEmotionMemory(),
    screenplayProjectMemory: sanitizeScreenplayProjectMemoryItems([
      {
        projectId: "feature-delta",
        act: "Act III",
        currentBeat: "The final image is waiting.",
        updatedAt: 400,
      },
    ]),
    screenplayProjectMemoryUpdatedAt: 400,
  };

  const prompt = await wrapSystemPromptWithCreativeMemory(
    "PERSONA",
    { body: {} },
    {
      screenplayTaskHint: "How are you feeling today?",
      memory,
    }
  );

  assert.equal(prompt, "PERSONA");
});

test("[persistent-screenplay-memory] live Studio context builds a rich creative-memory recall query", () => {
  const query = buildCreativeMemoryRecallQuery(
    {
      body: {
        client_transcript: "Continue from here into the midpoint reversal.",
        screenplayProjectId: "rain-docket",
        screenplayProjectTitle: "Rain Docket",
        screenplayTarget: "page",
        screenplayAct: "Act II",
        screenplayAnchorSceneLabel: "Courthouse Hallway",
        screenplayCurrentBeat: "Mara realizes the sealed affidavit points at the judge.",
        screenplayFeatureSequence: "Act II - Midpoint trap",
        screenplayFeatureObligation: "Turn private proof into public cost.",
        screenplayActPressureState: "The midpoint must make private evidence useless.",
        screenplayCharacterArcState: "Mara still believes control can protect Eli.",
        screenplayCharacterArcMemory: {
          character: "Mara",
          want: "protect Eli without exposing the affidavit",
          need: "choose public courage",
          falseBelief: "control keeps Eli safe",
          nextEmotionalTurn: "public exposure",
        },
        screenplayNextThreeTurns: [
          "Father names the lie.",
          "Mara chooses public exposure.",
          "The sealed affidavit becomes dangerous.",
        ],
        screenplayActThreePayoffPath: [
          "The affidavit becomes courtroom testimony.",
          "The courthouse wall pays off as final image.",
        ],
        screenplayUnresolvedSetups: ["sealed affidavit", "missing sketchbook"],
        screenplayCharacterFocus: ["Mara", "Father"],
        screenplayImageMotifs: ["charcoal dust", "courthouse fluorescents"],
      },
    },
    {
      screenplayTaskHint: "Continue the screenplay pages.",
    }
  );

  assert.match(query, /user_request: Continue the screenplay pages\./);
  assert.match(query, /project_id: rain-docket/);
  assert.match(query, /project_title: Rain Docket/);
  assert.match(query, /act: Act II/);
  assert.match(query, /current_beat: Mara realizes the sealed affidavit points at the judge\./);
  assert.match(query, /character_arc_memory: character=Mara; want=protect Eli without exposing the affidavit/);
  assert.match(query, /need=choose public courage/);
  assert.match(query, /false_belief=control keeps Eli safe/);
  assert.match(query, /next_three_turns: Father names the lie\. \/ Mara chooses public exposure\./);
  assert.match(query, /act_three_payoff_path: The affidavit becomes courtroom testimony\./);
  assert.match(query, /unresolved_setups: sealed affidavit \/ missing sketchbook/);
  assert.match(query, /character_focus: Mara \/ Father/);
  assert.match(query, /image_motifs: charcoal dust \/ courthouse fluorescents/);
  assert.ok(query.length <= 4_000);
});

test("[persistent-screenplay-memory] prompt trace exposes retrieved characters and corrections", () => {
  const trace = buildCreativeMemoryPromptTrace(
    {
      characters: [
        {
          name: "Mara",
          bible: {
            correctedTerms: ["mother"],
            correctionReplacements: ["mother -> Eli's sister"],
          },
        },
      ],
      episodicMemories: [
        {
          summary: "Correction for Mara: Mara hides a VHS tape, not a cassette.",
          excerpt: "Actually, no, it is a VHS tape under the courthouse vent.",
          projectId: "rain-docket",
          projectTitle: "Rain Docket",
          characterNames: ["Mara"],
          tags: ["screenplay", "correction"],
        },
      ],
      style: { preferredTone: "restrained" },
    },
    {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      query: "Continue Mara and the corrected evidence.",
    }
  );

  assert.equal(trace.applied, true);
  assert.equal(trace.project_id, "rain-docket");
  assert.equal(trace.project_title, "Rain Docket");
  assert.equal(trace.character_count, 1);
  assert.equal(trace.episodic_count, 1);
  assert.equal(trace.correction_count, 2);
  assert.deepEqual(trace.corrected_terms, ["mother"]);
  assert.deepEqual(trace.correction_replacements, ["mother -> Eli's sister"]);
  assert.equal(trace.characters[0].name, "Mara");
  assert.equal(trace.characters[0].has_corrections, true);
  assert.match(trace.episodic[0].summary, /Correction for Mara/);
  assert.equal(trace.episodic[0].correction, true);
  assert.equal(trace.style_applied, true);
  assert.ok(trace.query_chars > 0);
});

test("[persistent-screenplay-memory] builds session continuity snapshot from latest project memory", () => {
  const memory = {
    ...createEmptyEmotionMemory(),
    screenplayProjectMemory: sanitizeScreenplayProjectMemoryItems([
      {
        projectId: "rain-docket",
        act: "Act II",
        featureSequence: "Act II - Midpoint Pressure",
        featureObligation: "Turn victory into a trap that forces public action.",
        sceneObjective: "Mara must decide whether to make the affidavit public.",
        sceneSummary: "The father reveal corners Mara in the courthouse hallway.",
        currentBeat: "Mara realizes the forged testimony points at the judge.",
        logline: "A court artist discovers every verdict has been staged.",
        themeArgument: "Justice begins when performance fails.",
        centralQuestion: "Can Mara draw the truth faster than the court can erase it?",
        protagonistWant: "Mara wants the sealed affidavit.",
        protagonistNeed: "Mara needs to stop hiding behind observation.",
        antagonisticForce: "A judge who edits the public record.",
        endingImage: "Mara hangs the true sketch outside the courthouse.",
        actPressureState: "The midpoint trap must make private proof useless.",
        characterArcState: "Mara's control must fracture into public courage.",
        lastSceneOutcome: "The father reveal collapses Mara's private strategy.",
        nextScenePlan: "Move into a private corridor confrontation.",
        nextSceneMoves: [
          "Force the affidavit into public view.",
          "Let the judge turn silence into a weapon.",
        ],
        nextThreeTurns: [
          "Father names the lie.",
          "Mara chooses public exposure.",
          "The sealed affidavit becomes dangerous.",
        ],
        actThreePayoffPath: [
          "The affidavit becomes courtroom testimony.",
          "The courthouse wall pays off as final image.",
        ],
        unresolvedSetups: ["The missing sketchbook", "The sealed affidavit"],
        unresolvedStoryThreads: ["Who forged the testimony?", "Why did the father vanish?"],
        characterArcTurns: ["Mara chooses public exposure over perfect proof."],
        imageMotifs: ["charcoal dust", "courthouse fluorescents"],
        continuityNotes: ["Do not soften Mara's public humiliation."],
        emotionalContinuity: "Humiliation hardens into public courage.",
        characterFocus: ["Mara", "Father"],
        pageCount: 47,
        targetPages: 105,
        updatedAt: 900,
      },
    ]),
    screenplayProjectMemoryUpdatedAt: 900,
  };

  const snapshot = buildSessionContinuitySnapshot(memory, {
    episodicMemories: [
      {
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        summary: "Mara hides the affidavit behind the courthouse vent.",
        excerpt: "The sealed affidavit becomes dangerous.",
        characterNames: ["Mara"],
        tags: ["screenplay"],
        updatedAt: 950,
      },
    ],
  });

  assert.equal(snapshot.has_continuity, true);
  assert.equal(snapshot.source, "screenplay_project_memory+creative_memory");
  assert.equal(snapshot.project_id, "rain-docket");
  assert.equal(snapshot.project_title, "Rain Docket");
  assert.equal(snapshot.act, "Act II");
  assert.equal(snapshot.feature_obligation, "Turn victory into a trap that forces public action.");
  assert.equal(snapshot.scene_objective, "Mara must decide whether to make the affidavit public.");
  assert.equal(snapshot.scene_summary, "The father reveal corners Mara in the courthouse hallway.");
  assert.equal(snapshot.logline, "A court artist discovers every verdict has been staged.");
  assert.equal(snapshot.theme_argument, "Justice begins when performance fails.");
  assert.equal(snapshot.central_question, "Can Mara draw the truth faster than the court can erase it?");
  assert.equal(snapshot.protagonist_want, "Mara wants the sealed affidavit.");
  assert.equal(snapshot.protagonist_need, "Mara needs to stop hiding behind observation.");
  assert.equal(snapshot.antagonistic_force, "A judge who edits the public record.");
  assert.equal(snapshot.ending_image, "Mara hangs the true sketch outside the courthouse.");
  assert.equal(snapshot.act_pressure_state, "The midpoint trap must make private proof useless.");
  assert.equal(snapshot.character_arc_state, "Mara's control must fracture into public courage.");
  assert.deepEqual(snapshot.next_scene_moves, [
    "Force the affidavit into public view.",
    "Let the judge turn silence into a weapon.",
  ]);
  assert.deepEqual(snapshot.next_three_turns.slice(0, 2), [
    "Father names the lie.",
    "Mara chooses public exposure.",
  ]);
  assert.deepEqual(snapshot.act_three_payoff_path, [
    "The affidavit becomes courtroom testimony.",
    "The courthouse wall pays off as final image.",
  ]);
  assert.deepEqual(snapshot.unresolved_setups, ["The missing sketchbook", "The sealed affidavit"]);
  assert.deepEqual(snapshot.unresolved_story_threads, ["Who forged the testimony?", "Why did the father vanish?"]);
  assert.deepEqual(snapshot.character_arc_turns, ["Mara chooses public exposure over perfect proof."]);
  assert.deepEqual(snapshot.image_motifs, ["charcoal dust", "courthouse fluorescents"]);
  assert.deepEqual(snapshot.continuity_notes, ["Do not soften Mara's public humiliation."]);
  assert.equal(snapshot.emotional_continuity, "Humiliation hardens into public courage.");
  assert.equal(snapshot.page_count, 47);
  assert.equal(snapshot.target_pages, 105);
  assert.ok(snapshot.opening_line.includes("Welcome back."));
  assert.ok(snapshot.opening_line.includes("Rain Docket"));
  assert.ok(snapshot.opening_line.includes("Next move: Move into a private corridor confrontation."));
});

test("[persistent-screenplay-memory] session continuity honors correction-only creative memory", () => {
  const snapshot = buildSessionContinuitySnapshot(createEmptyEmotionMemory(), {
    episodicMemories: [
      {
        projectId: "black-salt",
        projectTitle: "Black Salt",
        summary: "Correction for lighthouse: it is a weather station, not haunted.",
        excerpt: "Actually, no, the lighthouse is a coded weather station.",
        characterNames: [],
        tags: ["screenplay", "correction"],
        updatedAt: 1_200,
      },
    ],
  });

  assert.equal(snapshot.has_continuity, true);
  assert.equal(snapshot.source, "creative_memory");
  assert.equal(snapshot.project_title, "Black Salt");
  assert.equal(snapshot.is_correction, true);
  assert.ok(snapshot.opening_line.includes("I'll honor your latest correction first."));
  assert.ok(snapshot.memory_excerpt.includes("coded weather station"));
});
