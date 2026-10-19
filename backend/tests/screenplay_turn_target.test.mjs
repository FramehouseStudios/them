import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RUN_SERVER = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

import {
  resolveScreenplayTargetFromRequest,
} from "../lib/screenplay_turn_target.js";

const { sanitizeStudioTurnMetadata } = await import("../index.js");

test("[screenplay-turn-target] an explicit complete-feature draft starts pages without existing context", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    transcript: "Write a complete 120-page screenplay.",
  }), "page");
});

test("[screenplay-turn-target] a direct screenplay request does not need an inferred task or existing draft", () => {
  for (const transcript of ["Write a screenplay.", "Please write a script."]) {
    assert.equal(resolveScreenplayTargetFromRequest({ transcript }), "page");
  }
});

for (const transcript of [
  "How do I write a 120-page screenplay?",
  "Write an outline for a 120-page screenplay.",
  "Do not write a 120-page screenplay yet. Help me plan.",
  "Please don't write the scene yet; explain the structure.",
  "Clementine, please don’t rewrite the scene yet.",
  "Could you explain how to write the next three pages?",
  "Draft a treatment for my screenplay.",
  "Help me plan how to write a scene.",
  "I do not want you to write the scene yet.",
]) {
  test(`[screenplay-turn-target] advice or planning does not infer a page mutation: ${transcript}`, () => {
    assert.equal(resolveScreenplayTargetFromRequest({ transcript }), "");
    assert.equal(resolveScreenplayTargetFromRequest({
      transcript,
      screenplayProjectId: "existing-project",
      screenplayDraftExcerpt: "INT. WORKSHOP - NIGHT\n\nA clock stops.",
    }), "", "Existing writer text must not turn an advice request into a page mutation");
    assert.equal(sanitizeStudioTurnMetadata({
      transcript,
      screenplayTargetPages: 120,
      screenplayProjectId: "existing-project",
    }).screenplayTarget, "", "The production sanitizer must not treat project length as permission to write");
  });
}

test("[screenplay-turn-target] story dialogue is not mistaken for a negative instruction", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    transcript: 'Write the scene: JOHN says "Do not write the letter."',
  }), "page");
});

test("[screenplay-turn-target] explicit destination remains authoritative", () => {
  for (const screenplayTarget of ["page", "voice_pin"]) {
    assert.equal(resolveScreenplayTargetFromRequest({
      screenplayTarget,
      transcript: "How do I write the next scene?",
    }), screenplayTarget);
  }
});

test("[screenplay-turn-target] infers page target for continuation with live draft context", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    clientTranscript: "Keep writing from here into the next scene.",
    screenplayProjectId: "feature-1",
    screenplayDraftExcerpt: "INT. MOTEL ROOM - NIGHT\n\nJUNE pockets the receipt.",
  }), "page");
});

test("[screenplay-turn-target] infers page target for feature page batches", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    transcript: "Write the next ten pages of act two.",
    screenplayAct: "Act II",
    screenplayDraftExcerpt: "INT. COURTHOUSE HALLWAY - NIGHT\n\nMARA stops walking.",
  }), "page");
});

test("[screenplay-turn-target] infers page target from restored feature memory compass", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    clientTranscript: "Continue from the remembered turn into the next page.",
    screenplayProjectId: "feature-1",
    screenplayNextThreeTurns: [
      "Father names the lie.",
      "Mara chooses public exposure.",
    ],
    screenplayActPressureState: "Act II must turn evidence into a public cost.",
  }), "page");
});

test("[screenplay-turn-target] infers page target for act-aware rewrite with project context", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    transcript: "Rewrite the Act II midpoint so the father reveal corners Mara.",
    screenplayProjectId: "feature-1",
  }), "page");
});

test("[screenplay-turn-target] infers page target for act transition language with project context", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    transcript: "Take us into act three from the all-is-lost aftermath.",
    screenplayProjectId: "feature-1",
  }), "page");
});

test("[screenplay-turn-target] infers page target from target page count even without transcript", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    screenplayTargetPages: 8,
    screenplayAct: "Act III",
  }), "page");
});

test("[screenplay-turn-target] explicit voice pin wins over page inference", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    screenplayTarget: "voice_pin",
    transcript: "Write the next ten pages of act two.",
    screenplayAct: "Act II",
    screenplayDraftExcerpt: "INT. COURTHOUSE HALLWAY - NIGHT\n\nMARA stops walking.",
  }), "voice_pin");
});

test("[screenplay-turn-target] does not auto-write pages for scene doctor notes", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    transcript: "Scene doctor this and tell me what's not working.",
    screenplayDraftExcerpt: "INT. MOTEL ROOM - NIGHT\n\nJUNE pockets the receipt.",
  }), "");
});

test("[screenplay-turn-target] does not auto-write pages for act-aware scene doctor notes", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    transcript: "Scene doctor act two and tell me why it drags.",
    screenplayProjectId: "feature-1",
    screenplayNextThreeTurns: ["Mara loses the public case."],
  }), "");
});

test("[screenplay-turn-target] does not auto-write broad feature help without live page context", () => {
  assert.equal(resolveScreenplayTargetFromRequest({
    transcript: "Help me finish this feature film.",
    screenplayProjectId: "feature-1",
  }), "");
});

test("[screenplay-turn-target] studio metadata sanitizer uses inferred page target", () => {
  const studio = sanitizeStudioTurnMetadata({
    screenplayProjectId: "feature-1",
    clientTranscript: "Continue from here into the next page.",
    screenplayDraftExcerpt: "INT. MOTEL ROOM - NIGHT\n\nJUNE pockets the receipt.",
  });

  assert.equal(studio.screenplayProjectId, "feature-1");
  assert.equal(studio.screenplayTarget, "page");
});

test("[screenplay-turn-target] studio metadata sanitizer routes restored feature compass to page", () => {
  const studio = sanitizeStudioTurnMetadata({
    screenplayProjectId: "feature-1",
    clientTranscript: "Continue from the next remembered turn.",
    screenplayNextThreeTurns: ["Father names the lie.", "Mara chooses public exposure."],
    screenplayActThreePayoffPath: ["The affidavit pays off in open court."],
  });

  assert.equal(studio.screenplayProjectId, "feature-1");
  assert.equal(studio.screenplayTarget, "page");
  assert.deepEqual(studio.screenplayNextThreeTurns, [
    "Father names the lie.",
    "Mara chooses public exposure.",
  ]);
});

test("[screenplay-turn-target] studio metadata preserves explicit one-line replacement mode", () => {
  const studio = sanitizeStudioTurnMetadata({
    screenplayProjectId: "feature-1",
    screenplayTarget: "page",
    screenplayAnchorLine: 12,
    screenplayAnchorEndLine: 12,
    screenplayInsertionMode: "replace-selection",
  });

  assert.equal(studio.screenplayInsertionMode, "replace_selection");
  assert.equal(studio.screenplayAnchorLine, 12);
  assert.equal(studio.screenplayAnchorEndLine, 12);
});
