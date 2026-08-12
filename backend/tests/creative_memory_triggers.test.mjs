// T08w-triggers: tests for recordTriggersFromTalkTurn.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildCharacterFieldProvenance,
  buildProjectFieldProvenance,
  createCreativeMemoryStore,
} from "../lib/creative_memory_store.js";
import {
  buildStoryMoveTasteProfile,
  rankStoryRescueMovesForContext,
} from "../lib/story_rescue_move_library.js";

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

test("recordTriggersFromTalkTurn learns a short answer to Clementine's planned story question", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-learning-answer",
    transcript: "Freedom.",
    reply: "Then every rescue attempt should threaten to become another cage.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    learningContext: {
      questionId: "screenplay-learning-8-character.want",
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      targetField: "character.want",
      targetLabel: "Mara's dramatic want",
      anchor: "Mara",
      question: "What does Mara want badly enough to keep choosing danger instead of safety?",
      authority: "writer_clarification",
    },
  });

  assert.equal(summary.learningAnswersRecorded, 1);
  assert.equal(summary.learningAnswersPromoted, 1);
  assert.equal(summary.episodicMemories, 1);

  const restartedStore = createCreativeMemoryStore({ persistence });
  const memory = await restartedStore.getCreativeMemoryForPrompt({
    userId: "u-trig-learning-answer",
    projectId: "split-ferries",
    query: "What does Mara want?",
  });
  const mara = memory.characters.find((item) => item.name === "Mara");
  assert.equal(mara.bible.arc.want, "Freedom");
  assert.equal(mara.bible.learnedFields[0].field, "want");
  assert.equal(mara.bible.learnedFields[0].questionId, "screenplay-learning-8-character.want");
  assert.equal(
    mara.bible.learnedFields[0].question,
    "What does Mara want badly enough to keep choosing danger instead of safety?"
  );
  assert.equal(mara.bible.learnedFields[0].anchor, "Mara");
  assert.deepEqual(
    buildCharacterFieldProvenance(mara.bible).map(({ field, value, status, source }) => ({
      field,
      value,
      status,
      source,
    })),
    [{
      field: "want",
      value: "Freedom",
      status: "current",
      source: "screenplay_learning_confirmation",
    }]
  );
  assert.ok(mara.bible.canon.some((item) => /Mara's want: Freedom/i.test(item)));
  assert.equal(memory.episodicMemories.length, 1);
  assert.match(memory.episodicMemories[0].summary, /Writer clarified Mara's dramatic want: Freedom/);
  assert.ok(memory.episodicMemories[0].tags.includes("writer-clarification"));
  assert.ok(memory.episodicMemories[0].tags.includes("question-answer"));
  assert.equal(memory.episodicMemories[0].tags.includes("correction"), false);
});

test("memory storage downgrades and discards an uncertain clarification from any caller", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const question = {
    questionId: "screenplay-learning-9-character.want",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    targetField: "character.want",
    targetLabel: "Mara's dramatic want",
    anchor: "Mara",
    question: "What does Mara want badly enough to choose danger?",
    askedAt: 1_725_000_000_000,
    authority: "writer_clarification",
  };
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-rejected-learning-answer",
    transcript: "Actually, I'm not sure. Help me brainstorm whether Mara wants freedom.",
    reply: "Let's explore several possibilities.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    learningContext: question,
    questionInteraction: {
      ...question,
      responseStatus: "answered",
      respondedAt: 1_725_000_001_000,
    },
  });

  assert.equal(summary.learningAnswersRecorded, 0);
  assert.equal(summary.learningAnswersPromoted, 0);
  assert.equal(summary.episodicMemories, 0);
  assert.equal(summary.corrections, 0);
  assert.equal(summary.structuredCharacterBibles, 0);
  assert.equal(summary.questionInteractionsRecorded, 1);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-rejected-learning-answer",
    projectId: "split-ferries",
    query: "What does Mara want?",
  });
  assert.equal((memory.episodicMemories || []).length, 0);
  assert.equal((memory.characters || []).some((item) => item.bible?.arc?.want), false);
  const outcome = memory.projectContinuity.questionEffectiveness.find(
    (item) => item.questionId === question.questionId
  );
  assert.equal(outcome.responseStatus, "declined");
  assert.equal(outcome.outcome, "declined");
});

test("memory storage promotes only the explicitly selected provisional option", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const options = [
    {
      id: "option-1",
      rank: 1,
      value: "Mara controls every ferry departure by stealing the harbor keys.",
      recommended: true,
      moveFamily: "reversal_pressure",
    },
    {
      id: "option-2",
      rank: 2,
      value: "Mara tells June the truth and asks her to choose the crossing.",
      recommended: false,
      moveFamily: "relationship_pressure",
    },
    {
      id: "option-3",
      rank: 3,
      value: "Mara destroys the manifest and forces both sisters to move without proof.",
      recommended: false,
      moveFamily: "obstacle_pressure",
    },
  ];
  const context = {
    questionId: "screenplay-options-14-character.current_tactic",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    targetField: "character.current_tactic",
    targetLabel: "Mara's Act II tactic",
    anchor: "Mara",
    question: "Which path should become true: Option 1, 2, or 3?",
    actKey: "act2",
    sequenceKey: "midpoint",
    authority: "writer_clarification",
    provisionalOptions: options,
    selectedOptionId: "option-2",
    selectedOptionRank: 2,
    askedAt: 1_725_000_000_000,
  };
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-provisional-selection",
    transcript: "Option 2.",
    reply: "Then the midpoint turns on June's agency, not Mara's control.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    learningContext: context,
    questionInteraction: {
      ...context,
      responseStatus: "answered",
      respondedAt: 1_725_000_001_000,
    },
  });

  assert.equal(summary.learningAnswersRecorded, 1);
  assert.equal(summary.learningAnswersPromoted, 1);
  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-provisional-selection",
    projectId: "split-ferries",
    query: "What is Mara's tactic at the midpoint?",
  });
  const mara = memory.characters.find((item) => item.name === "Mara");
  assert.equal(
    mara.bible.arc.currentTactic,
    "Mara tells June the truth and asks her to choose the crossing"
  );
  const storedText = JSON.stringify(memory);
  assert.doesNotMatch(storedText, /stealing the harbor keys/i);
  assert.doesNotMatch(storedText, /destroys the manifest/i);
  assert.match(memory.episodicMemories[0].summary, /tells June the truth/i);
  assert.doesNotMatch(memory.episodicMemories[0].excerpt, /Option 2/i);
  assert.equal(
    memory.projectContinuity.questionEffectiveness[0].selectedMoveFamily,
    "relationship_pressure"
  );
  assert.deepEqual(
    memory.projectContinuity.questionEffectiveness[0].offeredMoveFamilies,
    ["reversal_pressure", "relationship_pressure", "obstacle_pressure"]
  );

  const accepted = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-provisional-selection",
    transcript: "Keep that version.",
    reply: "INT. EAST FERRY DOCK - NIGHT",
    acceptedPageText: [
      "INT. EAST FERRY DOCK - NIGHT",
      "",
      "Mara puts the manifest in June's hand.",
    ].join("\n"),
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
  });
  assert.equal(accepted.questionAcceptedPageOutcomes, 1);
  const afterAcceptedPage = await store.getCreativeMemoryForPrompt({
    userId: "u-trig-provisional-selection",
    projectId: "split-ferries",
    query: "What kinds of story moves have worked for this screenplay?",
  });
  assert.equal(
    afterAcceptedPage.projectContinuity.questionEffectiveness[0].acceptedPageCount,
    1
  );
});

