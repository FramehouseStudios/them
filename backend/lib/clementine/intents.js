// Clementine intent classification (D008 / T-clementine-muse-runtime-skeleton).
//
// Product-facing classification is intent-first. Intents then map to cost
// lanes in lanes.js. v0 is rule-based heuristics.
// Greeting / check-in / silence → Reflex (see lanes.js + reflex_lane.js).
// Template short-circuit lives in reflex_classifier.js (no Spark). Later:
// optional on-device CoreML / server Glimmer without changing this enum surface.

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
  STORY: "story",
  PLAN: "plan",
  THINK_HARD: "think_hard",
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

  const text = normalizeText(utterance);
  if (!text) return INTENT.SILENCE;

  // Silence / yield
  if (/^(ok|okay|k|mm+|hmm+|silence|pass|never ?mind|leave it|i'?ll leave that)\.?$/.test(text)) {
    return INTENT.SILENCE;
  }

  // Page rewrite — must win before STORY/PageEdit so "tighten the kitchen scene / Jess on-the-nose" rewrites the page, not narrates.
  if (/\b(rewrite|tighten|sharpen|soften|shorten|punch up|on-the-nose|too verbose|too long)\b/.test(text)) {
    return INTENT.PAGE_REWRITE;
  }
  // Feature-length screenplay: 90/120 pages is a plan-then-page job, not chit-chat
  if (/\b(90|120|ninety|hundred\s*and\s*twenty)\s*(page|pages)\b/.test(text)
    || /\b(feature\s*(script|screenplay|film)|full\s*script|complete\s*screenplay)\b/.test(text)) {
    if (/\b120\b/.test(text) || text.includes("hundred")) return INTENT.THINK_HARD;
    return INTENT.PLAN;
  }

  // Story explanation — narrative content that should become screenplay (writer telling story to Clementine)
  // Long, descriptive, or protagonist/conflict-heavy utterances that are not chit-chat.
  // This is the "explain your story" path: user narrates plot/character/world in natural language.
  const isLongNarrative = text.split(/\s+/).length >= 12;
  const storyHints = [
    /\b(my )?(story|protagonist|character|hero|antagonist|villain|world|universe) (is|about|wants|needs|cares|has|was|were)\b/,
    /\b(he|she|they) (wants|needs|tries|has to|must|is trying|is stuck|is trapped|loses|finds|discovers)\b/,
    /\b(act one|act two|act three|inciting incident|climax|resolution|setup|confrontation)\b/,
    /\b(what if|imagine a|there is a|there's a) (world|character|story|place) where\b/,
    /\b(logline|premise|throughline|theme|want vs need)\b/,
    /\b(once upon a time|in a world|far away|long ago)\b/,
  ];
  // Explicit plan/deep cues keep their HEAD routing ("help me plan act two conflict" -> PLAN, not STORY).
  const hasPlanCue = /\b(think hard|think longer|deep dive|reason carefully)\b/.test(text)
    || /\b(plan|outline|structure|break (act|story)|conflict|throughline)\b/.test(text)
    || hints?.deep === true;
  if (!hasPlanCue && (storyHints.some((re) => re.test(text)) || (isLongNarrative && /\b(wants?|needs?|because|but then|so then|and then)\b/.test(text)))) {
    return INTENT.STORY;
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
