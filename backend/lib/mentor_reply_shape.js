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
    "|the\\s+(?:setup|premise|idea|hook|concept|opening|scene)\\s+(?:is|feels|has|sounds)\\s+(?:an?\\s+)?(?:really\\s+|very\\s+)?(?:great|strong|intriguing|evocative|compelling|fantastic|wonderful|rich|solid|lovely|nice|good|powerful|interesting|promising|fun|cool|beautiful|clever|vivid|fascinating|exciting)\\b" +
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
    "|i\\s+(?:hear|get|understand|feel)\\s+(?:you|that|it)\\s*[.!?:]" +
    "|(?:it\\s+)?sounds\\s+like\\s+(?:you're|you are)\\s+(?:feeling|stuck|overwhelmed|frustrated|upset)\\b" +
    "|(?:it\\s+)?sounds\\s+like\\s+(?:a\\s+)?(?:rough|tough|hard|frustrating)\\s+(?:spot|place|moment)\\s*[.!?:]$" +
    "|first,?\\s+let(?:'s| us)\\s+(?:take a breath|breathe)(?:\\s+and\\s+remember)?\\s*[.!?:]$" +
    "|(?:you're|you are)\\s+not\\s+alone\\b" +
    "|(?:every|most)\\s+writers?\\s+(?:feels?|hits?|goes)\\b" +
  ")",
  "i",
);

function splitFirstSentence(text) {
  // Same-length canonical masking keeps dialogue punctuation from truncating
  // a verdict before its outside-the-quote reason. Unclosed quotes stay whole.
  const m = /^(.*?[.!?:])(\s+|$)/s.exec(maskQuotedSpeech(text));
  if (!m) return null;
  const first = text.slice(0, m[1].length).trim();
  const rest = text.slice(m[0].length).trim();
  return { first, rest };
}

export function isPraiseOpener(sentence) {
  const s = String(sentence || "").trim();
  if (!s) return false;
  if (s.split(/\s+/).length > OPENER_MAX_WORDS) return false;
  // Preserve the actual reason or criticism, not just its opening words.
  // Quoted dialogue cannot make a bland check-in count as a craft reason.
  if (/\b(?:because|therefore|but|however|although|unless|yet|except)\b/i.test(maskQuotedSpeech(s))) return false;
  return PRAISE_OPENER.test(s) || SYMPATHY_OPENER.test(s);
}

/**
 * Remove a leading praise/verdict-on-the-premise sentence from a mentor reply.
 * Returns { text, stripped } where stripped is the removed sentence or "".
 */
export function stripPraiseOpener(reply) {
  let text = String(reply || "").trim();
  const strippedParts = [];
  // A check-in can run two sentences ("Sounds like a rough spot. First, let's take a breath.").
  for (let i = 0; i < 2; i += 1) {
    const parts = splitFirstSentence(text);
    if (!parts || !isPraiseOpener(parts.first) || !parts.rest) break;
    // Do not leave a reply that starts mid-thought ("But", "And", "Now,").
    const rest = parts.rest.replace(/^(?:but|and|now|so|still|however|that said|then),?\s+/i, () => "");
    text = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : parts.rest;
    strippedParts.push(parts.first);
  }
  return { text, stripped: strippedParts.join(" ") };
}

// ---------------------------------------------------------------------------
// One question at most. The core says "verdict first, then one question at
// most"; the model still stacks them ("What does she want, what's the
// deadline, and what's in her way? ... What's her first-scene want?"). The
// last question is the handoff, so it stays; earlier question sentences go.
// A two- or three-word label question ("The obstacle?") is spoken as a colon.
// Quoted dialogue punctuation is not a mentor question. A mentor question
// containing a quoted word is still a question and may be removed whole.

const LABEL_QUESTION_MAX_WORDS = 3;
const CONTINUATION = /^(?:or|and)\b,?\s+/i;
// "What's the deadline?" is a question; "The obstacle?" is a label.
const QUESTION_LEAD = /^(?:what|why|how|where|when|who|whom|which|does|do|did|is|are|was|were|can|could|will|would|should|shall|have|has|had|any|ready)\b/i;