test("confirmed story questions populate Story Spine fields across store restarts", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const centralQuestion = "Can Mara expose the truth without becoming her father?";
  const summary = await store.recordTriggersFromTalkTurn({
    userId: "u-trig-learning-story-spine",
    transcript: centralQuestion,
    reply: "Good. That question can tighten every sequence toward the climax.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    learningContext: {
      questionId: "screenplay-learning-12-project.central_question",
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      targetField: "project.central_question",
      targetLabel: "the feature's central dramatic question",
      anchor: "Rain Docket",
      question: "What single dramatic question should the feature keep tightening?",
      authority: "writer_clarification",
    },
  });

  assert.equal(summary.learningAnswersRecorded, 1);
  assert.equal(summary.learningAnswersPromoted, 1);
  const restartedStore = createCreativeMemoryStore({ persistence });
  const memory = await restartedStore.getCreativeMemoryForPrompt({
    userId: "u-trig-learning-story-spine",
    projectId: "rain-docket",
    query: "What question drives the whole feature?",
  });
  assert.equal(memory.projectContinuity.centralQuestion, centralQuestion);
  const [provenance] = buildProjectFieldProvenance(memory.projectContinuity);
  assert.equal(provenance.field, "centralQuestion");
  assert.equal(provenance.value, centralQuestion);
  assert.equal(provenance.status, "current");
  assert.equal(provenance.questionId, "screenplay-learning-12-project.central_question");
  assert.equal(provenance.anchor, "Rain Docket");
  assert.ok(memory.projectContinuity.continuityNotes.some((item) => (
    /Writer clarified central question/.test(item)
  )));
});

test("confirmed questions learn from committed pages and explicit writer-block recovery", async () => {
  const persistence = freshPersistence();
  const userId = "u-question-effectiveness";
  let store = createCreativeMemoryStore({ persistence });
  const answer = await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Mara burns the private route and asks Eli to steer.",
    reply: "That choice can turn the premise into a consequence.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    learningContext: {
      questionId: "screenplay-learning-14-story.next_irreversible_choice",
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      targetField: "story.next_irreversible_choice",
      targetLabel: "the next irreversible choice",
      anchor: "Mara",
      question: "Which safe option should Mara lose in the next scene?",
      authority: "writer_clarification",
      actKey: "act2",
      sequenceKey: "premise",
      writerBlocked: true,
    },
  });

  assert.equal(answer.questionOutcomesRecorded, 1);
  let memory = await store.getCreativeMemoryForPrompt({
    userId,
    projectId: "split-ferries",
  });
  assert.equal(memory.projectContinuity.questionEffectiveness.length, 1);
  assert.equal(memory.projectContinuity.questionEffectiveness[0].outcome, "awaiting_outcome");
  assert.equal(memory.projectContinuity.questionEffectiveness[0].sequenceKey, "premise");
  assert.equal(memory.projectContinuity.questionEffectiveness[0].writerBlocked, true);

  const page = `INT. FERRY WHEELHOUSE - NIGHT

Mara strikes a match under the private route map.

MARA
Your turn.

Eli takes the wheel as the map burns between them.`;
  const accepted = await store.recordTriggersFromTalkTurn({
    userId,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    acceptedPageText: page,
  });
  assert.equal(accepted.questionAcceptedPageOutcomes, 1);

  const recovered = await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "That solved the block. Now I know what happens next.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
  });
  assert.equal(recovered.questionBlockResolutions, 1);

  store = createCreativeMemoryStore({ persistence });
  memory = await store.getCreativeMemoryForPrompt({
    userId,
    projectId: "split-ferries",
  });
  const [outcome] = memory.projectContinuity.questionEffectiveness;
  assert.equal(outcome.questionId, "screenplay-learning-14-story.next_irreversible_choice");
  assert.equal(outcome.acceptedPageCount, 1);
  assert.equal(outcome.blockResolutionCount, 1);
  assert.equal(outcome.outcome, "accepted_pages_and_block_resolved");

  const repeated = await store.recordTriggersFromTalkTurn({
    userId,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    acceptedPageText: page,
  });
  assert.equal(repeated.questionAcceptedPageOutcomes, 0);
});

test("delivered rescue moves earn taste only after pages or explicit block recovery", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-rescue-learning-"));
  let persistence = createJsonPersistence({ jsonRoot: root });
  const userId = "u-delivered-rescue-outcome";
  let store = createCreativeMemoryStore({ persistence });
  const deliveredAt = Date.now();
  const delivered = await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "I'm stuck in the middle.",
    reply: "Use a reversal that makes Mara's old tactic cost Eli's trust.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    questionInteraction: {
      questionId: "writer-block-rescue-req-42",
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      targetField: "story.writer_block_rescue",
      targetLabel: "the delivered writer-block rescue",
      anchor: "relationship_pressure",
      question: "Which delivered story move gets the writer moving again?",
      actKey: "act2",
      sequenceKey: "premise",
      writerBlocked: true,
      recommendationOnly: true,
      selectedMoveFamily: "relationship_pressure",
      offeredMoveFamilies: [
        "reversal_pressure",
        "relationship_pressure",
        "obstacle_pressure",
      ],
      askedAt: deliveredAt,
      respondedAt: deliveredAt,
      responseStatus: "answered",
    },
  });
  assert.equal(delivered.questionInteractionsRecorded, 1);

  let memory = await store.getCreativeMemoryForPrompt({
    userId,
    projectId: "split-ferries",
  });
  let [outcome] = memory.projectContinuity.questionEffectiveness;
  assert.equal(outcome.recommendationOnly, true);
  assert.equal(outcome.selectedMoveFamily, "relationship_pressure");
  assert.equal(
    buildStoryMoveTasteProfile(memory.projectContinuity.questionEffectiveness).length,
    0,
  );
  const rescueContext = {
    transcript: "I am stuck in the middle.",
    act: "Act II",
  };
  assert.equal(
    rankStoryRescueMovesForContext({
      ...rescueContext,
      questionEffectiveness: memory.projectContinuity.questionEffectiveness,
    })[0].key,
    "reversal_pressure",
  );

  await persistence.close();
  persistence = createJsonPersistence({ jsonRoot: root });
  store = createCreativeMemoryStore({ persistence });

  await store.recordTriggersFromTalkTurn({
    userId,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    acceptedPageText: "INT. FERRY - NIGHT\n\nMara burns the safe route. Eli takes the wheel.",
  });
  await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "That solved the block. I know what happens next.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
  });

  await persistence.close();
  persistence = createJsonPersistence({ jsonRoot: root });
  store = createCreativeMemoryStore({ persistence });

  memory = await store.getCreativeMemoryForPrompt({
    userId,
    projectId: "split-ferries",
  });
  [outcome] = memory.projectContinuity.questionEffectiveness;
  assert.equal(outcome.acceptedPageCount, 1);
  assert.equal(outcome.blockResolutionCount, 1);
  const profile = buildStoryMoveTasteProfile(memory.projectContinuity.questionEffectiveness);
  const relationship = profile.find((item) => item.family === "relationship_pressure");
  assert.equal(relationship.selectedCount, 1);
  assert.equal(relationship.acceptedPageCount, 1);
  assert.equal(relationship.blockResolutionCount, 1);
  assert.ok(relationship.tasteBonus > 0);
  assert.equal(
    rankStoryRescueMovesForContext({
      ...rescueContext,
      questionEffectiveness: memory.projectContinuity.questionEffectiveness,
    })[0].key,
    "relationship_pressure",
  );
  assert.equal(
    rankStoryRescueMovesForContext({
      transcript: "I am stuck at the ending.",
      act: "Act III",
      dueStoryThread: {
        setup: "Mara hid the red ferry key in Eli's coat.",
        promisedPayoff: "Eli returns the key when Mara finally trusts him with the crossing.",
        ageInScenes: 38,
      },
      questionEffectiveness: memory.projectContinuity.questionEffectiveness,
    })[0].key,
    "payoff_pressure",
  );
  await persistence.close();
});

