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
/**
 * Is this the first exchange of a conversation? The client may say so with
 * `conversation_turn_index` (0 = nothing before this turn). Older clients do
 * not send it, but they do send their assembled `system_prompt`, which carries
 * a RECENT CONVERSATION block only once there is history — so a non-empty
 * prompt without that block is a fresh conversation. Unknown → false.
 */
const RECENT_CONVERSATION_MARKER = "RECENT CONVERSATION (";
const FRESH_SKIPPED_TEMPLATES = /^(greeting|check_in)/;

function peekConversationFreshness(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const explicit = body.conversation_turn_index ?? body.conversationTurnIndex;
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== "") {
    const index = Number.parseInt(String(explicit).trim(), 10);
    if (Number.isFinite(index)) return index <= 0;
  }
  const systemPrompt = typeof body.system_prompt === "string"
    ? body.system_prompt
    : (typeof body.systemPrompt === "string" ? body.systemPrompt : "");
  if (!systemPrompt.trim()) return false;
  return !systemPrompt.includes(RECENT_CONVERSATION_MARKER);
}

function tryTalkEdgeReflex({
  text,
  laneInfo,
  knownFacts = [],
  voiceSpecHints = {},
  freshConversation = false,
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
  // A greeting that opens a conversation is the persona's cue to pitch a
  // scene (HerVoiceSpec SCENE PITCH). A canned template would swallow it, so
  // the first "hello" goes to the model; later greetings stay on Reflex.
  if (freshConversation && FRESH_SKIPPED_TEMPLATES.test(String(result.templateId || ""))) {
    return null;
  }
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
  peekConversationFreshness,
  RECENT_CONVERSATION_MARKER,
  peekKnownFacts,
  peekVoiceSpecHints,
  isReflexEligibleLane,
  tryTalkEdgeReflex,
  sendReflexReply,
};
