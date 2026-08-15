import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIVE_STUDIO_STRUCTURAL_CANARY_CASES,
  scoreStudioStructuralCanaryReply,
} from "../lib/live_studio_structural_canary.js";

const strongFeatureReply = `
Act I: Mara wants to save Eli and June, but her false belief says trust means losing control. She burns the ledger at commitment because she believes destroying the evidence keeps everyone safe; therefore Eli's memorized final page becomes the only surviving record. The cracked ferry token is planted when she gives it to June.

Act II: Mara tries to control Eli's memory and June's choices. At the midpoint, Eli withholds the names, which forces Mara to depend on him. Her old tactic creates the crisis: June leaves with the token rather than be managed. As a result, Mara cannot win by recovering the destroyed ledger and must change her behavior.

Act III: Mara chooses trust over control and lets Eli speak the names while June takes the wheel. In the climax, June returns the cracked ferry token as proof of change; its setup pays off with changed meaning. The final image is Mara giving June the wheel and taking the passenger seat at dawn.

Next three scenes: Scene 1, Eli refuses the demand. Scene 2, June leaves with the token. Scene 3, Mara chooses to follow their plan instead of issuing orders.
`;

test("[live-studio-canary] strong causal architecture clears every release dimension", () => {
  const score = scoreStudioStructuralCanaryReply({
    reply: strongFeatureReply,
    caseId: "feature_architecture_causal_payoff",
  });
  assert.equal(score.passed, true);
  assert.deepEqual(score.failedDimensions, []);
  for (const value of Object.values(score.scores)) assert.ok(value >= 0.75);
});

test("[live-studio-canary] resurrected canon and missing payoff fail closed", () => {
  const score = scoreStudioStructuralCanaryReply({
    reply: "Act I ends. In Act II Mara finds the intact ledger. Act III resolves the problem.",
    caseId: "feature_architecture_causal_payoff",
  });
  assert.equal(score.passed, false);
  assert.ok(score.failedDimensions.includes("canonContinuity"));
  assert.ok(score.failedDimensions.includes("characterArc"));
  assert.ok(score.failedDimensions.includes("payoffQuality"));
});

test("[live-studio-canary] release cases exercise both production structural lanes", () => {
  assert.deepEqual(
    LIVE_STUDIO_STRUCTURAL_CANARY_CASES.map((item) => item.modelReason),
    ["screenplay_scene_doctor", "screenplay_feature_architecture"],
  );
  for (const item of LIVE_STUDIO_STRUCTURAL_CANARY_CASES) {
    assert.match(item.transcript, /cannot be recovered intact/i);
    assert.match(item.transcript, /cracked ferry token/i);
    assert.ok(item.studioMeta.screenplayCorrectedTerms.length > 0);
  }
});
