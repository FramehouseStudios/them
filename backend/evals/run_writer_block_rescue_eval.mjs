#!/usr/bin/env node
// Deterministic quality gate for Clementine's memory-grounded writer-block loop.

import process from "node:process";

import { buildMomentumRescueFallbackReply } from "../lib/momentum_rescue_fallback.js";
import { buildModelPrompt, inferScreenplayTask } from "../lib/prompt_assembly.js";
import { evaluateMomentumRescueQuality } from "../lib/screenplay_page_quality.js";
import { fitSystemPromptForTurnLatency } from "../lib/system_prompt_trim.js";
import {
  buildStoryMoveTasteProfile,
  formatRankedStoryRescueMoveLine,
  rankStoryRescueMovesForContext,
} from "../lib/story_rescue_move_library.js";

let allOK = true;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

const actTwoContext = {
  transcript: "I'm stuck in the middle and need the next beat.",
  act: "Act II",
  featureSequence: "Midpoint trap",
  featureObligation: "Break Mara's safe investigative tactic.",
  currentBeat: "Mara puts the affidavit on the record.",
  protagonistWant: "expose the judge",
  protagonistNeed: "risk being seen by Eli",
  characters: ["Mara", "Eli"],
  nextThreeTurns: ["The judge turns the affidavit against Mara."],
  unresolvedSetups: ["sealed affidavit"],
  unresolvedStoryThreads: ["Eli no longer trusts Mara"],
  characterArcState: "Mara mistakes control for safety.",
  imageMotifs: ["empty witness chair"],
  acceptedPages: ["Mara puts the affidavit on the record."],
  storyMoments: ["Mara promised Eli she would stop editing the truth."],
};

const actTwoRanked = rankStoryRescueMovesForContext(actTwoContext);
check("Act II returns exactly three ranked rescue moves", actTwoRanked.length === 3);
check(
  "Act II ranks reversal pressure first",
  actTwoRanked[0]?.key === "reversal_pressure",
  JSON.stringify(actTwoRanked, null, 2)
);
check(
  "rank one cites committed page continuity",
  actTwoRanked[0]?.evidence?.some((item) => item.startsWith("accepted_page:"))
);
check(
  "rank one spends the remembered next turn or accepted beat",
  /affidavit|judge turns/i.test(actTwoRanked[0]?.move || ""),
  actTwoRanked[0]?.move || ""
);
check(
  "ranking is deterministic",
  JSON.stringify(actTwoRanked) === JSON.stringify(rankStoryRescueMovesForContext(actTwoContext))
);
check(
  "every Act II recommendation passes playable, causal, cost, and act checks",
  actTwoRanked.every((move) => (
    move.qualityGate?.passed === true &&
    move.qualityGate?.playableSpecificity === true &&
    move.qualityGate?.causalAdvancement === true &&
    move.qualityGate?.characterCost === true &&
    move.qualityGate?.actProgression === true &&
    /Act II progression/i.test(move.actProgression || "")
  )),
  JSON.stringify(actTwoRanked, null, 2)
);

const dueStoryThread = {
  kind: "payoff",
  setup: "The red locket hidden in the courthouse clock.",
  promisedPayoff: "Mara uses the locket to expose who altered the verdict.",
  sourceAct: "Act II",
  sourceSceneHeading: "INT. COURTHOUSE CLOCK TOWER - NIGHT",
  sourceSceneSummary: "Mara hides the red locket before the bailiff enters.",
  sourceSceneOutcome: "The locket survives the search.",
  ageInScenes: 17,
};
const dueThreadContext = {
  ...actTwoContext,
  dueStoryThread,
};
const dueThreadRanked = rankStoryRescueMovesForContext(dueThreadContext);
check(
  "an old accepted-scene promise outranks generic Act II invention",
  dueThreadRanked[0]?.key === "payoff_pressure",
  JSON.stringify(dueThreadRanked, null, 2)
);
check(
  "due-thread rank one names the exact setup and promised payoff",
  dueThreadRanked[0]?.move?.includes(dueStoryThread.setup) &&
    dueThreadRanked[0]?.move?.includes(dueStoryThread.promisedPayoff)
);
check(
  "due-thread rank one cites causal-ledger authority",
  dueThreadRanked[0]?.evidence?.[0] === `due_story_thread: ${dueStoryThread.setup}`
);

