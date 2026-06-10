import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RUN_SERVER = "0";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.REALTIME_PROVIDER ||= "stub";

import {
  resolveScreenplayTargetFromRequest,
} from "../lib/screenplay_turn_target.js";

const { sanitizeStudioTurnMetadata } = await import("../index.js");

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
