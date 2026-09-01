// Talk-edge Reflex short-circuit (D008 / T-clementine-reflex-lane).
//
// Middleware-shaped helper used by createPageLaneTalkAdapter BEFORE
// wallet reserve / Page reservation / handleTalkRequest (Spark).
//
// When lane is Reflex (or Companion) and tryReflexReply succeeds, the talk
// edge returns a tiny JSON reply and never touches Spark or meters.
// Documented stubs: no on-device CoreML; no server Glimmer yet.

import { LANE } from "./lanes.js";
import { tryReflexReply } from "./reflex_lane.js";

function peekKnownFacts(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const raw = body.known_facts ?? body.knownFacts ?? body.clementine_known_facts;
  if (!Array.isArray(raw)) return [];
  return raw.filter((f) => f && typeof f === "object");
}

function peekVoiceSpecHints(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const hints = body.voice_spec_hints ?? body.voiceSpecHints ?? {};
  if (!hints || typeof hints !== "object") return {};
  return hints;
}

/**
 * True when this lane may attempt Reflex templates (never Page/Deep).
 */
function isReflexEligibleLane(laneName) {
  return laneName === LANE.REFLEX || laneName === LANE.COMPANION;
}

/**
 * Try Reflex short-circuit at the talk edge.
 * @returns {null | { handled: true, text: string, lane: 'reflex', templateId: string, confidence: number }}
 */
function tryTalkEdgeReflex({
  text,
  laneInfo,
  knownFacts = [],
  voiceSpecHints = {},
} = {}) {
  if (!isReflexEligibleLane(laneInfo?.lane)) {
    return null;
  }
  // Page-mode hints always skip Reflex even if text looks like "hey"
  if (laneInfo?.lane === LANE.PAGE || laneInfo?.walletMeter === "page") {
    return null;
  }
  const result = tryReflexReply({ text, knownFacts, voiceSpecHints });
  if (!result?.handled) return null;
  return result;
}

/**
 * Write a Reflex short-circuit HTTP response. No Spark, no wallet debit.
 */
function sendReflexReply(res, { reflex, laneInfo }) {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("x-clementine-lane", laneInfo?.lane || LANE.REFLEX);
    res.setHeader("x-clementine-reflex", "1");
    if (reflex.templateId) {
      res.setHeader("x-clementine-reflex-template", String(reflex.templateId));
    }
  } catch (_e) {
    /* headers may already be sent */
  }
  return res.status(200).json({
    ok: true,
    reply: reflex.text,
    lane: "reflex",
    spark: false,
    clementine: {
      intent: laneInfo?.intent || null,
      lane: laneInfo?.lane || LANE.REFLEX,
      effort: "none",
      walletMeter: "none",
      templateId: reflex.templateId || null,
      confidence: reflex.confidence,
      spark: false,
    },
  });
}

export {
  peekKnownFacts,
  peekVoiceSpecHints,
  isReflexEligibleLane,
  tryTalkEdgeReflex,
  sendReflexReply,
};
