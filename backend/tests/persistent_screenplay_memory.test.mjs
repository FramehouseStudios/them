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
  createEmptyEmotionMemory,
  sanitizeScreenplayProjectMemoryItems,
  updateSessionAfterReply,
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
      screenplayNextScenePlan: "Pay off the father reveal with a private confrontation.",
      screenplayCharacterFocus: ["Mara", "Bailiff", "Father"],
      screenplayUnresolvedSetups: ["Forged testimony", "Missing evidence"],
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
  assert.equal(first.act, "Act II");
  assert.equal(first.sceneLabel, "Courthouse Hallway");
  assert.equal(first.currentBeat, "Mara sees the bailiff pocket the missing evidence.");
  assert.equal(first.nextScenePlan, "Pay off the father reveal with a private confrontation.");
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

  memory.turns = 13;
  memory = withMockedNow(secondTs, () => updateSessionAfterReply(
    memory,
    "Now keep going and make the father reveal more emotionally loaded.",
    "FATHER\nI came because the lie finally had your face on it.",
    false,
    {
      screenplayProjectId: "feature-alpha",
      screenplayDocumentRevisionId: "rev-13",
      screenplayTarget: "page",
      screenplayPromptSource: "voice",
      screenplayWriteId: "write-2",
      screenplayAnchorSceneLabel: "Courthouse Hallway",
      screenplayAct: "Act II",
      screenplayCurrentBeat: "The father reveal corners Mara emotionally.",
      screenplayNextScenePlan: "Move into a private corridor confrontation that redefines the case.",
      screenplayEmotionalContinuity: "Resolve fractures into grief, then reforms as courage.",
      screenplayInsertedText: "FATHER\nI came because the lie finally had your face on it.",
    }
  ));

  assert.equal(memory.screenplayProjectMemory.length, 1);
  const merged = memory.screenplayProjectMemory[0];
  assert.equal(merged.projectId, "feature-alpha");
  assert.equal(merged.documentRevisionId, "rev-13");
  assert.equal(merged.currentBeat, "The father reveal corners Mara emotionally.");
  assert.equal(merged.nextScenePlan, "Move into a private corridor confrontation that redefines the case.");
  assert.equal(merged.writeCount, 2);
  assert.equal(merged.interactionCount, 2);
  assert.equal(merged.updatedAt, secondTs);
  assert.match(merged.lastWritePreview, /lie finally had your face/);

  const cards = buildMemoryCards(memory, [], 12);
  const projectCard = cards.find((card) => card.source === "screenplay_project");
  assert.ok(projectCard);
  assert.equal(projectCard.key, "feature-alpha");
  assert.match(projectCard.summary, /The father reveal corners Mara emotionally/);
  assert.match(projectCard.referenceHint, /private corridor confrontation/);
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
        nextSceneMoves: ["Image payoff", "Silent choice", "New equilibrium"],
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
  assert.deepEqual(sanitized.screenplayProjectMemory[0].nextSceneMoves, [
    "Image payoff",
    "Silent choice",
    "New equilibrium",
  ]);
  assert.equal(sanitized.screenplayProjectMemoryUpdatedAt, 200);
});