test("asked and ignored screenplay questions persist without earning false page credit", async () => {
  const persistence = freshPersistence();
  const userId = "u-question-intervention-cadence";
  let store = createCreativeMemoryStore({ persistence });
  const baseInteraction = {
    questionId: "screenplay-learning-18-project.theme_argument",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    targetField: "project.theme_argument",
    targetLabel: "the feature's thematic argument",
    anchor: "Split Ferries",
    question: "What should this feature ultimately argue about love and control?",
    actKey: "act2",
    sequenceKey: "fallout",
    writerBlocked: false,
    askedAt: 1_000,
  };
  const asked = await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Let's work on the midpoint fallout.",
    reply: baseInteraction.question,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    questionInteraction: {
      ...baseInteraction,
      responseStatus: "asked",
      respondedAt: 0,
    },
  });
  assert.equal(asked.questionInteractionsRecorded, 1);

  const ignored = await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Let's keep moving.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    questionInteraction: {
      ...baseInteraction,
      responseStatus: "expired",
      respondedAt: 4_000,
    },
  });
  assert.equal(ignored.questionInteractionsRecorded, 1);

  const accepted = await store.recordTriggersFromTalkTurn({
    userId,
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    acceptedPageText: `INT. FERRY CABIN - NIGHT

Mara locks the wheel and kills the engine.`,
  });
  assert.equal(accepted.questionAcceptedPageOutcomes, 0);

  store = createCreativeMemoryStore({ persistence });
  const memory = await store.getCreativeMemoryForPrompt({
    userId,
    projectId: "split-ferries",
  });
  const [interaction] = memory.projectContinuity.questionEffectiveness;
  assert.equal(interaction.questionId, baseInteraction.questionId);
  assert.equal(interaction.askedAt, 1_000);
  assert.equal(interaction.respondedAt, 4_000);
  assert.equal(interaction.responseStatus, "expired");
  assert.equal(interaction.outcome, "ignored");
  assert.equal(interaction.answeredAt, undefined);
  assert.equal(interaction.acceptedPageCount, undefined);
});

test("authoritative corrections block stale clarification replay across sessions", async () => {
  const persistence = freshPersistence();
  const userId = "u-trig-learning-correction-safe";
  const learningContext = {
    questionId: "screenplay-learning-3-character.false_belief",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    targetField: "character.false_belief",
    targetLabel: "Mara's false belief",
    anchor: "Mara",
    question: "What false belief is Mara still using to survive?",
    authority: "writer_clarification",
  };
  let store = createCreativeMemoryStore({ persistence });
  await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Perfect proof can keep everyone safe.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    learningContext,
  });
  await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Actually, Mara's false belief is that truth will get Eli killed, not that perfect proof can keep everyone safe.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });

  const beforeReplayMemory = await store.getCreativeMemoryForPrompt({
    userId,
    projectId: "rain-docket",
    query: "What does Mara falsely believe?",
  });
  const beforeReplayMara = beforeReplayMemory.characters.find((item) => item.name === "Mara");

  store = createCreativeMemoryStore({ persistence });
  const replay = await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Perfect proof can keep everyone safe.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    learningContext,
  });
  assert.equal(replay.learningAnswersPromoted, 0);
  assert.equal(replay.learningAnswersCorrectionProtected, 1);
  assert.equal(replay.learningAnswersRecorded, 0);

  const restartedStore = createCreativeMemoryStore({ persistence });
  const memory = await restartedStore.getCreativeMemoryForPrompt({
    userId,
    projectId: "rain-docket",
    query: "What does Mara falsely believe?",
  });
  const mara = memory.characters.find((item) => item.name === "Mara");
  assert.equal(mara.bible.arc.falseBelief, "truth will get Eli killed");
  assert.equal(mara.source, beforeReplayMara.source);
  assert.equal(mara.updatedAt, beforeReplayMara.updatedAt);
  assert.equal(
    mara.bible.authoritativeFields.find((item) => item.field === "falseBelief")?.source,
    "writer_correction"
  );
  const correctedField = buildCharacterFieldProvenance(mara.bible)
    .find((item) => item.field === "falseBelief");
  assert.equal(correctedField.status, "corrected");
  assert.equal(correctedField.value, "truth will get Eli killed");
  assert.equal(correctedField.learnedValue, "Perfect proof can keep everyone safe");
  assert.equal(correctedField.questionId, learningContext.questionId);
  assert.equal(correctedField.anchor, "Mara");
  assert.match(correctedField.correctionText, /truth will get Eli killed/i);
  assert.ok(!JSON.stringify(memory).includes("Writer clarified Mara's false belief: Perfect proof"));
});

test("Story Spine corrections block stale clarification replay across sessions", async () => {
  const persistence = freshPersistence();
  const userId = "u-trig-learning-story-spine-correction-safe";
  const learningContext = {
    questionId: "screenplay-learning-6-project.central_question",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    targetField: "project.central_question",
    targetLabel: "the feature's central dramatic question",
    anchor: "Rain Docket",
    question: "What dramatic question should every sequence tighten?",
    authority: "writer_clarification",
  };
  let store = createCreativeMemoryStore({ persistence });
  await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Whether Mara can save the ferry without losing Eli.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    learningContext,
  });
  await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Actually, the central question is whether Mara can expose the truth without becoming her father, not whether Mara can save the ferry without losing Eli.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
  });

  store = createCreativeMemoryStore({ persistence });
  const replay = await store.recordTriggersFromTalkTurn({
    userId,
    transcript: "Whether Mara can save the ferry without losing Eli.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    learningContext,
  });
  assert.equal(replay.learningAnswersPromoted, 0);
  assert.equal(replay.learningAnswersCorrectionProtected, 1);
  assert.equal(replay.learningAnswersRecorded, 0);

  const restartedStore = createCreativeMemoryStore({ persistence });
  const memory = await restartedStore.getCreativeMemoryForPrompt({
    userId,
    projectId: "rain-docket",
    query: "What is the central dramatic question?",
  });
  assert.equal(
    memory.projectContinuity.centralQuestion,
    "whether Mara can expose the truth without becoming her father"
  );
  const correctedField = buildProjectFieldProvenance(memory.projectContinuity)
    .find((item) => item.field === "centralQuestion");
  assert.equal(correctedField.status, "corrected");
  assert.equal(correctedField.learnedValue, "Whether Mara can save the ferry without losing Eli");
  assert.match(correctedField.value, /expose the truth without becoming her father/i);
  assert.ok(!JSON.stringify(memory).includes("Writer clarified the feature's central dramatic question: Whether Mara can save"));
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