// Same-length mask shared by production shaping and its scorer. Apostrophes
// in contractions/possessives are not quote delimiters. Unclosed dialogue is
// conservatively protected through the end, including paragraph breaks.
function analyzeQuotedSpeech(value) {
  const text = String(value || "");
  const chars = text.split("");
  let close = "";
  let escaped = false;
  const ends = new Set();
  const word = char => /[\p{L}\p{N}]/u.test(char || "");
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const apostrophe = (char === "'" || char === "’") && word(text[i - 1]) && word(text[i + 1]);
    if (close) {
      chars[i] = " ";
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === close && !apostrophe) { ends.add(i); close = ""; }
    } else if (char === '"' || char === "“" || char === "‘" || (char === "'" && !word(text[i - 1]))) {
      close = ({"“": "”", "‘": "’"})[char] || char;
      chars[i] = " ";
    }
  }
  return {mask: chars.join(""), ends};
}

export function maskQuotedSpeech(value) {
  return analyzeQuotedSpeech(value).mask;
}

function splitSentences(paragraph) {
  const {mask, ends} = analyzeQuotedSpeech(paragraph);
  const parts = [];
  let start = 0;
  for (let i = 0; i < paragraph.length; i += 1) {
    const outsidePunctuation = /[.!?]/.test(mask[i]);
    const quotedEnd = ends.has(i) && /[.!?]/.test(paragraph[i - 1] || "");
    if (!(outsidePunctuation || quotedEnd) || !/\s/.test(paragraph[i + 1] || "")) continue;
    parts.push(paragraph.slice(start, i + 1));
    start = i + 1;
    while (/\s/.test(paragraph[start] || "")) start += 1;
    i = start - 1;
  }
  if (start < paragraph.length) parts.push(paragraph.slice(start));
  return parts;
}

function isQuestionSentence(sentence) {
  return /\?$/.test(maskQuotedSpeech(sentence).trim());
}

