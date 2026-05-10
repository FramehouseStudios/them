// T-trait-library — Craft Intelligence Suite, Layer 2.
//
// Per-character voice/trait inventory. Stored as an additive `traits`
// object on each `creative_memory.characters[]` record so the existing
// prompt-assembly path (`wrapSystemPromptWithCreativeMemory`)
// automatically surfaces it as system-prompt context.
//
// Public surface (pure, deterministic):
//
//   extractTraits({ characterName, lines, hint? }) -> Traits
//     hint: { relationships?: { [name]: string }, goals?: string[],
//            keywords?: string[] }  // caller-supplied seeds
//
//   mergeTraits(existing, next) -> Traits
//     idempotent + bounded; same inputs in either order produce the same
//     output up to ordering inside the arrays.
//
//   buildTraitsBlockForPrompt(traits) -> string
//     small, plain-text rendering of one character's traits for prompt
//     assembly; safe to embed in a system prompt.
//
// Trait shape:
//   {
//     vocabulary: string[],         // recurring short phrases
//     keywords: string[],           // adjective/role tags
//     speech_style: {
//       pace: "terse" | "measured" | "ornate" | "",
//       syntax: "fragmented" | "flowing" | "declarative" | ""
//     },
//     emotional_default: string,
//     goals: string[],
//     relationships: { [name: string]: string }
//   }
//
// LLM mode: this module exposes deterministic extraction only. The
// dialogue-aware classifier interface (T21) can wrap `extractTraits`
// later if a richer character-voice extractor is added; the trait
// shape itself is what the prompt path consumes.

const TRAIT_SCHEMA_VERSION = 1;

const VOCAB_MAX = 12;
const KEYWORD_MAX = 16;
const GOALS_MAX = 8;
const RELATIONSHIPS_MAX = 24;
const PHRASE_MIN_WORDS = 2;
const PHRASE_MAX_WORDS = 8;

const TRAIT_KEYWORDS = Object.freeze([
  "anxious", "calm", "fierce", "loyal", "stoic", "wry", "earnest",
  "cynical", "tender", "guarded", "impulsive", "patient", "weary",
  "ambitious", "haunted", "playful", "stern", "tender", "ruthless",
  "vulnerable", "righteous", "skeptical", "warm", "cold",
]);

const TRAIT_KEYWORD_SET = new Set(TRAIT_KEYWORDS);

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at",
  "for", "with", "by", "from", "as", "is", "are", "was", "were",
  "be", "been", "being", "do", "does", "did", "have", "has", "had",
  "this", "that", "these", "those", "i", "you", "he", "she", "we",
  "they", "it", "me", "him", "her", "us", "them", "my", "your",
  "his", "her", "our", "their", "its", "if", "then", "so", "not",
  "no", "yes", "what", "when", "where", "who", "how", "why", "all",
  "any", "some", "out", "up", "down", "just", "into",
]);

function clampArrayUnique(arr, cap) {
  const seen = new Set();
  const out = [];
  for (const raw of arr || []) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= cap) break;
  }
  return out;
}

function normalizeStyle(raw) {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return s || "";
}

function emptyTraits() {
  return {
    vocabulary: [],
    keywords: [],
    speech_style: { pace: "", syntax: "" },
    emotional_default: "",
    goals: [],
    relationships: {},
  };
}

function extractVocabularyFromLines(lines) {
  const phrases = [];
  for (const line of lines || []) {
    if (typeof line !== "string") continue;
    // Split into sentence-ish fragments. Keep punctuation out of phrases.
    const segments = line
      .split(/[.!?,;:—]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const seg of segments) {
      const words = seg.split(/\s+/).filter(Boolean);
      if (words.length < PHRASE_MIN_WORDS) continue;
      if (words.length > PHRASE_MAX_WORDS) continue;
      // Lowercase the phrase for deterministic dedupe; preserve original
      // casing in the stored vocabulary entry.
      phrases.push(seg);
    }
  }
  return clampArrayUnique(phrases, VOCAB_MAX);
}

