// Clementine intent classification (D008 / T-clementine-muse-runtime-skeleton).
//
// Product-facing classification is intent-first. Intents then map to cost
// lanes in lanes.js. v0 is rule-based heuristics.
// Greeting / check-in / silence → Reflex (see lanes.js + reflex_lane.js).
// Template short-circuit lives in reflex_classifier.js (no Spark). Later:
// optional on-device CoreML / server Glimmer without changing this enum surface.

import { parseShortFilmIntent } from "./short_film_intent.js";
import { isShortFilmBetaEnabled } from "./short_film_beta.js";

const INTENT = Object.freeze({
  GREETING: "greeting",
  CHECK_IN: "check_in",
  COMFORT: "comfort",
  RECALL: "recall",
  ADVISE: "advise",
  TEASE: "tease",
  SILENCE: "silence",
  PAGE_EDIT: "page_edit",
  PAGE_CONTINUE: "page_continue",
  PAGE_REWRITE: "page_rewrite",
  PLAN: "plan",
  THINK_HARD: "think_hard",
  SHORT_FILM_BETA: "short_film_beta",
  UNKNOWN: "unknown",
});

const INTENT_VALUES = Object.freeze(Object.values(INTENT));

function normalizeText(input) {
  return String(input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Rule-based v0 classifier. Prefer explicit page/plan cues over chit-chat.
 * Returns one of INTENT values.
 */
function classifyIntent(utterance, hints = {}) {
  const forced = String(hints?.intent || "").trim().toLowerCase();
  if (forced && INTENT_VALUES.includes(forced)) return forced;

  // Short-film beta — flag-gated, additive, no V1 regression when flag off.
  try {
    if (isShortFilmBetaEnabled(process.env)) {
      const raw = String(utterance ?? "");
      if (raw.toLowerCase().includes("short film") && raw.toLowerCase().includes("pages")) {
        const parsed = parseShortFilmIntent(raw);
        if (parsed) return INTENT.SHORT_FILM_BETA;
      }
    }
  } catch (_e) {
    // Fall through to normal classification on any import/parse error.
  }

  const text = normalizeText(utterance);
  if (!text) return INTENT.SILENCE;

  // Silence / yield
  if (/^(ok|okay|k|mm+|hmm+|silence|pass|never ?mind|leave it|i'?ll leave that)\.?$/.test(text)) {
    return INTENT.SILENCE;
  }

  // Page lane cues (sacred — must win over casual talk)
  if (/\b(write|draft|type|insert|propose)\b.*\b(scene|beat|page|action|dialogue|line)\b/.test(text)
    || /\b(page|scene|beat)\b.*\b(edit|change|fix|rewrite)\b/.test(text)
    || /\b(format (this|as)|screenplay|slugline|int\.|ext\.)\b/.test(text)
    || hints?.pageMode === true) {
    return INTENT.PAGE_EDIT;
  }
  if (/\b(continue|keep going|next beat|next line|carry on)\b/.test(text)
    || hints?.continuePage === true) {
    return INTENT.PAGE_CONTINUE;
  }
  if (/\b(rewrite|tighten|sharpen|soften|shorten|punch up)\b/.test(text)) {
    return INTENT.PAGE_REWRITE;
  }

  // Deep / plan
  if (/\b(think hard|think longer|deep dive|reason carefully)\b/.test(text)
    || hints?.deep === true) {
    return INTENT.THINK_HARD;
  }
  if (/\b(plan|outline|structure|break (act|story)|conflict|throughline)\b/.test(text)) {
    return INTENT.PLAN;
  }

  // Companion-ish
  if (/\b(remember|recall|what did i|my character|last time)\b/.test(text)) {
    return INTENT.RECALL;
  }
  if (/\b(advice|advise|should i|what should|help me decide)\b/.test(text)) {
    return INTENT.ADVISE;
  }
  if (/\b(tease|roast|playful|banter)\b/.test(text)) {
    return INTENT.TEASE;
  }
  if (/\b(comfort|i'?m stuck|writer'?s? block|anxious|overwhelmed)\b/.test(text)) {
    return INTENT.COMFORT;
  }
  if (/^(hi|hey|hello|yo|gm|good (morning|evening|night)|how('?s| is) it going)\b/.test(text)
    || /^(what'?s up)\??$/.test(text)) {
    return INTENT.GREETING;
  }
  if (/\b(how are you|checking in|check[- ]?in)\b/.test(text)) {
    return INTENT.CHECK_IN;
  }

  // Default companion talk
  return INTENT.UNKNOWN;
}

export {
  INTENT,
  INTENT_VALUES,
  classifyIntent,
};
