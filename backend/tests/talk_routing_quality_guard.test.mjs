// Deterministic guard for the eval-quality regression behind the
// PR #33 eval gate (knowledge_art_history, knowledge_philosophy,
// knowledge_learning_science, playful_banter_humor).
//
// Turns those four failing regression cases into a fast, network-free
// automated check on the *root-cause behavior*, not the LLM scorecard:
//
//  - Knowledge questions must route to the knowledge tier AND a
//    knowledge-grade model (NOT the fast/mini model). Prior bug:
//    CHAT_MODEL_KNOWLEDGE defaulted to CHAT_MODEL_FAST (gpt-4o-mini),
//    under-serving substantive knowledge answers in production while
//    the regression eval force-riches (a prod/eval divergence).
//  - Explicit playful/banter ("roast me ... lol") must produce a
//    playful intent + bright_playful emotion + a witty turn-back move.
//    Prior bug: flags.isPlayful was detected but never consumed by
//    inferRoutingPriorityLane/buildTurnPlanner, so it fell through to
//    intent="reflective_checkin" (an earnest check-in, not banter).
//  - Regression-direction: a plain emotional turn must STILL be
//    reflective_checkin (the new playful branch must not over-trigger).
//
// Pure functions, no OpenAI call. The LLM-graded regression eval
// (run_nightly_regression.mjs) is CI-only (needs OPENAI_API_KEY); this
// guard is the deterministic proof that the failing behavior is fixed.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY ||= "deterministic-guard-no-network";
process.env.RUN_SERVER = "0";

const {
  directorFlagsFromTranscript,
  inferRoutingPriorityLane,
  buildTurnPlanner,
  selectChatModelForTurn,
  computeChatMaxTokensForTurn,
  resolveTalkScreenplayRequestedPageBatch,
} = await import("../index.js");

function plan(transcript) {
  const flags = directorFlagsFromTranscript(transcript);
  const routingPlan = inferRoutingPriorityLane(transcript, flags);
  const turnPlanner = buildTurnPlanner({
    transcript, flags, routingPlan, behaviorMode: "growth", memory: {},
  });
  const modelPlan = selectChatModelForTurn({
    transcript, turnPlanner, flags, routingLane: routingPlan?.lane,
  });
  return { flags, routingPlan, turnPlanner, modelPlan };
}

const KNOWLEDGE = [
  ["knowledge_art_history", "What changed between Renaissance art and Baroque art, and why does it matter?"],
  ["knowledge_philosophy", "Explain Stoicism like I'm in high school, then give me one deeper philosophical criticism."],
  ["knowledge_learning_science", "What's the fastest evidence-based way to learn a hard skill without burning out?"],
];

for (const [id, transcript] of KNOWLEDGE) {
  test(`[33-guard] ${id}: knowledge tier + knowledge-grade model (not fast/mini)`, () => {
    const { routingPlan, turnPlanner, modelPlan } = plan(transcript);
    assert.equal(routingPlan.lane, "knowledge", "must route to the knowledge lane");
    assert.equal(turnPlanner.intent, "knowledge_answer", "intent must be knowledge_answer");
    assert.equal(turnPlanner.requiresSubstantiveAnswer, true, "knowledge answer must be substantive");
    assert.equal(modelPlan.tier, "knowledge", "model tier must be knowledge");
    // Core regression fix: knowledge tier must NOT fall back to the
    // fast/mini model. gpt-4o-mini gives shallow knowledge answers.
    assert.notEqual(modelPlan.model, "gpt-4o-mini", `${id} must not use gpt-4o-mini`);
    assert.ok(/gpt-4o(?!-mini)/.test(modelPlan.model), `${id} should use a knowledge-grade model, got ${modelPlan.model}`);
  });
}

test("[33-guard] playful_banter_humor: explicit roast -> playful banter, not reflective_checkin", () => {
  const t = "Okay roast me gently: I sent a risky text and now I'm overthinking everything lol.";
  const { flags, turnPlanner } = plan(t);
  assert.equal(flags.isPlayful, true, "isPlayful must be detected for an explicit roast/lol turn");
  assert.equal(turnPlanner.intent, "playful_banter", "isPlayful must drive intent=playful_banter");
  assert.notEqual(turnPlanner.intent, "reflective_checkin", "must not fall through to reflective_checkin");
  assert.equal(turnPlanner.emotionToMatch, "bright_playful", "playful turn must match bright_playful");
  assert.match(
    String(turnPlanner.nextBestMove || ""),
    /witty|playful|turn_back/,
    "playful next-best-move must cue witty + turn-taking",
  );
});

test("[33-guard] no collateral regression: a plain emotional turn stays reflective_checkin", () => {
  const { turnPlanner } = plan("I feel kind of lost today and I'm not sure why.");
  assert.equal(turnPlanner.intent, "reflective_checkin",
    "the new playful branch must not over-trigger on non-playful emotional turns");
});

test("[screenplay-budget] normal companion talk stays compact", () => {
  const { flags, routingPlan, turnPlanner, modelPlan } = plan("keep going");
  const maxTokens = computeChatMaxTokensForTurn({
    transcript: "keep going",
    turnPlanner,
    flags,
    routingLane: routingPlan?.lane,
    chatModelPlan: modelPlan,
  });
  assert.ok(maxTokens <= 190, `normal talk should stay compact, got ${maxTokens}`);
});