test("explicit Story Spine corrections stay authoritative without an accepted-page match", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  await store.recordProjectContinuity({
    userId: "u-explicit-story-spine-authority",
    continuity: {
      projectId: "red-key",
      projectTitle: "Red Key",
      unresolvedSetups: ["The blue key under the floorboard"],
    },
  });
  const correction = await store.recordTriggersFromTalkTurn({
    userId: "u-explicit-story-spine-authority",
    transcript: "Actually, the unresolved setup is the red key inside Mara's locket, not the blue key under the floorboard.",
    projectId: "red-key",
    projectTitle: "Red Key",
    source: "talk_turn",
  });
  assert.equal(correction.acceptedCanonFactsRetired, 0);
  assert.equal(correction.writerCanonFactsRecorded, 0);
  let ledger = await store.getCreativeMemoryLedger({ userId: "u-explicit-story-spine-authority" });
  let project = ledger.projects.find((item) => item.projectId === "red-key");
  assert.equal(project.unresolvedSetups[0], "the red key inside Mara's locket");
  assert.equal(project.authoritativeFields[0].field, "unresolvedSetups");

  await store.recordProjectContinuity({
    userId: "u-explicit-story-spine-authority",
    continuity: {
      projectId: "red-key",
      projectTitle: "Red Key",
      unresolvedSetups: ["The blue key under the floorboard"],
    },
  });
  const restored = createCreativeMemoryStore({ persistence });
  const memory = await restored.getCreativeMemoryForPrompt({
    userId: "u-explicit-story-spine-authority",
    projectId: "red-key",
    projectTitle: "Red Key",
    query: "Continue from the unresolved setup.",
  });
  assert.equal(memory.projectContinuity.unresolvedSetups[0], "the red key inside Mara's locket");
  assert.equal(memory.projectContinuity.authoritativeFields[0].field, "unresolvedSetups");
  assert.match(memory.projectContinuity.authoritativeFields[0].sourceCorrectionId, /^writer_correction_/);
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

test("a writer's Memories edit supersedes automatic Character Bible authority", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  await store.recordTriggersFromTalkTurn({
    userId: "u-character-manual-authority",
    transcript: "Actually, Mara's wound is that her father vanished during the flood, not that he abandoned her.",
    projectId: "flood-record",
    projectTitle: "Flood Record",
    source: "talk_turn",
  });
  await store.recordCharacterMention({
    userId: "u-character-manual-authority",
    characterName: "Mara",
    source: "memory_character_bible_edit",
    metadata: { projectId: "flood-record", projectTitle: "Flood Record" },
    characterBible: {
      arc: { wound: "she chose to leave her father behind" },
      corrections: ["Writer corrected Mara's wound in Memories."],
    },
  });
  await store.recordCharacterMention({
    userId: "u-character-manual-authority",
    characterName: "Mara",
    source: "realtime_turn_commit",
    metadata: { projectId: "flood-record", projectTitle: "Flood Record" },
    characterBible: { arc: { wound: "her father vanished during the flood" } },
  });

  const restored = createCreativeMemoryStore({ persistence });
  const memory = await restored.getCreativeMemoryForPrompt({
    userId: "u-character-manual-authority",
    projectId: "flood-record",
    projectTitle: "Flood Record",
    query: "What is Mara's wound?",
  });
  const mara = memory.characters.find((item) => item.name === "Mara");
  assert.equal(mara.bible.arc.wound, "she chose to leave her father behind");
  const authority = mara.bible.authoritativeFields.find((item) => item.field === "wound");
  assert.match(authority.sourceCorrectionId, /^memory_edit_/);
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

test("project correction history cannot revive older retired canon after a later batch", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const olderTerms = Array.from(
    { length: 8 },
    (_, index) => `Mara destroys archive copy ${index + 1}`
  );
  const newerTerms = Array.from(
    { length: 8 },
    (_, index) => `Eli hides witness ledger ${index + 1}`
  );
  await store.recordProjectContinuity({
    userId: "u-long-correction-ledger",
    continuity: {
      projectId: "long-correction-ledger",
      projectTitle: "The Archive",
      correctedTerms: olderTerms,
    },
  });
  await store.recordProjectContinuity({
    userId: "u-long-correction-ledger",
    continuity: {
      projectId: "long-correction-ledger",
      projectTitle: "The Archive",
      correctedTerms: newerTerms,
      currentBeat: "Mara destroys archive copy 8 before the hearing.",
    },
  });

  const ledger = await store.getCreativeMemoryLedger({ userId: "u-long-correction-ledger" });
  const project = ledger.projects[0];
  assert.equal(project.correctedTerms.length, 16);
  assert.ok(project.correctedTerms.includes("Mara destroys archive copy 8"));
  assert.equal(Object.hasOwn(project, "currentBeat"), false);
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
  assert.equal(correction.writerCanonFactsRecorded, 1);
  assert.equal(correction.corrections, 1);
  assert.match(correction.canonCorrectionReceiptId, /^canon_correction_/);

  const restored = createCreativeMemoryStore({ persistence });
  const ledger = await restored.getCreativeMemoryLedger({ userId: "u-durable-canon-retcon" });
  const project = ledger.projects.find((item) => item.projectId === "rain-docket");
  assert.ok(project.correctedTerms.some((item) => /burns the only copy/i.test(item)));
  assert.doesNotMatch(JSON.stringify(project.acceptedScenes), /burns the only copy/i);
  assert.match(JSON.stringify(project.acceptedScenes), /I admit I forged the affidavit/);
  assert.match(JSON.stringify(project.acceptedScenes), /I choose the case over us/);
  assert.equal(project.writerCanonFacts.length, 1);
  assert.equal(
    project.writerCanonFacts[0].fact,
    "Mara never burns the affidavit. The affidavit survives, and Mara hides it in Eli's ferry locker."
  );
  assert.deepEqual(project.writerCanonFacts[0].replacesFacts, [
    "Mara burns the only copy before the cameras arrive.",
  ]);
  assert.equal(project.writerCanonFacts[0].receiptId, correction.canonCorrectionReceiptId);

  const memory = await restored.getCreativeMemoryForPrompt({
    userId: "u-durable-canon-retcon",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Continue after Mara hides the surviving affidavit in Eli's ferry locker.",
  });
  assert.equal(memory.acceptedCausalFacts.some((item) => /burns the only copy/i.test(item.fact)), false);
  const writerCanon = memory.acceptedCausalFacts.find((item) => item.authority === "writer_correction");
  assert.ok(writerCanon);
  assert.match(writerCanon.fact, /affidavit survives/i);
  assert.deepEqual(writerCanon.replacesFacts, [
    "Mara burns the only copy before the cameras arrive.",
  ]);
  assert.equal(memory.projectContinuity.sceneSummary, undefined);
  assert.ok(memory.acceptedCausalFacts.some((item) => /I admit I forged the affidavit/i.test(item.fact)));
  assert.ok(memory.episodicMemories.some((item) => (
    item.tags.includes("correction") && /ferry locker/i.test(item.excerpt)
  )));
  assert.equal(memory.episodicMemories.some((item) => /burns the only copy/i.test(item.excerpt)), false);

  assert.equal(ledger.canonCorrectionReceipts[0].id, correction.canonCorrectionReceiptId);
  assert.equal(ledger.canonCorrectionReceipts[0].status, "active");
  assert.deepEqual(ledger.canonCorrectionReceipts[0].matchedFacts, [
    "Mara burns the only copy before the cameras arrive.",
  ]);
  assert.deepEqual(ledger.canonCorrectionReceipts[0].replacementFacts, [writerCanon.fact]);
  assert.deepEqual(ledger.canonCorrectionReceipts[0].replacementFactIds, [project.writerCanonFacts[0].id]);

  await restored.recordProjectContinuity({
    userId: "u-durable-canon-retcon",
    continuity: {
      projectId: "rain-docket",
      projectTitle: "Rain Docket",
      nextScenePlan: "Mara takes the surviving affidavit to the ferry terminal.",
    },
  });
  const undone = await restored.undoCanonCorrection({
    userId: "u-durable-canon-retcon",
    receiptId: correction.canonCorrectionReceiptId,
  });
  assert.equal(undone.ok, true);
  assert.equal(undone.status, "undone");

  const afterUndoLedger = await restored.getCreativeMemoryLedger({ userId: "u-durable-canon-retcon" });
  const afterUndoProject = afterUndoLedger.projects.find((item) => item.projectId === "rain-docket");
  assert.match(JSON.stringify(afterUndoProject.acceptedScenes), /burns the only copy/i);
  assert.deepEqual(afterUndoProject.writerCanonFacts || [], []);
  assert.equal(
    afterUndoProject.nextScenePlan,
    "Mara takes the surviving affidavit to the ferry terminal."
  );
  assert.equal(afterUndoLedger.canonCorrectionReceipts[0].status, "undone");
  assert.ok(afterUndoLedger.canonCorrectionReceipts[0].undoneAt > 0);

  const afterUndoMemory = await restored.getCreativeMemoryForPrompt({
    userId: "u-durable-canon-retcon",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    query: "Continue after Mara burns the only copy.",
  });
  assert.ok(afterUndoMemory.acceptedCausalFacts.some((item) => /burns the only copy/i.test(item.fact)));
  assert.equal(
    afterUndoMemory.acceptedCausalFacts.some((item) => item.authority === "writer_correction"),
    false
  );
  assert.equal(afterUndoMemory.episodicMemories.some((item) => item.tags.includes("correction")), false);
  assert.ok(afterUndoMemory.episodicMemories.some((item) => /burns the only copy/i.test(item.excerpt)));

  const repeatedUndo = await restored.undoCanonCorrection({
    userId: "u-durable-canon-retcon",
    receiptId: correction.canonCorrectionReceiptId,
  });
  assert.equal(repeatedUndo.ok, true);
  assert.equal(repeatedUndo.status, "already_undone");
});

test("writer replacement canon promotes explicit Character Bible and Story Spine fields", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  await store.recordCharacterMention({
    userId: "u-structured-writer-canon",
    characterName: "Mara",
    metadata: { projectId: "blue-key", projectTitle: "Blue Key" },
    characterBible: {
      arc: { falseBelief: "perfect proof can save everyone" },
      canon: ["Mara believes perfect proof can save everyone."],
    },
  });
  const page = `INT. ARCHIVE - NIGHT

Mara destroys the blue key before leaving.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-structured-writer-canon",
    transcript: "Commit the archive scene.",
    reply: page,
    acceptedPageText: page,
    acceptedSceneContext: { anchorSceneId: "scene-archive" },
    projectId: "blue-key",
    projectTitle: "Blue Key",
    projectContinuity: {
      unresolvedSetups: ["The destroyed blue key"],
      actThreePayoffPath: ["Mara finds another way into the archive"],
    },
    source: "talk_screenplay_output",
  });

  const correction = await store.recordTriggersFromTalkTurn({
    userId: "u-structured-writer-canon",
    transcript: "Actually, Mara never destroys the blue key. Mara's false belief is that truth will get Eli killed, not that perfect proof can save everyone. The unresolved setup is the blue key in Eli's locker. The Act III payoff is Mara uses the blue key to open the sealed archive.",
    projectId: "blue-key",
    projectTitle: "Blue Key",
    source: "talk_turn",
  });
  assert.equal(correction.acceptedCanonFactsRetired, 1);
  assert.equal(correction.writerCanonFactsRecorded, 1);

  let ledger = await store.getCreativeMemoryLedger({ userId: "u-structured-writer-canon" });
  let project = ledger.projects.find((item) => item.projectId === "blue-key");
  let mara = ledger.characters.find((item) => (
    item.name === "Mara" && item.metadata?.projectId === "blue-key"
  ));
  assert.equal(mara.bible.arc.falseBelief, "truth will get Eli killed");
  assert.equal(mara.bible.authoritativeFields[0].field, "falseBelief");
  assert.equal(
    mara.bible.authoritativeFields[0].sourceCorrectionId,
    correction.canonCorrectionReceiptId
  );
  assert.deepEqual(project.unresolvedSetups, ["the blue key in Eli's locker"]);
  assert.deepEqual(project.actThreePayoffPath, ["Mara uses the blue key to open the sealed archive"]);
  assert.ok(project.authoritativeFields.some((item) => item.field === "unresolvedSetups"));
  assert.ok(project.authoritativeFields.some((item) => item.field === "actThreePayoffPath"));
  assert.ok(project.writerCanonFacts[0].structuredTargets.some((item) => (
    item.scope === "character" && item.field === "falseBelief"
  )));
  assert.ok(ledger.canonCorrectionReceipts[0].structuredUpdates.includes(
    "Mara.falseBelief: truth will get Eli killed"
  ));

  await store.recordCharacterMention({
    userId: "u-structured-writer-canon",
    characterName: "Mara",
    metadata: { projectId: "blue-key", projectTitle: "Blue Key" },
    characterBible: { arc: { falseBelief: "perfect proof can save everyone" } },
  });
  await store.recordProjectContinuity({
    userId: "u-structured-writer-canon",
    continuity: {
      projectId: "blue-key",
      projectTitle: "Blue Key",
      unresolvedSetups: ["The destroyed blue key"],
      actThreePayoffPath: ["Mara finds another way into the archive"],
    },
  });
  ledger = await store.getCreativeMemoryLedger({ userId: "u-structured-writer-canon" });
  project = ledger.projects.find((item) => item.projectId === "blue-key");
  mara = ledger.characters.find((item) => (
    item.name === "Mara" && item.metadata?.projectId === "blue-key"
  ));
  assert.equal(mara.bible.arc.falseBelief, "truth will get Eli killed");
  assert.deepEqual(project.unresolvedSetups, ["the blue key in Eli's locker"]);
  assert.deepEqual(project.actThreePayoffPath, ["Mara uses the blue key to open the sealed archive"]);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-structured-writer-canon",
    projectId: "blue-key",
    projectTitle: "Blue Key",
    query: "Continue toward the archive payoff.",
  });
  assert.equal(memory.characters[0].bible.arc.falseBelief, "truth will get Eli killed");
  assert.equal(memory.projectContinuity.unresolvedSetups[0], "the blue key in Eli's locker");
  assert.ok(memory.acceptedCausalFacts[0].structuredUpdates.includes(
    "unresolvedSetups: the blue key in Eli's locker"
  ));

  const undone = await store.undoCanonCorrection({
    userId: "u-structured-writer-canon",
    receiptId: correction.canonCorrectionReceiptId,
  });
  assert.equal(undone.status, "undone");
  ledger = await store.getCreativeMemoryLedger({ userId: "u-structured-writer-canon" });
  project = ledger.projects.find((item) => item.projectId === "blue-key");
  mara = ledger.characters.find((item) => (
    item.name === "Mara" && item.metadata?.projectId === "blue-key"
  ));
  assert.equal(mara.bible.arc.falseBelief, "perfect proof can save everyone");
  assert.equal(mara.bible.authoritativeFields?.length || 0, 0);
  assert.deepEqual(project.unresolvedSetups, ["The destroyed blue key"]);
  assert.deepEqual(project.actThreePayoffPath, ["Mara finds another way into the archive"]);
});

test("writer corrections upgrade legacy unscoped character bibles without duplicates", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  await store.recordCharacterMention({
    userId: "u-legacy-character-upgrade",
    characterName: "Mara",
    characterBible: {
      arc: { falseBelief: "perfect proof can save everyone" },
    },
  });

  await store.recordTriggersFromTalkTurn({
    userId: "u-legacy-character-upgrade",
    transcript: "Actually, Mara's false belief is that truth will get Eli killed, not that perfect proof can save everyone.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_turn",
  });

  const ledger = await store.getCreativeMemoryLedger({ userId: "u-legacy-character-upgrade" });
  const maraRecords = ledger.characters.filter((item) => item.name === "Mara");
  assert.equal(maraRecords.length, 1);
  assert.equal(maraRecords[0].metadata.projectId, "rain-docket");
  assert.equal(maraRecords[0].metadata.projectTitle, "Rain Docket");
  assert.equal(maraRecords[0].bible.arc.falseBelief, "truth will get Eli killed");
  assert.equal(maraRecords[0].bible.authoritativeFields[0].source, "writer_correction");
});

test("stacked canon corrections must be undone newest-first within a project", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const page = `INT. RECORDS ROOM - NIGHT

Mara burns the only copy before the cameras arrive.

ELI
I choose the case over us.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-stacked-canon-retcons",
    transcript: "Commit the records room scene.",
    reply: page,
    acceptedPageText: page,
    acceptedSceneContext: { anchorSceneId: "scene-records-room" },
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_screenplay_output",
  });

  const first = await store.recordTriggersFromTalkTurn({
    userId: "u-stacked-canon-retcons",
    transcript: "Actually, Mara never burns the only copy. She hides it in the ferry locker.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_turn",
  });
  const second = await store.recordTriggersFromTalkTurn({
    userId: "u-stacked-canon-retcons",
    transcript: "Actually, Eli never chooses the case over us. He chooses Mara instead.",
    projectId: "rain-docket",
    projectTitle: "Rain Docket",
    source: "talk_turn",
  });
  assert.match(first.canonCorrectionReceiptId, /^canon_correction_/);
  assert.match(second.canonCorrectionReceiptId, /^canon_correction_/);

  const outOfOrder = await store.undoCanonCorrection({
    userId: "u-stacked-canon-retcons",
    receiptId: first.canonCorrectionReceiptId,
  });
  assert.equal(outOfOrder.ok, false);
  assert.equal(outOfOrder.status, "newer_correction_exists");

  const newest = await store.undoCanonCorrection({
    userId: "u-stacked-canon-retcons",
    receiptId: second.canonCorrectionReceiptId,
  });
  assert.equal(newest.status, "undone");
  const oldest = await store.undoCanonCorrection({
    userId: "u-stacked-canon-retcons",
    receiptId: first.canonCorrectionReceiptId,
  });
  assert.equal(oldest.status, "undone");
});