function extractKeywordsFromLines(lines, hintKeywords) {
  const hits = new Set();
  for (const line of lines || []) {
    if (typeof line !== "string") continue;
    const words = line.toLowerCase().split(/[^a-z']+/).filter(Boolean);
    for (const w of words) {
      if (TRAIT_KEYWORD_SET.has(w)) hits.add(w);
    }
  }
  // Hint keywords always win; they represent caller-asserted facts.
  if (Array.isArray(hintKeywords)) {
    for (const raw of hintKeywords) {
      if (typeof raw === "string" && raw.trim()) hits.add(raw.trim().toLowerCase());
    }
  }
  return clampArrayUnique([...hits], KEYWORD_MAX);
}

function inferSpeechStyle(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return { pace: "", syntax: "" };
  let totalWords = 0;
  let sentenceCount = 0;
  let fragmentCount = 0;
  for (const line of lines) {
    if (typeof line !== "string") continue;
    const sentences = line.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    for (const s of sentences) {
      sentenceCount += 1;
      const words = s.split(/\s+/).filter(Boolean);
      totalWords += words.length;
      if (words.length <= 4) fragmentCount += 1;
    }
  }
  if (sentenceCount === 0) return { pace: "", syntax: "" };
  const avgLen = totalWords / sentenceCount;
  let pace = "measured";
  if (avgLen <= 5) pace = "terse";
  else if (avgLen >= 14) pace = "ornate";
  const fragmentRate = fragmentCount / sentenceCount;
  let syntax = "declarative";
  if (fragmentRate >= 0.5) syntax = "fragmented";
  else if (avgLen >= 12) syntax = "flowing";
  return { pace, syntax };
}

function inferEmotionalDefault(keywords) {
  // Lightweight mapping from the strongest keyword present.
  const map = {
    anxious: "anxious",
    haunted: "haunted",
    weary: "weary",
    cynical: "cynical",
    guarded: "guarded",
    wry: "wry",
    earnest: "earnest",
    fierce: "fierce",
    ambitious: "driven",
    stoic: "stoic",
    tender: "tender",
    warm: "warm",
    cold: "cold",
  };
  for (const k of keywords || []) {
    if (map[k]) return map[k];
  }
  return "";
}

function extractTraits({ characterName = "", lines = [], hint = null } = {}) {
  if (!characterName || typeof characterName !== "string") {
    return { ...emptyTraits(), schemaVersion: TRAIT_SCHEMA_VERSION };
  }
  if (!Array.isArray(lines)) lines = [];
  const cleanLines = lines.filter((l) => typeof l === "string" && l.trim().length);

  const vocabulary = extractVocabularyFromLines(cleanLines);
  const hintKeywords = hint && Array.isArray(hint.keywords) ? hint.keywords : [];
  const keywords = extractKeywordsFromLines(cleanLines, hintKeywords);
  const speech_style = inferSpeechStyle(cleanLines);
  const emotional_default = inferEmotionalDefault(keywords);
  const goals = hint && Array.isArray(hint.goals)
    ? clampArrayUnique(hint.goals, GOALS_MAX)
    : [];
  const relationships = {};
  if (hint && hint.relationships && typeof hint.relationships === "object" && !Array.isArray(hint.relationships)) {
    let count = 0;
    for (const [k, v] of Object.entries(hint.relationships)) {
      if (count >= RELATIONSHIPS_MAX) break;
      if (typeof k !== "string" || !k.trim()) continue;
      if (typeof v !== "string" || !v.trim()) continue;
      relationships[k.trim()] = v.trim().slice(0, 120);
      count += 1;
    }
  }

  return {
    schemaVersion: TRAIT_SCHEMA_VERSION,
    vocabulary,
    keywords,
    speech_style,
    emotional_default,
    goals,
    relationships,
  };
}

function mergeTraits(existing, next) {
  const base = existing && typeof existing === "object" ? existing : emptyTraits();
  const add = next && typeof next === "object" ? next : emptyTraits();
  const merged = {
    schemaVersion: TRAIT_SCHEMA_VERSION,
    vocabulary: clampArrayUnique([...(base.vocabulary || []), ...(add.vocabulary || [])], VOCAB_MAX),
    keywords: clampArrayUnique([...(base.keywords || []), ...(add.keywords || [])], KEYWORD_MAX),
    speech_style: {
      pace: normalizeStyle(add.speech_style?.pace) || normalizeStyle(base.speech_style?.pace) || "",
      syntax: normalizeStyle(add.speech_style?.syntax) || normalizeStyle(base.speech_style?.syntax) || "",
    },
    emotional_default: typeof add.emotional_default === "string" && add.emotional_default.trim()
      ? add.emotional_default.trim()
      : (base.emotional_default || ""),
    goals: clampArrayUnique([...(base.goals || []), ...(add.goals || [])], GOALS_MAX),
    relationships: { ...(base.relationships || {}) },
  };
  if (add.relationships && typeof add.relationships === "object" && !Array.isArray(add.relationships)) {
    let count = Object.keys(merged.relationships).length;
    for (const [k, v] of Object.entries(add.relationships)) {
      if (count >= RELATIONSHIPS_MAX && !(k in merged.relationships)) break;
      if (typeof k === "string" && k.trim() && typeof v === "string" && v.trim()) {
        merged.relationships[k.trim()] = v.trim().slice(0, 120);
        count = Object.keys(merged.relationships).length;
      }
    }
  }
  return merged;
}

function buildTraitsBlockForPrompt(traits) {
  if (!traits || typeof traits !== "object") return "";
  const parts = [];
  if (traits.emotional_default) parts.push(`emotion: ${traits.emotional_default}`);
  if (Array.isArray(traits.keywords) && traits.keywords.length) {
    parts.push(`keywords: ${traits.keywords.slice(0, 8).join(", ")}`);
  }
  if (traits.speech_style && (traits.speech_style.pace || traits.speech_style.syntax)) {
    const ss = [];
    if (traits.speech_style.pace) ss.push(traits.speech_style.pace);
    if (traits.speech_style.syntax) ss.push(traits.speech_style.syntax);
    parts.push(`speech: ${ss.join(" / ")}`);
  }
  if (Array.isArray(traits.goals) && traits.goals.length) {
    parts.push(`goals: ${traits.goals.slice(0, 3).join("; ")}`);
  }
  if (traits.relationships && Object.keys(traits.relationships).length) {
    const entries = Object.entries(traits.relationships).slice(0, 4);
    parts.push(`relationships: ${entries.map(([k, v]) => `${k}=${v}`).join("; ")}`);
  }
  if (Array.isArray(traits.vocabulary) && traits.vocabulary.length) {
    parts.push(`vocab: "${traits.vocabulary.slice(0, 4).join('"; "')}"`);
  }
  return parts.join(" | ");
}

export {
  extractTraits,
  mergeTraits,
  buildTraitsBlockForPrompt,
  TRAIT_SCHEMA_VERSION,
  TRAIT_KEYWORDS,
  VOCAB_MAX,
  KEYWORD_MAX,
  GOALS_MAX,
  RELATIONSHIPS_MAX,
};
