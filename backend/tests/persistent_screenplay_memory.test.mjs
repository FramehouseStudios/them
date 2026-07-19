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
    "Private corridor choice exposes the lie.",
    "Mara burns the safe legal tactic.",
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
    "Private corridor choice exposes the lie.",
    "Mara burns the safe legal tactic.",
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

test("[persistent-screenplay-memory] canon correction receipts replace duplicate correction episodes", () => {
  const cards = buildMemoryCards(
    createEmptyEmotionMemory(),
    [],
    12,
    {
      canonCorrectionReceipts: [{
        id: "canon_correction_123",
        status: "active",
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        correctionText: "Actually, Mara never burns the affidavit. It survives.",
        matchedFacts: ["Mara burns the only copy before the cameras arrive."],
        correctionMemoryId: "episode_correction",
        createdAt: 1_800_000_000_000,
      }],
      episodicMemories: [{
        id: "episode_correction",
        summary: "Correction for Rain Docket",
        excerpt: "Actually, Mara never burns the affidavit. It survives.",
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        tags: ["screenplay", "correction"],
        createdAt: 1_800_000_000_000,
        updatedAt: 1_800_000_000_000,
      }],
    },
  );

  const receipt = cards.find((card) => card.source === "canon_correction");
  assert.ok(receipt);
  assert.equal(receipt.key, "correction:canon_correction_123");
  assert.equal(receipt.correction_receipt.status, "active");
  assert.equal(receipt.correction_receipt.project_title, "Rain Docket");
  assert.deepEqual(receipt.correction_receipt.matched_facts, [
    "Mara burns the only copy before the cameras arrive.",
  ]);
  assert.match(receipt.summary, /never burns the affidavit/i);
  assert.equal(cards.some((card) => card.source === "episodic_correction"), false);
});

