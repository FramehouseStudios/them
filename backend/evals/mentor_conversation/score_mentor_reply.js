// Deterministic scorer for Clementine's spoken mentor replies.
//
// Same discipline as evals/page_craft/score_page.js: named dimensions, 1–5
// scores, an overall mean, PASS at 3.5 and FAIL at 2.8. Everything here is a
// text heuristic so the golden set runs in CI without a model; the live mode
// of run_mentor_golden_eval.mjs feeds real replies through the same scorer.
//
// Dimensions apply per case category (see cases.mjs):
//   register                every case
//   pitch_concreteness      pitch
//   build_on_writer         build
//   structure_accuracy      structure
//   on_the_nose_detection   dialogue

export const DIMENSIONS = Object.freeze([
  "register",
  "pitch_concreteness",
  "build_on_writer",
  "structure_accuracy",
  "on_the_nose_detection",
]);

export const THRESHOLDS = Object.freeze({
  passMinOverall: 3.5,
  failMaxOverall: 2.8,
});

const PLACE_WORDS = [
  "kitchen", "motel", "hospital", "car", "bar", "apartment", "office", "church", "diner", "bus",
  "rooftop", "garage", "station", "hallway", "bathroom", "porch", "parking lot", "courtroom",
  "classroom", "bedroom", "elevator", "airport", "train", "lobby", "pier", "field", "lot",
  "basement", "warehouse", "backseat", "waiting room", "gas station", "stairwell", "boat", "cabin",
];
const TIME_WORDS = /\b(night|morning|dawn|dusk|noon|midnight|afternoon|evening|sunrise|sunset|\d{1,2}\s?(a\.?m\.?|p\.?m\.?)|the hour before|late)\b/i;
const WANT_WORDS = /\b(wants?|needs?|has to|have to|trying to|desperate to|is after|came (here )?to|refuses to leave until)\b/i;
const OBSTACLE_WORDS = /\b(but|except|in (his|her|their|the) way|won'?t|can'?t|refuses|refusing|blocking|until|unless|standing between|the catch)\b/i;
const NAME_STOP = new Set([
  "I", "The", "A", "An", "And", "But", "So", "She", "He", "They", "It", "We", "You", "Her", "His",
  "Their", "Then", "What", "Which", "Where", "When", "Who", "Why", "How", "Act", "Acts", "Page",
  "Pages", "Midpoint", "Verdict", "Okay", "Yes", "No", "Not", "Let", "Give", "Take", "Try", "Two",
  "One", "Three", "Fine", "Good", "Right", "Now", "Here", "There", "This", "That", "These", "Those",
  "If", "In", "On", "At", "Of", "For", "With", "From", "To", "Into", "Your", "My", "Our", "Is",
  "Do", "Does", "Did", "Say", "Write", "Keep", "Make", "Put", "Start", "Every", "Because",
  "Therefore", "First", "Second", "Third", "Last", "Final", "Opening", "Closing", "Nothing",
  "Something", "Everything", "Scene", "Script", "Story", "Dialogue", "Structure", "Courier",
  "Hollywood", "Fountain", "Int", "Ext", "Day", "Night", "Morning", "Cut", "Fade", "Mentor",
]);

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function clamp(value) {
  return Math.max(1, Math.min(5, Number(value.toFixed(2))));
}

function capitalizedNames(text) {
  const found = new Set();
  for (const sentence of sentences(text)) {
    const tokens = sentence.split(/\s+/);
    tokens.forEach((raw, index) => {
      const token = raw.replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, "");
      if (!token || !/^[A-Z][a-z]+$/.test(token)) return;
      if (NAME_STOP.has(token)) return;
      if (index === 0) return; // sentence-initial capitals are not evidence of a name
      found.add(token);
    });
  }
  return [...found];
}

function quotedLines(text) {
  const out = [];
  const re = /["“]([^"”]{6,})["”]/g;
  let m;
  while ((m = re.exec(String(text || "")))) out.push(m[1].trim());
  return out;
}