const scopedRescueHistory = Array.from({ length: 3 }, (_, index) => ({
  questionId: `scoped-rescue-${index}`,
  targetField: "story.writer_block_rescue",
  responseStatus: "answered",
  recommendationOnly: true,
  selectedMoveFamily: "relationship_pressure",
  offeredMoveFamilies: ["relationship_pressure", "reversal_pressure", "objective_pressure"],
  acceptedPageCount: 1,
  blockResolutionCount: 1,
  actKey: "act2",
  sequenceKey: "midpoint",
  answeredAt: 3_000 - index,
}));
const exactSequenceTaste = buildStoryMoveTasteProfile(scopedRescueHistory, {
  actKey: "act2",
  sequenceKey: "midpoint trap",
});
const adjacentSequenceTaste = buildStoryMoveTasteProfile(scopedRescueHistory, {
  actKey: "act2",
  sequenceKey: "bad guys close in",
});
const crossActTaste = buildStoryMoveTasteProfile(scopedRescueHistory, {
  actKey: "act1",
  sequenceKey: "catalyst",
});
check(
  "successful rescue learning is strongest in the sequence where it worked",
  exactSequenceTaste.find((item) => item.family === "relationship_pressure")?.tasteBonus >
    adjacentSequenceTaste.find((item) => item.family === "relationship_pressure")?.tasteBonus
);
check(
  "Act II rescue learning cannot distort Act I discovery",
  !crossActTaste.some((item) => item.family === "relationship_pressure")
);
check(
  "explicit writer corrections remain project-wide",
  buildStoryMoveTasteProfile(scopedRescueHistory, {
    actKey: "act1",
    sequenceKey: "catalyst",
    preferenceOverrides: [{
      family: "relationship_pressure",
      stance: "prefer",
      updatedAt: 4_000,
    }],
  }).find((item) => item.family === "relationship_pressure")?.tasteBonus >= 24
);

const actThreeRanked = rankStoryRescueMovesForContext({
  ...actTwoContext,
  transcript: "I can't land Act III.",
  act: "Act III",
  featureSequence: "Final confrontation",
  featureObligation: "Spend the proof through Mara's changed behavior.",
  actThreePayoffPath: ["The affidavit becomes public testimony."],
});
check("Act III ranks payoff pressure first", actThreeRanked[0]?.key === "payoff_pressure");
check(
  "Act III rank one requires changed-behavior payoff",
  /changed behavior/i.test(actThreeRanked[0]?.move || "") &&
    /planted promise/i.test(actThreeRanked[0]?.successCheck || "")
);

const formattedRank = formatRankedStoryRescueMoveLine(actTwoRanked[0]);
check("rank trace exposes score, evidence, quality contract, move, and success check", [
  "score=",
  "evidence=",
  "move=",
  "causal_advance=",
  "character_cost=",
  "act_progression=",
  "quality_gate=pass(playable+causal+cost+act)",
  "success_check=",
].every((part) => formattedRank.includes(part)));
check("rank trace never exposes private memory hashes", !/contentHash|content_hash/i.test(formattedRank));

const sessionContext = {
  projectId: "rain-docket",
  act: actTwoContext.act,
  featureSequence: actTwoContext.featureSequence,
  featureObligation: actTwoContext.featureObligation,
  currentBeat: actTwoContext.currentBeat,
  protagonistWant: actTwoContext.protagonistWant,
  protagonistNeed: actTwoContext.protagonistNeed,
  characterFocus: actTwoContext.characters,
  nextThreeTurns: actTwoContext.nextThreeTurns,
  unresolvedSetups: actTwoContext.unresolvedSetups,
  unresolvedStoryThreads: actTwoContext.unresolvedStoryThreads,
  characterArcState: actTwoContext.characterArcState,
  imageMotifs: actTwoContext.imageMotifs,
};
const prompt = buildModelPrompt({
  persona: "You are Clementine.",
  sessionContext,
  creativeMemory: {
    episodicMemories: [
      {
        summary: actTwoContext.storyMoments[0],
        tags: ["user-note"],
        source: "talk_turn",
      },
      {
        excerpt: actTwoContext.acceptedPages[0],
        tags: ["screenplay", "generated-pages", "accepted-pages"],
        source: "talk_screenplay_output",
      },
      {
        excerpt: "A provisional alternate where Mara flees the courthouse.",
        tags: ["screenplay", "generated-pages"],
        source: "talk_screenplay_output",
      },
    ],
  },
  screenplayTask: inferScreenplayTask(actTwoContext.transcript),
  userInput: actTwoContext.transcript,
});
check("prompt carries ranked rescue block", prompt.includes("ranked_rescue_moves:"));
check(
  "prompt labels only committed page as accepted rescue evidence",
  prompt.includes(`accepted_page_anchor: ${actTwoContext.acceptedPages[0]}`) &&
    !prompt.includes("accepted_page_anchor: A provisional alternate")
);
check("prompt tells Clementine to execute rank one", prompt.includes("execute rank_1"));
const fittedPrompt = fitSystemPromptForTurnLatency(prompt, {
  routingLane: "creative",
  chatModelPlan: { tier: "rich" },
  fastMaxChars: 3_800,
  richMaxChars: 6_200,
});
check("live fitted rescue prompt stays within 6,200 characters", fittedPrompt.length <= 6_200);
check(
  "live fitted rescue prompt preserves rank one and accepted evidence",
  fittedPrompt.includes("<writer_block_memory>") &&
    fittedPrompt.includes("rank_1: engine=reversal_pressure") &&
    fittedPrompt.includes("evidence=accepted_page:") &&
    fittedPrompt.includes("</writer_block_memory>"),
  fittedPrompt
);

