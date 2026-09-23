// Mentor reply shape: drop the evaluative opener a model reaches for before it
// answers a writer ("That's a strong setup.", "Great premise!"). A mentor in
// the room starts with the writer's nouns and the beat, not a grade of the
// pitch. Measured: prompt wording alone did not move this habit (six of eight
// build replies still opened with praise), so it is enforced here, after
// generation and before anything is spoken.
//
// Pure. Never touches page-write output, and never empties a reply.

const OPENER_MAX_WORDS = 16;

const PRAISE_OPENER = new RegExp(
  "^(?:" +
    "(?:that|this|it)(?:'s| is)\\s+(?:an?\\s+)?(?:really\\s+|very\\s+|such\\s+an?\\s+)?" +
      "(?:great|strong|intriguing|evocative|compelling|fantastic|wonderful|rich|solid|lovely|nice|good|powerful|interesting|promising|fun|cool|beautiful|clever|juicy|vivid|fascinating|exciting)\\b" +
    "|(?:great|strong|intriguing|evocative|compelling|fantastic|wonderful|nice|good|love|lovely|interesting|fascinating|exciting|cool)\\b[^.!?:]{0,40}(?:setup|premise|idea|start|hook|concept|scene|pitch|opening)" +
    "|the\\s+(?:setup|premise|idea|hook|concept|opening|scene)\\s+(?:is|feels|has|sounds)\\b" +
    "|(?:i\\s+)?love\\s+(?:this|that|it|the)\\b" +
    "|[A-Z][\\w'’ -]{0,60}?\\b(?:is|are|makes?)\\s+(?:an?\\s+)?(?:really\\s+|very\\s+)?(?:great|strong|intriguing|evocative|compelling|rich|solid|good|powerful|interesting|promising|fascinating|exciting)\\s+(?:setup|premise|idea|start|hook|concept|inciting incident|opening|place to start)" +
  ")",
  "i",
);

// The companion's check-in reflex: sympathy before the move. Same treatment.
const SYMPATHY_OPENER = new RegExp(
  "^(?:" +
    "(?:that|this|it)(?:'s| is)\\s+(?:a\\s+)?(?:really\\s+)?(?:tough|hard|rough|frustrating|painful|difficult)(?:\\s+(?:place|spot|moment|feeling|one|thing)\\b|\\s+to\\s+(?:hear|feel|sit with)\\b|[.!]|$)" +
    "|it(?:'s| is)\\s+(?:tough|hard|rough|normal|okay|ok|natural|understandable)\\s+(?:when|to)\\b" +
    "|let(?:'s| us)\\s+(?:take a breath|breathe|slow down|pause)" +
    "|i\\s+(?:hear|get|understand|feel)\\s+(?:you|that|it)\\b" +
    "|it\\s+sounds\\s+like\\b" +
    "|(?:you're|you are)\\s+not\\s+alone\\b" +
    "|(?:every|most)\\s+writers?\\s+(?:feels?|hits?|goes)\\b" +
  ")",
  "i",
);

function splitFirstSentence(text) {
  const m = /^(.*?[.!?:])(\s+|$)/s.exec(text);
  if (!m) return null;
  const first = m[1].trim();
  const rest = text.slice(m[0].length).trim();
  return { first, rest };
}

export function isPraiseOpener(sentence) {
  const s = String(sentence || "").trim();
  if (!s) return false;
  if (s.split(/\s+/).length > OPENER_MAX_WORDS) return false;
  return PRAISE_OPENER.test(s) || SYMPATHY_OPENER.test(s);
}

/**
 * Remove a leading praise/verdict-on-the-premise sentence from a mentor reply.
 * Returns { text, stripped } where stripped is the removed sentence or "".
 */
export function stripPraiseOpener(reply) {
  const text = String(reply || "").trim();
  const parts = splitFirstSentence(text);
  if (!parts) return { text, stripped: "" };
  if (!isPraiseOpener(parts.first)) return { text, stripped: "" };
  if (!parts.rest) return { text, stripped: "" };
  // Do not leave a reply that starts mid-thought ("But", "And", "Now,").
  const rest = parts.rest.replace(/^(?:but|and|now|so|still|however|that said|then),?\s+/i, (m) => "");
  const fixed = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : parts.rest;
  return { text: fixed, stripped: parts.first };
}

export function shapeMentorReply(reply, { mentorTurn = false, screenplayPageWrite = false } = {}) {
  if (!mentorTurn || screenplayPageWrite) return { text: String(reply || ""), stripped: "" };
  return stripPraiseOpener(reply);
}