test("a later writer correction replaces prior writer canon without reviving retired page truth", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const page = `INT. RECORDS ROOM - NIGHT

Mara burns the only affidavit before the cameras arrive.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-writer-canon-chain",
    transcript: "Commit the records room scene.",
    reply: page,
    acceptedPageText: page,
    acceptedSceneContext: { anchorSceneId: "scene-records-room-chain" },
    projectId: "rain-docket-chain",
    projectTitle: "Rain Docket Chain",
    source: "talk_screenplay_output",
  });

  const first = await store.recordTriggersFromTalkTurn({
    userId: "u-writer-canon-chain",
    transcript: "Actually, Mara never burns the only affidavit. She hides it in Eli's ferry locker.",
    projectId: "rain-docket-chain",
    projectTitle: "Rain Docket Chain",
    source: "talk_turn",
  });
  const second = await store.recordTriggersFromTalkTurn({
    userId: "u-writer-canon-chain",
    transcript: "Actually, Mara never hides the affidavit in Eli's ferry locker. She gives it to June at the east dock.",
    projectId: "rain-docket-chain",
    projectTitle: "Rain Docket Chain",
    source: "talk_turn",
  });
  assert.equal(first.writerCanonFactsRecorded, 1);
  assert.equal(second.writerCanonFactsRecorded, 1);
  assert.equal(second.acceptedCanonFactsRetired, 1);

  let memory = await store.getCreativeMemoryForPrompt({
    userId: "u-writer-canon-chain",
    projectId: "rain-docket-chain",
    projectTitle: "Rain Docket Chain",
    query: "Who has the affidavit now?",
  });
  let writerFacts = memory.acceptedCausalFacts.filter((item) => item.authority === "writer_correction");
  assert.equal(writerFacts.length, 1);
  assert.match(writerFacts[0].fact, /gives it to June/i);
  assert.deepEqual(writerFacts[0].replacesFacts, [
    "Mara never burns the only affidavit. She hides it in Eli's ferry locker.",
  ]);
  assert.equal(
    memory.acceptedCausalFacts.some((item) => item.fact === writerFacts[0].replacesFacts[0]),
    false
  );
  assert.equal(
    memory.acceptedCausalFacts.some((item) => /burns the only affidavit before/i.test(item.fact)),
    false
  );

  const undoneSecond = await store.undoCanonCorrection({
    userId: "u-writer-canon-chain",
    receiptId: second.canonCorrectionReceiptId,
  });
  assert.equal(undoneSecond.status, "undone");
  memory = await store.getCreativeMemoryForPrompt({
    userId: "u-writer-canon-chain",
    projectId: "rain-docket-chain",
    projectTitle: "Rain Docket Chain",
    query: "Where is the affidavit?",
  });
  writerFacts = memory.acceptedCausalFacts.filter((item) => item.authority === "writer_correction");
  assert.equal(writerFacts.length, 1);
  assert.match(writerFacts[0].fact, /Eli's ferry locker/i);

  const undoneFirst = await store.undoCanonCorrection({
    userId: "u-writer-canon-chain",
    receiptId: first.canonCorrectionReceiptId,
  });
  assert.equal(undoneFirst.status, "undone");
  memory = await store.getCreativeMemoryForPrompt({
    userId: "u-writer-canon-chain",
    projectId: "rain-docket-chain",
    projectTitle: "Rain Docket Chain",
    query: "What happened to the affidavit?",
  });
  assert.ok(memory.acceptedCausalFacts.some((item) => /burns the only affidavit before/i.test(item.fact)));
  assert.equal(memory.acceptedCausalFacts.some((item) => item.authority === "writer_correction"), false);
});

test("ambiguous canon corrections preserve near-tied accepted facts while recording the correction", async () => {
  const persistence = freshPersistence();
  const store = createCreativeMemoryStore({ persistence });
  const page = `EXT. EAST FERRY DOCK - NIGHT

Mara watches two separate ferries pull away.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-ambiguous-canon-retcon",
    transcript: "Commit the east ferry dock scene.",
    reply: page,
    acceptedPageText: page,
    acceptedSceneContext: { anchorSceneId: "scene-east-ferry-dock" },
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    projectContinuity: {
      act: "Act II",
      irreversibleConsequences: [
        "Mara abandons Eli at the east ferry dock.",
        "Mara abandons June at the east ferry dock.",
      ],
    },
    source: "talk_screenplay_output",
  });

  const correction = await store.recordTriggersFromTalkTurn({
    userId: "u-ambiguous-canon-retcon",
    transcript: "Actually, Mara never abandons anyone at the east ferry dock. She goes back for both of them. The unresolved setup is Mara promised to return for Eli and June.",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    source: "talk_turn",
  });
  assert.equal(correction.acceptedCanonFactsRetired, 0);
  assert.equal(correction.acceptedCanonFactsAmbiguous, 2);
  assert.equal(correction.corrections, 1);
  assert.match(correction.canonCorrectionAmbiguityId, /^canon_ambiguity_/);
  assert.equal(correction.canonCorrectionAmbiguity.id, correction.canonCorrectionAmbiguityId);
  assert.equal(correction.canonCorrectionAmbiguity.status, "pending");
  assert.equal(correction.canonCorrectionAmbiguity.projectId, "split-ferries");
  assert.deepEqual(correction.canonCorrectionAmbiguity.candidateFacts, [
    "Mara abandons Eli at the east ferry dock.",
    "Mara abandons June at the east ferry dock.",
  ]);

  const restored = createCreativeMemoryStore({ persistence });
  let ledger = await restored.getCreativeMemoryLedger({ userId: "u-ambiguous-canon-retcon" });
  assert.equal(ledger.canonCorrectionAmbiguities[0].id, correction.canonCorrectionAmbiguityId);
  assert.equal(ledger.canonCorrectionAmbiguities[0].status, "pending");
  assert.deepEqual(ledger.canonCorrectionAmbiguities[0].candidateFacts, [
    "Mara abandons Eli at the east ferry dock.",
    "Mara abandons June at the east ferry dock.",
  ]);
  const rejectedSelection = await restored.resolveCanonCorrectionAmbiguity({
    userId: "u-ambiguous-canon-retcon",
    ambiguityId: correction.canonCorrectionAmbiguityId,
    selectedFacts: [
      "Mara abandons Eli at the east ferry dock.",
      "Mara abandons a third person at the west ferry dock.",
    ],
  });
  assert.equal(rejectedSelection.ok, false);
  assert.equal(rejectedSelection.status, "selected_fact_not_candidate");
  const memory = await restored.getCreativeMemoryForPrompt({
    userId: "u-ambiguous-canon-retcon",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    query: "What happened at the east ferry dock?",
  });
  assert.ok(memory.acceptedCausalFacts.some((item) => /abandons Eli/i.test(item.fact)));
  assert.ok(memory.acceptedCausalFacts.some((item) => /abandons June/i.test(item.fact)));
  assert.equal(memory.projectContinuity.unresolvedSetups, undefined);
  assert.ok(memory.episodicMemories.some((item) => (
    item.tags.includes("correction") && /goes back for both/i.test(item.excerpt)
  )));

  const resolved = await restored.resolveCanonCorrectionAmbiguity({
    userId: "u-ambiguous-canon-retcon",
    ambiguityId: correction.canonCorrectionAmbiguityId,
    selectedFacts: [
      "Mara abandons Eli at the east ferry dock.",
      "Mara abandons June at the east ferry dock.",
    ],
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.ambiguity.selectedFact, "Mara abandons Eli at the east ferry dock.");
  assert.deepEqual(resolved.ambiguity.selectedFacts, [
    "Mara abandons Eli at the east ferry dock.",
    "Mara abandons June at the east ferry dock.",
  ]);
  assert.deepEqual(resolved.receipt.matchedFacts, resolved.ambiguity.selectedFacts);
  assert.deepEqual(resolved.receipt.replacementFacts, [
    "Mara never abandons anyone at the east ferry dock. She goes back for both of them. The unresolved setup is Mara promised to return for Eli and June.",
  ]);
  assert.deepEqual(resolved.receipt.structuredUpdates, [
    "unresolvedSetups: Mara promised to return for Eli and June",
  ]);
  assert.match(resolved.receipt.id, /^canon_correction_/);

  const resolvedMemory = await restored.getCreativeMemoryForPrompt({
    userId: "u-ambiguous-canon-retcon",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    query: "What happened at the east ferry dock?",
  });
  const resolvedFacts = resolvedMemory.acceptedCausalFacts || [];
  assert.equal(resolvedFacts.some((item) => /abandons Eli/i.test(item.fact)), false);
  assert.equal(resolvedFacts.some((item) => /abandons June/i.test(item.fact)), false);
  const resolvedWriterCanon = resolvedFacts.filter((item) => item.authority === "writer_correction");
  assert.equal(resolvedWriterCanon.length, 1);
  assert.equal(resolvedWriterCanon[0].fact, resolved.receipt.replacementFacts[0]);
  assert.deepEqual(resolvedWriterCanon[0].replacesFacts, resolved.ambiguity.selectedFacts);
  assert.equal(
    resolvedMemory.projectContinuity.unresolvedSetups[0],
    "Mara promised to return for Eli and June"
  );

  const idempotentResolution = await restored.resolveCanonCorrectionAmbiguity({
    userId: "u-ambiguous-canon-retcon",
    ambiguityId: correction.canonCorrectionAmbiguityId,
    selectedFacts: [
      "Mara abandons June at the east ferry dock.",
      "Mara abandons Eli at the east ferry dock.",
    ],
  });
  assert.equal(idempotentResolution.ok, true);
  assert.equal(idempotentResolution.status, "already_resolved");
  assert.equal(idempotentResolution.receipt.id, resolved.receipt.id);
  const idempotentMemory = await restored.getCreativeMemoryForPrompt({
    userId: "u-ambiguous-canon-retcon",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    query: "Does Mara go back for Eli and June?",
  });
  assert.equal(
    idempotentMemory.acceptedCausalFacts.filter((item) => item.authority === "writer_correction").length,
    1
  );

  ledger = await restored.getCreativeMemoryLedger({ userId: "u-ambiguous-canon-retcon" });
  assert.equal(ledger.canonCorrectionAmbiguities[0].status, "resolved");
  assert.equal(ledger.canonCorrectionAmbiguities[0].receiptId, resolved.receipt.id);
  assert.deepEqual(ledger.canonCorrectionReceipts[0].matchedFacts, [
    "Mara abandons Eli at the east ferry dock.",
    "Mara abandons June at the east ferry dock.",
  ]);
  assert.equal(Object.hasOwn(ledger.canonCorrectionReceipts[0], "beforeState"), false);
  assert.equal(Object.hasOwn(ledger.canonCorrectionReceipts[0], "afterState"), false);

  const undone = await restored.undoCanonCorrection({
    userId: "u-ambiguous-canon-retcon",
    receiptId: resolved.receipt.id,
  });
  assert.equal(undone.status, "undone");
  const afterUndoMemory = await restored.getCreativeMemoryForPrompt({
    userId: "u-ambiguous-canon-retcon",
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    query: "What happened at the east ferry dock?",
  });
  assert.equal(afterUndoMemory.projectContinuity.unresolvedSetups, undefined);
  assert.ok(afterUndoMemory.acceptedCausalFacts.some((item) => /abandons Eli/i.test(item.fact)));
  assert.ok(afterUndoMemory.acceptedCausalFacts.some((item) => /abandons June/i.test(item.fact)));
  assert.equal(
    afterUndoMemory.acceptedCausalFacts.some((item) => item.authority === "writer_correction"),
    false
  );
  ledger = await restored.getCreativeMemoryLedger({ userId: "u-ambiguous-canon-retcon" });
  assert.equal(ledger.canonCorrectionAmbiguities[0].status, "pending");

  const legacySingularResolution = await restored.resolveCanonCorrectionAmbiguity({
    userId: "u-ambiguous-canon-retcon",
    ambiguityId: correction.canonCorrectionAmbiguityId,
    selectedFact: "Mara abandons Eli at the east ferry dock.",
  });
  assert.equal(legacySingularResolution.ok, true);
  assert.deepEqual(legacySingularResolution.ambiguity.selectedFacts, [
    "Mara abandons Eli at the east ferry dock.",
  ]);
  assert.deepEqual(legacySingularResolution.receipt.matchedFacts, [
    "Mara abandons Eli at the east ferry dock.",
  ]);
});

