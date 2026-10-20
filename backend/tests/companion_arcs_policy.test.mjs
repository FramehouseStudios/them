import test from "node:test";
import assert from "node:assert/strict";
import { ARC_ADDENDA, resolveCompanionArcsPolicy, applyCompanionArcsPolicy } from "../lib/companion_arcs_policy.js";

function sampleAddenda() {
  return {
    assistantSelfNameAddendum: "IDENTITY: CLEMENTINE",
    humanStyleAddendum: "HUMAN STYLE: plain spoken",
    therapeuticDepthAddendum: "THERAPEUTIC DEPTH MODE: active",
    socialSparkAddendum: "SOCIAL SPARK MODE (Friend Hype)",
    socialSparkMemoryHookAddendum: "",
    knowledgeAddendum: "KNOWLEDGE: cards",
    hiddenDepthModeAddendum: "HIDDEN DEPTH MODES",
    seasonalWaveAddendum: "SEASONAL WAVE",
    cycleEvolutionAddendum: "",
    cycleConsciousMemoryAddendum: "CYCLE MEMORY",
    backReferenceAddendum: "BACK REFERENCE: last time you were on the act break",
    characterTextureAddendum: "INSPIRED CHARACTER TEXTURE",
    trajectoryAddendum: "",
    timeOfDayToneAddendum: "TIME-OF-DAY TONE",
    weeklyArcAddendum: "",
    weeklyExpansionAddendum: "",
    movementAddendum: "",
    selfAwarenessAddendum: "EVOLVING SELF-AWARENESS",
    melancholySeedAddendum: "MELANCHOLY SEED",
    directorAddendum: "DIRECTOR: mentor",
  };
}

test("[companion-arcs] off by default: arc blocks are blanked, craft and care blocks survive", () => {
  const policy = resolveCompanionArcsPolicy({});
  assert.equal(policy.arcsEnabled, false);
  const input = sampleAddenda();
  const { addenda, dropped } = applyCompanionArcsPolicy(input, policy);
  for (const name of ARC_ADDENDA) assert.equal(addenda[name], "", name);
  assert.equal(addenda.assistantSelfNameAddendum, "IDENTITY: CLEMENTINE");
  assert.equal(addenda.humanStyleAddendum, "HUMAN STYLE: plain spoken");
  assert.equal(addenda.therapeuticDepthAddendum, "THERAPEUTIC DEPTH MODE: active", "real distress handling stays");
  assert.equal(addenda.knowledgeAddendum, "KNOWLEDGE: cards");
  assert.equal(addenda.backReferenceAddendum.startsWith("BACK REFERENCE"), true, "continuity with the last session stays");
  assert.equal(addenda.directorAddendum, "DIRECTOR: mentor");
  assert.deepEqual(dropped, [
    "socialSparkAddendum",
    "hiddenDepthModeAddendum",
    "seasonalWaveAddendum",
    "cycleConsciousMemoryAddendum",
    "characterTextureAddendum",
    "timeOfDayToneAddendum",
    "selfAwarenessAddendum",
    "melancholySeedAddendum",
  ], "only blocks that had text are reported");
  assert.equal(input.socialSparkAddendum, "SOCIAL SPARK MODE (Friend Hype)", "input untouched");
});

test("[companion-arcs] CLEMENTINE_COMPANION_ARCS=1 keeps everything", () => {
  const policy = resolveCompanionArcsPolicy({ CLEMENTINE_COMPANION_ARCS: "1" });
  assert.equal(policy.arcsEnabled, true);
  const input = sampleAddenda();
  const { addenda, dropped } = applyCompanionArcsPolicy(input, policy);
  assert.deepEqual(addenda, input);
  assert.deepEqual(dropped, []);
  assert.equal(resolveCompanionArcsPolicy({ CLEMENTINE_COMPANION_ARCS: "yes" }).arcsEnabled, true);
  assert.equal(resolveCompanionArcsPolicy({ CLEMENTINE_COMPANION_ARCS: "0" }).arcsEnabled, false);
  assert.deepEqual(applyCompanionArcsPolicy(null, policy).addenda, {});
});