test("[persistent-screenplay-memory] ambiguous canon corrections become an explicit writer choice", () => {
  const cards = buildMemoryCards(
    createEmptyEmotionMemory(),
    [],
    12,
    {
      canonCorrectionAmbiguities: [{
        id: "canon_ambiguity_123",
        status: "pending",
        projectId: "split-ferries",
        projectTitle: "Split Ferries",
        correctionText: "Actually, Mara never abandons anyone at the ferry dock.",
        candidateFacts: [
          "Mara abandons Eli at the east ferry dock.",
          "Mara abandons June at the east ferry dock.",
        ],
        correctionMemoryId: "episode_ambiguous",
        createdAt: 1_800_000_000_000,
      }],
      episodicMemories: [{
        id: "episode_ambiguous",
        summary: "Correction for Split Ferries",
        excerpt: "Actually, Mara never abandons anyone at the ferry dock.",
        projectId: "split-ferries",
        projectTitle: "Split Ferries",
        tags: ["screenplay", "correction"],
        createdAt: 1_800_000_000_000,
        updatedAt: 1_800_000_000_000,
      }],
    },
  );

  const ambiguity = cards.find((card) => card.source === "canon_correction_ambiguous");
  assert.ok(ambiguity);
  assert.equal(ambiguity.correction_ambiguity.id, "canon_ambiguity_123");
  assert.equal(ambiguity.correction_ambiguity.status, "pending");
  assert.deepEqual(ambiguity.correction_ambiguity.candidate_facts, [
    "Mara abandons Eli at the east ferry dock.",
    "Mara abandons June at the east ferry dock.",
  ]);
  assert.match(ambiguity.reason, /preserved both/i);
  assert.equal(cards.some((card) => card.source === "episodic_correction"), false);
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
    "Make Mara choose a new tactic under pressure from cassette.",
    "Complicate or pay off cassette so it changes the next scene.",
  ]);
  assert.deepEqual(record.actThreePayoffPath, [
    "Cassette returns as proof or cost in Act III.",
    "Rain-Swollen Vent returns as proof or cost in Act III.",
    "Courthouse returns as proof or cost in Act III.",
    "Mara's next public choice must pay off the private pressure planted here.",
  ]);
  assert.deepEqual(record.unresolvedSetups, [
    "Mara hides the cassette under the rain-swollen vent.",
  ]);
  assert.deepEqual(record.unresolvedStoryThreads, [
    "Who else knows about cassette?",
  ]);
  assert.deepEqual(record.characterArcTurns, [
    "Mara must change tactics after: She watches the courthouse lights blink out below them.",
    "Mara must decide what cassette costs them.",
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
  assert.match(prompt, /act3_payoff_path:Cassette returns as proof or cost in Act III/);
  assert.match(prompt, /arc_turns:Mara must change tactics after/);
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

test("[persistent-screenplay-memory] generated page replies update payoff and arc runway", () => {
  const replyPages = [
    "INT. COURTHOUSE - NIGHT",
    "",
    "Mara sets the sealed affidavit beside the dead microphone.",
    "",
    "ELI",
    "If you say this aloud, they own you.",
    "",
    "MARA",
    "Then I stop owning it alone.",
    "",
    "She pushes the microphone toward the witness table.",
    "On her phone, the empty pool fills with rain.",
  ].join("\n");

  const record = buildScreenplayProjectMemoryRecordFromStudioMeta(
    {
      screenplayProjectId: "feature-reply-pages",
      screenplayTarget: "page",
      screenplayPageCount: 101,
      screenplayTargetPages: 110,
    },
    {
      reply: replyPages,
      nowTs: 1_800_000_110_000,
    }
  );

  assert.ok(record);
  assert.equal(record.projectId, "feature-reply-pages");
  assert.equal(record.act, "Act III");
  assert.equal(record.featureSequence, "Act III - Climax / Final Image");
  assert.equal(record.sceneLabel, "INT. COURTHOUSE - NIGHT");
  assert.equal(record.currentBeat, "On her phone, the empty pool fills with rain.");
  assert.deepEqual(record.characterFocus, ["Eli", "Mara"]);
  assert.deepEqual(record.nextThreeTurns, [
    "Force the consequence of: On her phone, the empty pool fills with rain.",
    "Make Mara choose a new tactic under pressure from sealed affidavit.",
    "Complicate or pay off sealed affidavit so it changes the next scene.",
  ]);
  assert.ok(record.actThreePayoffPath.includes("Sealed Affidavit returns as proof or cost in Act III."));
  assert.ok(record.actThreePayoffPath.includes("Microphone returns as proof or cost in Act III."));
  assert.ok(record.actThreePayoffPath.includes("Mara's next public choice must pay off the private pressure planted here."));
  assert.deepEqual(record.unresolvedSetups, [
    "Mara sets the sealed affidavit beside the dead microphone.",
  ]);
  assert.ok(record.characterArcTurns.includes("Mara is being pushed from private control toward public truth."));
  assert.ok(record.characterArcTurns.includes("Mara must decide what sealed affidavit costs them."));
  assert.ok(record.imageMotifs.includes("sealed affidavit"));
  assert.ok(record.imageMotifs.includes("microphone"));
  assert.match(record.lastWritePreview, /sealed affidavit/);

  let memory = createEmptyEmotionMemory();
  memory = withMockedNow(1_800_000_110_000, () => updateSessionAfterReply(
    memory,
    "Write the Act III courtroom pages.",
    replyPages,
    false,
    {
      screenplayProjectId: "feature-reply-pages",
      screenplayTarget: "page",
      screenplayPageCount: 101,
      screenplayTargetPages: 110,
    }
  ));

  assert.equal(memory.screenplayProjectMemory.length, 1);
  const prompt = buildMemoryAddendum(memory);
  assert.match(prompt, /act:Act III/);
  assert.match(prompt, /next_three_turns:Force the consequence of: On her phone/);
  assert.match(prompt, /act3_payoff_path:Sealed Affidavit returns as proof or cost in Act III/);
  assert.match(prompt, /arc_turns:Mara is being pushed from private control toward public truth/);
});

test("[persistent-screenplay-memory] accepted page writes advance spent next-scene runway", () => {
  const replyPages = [
    "INT. EDIT BAY - NIGHT",
    "",
    "Mara threads the warped reel through the Steenbeck.",
    "On screen, the wrong memory stutters where the evidence should be.",
    "The locked archive door rattles under someone's fist.",
    "",
    "MARCUS",
    "If you say this in public, you don't get to take it back.",
    "",
    "MARA",
    "Then stop cutting around my guilt.",
    "",
    "She lifts the splice marker and writes FIXER across the frame.",
    "A projector flare washes the room white as Marcus opens the door to the crowd.",
  ].join("\n");
  const studioMeta = {
    screenplayProjectId: "feature-runway",
    screenplayProjectTitle: "Runway",
    screenplayTarget: "page",
    screenplayAct: "Act II",
    screenplayFeatureSequence: "Reversal Fallout",
    screenplayFeatureObligation: "The reel plays the wrong memory and turns evidence into a trap.",
    screenplayCurrentBeat: "Mara loads the reel before knowing what it contains.",
    screenplayNextSceneMoves: [
      "The reel plays the wrong memory.",
      "Marcus forces a public choice.",
    ],
    screenplayNextThreeTurns: [
      "The reel plays the wrong memory.",
      "Marcus forces a public choice.",
      "The fixer is exposed by the public splice.",
    ],
    screenplayUnresolvedStoryThreads: ["The locked archive door blocks Mara."],
    screenplayCharacterArcTurns: ["Mara stops cutting around her guilt."],
    screenplayActThreePayoffPath: ["The fixer is exposed by the public splice."],
    screenplayImageMotifs: ["projector flare"],
  };

  const record = buildScreenplayProjectMemoryRecordFromStudioMeta(studioMeta, {
    reply: replyPages,
    nowTs: 1_800_000_123_000,
  });

  assert.equal(record.currentBeat, "A projector flare washes the room white as Marcus opens the door to the crowd.");
  assert.equal(record.lastSceneOutcome, "A projector flare washes the room white as Marcus opens the door to the crowd.");
  assert.deepEqual(record.nextThreeTurns, [
    "Marcus forces a public choice.",
    "The fixer is exposed by the public splice.",
    "Force the consequence of: A projector flare washes the room white as Marcus opens the door to the crowd.",
  ]);
  assert.deepEqual(record.nextSceneMoves.slice(0, 2), [
    "Marcus forces a public choice.",
    "Force the consequence of: A projector flare washes the room white as Marcus opens the door to the crowd.",
  ]);
  assert.ok(record.characterArcTurns.includes("Mara is being pushed from private control toward public truth."));
  assert.ok(record.imageMotifs.includes("reel"));
  assert.ok(record.imageMotifs.includes("projector flare"));

  let memory = createEmptyEmotionMemory();
  memory.screenplayProjectMemory = sanitizeScreenplayProjectMemoryItems([
    {
      projectId: "feature-runway",
      projectTitle: "Runway",
      nextSceneMoves: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
      ],
      nextThreeTurns: [
        "The reel plays the wrong memory.",
        "Marcus forces a public choice.",
        "The fixer is exposed by the public splice.",
      ],
      updatedAt: 1_800_000_120_000,
      createdAt: 1_800_000_100_000,
    },
  ]);

  memory = withMockedNow(1_800_000_123_000, () => updateSessionAfterReply(
    memory,
    "Continue the edit bay page from the remembered next turn.",
    replyPages,
    false,
    studioMeta
  ));

  const merged = memory.screenplayProjectMemory[0];
  assert.equal(merged.currentBeat, "A projector flare washes the room white as Marcus opens the door to the crowd.");
  assert.deepEqual(merged.nextThreeTurns, [
    "Marcus forces a public choice.",
    "The fixer is exposed by the public splice.",
    "Force the consequence of: A projector flare washes the room white as Marcus opens the door to the crowd.",
  ]);
  assert.equal(
    merged.nextThreeTurns.some((turn) => turn === "The reel plays the wrong memory."),
    false
  );
  assert.equal(
    merged.nextSceneMoves.some((turn) => turn === "The reel plays the wrong memory."),
    false
  );
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
  assert.match(prompt, /CORRECTION_CONTRACT: authoritative_replacements:cassette -> VHS tape/);
  assert.match(prompt, /corrected_terms:cassette -> VHS tape/);
  assert.ok(
    prompt.indexOf("CORRECTION_CONTRACT") < prompt.indexOf("current_beat:"),
    "correction contract should appear before older beat/runway memory"
  );

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

test("[persistent-screenplay-memory] character arc memory becomes durable Story Spine recall", () => {
  const ts = 1_800_000_700_000;
  let memory = createEmptyEmotionMemory();

  memory = withMockedNow(ts, () => updateSessionAfterReply(
    memory,
    "Remember Mara and Eli's Act II character engines before we continue.",
    "Locked. I will use Mara and Eli's arc pressure before inventing new plot.",
    false,
    {
      screenplayProjectId: "mercy-court",
      screenplayProjectTitle: "Mercy Court",
      screenplayTarget: "voice_pin",
      screenplayAct: "Act II",
      screenplayCharacterArcMemory: [
        {
          character: "Mara",
          act: "Act II",
          want: "expose the forged testimony",
          need: "stop hiding behind observation",
          wound: "her father's disappearance",
          falseBelief: "truth destroys anyone who says it aloud",
          currentTactic: "collecting evidence in silence",
          nextEmotionalTurn: "public courage",
        },
        {
          character: "Eli",
          act: "Act II",
          want: "keep Mara alive until dawn",
          need: "tell Mara the secret without asking permission",
          wound: "the night he abandoned the witness",
          falseBelief: "protection requires lying",
          currentTactic: "stalling with half-truths",
          nextEmotionalTurn: "chooses honesty over protection",
        },
      ],
    }
  ));

  const project = memory.screenplayProjectMemory[0];
  assert.equal(project.projectId, "mercy-court");
  assert.deepEqual(project.characterFocus, ["Mara", "Eli"]);
  assert.equal(project.protagonistWant, "expose the forged testimony");
  assert.equal(project.protagonistNeed, "stop hiding behind observation");
  assert.match(project.characterArcState, /Mara: want=expose the forged testimony/);
  assert.ok(project.unresolvedStoryThreads.some((item) => /Test Mara's false belief: truth destroys/.test(item)));
  assert.ok(project.unresolvedStoryThreads.some((item) => /Re-open Eli's wound: the night he abandoned/.test(item)));
  assert.ok(project.nextSceneMoves.some((item) => /Make Mara's current tactic fail/.test(item)));
  assert.ok(project.nextThreeTurns.some((item) => /Mara's next emotional turn: public courage/.test(item)));
  assert.ok(project.characterArcTurns.some((item) => /Eli: want=keep Mara alive until dawn/.test(item)));
  assert.ok(project.continuityNotes.some((item) => /Character bible: Mara/.test(item)));

  const prompt = buildMemoryAddendum(memory);
  assert.match(prompt, /characters:Mara, Eli/);
  assert.match(prompt, /want:expose the forged testimony/);
  assert.match(prompt, /need:stop hiding behind observation/);
  assert.match(prompt, /story_threads:Test Mara's false belief: truth destroys anyone who says it aloud/);
  assert.match(prompt, /arc_turns:Mara: want=expose the forged testimony/);
  assert.match(prompt, /next_three_turns:Mara's next emotional turn: public courage/);
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
  assert.equal(sanitized.screenplayProjectMemory[0].actProgress.currentAct, "Act III");
  assert.equal(sanitized.screenplayProjectMemory[0].actProgress.currentActKey, "act3");
  assert.equal(sanitized.screenplayProjectMemory[0].actProgress.actOneStatus, "complete");
  assert.equal(sanitized.screenplayProjectMemory[0].actProgress.actTwoStatus, "complete");
  assert.equal(sanitized.screenplayProjectMemory[0].actProgress.actThreeStatus, "active");
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
        correctedTerms: ["sealed affidavit"],
        correctionReplacements: ["sealed affidavit -> public affidavit"],
        continuityNotes: ["Authoritative user correction: public affidavit, not sealed affidavit."],
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
  assert.ok(prompt.includes("correction_memory_contract:"));
  assert.ok(prompt.includes("authoritative_replacements: sealed affidavit -> public affidavit"));
  assert.ok(prompt.includes("current_beat: Mara realizes the public affidavit points at the judge."));
  assert.ok(prompt.includes("next_three_turns:"));
  assert.ok(prompt.includes("- Mara chooses public exposure."));
  assert.ok(prompt.includes("<writer_block_memory>"));
  assert.ok(prompt.includes("correction_contract: replace sealed affidavit -> public affidavit"));
  assert.ok(prompt.includes("strongest_remembered_next_turn: Father names the lie."));
  assert.ok(prompt.includes("open_setup_to_pressure: public affidavit"));
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
        {
          summary: "Mara carries the VHS tape into the hearing.",
          projectId: "rain-docket",
          projectTitle: "Rain Docket",
          characterNames: ["Mara"],
          tags: ["screenplay", "generated-pages", "accepted-pages"],
          source: "talk_screenplay_output",
        },
      ],
      episodicSelection: {
        strategy: "hybrid_embedding",
        semanticUsed: true,
        embeddedCandidates: 7,
        missingEmbeddings: 2,
        coverageRatio: 0.778,
        backfillQueued: true,
      },
      acceptedScenes: [
        {
          sceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
          act: "Act II",
          summary: "Mara hides the red locket before the bailiff enters.",
          outcome: "The locket survives the search.",
          nextScenePlan: "Mara carries the locket into the hearing.",
          excerpt: "Mara slides the red locket behind the frozen minute hand.",
          characterNames: ["Mara", "Bailiff"],
          acceptedAt: 1_800,
        },
      ],
      acceptedCausalFacts: [
        {
          kind: "revelation",
          fact: "MARA: I forged the affidavit.",
          sourceSceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
          sourceAct: "Act II",
          ageInScenes: 9,
        },
        {
          kind: "irreversible_consequence",
          fact: "Mara burns the only copy of the affidavit.",
          sourceSceneHeading: "INT. ARCHIVE - NIGHT",
          sourceAct: "Act II",
          ageInScenes: 8,
        },
      ],
      dueStoryThread: {
        kind: "payoff",
        setup: "The red locket hidden in the courthouse clock.",
        promisedPayoff: "Mara uses the locket to expose who altered the verdict.",
        sourceSceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
        sourceSceneSummary: "Mara hides the red locket before the bailiff enters.",
        sourceSceneOutcome: "The locket survives the search.",
        sourceAct: "Act II",
        ageInScenes: 17,
        acceptedSceneCount: 42,
      },
      style: { preferredTone: "restrained" },
    },
    {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      query: "Continue Mara and the corrected evidence.",
      screenplayProjectMemory: {
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        act: "Act II",
        featureSequence: "Act II - Reversal Fallout",
        currentBeat: "Mara sees the sealed affidavit under the vent.",
        nextScenePlan: "Force Mara to use the affidavit in public.",
        nextThreeTurns: [
          "Mara pockets the affidavit.",
          "Eli forces a public choice.",
        ],
        actThreePayoffPath: [
          "The affidavit becomes courtroom testimony.",
        ],
        unresolvedSetups: ["sealed affidavit"],
        unresolvedStoryThreads: ["Who forged the testimony?"],
        characterArcTurns: ["Mara chooses exposure over control."],
        imageMotifs: ["rain-swollen vent"],
        correctedTerms: ["cassette"],
        correctionReplacements: ["cassette -> VHS tape"],
        continuityNotes: ["Authoritative user correction: VHS tape, not cassette."],
      },
    }
  );

  assert.equal(trace.applied, true);
  assert.equal(trace.project_id, "rain-docket");
  assert.equal(trace.project_title, "Rain Docket");
  assert.equal(trace.character_count, 1);
  assert.equal(trace.episodic_count, 2);
  assert.equal(trace.accepted_scene_count, 1);
  assert.deepEqual(trace.accepted_scenes[0], {
    scene_heading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
    act: "Act II",
    summary: "Mara hides the red locket before the bailiff enters.",
    outcome: "The locket survives the search.",
    next_scene_plan: "Mara carries the locket into the hearing.",
    excerpt: "Mara slides the red locket behind the frozen minute hand.",
    characters: ["Mara", "Bailiff"],
    accepted_at: 1_800,
  });
  assert.deepEqual(trace.due_story_thread, {
    kind: "payoff",
    setup: "The red locket hidden in the courthouse clock.",
    promised_payoff: "Mara uses the locket to expose who altered the verdict.",
    source_scene_heading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
    source_scene_summary: "Mara hides the red locket before the bailiff enters.",
    source_scene_outcome: "The locket survives the search.",
    source_act: "Act II",
    age_in_scenes: 17,
    accepted_scene_count: 42,
  });
  assert.deepEqual(trace.accepted_causal_facts, [
    {
      kind: "revelation",
      fact: "MARA: I forged the affidavit.",
      source_scene_heading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
      source_act: "Act II",
      age_in_scenes: 9,
    },
    {
      kind: "irreversible_consequence",
      fact: "Mara burns the only copy of the affidavit.",
      source_scene_heading: "INT. ARCHIVE - NIGHT",
      source_act: "Act II",
      age_in_scenes: 8,
    },
  ]);
  assert.equal(trace.correction_count, 3);
  assert.deepEqual(trace.corrected_terms, ["mother", "cassette"]);
  assert.deepEqual(trace.correction_replacements, ["mother -> Eli's sister", "cassette -> VHS tape"]);
  assert.equal(trace.characters[0].name, "Mara");
  assert.equal(trace.characters[0].has_corrections, true);
  assert.match(trace.episodic[0].summary, /Correction for Mara/);
  assert.equal(trace.episodic[0].correction, true);
  assert.equal(trace.episodic[0].authority, "user_correction");
  assert.equal(trace.episodic[1].authority, "accepted_page");
  assert.deepEqual(trace.episodic_retrieval, {
    strategy: "hybrid_embedding",
    semantic_used: true,
    embedded_candidates: 7,
    missing_embeddings: 2,
    coverage_ratio: 0.778,
    backfill_queued: true,
  });
  assert.equal(trace.screenplay_project_memory.applied, true);
  assert.equal(trace.screenplay_project_memory.project_id, "rain-docket");
  assert.equal(trace.screenplay_project_memory.act, "Act II");
  assert.equal(trace.screenplay_project_memory.has_corrections, true);
  assert.deepEqual(trace.screenplay_project_memory.corrected_terms, ["cassette"]);
  assert.deepEqual(trace.screenplay_project_memory.correction_replacements, ["cassette -> VHS tape"]);
  assert.match(trace.screenplay_project_memory.correction_contract, /CORRECTION_CONTRACT/);
  assert.deepEqual(trace.screenplay_project_memory.next_three_turns, [
    "Mara pockets the affidavit.",
    "Eli forces a public choice.",
  ]);
  assert.deepEqual(trace.screenplay_project_memory.act_three_payoff_path, [
    "The affidavit becomes courtroom testimony.",
  ]);
  assert.deepEqual(trace.screenplay_project_memory.character_arc_turns, [
    "Mara chooses exposure over control.",
  ]);
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
  assert.equal(snapshot.act_progress.current_act, "Act II");
  assert.equal(snapshot.act_progress.current_act_key, "act2");
  assert.equal(snapshot.act_progress.current_sequence, "Act II - Midpoint Pressure");
  assert.equal(snapshot.act_progress.current_obligation, "Turn victory into a trap that forces public action.");
  assert.equal(snapshot.act_progress.page_progress, "47/105");
  assert.equal(snapshot.act_progress.act_i, "complete");
  assert.equal(snapshot.act_progress.act_ii, "active");
  assert.equal(snapshot.act_progress.act_iii, "pending");
  assert.match(snapshot.act_progress.next_act_bridge, /Act II tactic/);
  assert.equal(snapshot.act_progress.completion_focus, "Spend next remembered turn first: Father names the lie.");
  assert.ok(snapshot.opening_line.includes("Welcome back."));
  assert.ok(snapshot.opening_line.includes("Rain Docket"));
  assert.ok(snapshot.opening_line.includes("Next move: Move into a private corridor confrontation."));
});

test("[persistent-screenplay-memory] cold session restores from durable project continuity", () => {
  const snapshot = buildSessionContinuitySnapshot(createEmptyEmotionMemory(), {
    projectContinuity: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      act: "Act II",
      featureSequence: "Midpoint pressure",
      featureObligation: "Turn private proof into a public choice.",
      actPressureState: "Mara can no longer protect Eli and expose the judge.",
      sceneObjective: "Force Mara to choose between Eli and public truth.",
      sceneSummary: "Eli corners Mara beside the sealed records room.",
      currentBeat: "Eli catches Mara hiding the affidavit.",
      lastSceneOutcome: "The affidavit is no longer secret.",
      nextScenePlan: "Force Mara to choose between Eli and public truth.",
      centralQuestion: "Can Mara expose the court without sacrificing Eli?",
      nextSceneMoves: ["Eli demands the truth.", "Mara chooses a protective lie."],
      nextThreeTurns: [
        "Eli demands the truth.",
        "Mara lies to protect him.",
        "The judge moves the witness.",
      ],
      beatSequence: ["Affidavit found", "Eli catches the lie", "Witness moved"],
      unresolvedSetups: ["The sister's voicemail"],
      unresolvedStoryThreads: ["Who forged the first report?"],
      actThreePayoffPath: ["The voicemail becomes testimony"],
      characterFocus: ["Mara", "Eli"],
      characterArcState: "Mara protects Eli by lying.",
      characterArcTurns: ["Mara chooses protection over truth."],
      imageMotifs: ["charcoal dust"],
      continuityNotes: ["Authoritative correction: VHS tape, not cassette."],
      correctedTerms: ["cassette"],
      correctionReplacements: ["cassette -> VHS tape"],
      emotionalContinuity: "Mara is ashamed but committed.",
      pageCount: 54,
      targetPages: 108,
      updatedAt: 2_400,
    },
    acceptedScenes: [
      {
        sceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
        act: "Act II",
        featureSequence: "Act II - Bad Guys Close In",
        summary: "Mara retrieves the locket while Eli holds the stairwell.",
        outcome: "Judge Vale sees the locket in Mara's hand.",
        nextScenePlan: "Mara enters the hearing before Vale can seal the room.",
        excerpt: "Mara closes her fist around the red locket as the alarm wakes.",
        characterNames: ["Mara", "Eli", "Judge Vale"],
        acceptedAt: 2_600,
      },
    ],
    acceptedCausalFacts: [{
      kind: "irreversible_consequence",
      fact: "Mara burns the only copy of the sealed affidavit.",
      sourceSceneHeading: "INT. ARCHIVE - NIGHT",
      sourceAct: "Act II",
      ageInScenes: 8,
    }],
    dueStoryThread: {
      kind: "payoff",
      setup: "The red locket hidden in the courthouse clock.",
      promisedPayoff: "Mara uses the locket to expose who altered the verdict.",
      sourceSceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
      sourceSceneSummary: "Mara hid the locket behind the frozen minute hand.",
      sourceSceneOutcome: "The locket survived the bailiff's search.",
      sourceAct: "Act II",
      ageInScenes: 17,
      acceptedSceneCount: 42,
    },
    episodicMemories: [
      {
        projectId: "night-train",
        projectTitle: "Night Train",
        summary: "A different screenplay's latest scene.",
        excerpt: "Mara uncouples the final carriage.",
        updatedAt: 2_500,
      },
    ],
  });

  assert.equal(snapshot.has_continuity, true);
  assert.equal(snapshot.source, "creative_project_continuity");
  assert.equal(snapshot.project_id, "rain-docket");
  assert.equal(snapshot.project_title, "Rain Docket");
  assert.equal(snapshot.act, "Act II");
  assert.equal(snapshot.feature_sequence, "Act II - Bad Guys Close In");
  assert.equal(snapshot.scene_summary, "Mara retrieves the locket while Eli holds the stairwell.");
  assert.equal(snapshot.current_beat, "Mara retrieves the locket while Eli holds the stairwell.");
  assert.equal(snapshot.central_question, "Can Mara expose the court without sacrificing Eli?");
  assert.equal(snapshot.last_scene_outcome, "Judge Vale sees the locket in Mara's hand.");
  assert.equal(snapshot.next_scene_plan, "Mara enters the hearing before Vale can seal the room.");
  assert.deepEqual(snapshot.next_scene_moves, ["Eli demands the truth.", "Mara chooses a protective lie."]);
  assert.deepEqual(snapshot.unresolved_setups, ["The sister's voicemail"]);
  assert.deepEqual(snapshot.unresolved_story_threads, ["Who forged the first report?"]);
  assert.deepEqual(snapshot.act_three_payoff_path, ["The voicemail becomes testimony"]);
  assert.deepEqual(snapshot.character_focus, ["Mara", "Eli", "Judge Vale"]);
  assert.equal(snapshot.character_arc_state, "Mara protects Eli by lying.");
  assert.equal(snapshot.emotional_continuity, "Mara is ashamed but committed.");
  assert.deepEqual(snapshot.corrected_terms, ["cassette"]);
  assert.deepEqual(snapshot.correction_replacements, ["cassette -> VHS tape"]);
  assert.match(snapshot.correction_contract, /cassette -> VHS tape/);
  assert.equal(snapshot.is_correction, true);
  assert.equal(snapshot.page_count, 54);
  assert.equal(snapshot.target_pages, 108);
  assert.equal(snapshot.memory_excerpt, "Mara closes her fist around the red locket as the alarm wakes.");
  assert.equal(snapshot.updated_at, 2_600);
  assert.deepEqual(snapshot.due_story_thread, {
    kind: "payoff",
    setup: "The red locket hidden in the courthouse clock.",
    promised_payoff: "Mara uses the locket to expose who altered the verdict.",
    source_scene_heading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
    source_scene_summary: "Mara hid the locket behind the frozen minute hand.",
    source_scene_outcome: "The locket survived the bailiff's search.",
    source_act: "Act II",
    age_in_scenes: 17,
    accepted_scene_count: 42,
  });
  assert.deepEqual(snapshot.accepted_causal_facts, [{
    kind: "irreversible_consequence",
    fact: "Mara burns the only copy of the sealed affidavit.",
    source_scene_heading: "INT. ARCHIVE - NIGHT",
    source_act: "Act II",
    age_in_scenes: 8,
  }]);
  assert.ok(snapshot.opening_line.includes("Rain Docket"));
  assert.ok(snapshot.opening_line.includes("Act II / Act II - Bad Guys Close In"));
  assert.ok(snapshot.opening_line.includes("Judge Vale sees the locket in Mara's hand."));
  assert.ok(snapshot.opening_line.includes("The thread waiting longest is The red locket hidden in the courthouse clock"));
  assert.ok(snapshot.opening_line.includes("still open after 17 accepted scenes"));
  assert.ok(snapshot.opening_line.includes("Its promised payoff is Mara uses the locket to expose who altered the verdict."));
  assert.ok(snapshot.opening_line.includes("Next move: Mara enters the hearing before Vale can seal the room."));
  assert.ok(snapshot.opening_line.includes("One accepted consequence stays binding: Mara burns the only copy of the sealed affidavit."));
  assert.ok(snapshot.opening_line.indexOf("Next move:") < snapshot.opening_line.indexOf("One accepted consequence stays binding:"));
  assert.doesNotMatch(JSON.stringify(snapshot), /Night Train|uncouples/);
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

test("[persistent-screenplay-memory] session continuity marks project corrections authoritative", () => {
  const memory = {
    ...createEmptyEmotionMemory(),
    screenplayProjectMemory: sanitizeScreenplayProjectMemoryItems([
      {
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        act: "Act II",
        currentBeat: "Mara protects Eli with the VHS tape.",
        nextScenePlan: "Make the VHS tape public.",
        characterFocus: ["Mara"],
        correctedTerms: ["cassette"],
        correctionReplacements: ["cassette -> VHS tape"],
        continuityNotes: ["Authoritative user correction: VHS tape, not cassette."],
        updatedAt: 1_500,
      },
    ]),
    screenplayProjectMemoryUpdatedAt: 1_500,
  };

  const snapshot = buildSessionContinuitySnapshot(memory, null);
  assert.equal(snapshot.has_continuity, true);
  assert.equal(snapshot.source, "screenplay_project_memory");
  assert.equal(snapshot.is_correction, true);
  assert.deepEqual(snapshot.corrected_terms, ["cassette"]);
  assert.deepEqual(snapshot.correction_replacements, ["cassette -> VHS tape"]);
  assert.match(snapshot.correction_contract, /CORRECTION_CONTRACT/);
  assert.ok(snapshot.opening_line.includes("I'll honor your latest correction first."));
});