test("duplicate accepted canon facts across categories retire as one unambiguous correction", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const page = `INT. ARCHIVE - NIGHT

Mara holds the affidavit over a match.`;
  await store.recordTriggersFromTalkTurn({
    userId: "u-duplicate-canon-retcon",
    transcript: "Commit the archive scene.",
    reply: page,
    acceptedPageText: page,
    acceptedSceneContext: { anchorSceneId: "scene-archive" },
    projectId: "paper-trail",
    projectTitle: "Paper Trail",
    projectContinuity: {
      act: "Act II",
      decisions: ["Mara burns the affidavit."],
      irreversibleConsequences: ["Mara burns the affidavit."],
    },
    source: "talk_screenplay_output",
  });

  const correction = await store.recordTriggersFromTalkTurn({
    userId: "u-duplicate-canon-retcon",
    transcript: "Actually, Mara never burns the affidavit. The affidavit survives.",
    projectId: "paper-trail",
    projectTitle: "Paper Trail",
    source: "talk_turn",
  });
  assert.equal(correction.acceptedCanonFactsRetired, 1);
  assert.equal(correction.acceptedCanonFactsAmbiguous, 0);

  const memory = await store.getCreativeMemoryForPrompt({
    userId: "u-duplicate-canon-retcon",
    projectId: "paper-trail",
    projectTitle: "Paper Trail",
    query: "Continue after the archive scene.",
  });
  assert.equal(
    (memory.acceptedCausalFacts || []).some((item) => item.fact === "Mara burns the affidavit."),
    false
  );
  assert.ok((memory.acceptedCausalFacts || []).some((item) => (
    item.authority === "writer_correction" && /affidavit survives/i.test(item.fact)
  )));
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

test("story move preference corrections persist and reset without deleting question outcomes", async () => {
  const store = createCreativeMemoryStore({ persistence: freshPersistence() });
  const userId = "u-story-move-preferences";
  await store.recordProjectContinuity({
    userId,
    continuity: {
      projectId: "split-ferries",
      projectTitle: "Split Ferries",
      questionEffectiveness: [{
        questionId: "story-choice-1",
        targetField: "story.next_irreversible_choice",
        responseStatus: "answered",
        askedAt: 1_000,
        answeredAt: 1_100,
        selectedMoveFamily: "reversal_pressure",
        offeredMoveFamilies: [
          "reversal_pressure",
          "relationship_pressure",
          "obstacle_pressure",
        ],
      }],
    },
  });

  const corrected = await store.updateStoryMovePreference({
    userId,
    projectId: "split-ferries",
    family: "relationship_pressure",
    action: "prefer",
    at: 2_000,
  });
  assert.equal(corrected.ok, true);
  let ledger = await store.getCreativeMemoryLedger({ userId });
  assert.deepEqual(ledger.projects[0].storyMovePreferenceOverrides, [{
    family: "relationship_pressure",
    stance: "prefer",
    updatedAt: 2_000,
  }]);

  const reset = await store.updateStoryMovePreference({
    userId,
    projectId: "split-ferries",
    family: "reversal_pressure",
    action: "reset",
    at: 3_000,
  });
  assert.equal(reset.ok, true);
  ledger = await store.getCreativeMemoryLedger({ userId });
  assert.equal(ledger.projects[0].questionEffectiveness.length, 1);
  assert.equal(ledger.projects[0].questionEffectiveness[0].responseStatus, "answered");
  assert.equal(ledger.projects[0].questionEffectiveness[0].selectedMoveFamily, undefined);
  assert.deepEqual(
    ledger.projects[0].questionEffectiveness[0].offeredMoveFamilies,
    ["relationship_pressure", "obstacle_pressure"]
  );

  await store.updateStoryMovePreference({
    userId,
    projectId: "split-ferries",
    action: "reset_all",
    at: 4_000,
  });
  ledger = await store.getCreativeMemoryLedger({ userId });
  assert.equal(ledger.projects[0].questionEffectiveness.length, 1);
  assert.equal(ledger.projects[0].questionEffectiveness[0].offeredMoveFamilies, undefined);
  assert.equal(ledger.projects[0].storyMovePreferenceOverrides, undefined);
});