function wordCount(sentence) {
  return sentence.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Cap a mentor reply at one question. Returns { text, dropped } where dropped
 * lists the removed question sentences (empty when nothing changed).
 */
export function capQuestions(reply) {
  const text = String(reply || "").trim();
  if (!text) return { text, dropped: [] };
  const paragraphs = [];
  let start = 0;
  for (const match of maskQuotedSpeech(text).matchAll(/\n{2,}/g)) {
    paragraphs.push(text.slice(start, match.index));
    start = match.index + match[0].length;
  }
  paragraphs.push(text.slice(start));
  const units = []; // { p, i, sentence, kind: "label" | "question" | "text" }
  paragraphs.forEach((paragraph, p) => {
    splitSentences(paragraph).forEach((sentence, i) => {
      let kind = "text";
      if (isQuestionSentence(sentence)) {
        const label = wordCount(sentence) <= LABEL_QUESTION_MAX_WORDS && !QUESTION_LEAD.test(sentence.trim().replace(/^["“(]/, ""));
        kind = label ? "label" : "question";
      }
      units.push({ p, i, sentence, kind });
    });
  });
  const questions = units.filter((u) => u.kind === "question");
  const labels = units.filter((u) => u.kind === "label");
  if (questions.length <= 1 && labels.length === 0) return { text, dropped: [] };

  const dropped = [];
  if (questions.length > 1) {
    let keep = questions[questions.length - 1];
    // "How does she win? Or was there something else?" keeps the first of the pair.
    if (CONTINUATION.test(keep.sentence.trim())) keep = questions[questions.length - 2];
    for (const q of questions) {
      if (q === keep) continue;
      q.kind = "drop";
      dropped.push(q.sentence.trim());
    }
  }
  // A label question followed by its answer is spoken as a colon.
  for (const u of units) {
    if (u.kind !== "label") continue;
    const next = units.find((n) => n.p === u.p && n.i === u.i + 1);
    if (next && next.kind !== "drop") {
      u.sentence = u.sentence.trim().replace(/\?$/, ":");
      u.kind = "text";
    }
  }
  const rebuilt = paragraphs.map((_, p) =>
    units.filter((u) => u.p === p && u.kind !== "drop").map((u) => u.sentence.trim()).join(" ")
  ).filter((paragraph) => paragraph.length > 0).join("\n\n");
  if (!rebuilt) return { text, dropped: [] };
  return { text: rebuilt, dropped };
}

// ---------------------------------------------------------------------------
// A pitch is spoken, not slugged. In the Studio the model opens a pitch with
// "INT. DIMLY LIT BASEMENT - NIGHT." although the pitch rule forbids Fountain;
// read aloud that is a slug, not a place. One slugline in a spoken reply is
// turned into prose ("a dimly lit basement at night"). Two or more, or a
// character cue, means the reply is page text and is left alone; page writes
// never reach this code anyway.

const CHARACTER_CUE = /^\s*[A-Z][A-Z' .-]{1,30}(?:\s*\([^)]*\))?\s*$/m;
const TIME_PHRASE = Object.freeze({
  DAY: "in the daytime", NIGHT: "at night", MORNING: "in the morning", AFTERNOON: "in the afternoon",
  EVENING: "in the evening", DUSK: "at dusk", DAWN: "at dawn", MIDNIGHT: "at midnight",
  SUNRISE: "at sunrise", SUNSET: "at sunset", CONTINUOUS: "", LATER: "a little later", SAME: "", "MOMENTS LATER": "moments later",
});

const HEADING_PREFIX = String.raw`\b(?:INT\.?\s*\/\s*EXT|I\/E|INT|EXT)\.?\s+`;
const TIME_NAMES = Object.keys(TIME_PHRASE).sort((a, b) => b.length - a.length).join("|");
const SLUGLINE = new RegExp(HEADING_PREFIX + String.raw`([A-Z0-9][A-Z0-9'’,\- ]*?)(?:\s*[-–—]+\s*(` + TIME_NAMES + String.raw`)\b)?(?=\.(?:\s|$)|\n|$)\.?`, "g");
// Prefer a complete timed heading over its apparent abbreviated prefix.
const TIMED_SLUGLINE = new RegExp(HEADING_PREFIX + String.raw`([A-Z0-9][A-Z0-9.'’,\- ]*?)\s*[-–—]+\s*(` + TIME_NAMES + String.raw`)\b(?=\.(?:\s|$)|\n|$)\.?`, "g");

function unquotedSluglines(reply) {
  const outside = maskQuotedSpeech(reply);
  const full = [...outside.matchAll(TIMED_SLUGLINE)];
  const fallback = [...outside.matchAll(SLUGLINE)].filter(match =>
    !full.some(heading => match.index >= heading.index && match.index < heading.index + heading[0].length));
  return [...full, ...fallback].sort((a, b) => a.index - b.index);
}

export function hasUnquotedSlugline(reply) {
  return unquotedSluglines(reply).length > 0;
}

function sluglineToProse(location, time) {
  const words = location.trim().replace(/[.,]+$/, "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const article = /^(?:a|an|the)$/.test(words[0]) ? "" : (/^[aeiou]/.test(words[0]) ? "an" : "a");
  const when = TIME_PHRASE[String(time || "").toUpperCase()] || "";
  return `${article ? `${article} ` : ""}${words.join(" ")}${when ? ` ${when}` : ""}`;
}

/**
 * Speak a lone slugline as prose. Returns { text, spoken } where spoken is the
 * slugline that was rewritten, or "" when nothing changed.
 */
export function speakSlugline(reply) {
  const text = String(reply || "");
  const outside = maskQuotedSpeech(text);
  const matches = unquotedSluglines(text);
  if (matches.length !== 1) return { text, spoken: "" };
  const m = matches[0];
  if (CHARACTER_CUE.test(outside.slice(0, m.index) + outside.slice(m.index + m[0].length))) return { text, spoken: "" };
  const before = text.slice(0, m.index);
  const prose = sluglineToProse(m[1], m[2]);
  if (!prose) return { text, spoken: "" };
  const startsSentence = /(?:^|[.!?]\s+|\n\s*)$/.test(before);
  const cased = startsSentence ? prose.charAt(0).toUpperCase() + prose.slice(1) : prose;
  const endedWithPeriod = /\.$/.test(m[0]);
  const replaced = before + cased + (endedWithPeriod ? "." : "") + text.slice(m.index + m[0].length);
  return { text: replaced, spoken: m[0] };
}

export function shapeMentorReply(reply, { mentorTurn = false, screenplayPageWrite = false } = {}) {
  if (!mentorTurn || screenplayPageWrite) return { text: String(reply || ""), stripped: "", droppedQuestions: [], spokenSlugline: "" };
  const opener = stripPraiseOpener(reply);
  const capped = capQuestions(opener.text);
  const slug = speakSlugline(capped.text);
  return { text: slug.text, stripped: opener.stripped, droppedQuestions: capped.dropped, spokenSlugline: slug.spoken };
}
