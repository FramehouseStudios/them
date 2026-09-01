// Clementine cost lanes (D008 / T-clementine-muse-runtime-skeleton).
//
// Intent → lane + default Spark effort. Page never shares a bill with
// Companion. Reflex has no Spark.

import { INTENT } from "./intents.js";

const LANE = Object.freeze({
  REFLEX: "Reflex",
  COMPANION: "Companion",
  PAGE: "Page",
  DEEP: "Deep",
});

/** Muse Spark reasoning effort knobs used by muse_client. */
const EFFORT = Object.freeze({
  NONE: "none",
  MINIMAL: "minimal",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
});

const INTENT_LANE_MAP = Object.freeze({
  [INTENT.GREETING]: { lane: LANE.REFLEX, effort: EFFORT.NONE },
  [INTENT.CHECK_IN]: { lane: LANE.REFLEX, effort: EFFORT.NONE },
  [INTENT.SILENCE]: { lane: LANE.REFLEX, effort: EFFORT.NONE },
  [INTENT.COMFORT]: { lane: LANE.COMPANION, effort: EFFORT.MINIMAL },
  [INTENT.RECALL]: { lane: LANE.COMPANION, effort: EFFORT.MINIMAL },
  [INTENT.ADVISE]: { lane: LANE.COMPANION, effort: EFFORT.LOW },
  [INTENT.TEASE]: { lane: LANE.COMPANION, effort: EFFORT.MINIMAL },
  [INTENT.UNKNOWN]: { lane: LANE.COMPANION, effort: EFFORT.MINIMAL },
  [INTENT.PAGE_EDIT]: { lane: LANE.PAGE, effort: EFFORT.LOW },
  [INTENT.PAGE_CONTINUE]: { lane: LANE.PAGE, effort: EFFORT.LOW },
  [INTENT.PAGE_REWRITE]: { lane: LANE.PAGE, effort: EFFORT.LOW },
  [INTENT.PLAN]: { lane: LANE.DEEP, effort: EFFORT.MEDIUM },
  [INTENT.THINK_HARD]: { lane: LANE.DEEP, effort: EFFORT.MEDIUM },
});

/**
 * Map a classified intent to { lane, effort, usesSpark, ownWallet }.
 * Page and Deep always own their meters; Companion is separate from Page.
 */
function laneForIntent(intent, overrides = {}) {
  const key = String(intent || INTENT.UNKNOWN);
  const base = INTENT_LANE_MAP[key] || INTENT_LANE_MAP[INTENT.UNKNOWN];
  const lane = overrides.lane || base.lane;
  let effort = overrides.effort || base.effort;

  // Multi-beat page work may bump to medium (caller can pass hints.multiBeat).
  if (lane === LANE.PAGE && overrides.multiBeat === true && effort === EFFORT.LOW) {
    effort = EFFORT.MEDIUM;
  }
  // High only when user explicitly asked or visible "thinking longer" mode.
  if (lane === LANE.DEEP && (overrides.explicitHigh === true || overrides.failedFirstPass === true)) {
    effort = EFFORT.HIGH;
  }

  const usesSpark = lane !== LANE.REFLEX;
  const ownWallet = lane === LANE.PAGE || lane === LANE.DEEP || lane === LANE.COMPANION;

  return {
    intent: key,
    lane,
    effort,
    usesSpark,
    /** Page meter is never shared with Companion chit-chat. */
    walletMeter: lane === LANE.PAGE ? "page" : lane === LANE.DEEP ? "deep" : lane === LANE.COMPANION ? "companion" : "none",
    ownWallet,
  };
}

export {
  LANE,
  EFFORT,
  INTENT_LANE_MAP,
  laneForIntent,
};