export function scoreRegister(reply, { allowShort = false } = {}) {
  const text = String(reply || "");
  const lower = text.toLowerCase();
  const notes = [];
  let score = 5;
  const firstLine = (sentences(text)[0] || "").toLowerCase();
  if (/^(hi|hey|hello|good (morning|evening|afternoon))\b/.test(firstLine) || /how are you|how('s| is) your (day|morning|evening)|feeling today|how are things/.test(lower)) {
    score -= 2; notes.push("opens with a greeting or feelings check-in");
  }
  // She is told to say she is artificial when asked; only the hedging forms cost points.
  if (/as an ai\b|language model|i('m| am) just an ai|i (cannot|can'?t|don'?t) (feel|have feelings|have personal)|my programming/.test(lower)) {
    score -= 2; notes.push("hedges about being a model");
  }
  if (/^\s*([-*•]|\d+\.)\s/m.test(text) || /^\s*#/m.test(text) || /\*\*/.test(text)) {
    score -= 1.5; notes.push("lists or markdown");
  }
  const therapyHits = (lower.match(/hold space|sit with (that|it|this)|it'?s okay to feel|you are not alone|take a (deep )?breath|honor (that|your)|be kind to yourself|every writer goes through this/g) || []).length;
  if (therapyHits) { score -= Math.min(3, 2 + (therapyHits - 1) * 0.5); notes.push("therapy phrasing"); }
  if (/it sounds like you'?re feeling|would you like to talk about|what'?s making (this|it|that) (hard|difficult)|is there anything (else )?on your mind/.test(lower)) {
    score -= 1.5; notes.push("turns the work into a feelings session");
  }
  const questions = (text.match(/\?/g) || []).length;
  if (questions > 1) { score -= Math.min(2, questions - 1); notes.push(`${questions} questions`); }
  if (/!/.test(text)) { score -= 1; notes.push("exclamation"); }
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) { score -= 1; notes.push("emoji"); }
  const count = words(text).length;
  if (!allowShort && count < 12) { score -= 1; notes.push("too clipped for a mentor"); }
  if (count > 220) { score -= 1; notes.push("runs long"); }
  if (/you'?ve got this|you got this|great job|amazing idea|love it|keep going\b|no pressure at all|there'?s no wrong answer/.test(lower) && !/\b(try|instead|make|give|put|write|cut|move|open|end|start)\b/.test(lower)) {
    score -= 1.5; notes.push("encouragement without a move");
  }
  return { score: clamp(score), notes };
}

export function scorePitchConcreteness(reply) {
  const text = String(reply || "");
  const lower = text.toLowerCase();
  const notes = [];
  let score = 1;
  if (PLACE_WORDS.some((w) => lower.includes(w)) || /\bat (a|the) \w+/.test(lower)) { score += 1; } else notes.push("no place");
  if (TIME_WORDS.test(text)) { score += 1; } else notes.push("no time of day");
  const names = capitalizedNames(text);
  if (names.length >= 2 || /two (named )?(characters|people)/.test(lower)) { score += 1; } else notes.push(`names: ${names.join(",") || "none"}`);
  if (WANT_WORDS.test(text)) { score += 1; } else notes.push("no want");
  if (OBSTACLE_WORDS.test(text)) { score += 1; } else notes.push("no obstacle");
  const last = sentences(text).slice(-1)[0] || "";
  if (!/\?$/.test(last)) { score -= 1; notes.push("does not hand the wheel back with a question"); }
  if (/^\s*(INT|EXT)\.?\s/m.test(text)) { score -= 1; notes.push("writes sluglines instead of pitching"); }
  return { score: clamp(score), notes };
}

export function scoreBuildOnWriter(reply, { writerNouns = [] } = {}) {
  const text = String(reply || "");
  const lower = text.toLowerCase();
  const notes = [];
  const reused = writerNouns.filter((n) => lower.includes(String(n).toLowerCase()));
  let score = 1 + Math.min(3, reused.length);
  if (reused.length < 2) notes.push(`reuses ${reused.length} of the writer's nouns`);
  if (/\b(slams|reaches|hands|finds|drops|lies|refuses|opens|hides|calls|walks|turns|counts|pockets|signs|pours|locks|waits|packs|leaves|says nothing|beat)\b/.test(lower)) {
    score += 1;
  } else notes.push("no concrete added beat");
  // "Instead of saying X, try: \"…\"" is a line rewrite that builds on the
  // idea; only a bare "instead, let's/what if/try…" replaces it.
  const rewriteOffer = /\binstead of (saying|writing|having|the line|a line|telling|announcing)\b/.test(lower) && quotedLines(text).length > 0;
  if (!rewriteOffer && /\binstead\b[^.]{0,40}\b(let'?s|what if|do a|make (it|him|her|them)|try)|forget (that|the)|scrap (it|that|the)|throw (it|that) out|start over|different idea|better idea|bigger canvas|more original|fresher|has been done/.test(lower)) {
    score -= 3; notes.push("replaces the writer's idea");
  }
  const whatIfs = (lower.match(/what if we/g) || []).length;
  if (whatIfs > 1) { score -= 1; notes.push("stacks alternatives"); }
  return { score: clamp(score), notes };
}

// A structural term counts when the reply says it the way a mentor says it in
// the room, not only as the textbook label. The golden exemplars use both.
const TERM_SYNONYMS = Object.freeze({
  "why now": [/why now/, /starts? today/, /start today/, /why today/, /not last (year|week|month)/],
  "obstacle": [/obstacle/, /in (his|her|their|the) way/, /standing in/, /stands in/],
  "want": [/\bwants?\b/, /\bneeds?\b/],
  "reversal": [/reversal/, /flips?/, /turns? (the )?(tactic|strategy|plan)/, /false (win|victory|defeat|loss)/],
  "commitment": [/commit/, /choice (he|she|they) can'?t take back/, /can'?t go back/, /no way back/, /point of no return/],
  "inciting incident": [/inciting incident/, /inciting event/],
  "midpoint": [/midpoint/, /mid-point/, /middle of the (script|story|film)/],
  "act one": [/act one/, /act 1\b/, /act i\b/],
  "act two": [/act two/, /act 2\b/, /act ii\b/],
});

function termPresent(lower, term) {
  if (lower.includes(term)) return true;
  const alts = TERM_SYNONYMS[term];
  return Array.isArray(alts) ? alts.some((re) => re.test(lower)) : false;
}

export function scoreStructureAccuracy(reply, { expectTerms = [], expectPages = [] } = {}) {
  const text = String(reply || "");
  const lower = text.toLowerCase();
  const notes = [];
  const found = expectTerms.filter((t) => termPresent(lower, String(t).toLowerCase()));
  let score = expectTerms.length
    ? 1 + (found.length / expectTerms.length) * 3
    : 4;
  if (found.length < expectTerms.length) notes.push(`missing: ${expectTerms.filter((t) => !found.includes(t)).join(", ")}`);
  const causal = /\b(because|therefore|so that|which forces|which means|forces|costs)\b/.test(lower);
  const andThen = (lower.match(/\band then\b/g) || []).length >= 2;
  if (causal && !andThen) { score += 1; } else notes.push(andThen ? "and-then chain" : "no causality");
  for (const spec of expectPages) {
    const re = new RegExp(`${spec.term}[^.]{0,60}?page\\s*(\\d{1,3})|page\\s*(\\d{1,3})[^.]{0,60}?${spec.term}`, "i");
    const m = text.match(re);
    if (!m) continue;
    const page = Number(m[1] || m[2]);
    if (page < spec.low || page > spec.high) { score -= 1; notes.push(`${spec.term} placed at page ${page}, expected ${spec.low}–${spec.high}`); }
  }
  return { score: clamp(score), notes };
}

export function scoreOnTheNoseDetection(reply, { flatLine = "" } = {}) {
  const text = String(reply || "");
  const lower = text.toLowerCase();
  const notes = [];
  let score = 1;
  if (/on[- ]the[- ]nose|says the feeling|announces|label|too direct|spells it out|tells us (what|how)|names the feeling|stating the subtext|saying it out loud/.test(lower)) {
    score += 2;
  } else notes.push("does not name the problem");
  const rewrites = quotedLines(text).filter((q) => q.toLowerCase() !== String(flatLine).toLowerCase());
  if (rewrites.length) { score += 2; } else notes.push("no rewritten line in quotes");
  if (/\b(instead|deflects|changes the subject|hands|looks|silence|pause|asks|counts|keeps|doesn'?t answer|turns|behavior|does)\b/.test(lower)) {
    score += 1;
  } else notes.push("rewrite is not behavior or tactic");
  if (/love that line|great line|perfect line|that line works/.test(lower)) { score -= 2; notes.push("praises the flat line"); }
  return { score: clamp(score), notes };
}

export function scoreMentorReply(reply, testCase = {}) {
  const category = String(testCase.category || "register");
  const dims = { register: scoreRegister(reply, { allowShort: Boolean(testCase.allowShort) }) };
  if (category === "pitch") dims.pitch_concreteness = scorePitchConcreteness(reply);
  if (category === "build") dims.build_on_writer = scoreBuildOnWriter(reply, testCase);
  if (category === "structure") dims.structure_accuracy = scoreStructureAccuracy(reply, testCase);
  if (category === "dialogue") dims.on_the_nose_detection = scoreOnTheNoseDetection(reply, testCase);
  // The skill is what the case measures; register is the floor it must clear.
  const skill = Object.entries(dims).find(([name]) => name !== "register")?.[1];
  const overall = Number((skill
    ? skill.score * 0.6 + dims.register.score * 0.4
    : dims.register.score).toFixed(2));
  const verdict = overall >= THRESHOLDS.passMinOverall ? "PASS" : overall <= THRESHOLDS.failMaxOverall ? "FAIL" : "BORDERLINE";
  return { overall, verdict, dimensions: dims };
}
