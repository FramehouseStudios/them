#!/usr/bin/env node
// Deterministic quality gate for Clementine's memory-grounded writer-block loop.

import process from "node:process";

import { buildMomentumRescueFallbackReply } from "../lib/momentum_rescue_fallback.js";
import { buildModelPrompt, inferScreenplayTask } from "../lib/prompt_assembly.js";
import { evaluateMomentumRescueQuality } from "../lib/screenplay_page_quality.js";
import { fitSystemPromptForTurnLatency } from "../lib/system_prompt_trim.js";
import {
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
check("rank trace exposes score, evidence, move, and success check", [
  "score=",
  "evidence=",
  "move=",
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

if (!allOK) {
  console.error("writer-block rescue eval: FAILED");
  process.exit(1);
}
console.log("writer-block rescue eval: OK");