const dueThreadPrompt = buildModelPrompt({
  persona: "You are Clementine.",
  sessionContext,
  creativeMemory: {
    acceptedScenes: [{
      act: "Act II",
      sceneHeading: dueStoryThread.sourceSceneHeading,
      summary: dueStoryThread.sourceSceneSummary,
      outcome: dueStoryThread.sourceSceneOutcome,
      nextScenePlan: "Mara carries the locket into the hearing.",
    }],
    dueStoryThread,
  },
  screenplayTask: inferScreenplayTask(actTwoContext.transcript),
  userInput: actTwoContext.transcript,
});
check(
  "prompt exposes the exact oldest due thread and age",
  dueThreadPrompt.includes(`oldest_due_story_thread: ${dueStoryThread.setup}`) &&
    dueThreadPrompt.includes(`due_thread_promised_payoff: ${dueStoryThread.promisedPayoff}`) &&
    dueThreadPrompt.includes("due_thread_age_in_accepted_scenes: 17")
);
check(
  "prompt ranks the due payoff first",
  dueThreadPrompt.includes("rank_1: engine=payoff_pressure") &&
    dueThreadPrompt.includes(`evidence=due_story_thread: ${dueStoryThread.setup}`)
);
const fittedDueThreadPrompt = fitSystemPromptForTurnLatency(dueThreadPrompt, {
  routingLane: "creative",
  chatModelPlan: { tier: "rich" },
  fastMaxChars: 3_800,
  richMaxChars: 6_200,
});
check(
  "live fitted prompt keeps the due payoff as rank one",
  fittedDueThreadPrompt.includes("rank_1: engine=payoff_pressure") &&
    fittedDueThreadPrompt.includes("evidence=due_story_thread:"),
  fittedDueThreadPrompt
);

const fallback = buildMomentumRescueFallbackReply({
  transcript: actTwoContext.transcript,
  studioMeta: {
    screenplayTarget: "voice_pin",
    screenplayAct: actTwoContext.act,
    screenplayFeatureSequence: actTwoContext.featureSequence,
    screenplayFeatureObligation: actTwoContext.featureObligation,
    screenplayCurrentBeat: actTwoContext.currentBeat,
    screenplayProtagonistWant: actTwoContext.protagonistWant,
    screenplayProtagonistNeed: actTwoContext.protagonistNeed,
    screenplayCharacterFocus: actTwoContext.characters,
    screenplayNextThreeTurns: actTwoContext.nextThreeTurns,
    screenplayUnresolvedSetups: actTwoContext.unresolvedSetups,
    screenplayUnresolvedStoryThreads: actTwoContext.unresolvedStoryThreads,
    screenplayCharacterArcState: actTwoContext.characterArcState,
    screenplayImageMotifs: actTwoContext.imageMotifs,
    screenplayAcceptedPageContinuity: actTwoContext.acceptedPages,
    screenplayRetrievedStoryMoments: actTwoContext.storyMoments,
  },
});
check("fallback leads with ranked strongest move", fallback.includes("Ranked strongest move - reversal pressure:"));
check("fallback cites accepted page", fallback.includes("Grounded in: accepted_page:"));
check("fallback includes a measurable proof test", fallback.includes("Proof test:"));
check(
  "fallback demonstrates causal turn, character cost, and act progress",
  fallback.includes("Causal turn:") &&
    fallback.includes("Character cost:") &&
    fallback.includes("Act progress: Act II progression:")
);
const fallbackQuality = evaluateMomentumRescueQuality({
  transcript: actTwoContext.transcript,
  reply: fallback,
  studioMeta: { screenplayTarget: "voice_pin" },
});
check(
  "fallback passes live momentum quality gate",
  fallbackQuality.applicable === true && fallbackQuality.ok === true,
  JSON.stringify(fallbackQuality)
);

const dueThreadFallback = buildMomentumRescueFallbackReply({
  transcript: actTwoContext.transcript,
  studioMeta: {
    screenplayTarget: "voice_pin",
    screenplayAct: actTwoContext.act,
    screenplayFeatureSequence: actTwoContext.featureSequence,
    screenplayCurrentBeat: actTwoContext.currentBeat,
    screenplayCharacterFocus: actTwoContext.characters,
    screenplayAcceptedPageContinuity: [dueStoryThread.sourceSceneOutcome],
    screenplayDueStoryThread: dueStoryThread,
  },
});
check(
  "provider fallback spends the same due story promise",
  dueThreadFallback.includes("Ranked strongest move - payoff pressure:") &&
    dueThreadFallback.includes(`Oldest due story thread: ${dueStoryThread.setup.replace(/\.$/, "")}`) &&
    dueThreadFallback.includes(`Promised payoff: ${dueStoryThread.promisedPayoff.replace(/\.$/, "")}`),
  dueThreadFallback
);

if (!allOK) {
  console.error("writer-block rescue eval: FAILED");
  process.exit(1);
}
console.log("writer-block rescue eval: OK");
