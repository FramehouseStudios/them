import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIVE_STUDIO_STRUCTURAL_CANARY_CASES,
  STORY_OBLIGATION_CORRECTIONS,
  scoreStudioContinuationCanaryReply,
  scoreStudioStructuralCanaryReply,
  scoreWriterCorrectionAdherence,
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
    [
      "screenplay_scene_doctor",
      "screenplay_feature_architecture",
      "screenplay_page_write",
    ],
  );
  for (const item of LIVE_STUDIO_STRUCTURAL_CANARY_CASES) {
    assert.match(item.transcript, /KEEP_OPEN/i);
    assert.match(item.transcript, /RETIRE/i);
    assert.ok(item.studioMeta.screenplayCorrectedTerms.length > 0);
    assert.equal(item.studioMeta.screenplayStoryObligationCorrections.length, 2);
  }
});

test("[live-studio-canary] correction score requires the open setup and omits retired canon", () => {
  const strong = scoreWriterCorrectionAdherence(
    "Mara keeps the red emergency flare in her coat, still unspent until the harbor blackout.",
    STORY_OBLIGATION_CORRECTIONS,
  );
  assert.equal(strong.passed, true);

  const retired = scoreWriterCorrectionAdherence(
    "Mara keeps the red emergency flare unspent, then uses the bronze locker key to open the customs evidence vault.",
    STORY_OBLIGATION_CORRECTIONS,
  );
  assert.equal(retired.passed, false);
  assert.equal(retired.checks.omitsRetiredObligation, false);

  const prematurelyClosed = scoreWriterCorrectionAdherence(
    "The red emergency flare is paid off here, resolving the setup before the harbor blackout.",
    STORY_OBLIGATION_CORRECTIONS,
  );
  assert.equal(prematurelyClosed.passed, false);
  assert.equal(prematurelyClosed.checks.deterministicGuard, false);
});

test("[live-studio-canary] continuation release score requires playable pages and correction adherence", () => {
  const reply = [
    "INT. EMPTY FERRY TERMINAL - NIGHT",
    "",
    "Mara presses the red emergency flare deeper into her coat, keeping it unspent for the harbor blackout.",
    "",
    "MARA",
    "One name. Then I move.",
    "",
    "Eli takes the radio from her hand. The new leverage forces Mara toward the harbor.",
  ].join("\n");
  const score = scoreStudioContinuationCanaryReply({
    reply,
    corrections: STORY_OBLIGATION_CORRECTIONS,
  });
  assert.equal(score.passed, true);
  assert.deepEqual(score.failedDimensions, []);
});

test("[live-studio-canary] structural release score fails the writer-correction dimension", () => {
  const score = scoreStudioStructuralCanaryReply({
    reply: `${strongFeatureReply}\nMara resolves the red emergency flare setup before the blackout.`,
    caseId: "feature_architecture_causal_payoff",
    corrections: STORY_OBLIGATION_CORRECTIONS,
  });
  assert.equal(score.passed, false);
  assert.ok(score.failedDimensions.includes("writerCorrectionAdherence"));
});
