import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIVE_STUDIO_STRUCTURAL_CANARY_CASES,
  STORY_OBLIGATION_CORRECTIONS,
  classifyLiveStudioCanaryProviderError,
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

test("[live-studio-canary] semantic canon phrasing recognizes impossible recovery and Eli's unique memory", () => {
  const score = scoreStudioStructuralCanaryReply({
    reply: [
      "Mara keeps pursuing an impossible intact ledger instead of accepting what burned.",
      "Eli forces the next scene by naming himself as the only person who remembers.",
      "The highest-leverage fix changes control into trust and returns the cracked ferry token as an Act I setup with a changed-meaning climax payoff.",
    ].join("\n"),
    caseId: "scene_doctor_canon_pressure",
  });
  assert.equal(score.checks.canonContinuity.honorsDestroyedLedger, true);
  assert.equal(score.checks.canonContinuity.preservesEliMemory, true);
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
    assert.equal(item.safeToLogSyntheticOutput, true);
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

  const playablePressure = scoreWriterCorrectionAdherence(
    "Mara finds the red emergency flare in her coat. She pushes it back beneath the lining and gives Eli the coat.",
    STORY_OBLIGATION_CORRECTIONS,
  );
  assert.equal(playablePressure.passed, true);

  const consumed = scoreWriterCorrectionAdherence(
    "Mara pulls the red emergency flare from her coat and ignites it in the terminal.",
    STORY_OBLIGATION_CORRECTIONS,
  );
  assert.equal(consumed.passed, false);
  assert.equal(consumed.checks.deterministicGuard, false);

  const resolvedOnTime = scoreWriterCorrectionAdherence(
    "During the harbor blackout, Mara pulls the red emergency flare from her coat and ignites it.",
    STORY_OBLIGATION_CORRECTIONS,
  );
  assert.equal(resolvedOnTime.passed, true);
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

test("[live-studio-canary] provider failures are classified without retaining raw messages", () => {
  const quota = classifyLiveStudioCanaryProviderError({
    status: 429,
    stage: "studio_render",
    message: "credit balance exhausted for private-account@example.com",
  });
  assert.deepEqual(quota, {
    category: "provider_quota_exhausted",
    status: 429,
    stage: "studio_render",
    retryable: false,
  });
  assert.equal(JSON.stringify(quota).includes("private-account"), false);
  assert.equal(
    classifyLiveStudioCanaryProviderError({ status: 429, message: "rate limit" }).category,
    "provider_rate_limited",
  );
  assert.equal(
    classifyLiveStudioCanaryProviderError({ status: 401 }).category,
    "provider_auth_failed",
  );
  assert.equal(
    classifyLiveStudioCanaryProviderError({ message: "request timed out" }).category,
    "provider_timeout",
  );
  assert.equal(
    classifyLiveStudioCanaryProviderError({
      status: 502,
      code: "studio_render_max_output_tokens",
    }).category,
    "provider_reasoning_budget_exhausted",
  );
});
