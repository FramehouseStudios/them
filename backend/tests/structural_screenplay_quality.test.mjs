import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStructuralScreenplayRepairMessages,
  evaluateStructuralScreenplayReply,
  shouldAcceptStructuralRepair,
} from "../lib/structural_screenplay_quality.js";

test("[structural-quality] rejects generic Scene Doctor notes", () => {
  const quality = evaluateStructuralScreenplayReply({
    modelReason: "screenplay_scene_doctor",
    reply: "The scene could use more emotion and stronger stakes. Consider making it more cinematic.",
  });
  assert.equal(quality.applicable, true);
  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "underdeveloped_scene_doctor");
  assert.equal(quality.repairDirectives.length > 0, true);
});

test("[structural-quality] accepts prioritized, playable Scene Doctor work", () => {
  const quality = evaluateStructuralScreenplayReply({
    modelReason: "screenplay_scene_doctor",
    reply: [
      "The core problem is that Mara's objective never meets real opposition, so the scene repeats one tactic without a turn.",
      "The highest-leverage fix is to make Eli withhold the reel until Mara risks their relationship. That adds obstacle, leverage, subtext, and a consequence that launches the next scene and her Act II arc.",
      "A playable version on the page:",
      "INT. EDIT BAY - NIGHT",
      "Mara reaches for the reel. Eli closes his fist around it.",
      "ELI",
      "Tell them what you cut, or this stays with me.",
      "End when Mara opens the live microphone; the choice makes the public hearing inevitable.",
    ].join("\n"),
  });
  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "ok");
  assert.equal(quality.score, 1);
});

test("[structural-quality] rejects a beat list that does not architect all three acts", () => {
  const quality = evaluateStructuralScreenplayReply({
    modelReason: "screenplay_feature_architecture",
    reply: "Act I introduces Mara. Then there are several escalating scenes and a dramatic ending.",
  });
  assert.equal(quality.ok, false);
  assert.equal(quality.reason, "underdeveloped_feature_architecture");
});

test("[structural-quality] accepts causal feature architecture with a scene-forward handoff", () => {
  const quality = evaluateStructuralScreenplayReply({
    modelReason: "screenplay_feature_architecture",
    reply: [
      "Act I: Mara wants to expose the forged testimony while her wound and false belief tell her that truth destroys anyone who speaks it. The catalyst is the public affidavit. Her commitment comes when she puts it on the record, which forces her into the investigation and closes the private escape route.",
      "Act II: her old tactic is controlling evidence alone. The first sequence makes that tactic appear to work, but the midpoint reveals that Eli carried the missing reel, therefore her apparent proof becomes a relationship betrayal. That reversal drives escalating public pressure. The all is lost crisis comes when Mara broadcasts the wrong memory and loses Eli's trust, which forces changed behavior instead of another clever concealment.",
      "Act III: Mara needs to surrender control and tell the unedited truth. The planted reel and her promise to Eli pay off in the climax when she gives him the final choice. Her changed behavior resolves the central question, and the final image transforms the edit-bay monitor from a hiding place into a public witness.",
      "Next three scenes: Mara discovers the reel splice; Eli refuses her old tactic; Mara chooses the live microphone and makes the hearing inevitable.",
    ].join("\n\n"),
  });
  assert.equal(quality.ok, true);
  assert.equal(quality.reason, "ok");
  assert.equal(quality.score, 1);
});

test("[structural-quality] leaves page writes and ordinary talk alone", () => {
  for (const modelReason of ["screenplay_page_write", "knowledge_answer", ""]) {
    const quality = evaluateStructuralScreenplayReply({ modelReason, reply: "Anything." });
    assert.equal(quality.applicable, false);
    assert.equal(quality.ok, true);
  }
});

test("[structural-quality] repair prompt preserves canon and asks only for failed dimensions", () => {
  const messages = buildStructuralScreenplayRepairMessages({
    modelReason: "screenplay_feature_architecture",
    userRequest: "Help me finish the feature.",
    weakDraft: "Act I is setup, Act II is conflict, Act III is resolution.",
    quality: {
      reason: "missing_causal_act_bridges",
      score: 0.57,
      repairDirectives: ["Connect each act causally."],
    },
    studioMeta: {
      screenplayAct: "Act II",
      screenplayProtagonistWant: "Mara wants to expose the forged testimony.",
      screenplayCorrectionReplacements: ["sealed affidavit -> public affidavit"],
      screenplayUnresolvedSetups: ["the missing reel"],
    },
  });
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /Silently fix only the failed dimensions/);
  assert.match(messages[0].content, /Never invent missing project facts/);
  assert.match(messages[1].content, /FAILED_REASON: missing_causal_act_bridges/);
  assert.match(messages[1].content, /CANON_CORRECTION: sealed affidavit -> public affidavit/);
  assert.match(messages[1].content, /OPEN_SETUP: the missing reel/);
  assert.match(messages[1].content, /Mara wants to expose/);
});

test("[structural-quality] accepts only a meaningfully stronger repair candidate", () => {
  assert.equal(shouldAcceptStructuralRepair(
    { applicable: true, ok: false, score: 0.42, passedDimensions: 3 },
    { applicable: true, ok: false, score: 0.71, passedDimensions: 5 },
  ), true);
  assert.equal(shouldAcceptStructuralRepair(
    { applicable: true, ok: false, score: 0.71, passedDimensions: 5 },
    { applicable: true, ok: false, score: 0.57, passedDimensions: 4 },
  ), false);
  assert.equal(shouldAcceptStructuralRepair(
    { applicable: true, ok: false, score: 0.86, passedDimensions: 6 },
    { applicable: true, ok: true, score: 1, passedDimensions: 7 },
  ), true);
});