test("[screenplay-budget] page-write turns get enough budget for feature page sprints", () => {
  const transcript = "Write the next ten pages of act two and keep the feature moving fast.";
  const { flags, routingPlan, turnPlanner, modelPlan } = plan(transcript);
  const maxTokens = computeChatMaxTokensForTurn({
    transcript,
    turnPlanner,
    flags,
    routingLane: routingPlan?.lane,
    chatModelPlan: modelPlan,
    screenplayPageWrite: true,
  });
  assert.ok(maxTokens >= 2300, `ten-page page-write needs a larger budget, got ${maxTokens}`);
  assert.ok(maxTokens <= 3200, `screenplay page-write budget should remain bounded, got ${maxTokens}`);
});

test("[screenplay-budget] range-based feature continuation briefs get batch budget", () => {
  const transcript = "Continue the feature as feature-film screenplay pages. Write 3-5 pages in Fountain format only.";
  const { flags, routingPlan, turnPlanner, modelPlan } = plan(transcript);
  const maxTokens = computeChatMaxTokensForTurn({
    transcript,
    turnPlanner,
    flags,
    routingLane: routingPlan?.lane,
    chatModelPlan: modelPlan,
    screenplayPageWrite: true,
  });
  assert.ok(maxTokens >= 1750, `3-5 page continuation needs five-page budget, got ${maxTokens}`);
  assert.ok(maxTokens <= 3200, `range-based page-write budget should remain bounded, got ${maxTokens}`);
});

test("[screenplay-budget] long feature page batches can use the expanded bounded cap", () => {
  const transcript = "Write the next fifteen pages of act three and pay off the ending image.";
  const { flags, routingPlan, turnPlanner, modelPlan } = plan(transcript);
  const maxTokens = computeChatMaxTokensForTurn({
    transcript,
    turnPlanner,
    flags,
    routingLane: routingPlan?.lane,
    chatModelPlan: modelPlan,
    screenplayPageWrite: true,
  });
  assert.ok(maxTokens >= 3200, `fifteen-page page-write needs expanded cap, got ${maxTokens}`);
  assert.ok(maxTokens <= 3200, `default long page-write budget should stay at configured cap, got ${maxTokens}`);
});

test("[screenplay-budget] explicit requested page count overrides missing transcript count", () => {
  const transcript = "Continue the feature from the remembered turn.";
  const { flags, routingPlan, turnPlanner, modelPlan } = plan(transcript);
  const maxTokens = computeChatMaxTokensForTurn({
    transcript,
    turnPlanner,
    flags,
    routingLane: routingPlan?.lane,
    chatModelPlan: modelPlan,
    screenplayPageWrite: true,
    screenplayRequestedPages: 8,
  });
  assert.ok(maxTokens >= 2300, `explicit eight-page request needs batch budget, got ${maxTokens}`);
  assert.ok(maxTokens <= 3200, `explicit requested-page budget should remain bounded, got ${maxTokens}`);
});

test("[screenplay-budget] Studio generation brief preserves its requested page batch", () => {
  const generationTranscript = [
    "Continue the feature from the remembered turn.",
    "- Requested page batch: 10 pages",
    "- Target act from request: Act II",
  ].join("\n");
  const requestedPages = resolveTalkScreenplayRequestedPageBatch({
    transcript: generationTranscript,
    studioMeta: { screenplayTargetPages: 110 },
  });
  assert.equal(requestedPages, 10, "the batch count must not be confused with the feature target");

  const { flags, routingPlan, turnPlanner, modelPlan } = plan("Continue the feature from the remembered turn.");
  const maxTokens = computeChatMaxTokensForTurn({
    transcript: generationTranscript,
    turnPlanner,
    flags,
    routingLane: routingPlan?.lane,
    chatModelPlan: modelPlan,
    screenplayPageWrite: true,
    screenplayRequestedPages: requestedPages,
  });
  assert.ok(maxTokens >= 2300, "ten-page Studio brief needs batch budget, got " + maxTokens);
  assert.ok(maxTokens <= 3200, "Studio batch budget should remain bounded, got " + maxTokens);
});

test("[screenplay-model] short Studio commands keep the rich screenplay model under load", () => {
  const voiceTranscript = "Continue.";
  const generationTranscript = [
    voiceTranscript,
    "- Requested page batch: 10 pages",
    "- Active act: Act II",
    "- Continue as playable Fountain pages with causal scene turns.",
  ].join("\n");
  const { flags, routingPlan, turnPlanner } = plan(voiceTranscript);
  const modelPlan = selectChatModelForTurn({
    transcript: generationTranscript,
    turnPlanner,
    flags,
    routingLane: routingPlan?.lane,
    runtimeStatus: {
      status: "degraded",
      metrics: { sampleCount: 20, p95TotalMs: 12_000 },
    },
    screenplayPageWrite: true,
  });

  assert.equal(modelPlan.tier, "rich");
  assert.equal(modelPlan.reason, "screenplay_page_write");
  assert.equal(modelPlan.loadShed, false, "feature pages must not fall back to the chat model");
  assert.notEqual(modelPlan.model, "gpt-4o-mini");
});
