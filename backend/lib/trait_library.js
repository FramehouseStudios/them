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
//     relationships: { [name: string]: string },
//     voice_fingerprint: {
//       tactics: string[],
//       silence: string,
//       emotional_tells: string[]
//     }
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
const VOICE_TACTICS_MAX = 6;
const EMOTIONAL_TELLS_MAX = 6;
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
    voice_fingerprint: { tactics: [], silence: "", emotional_tells: [] },
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

function inferVoiceTactics(lines) {
  const tactics = [];
  const add = (label) => {
    if (!tactics.includes(label)) tactics.push(label);
  };
  for (const raw of lines || []) {
    const line = typeof raw === "string" ? raw.trim() : "";
    if (!line) continue;
    const lower = line.toLowerCase();
    if (/^(?:no|not\b|not until|not unless|never)\b/.test(lower)) add("refuses first");
    if (/\b(?:if|unless|until|or)\b/.test(lower)) add("uses conditional pressure");
    if (/\?$/.test(line)) add("presses with questions");
    if (/^(?:look|listen|stop|take|give|tell|show|read|open|sign|wait)\b/i.test(line)) add("commands under pressure");
    if (/\b(?:fine|sure|great|good|perfect)\b[.!]?$/i.test(line) || /\b(?:funny|cute|adorable)\b/i.test(line)) add("deflects with dry irony");
    if (/\b(?:truth|lie|proof|evidence|receipt|affidavit|tape|reel|docket|file)\b/i.test(line)) add("weaponizes facts");
    if (tactics.length >= VOICE_TACTICS_MAX) break;
  }
  return clampArrayUnique(tactics, VOICE_TACTICS_MAX);
}

function inferSilencePattern(lines, speechStyle = {}) {
  const cleanLines = (lines || []).filter((line) => typeof line === "string" && line.trim());
  if (!cleanLines.length) return "";
  const fragmentLines = cleanLines.filter((line) => line.trim().split(/\s+/).filter(Boolean).length <= 4).length;
  const questionLines = cleanLines.filter((line) => /\?$/.test(line.trim())).length;
  const ellipsisLines = cleanLines.filter((line) => /(?:\.{3}|—|--)$/.test(line.trim())).length;
  if (ellipsisLines >= 2) return "trails off instead of naming the wound";
  if (speechStyle?.pace === "terse" || fragmentLines / cleanLines.length >= 0.5) {
    return "cuts lines short and lets silence carry threat";
  }
  if (questionLines / cleanLines.length >= 0.5) return "answers pressure with questions";
  return "";
}

function inferEmotionalTells(lines) {
  const tells = [];
  const add = (label) => {
    if (!tells.includes(label)) tells.push(label);
  };
  for (const raw of lines || []) {
    const line = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!line) continue;
    if (/\b(?:safe|door|home|leave|run|hide)\b/.test(line)) add("security language");
    if (/\b(?:truth|lie|proof|evidence|receipt|affidavit|tape|reel|docket|file)\b/.test(line)) add("fixates on evidence");
    if (/\b(?:sorry|forgive|mercy|fault|guilt|ashamed)\b/.test(line)) add("guilt leaks through");
    if (/\b(?:sister|brother|mother|father|kid|family)\b/.test(line)) add("family pressure slips out");
    if (/\b(?:burn|fire|blood|bury|grave|dead|ghost)\b/.test(line)) add("turns feeling into violent image");
    if (/\b(?:can't|cannot|won't|never|not until|not unless)\b/.test(line)) add("emotion surfaces as refusal");
    if (tells.length >= EMOTIONAL_TELLS_MAX) break;
  }
  return clampArrayUnique(tells, EMOTIONAL_TELLS_MAX);
}

function inferVoiceFingerprint(lines, speechStyle = {}) {
  const tactics = inferVoiceTactics(lines);
  const silence = inferSilencePattern(lines, speechStyle);
  const emotional_tells = inferEmotionalTells(lines);
  return {
    tactics,
    silence,
    emotional_tells,
  };
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
  const voice_fingerprint = inferVoiceFingerprint(cleanLines, speech_style);
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
    voice_fingerprint,
  };
}

function mergeTraits(existing, next) {
  const base = existing && typeof existing === "object" ? existing : emptyTraits();
  const add = next && typeof next === "object" ? next : emptyTraits();
  const baseFingerprint = base.voice_fingerprint && typeof base.voice_fingerprint === "object"
    ? base.voice_fingerprint
    : base.voiceFingerprint && typeof base.voiceFingerprint === "object"
      ? base.voiceFingerprint
      : {};
  const addFingerprint = add.voice_fingerprint && typeof add.voice_fingerprint === "object"
    ? add.voice_fingerprint
    : add.voiceFingerprint && typeof add.voiceFingerprint === "object"
      ? add.voiceFingerprint
      : {};
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
    voice_fingerprint: {
      tactics: clampArrayUnique([
        ...(baseFingerprint.tactics || []),
        ...(addFingerprint.tactics || []),
      ], VOICE_TACTICS_MAX),
      silence: normalizeStyle(addFingerprint.silence) || normalizeStyle(baseFingerprint.silence) || "",
      emotional_tells: clampArrayUnique([
        ...(baseFingerprint.emotional_tells || baseFingerprint.emotionalTells || []),
        ...(addFingerprint.emotional_tells || addFingerprint.emotionalTells || []),
      ], EMOTIONAL_TELLS_MAX),
    },
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
  const fingerprint = traits.voice_fingerprint && typeof traits.voice_fingerprint === "object"
    ? traits.voice_fingerprint
    : traits.voiceFingerprint && typeof traits.voiceFingerprint === "object"
      ? traits.voiceFingerprint
      : null;
  if (fingerprint) {
    const fp = [];
    if (Array.isArray(fingerprint.tactics) && fingerprint.tactics.length) {
      fp.push(`tactics=${fingerprint.tactics.slice(0, 4).join(", ")}`);
    }
    if (fingerprint.silence) fp.push(`silence=${fingerprint.silence}`);
    const emotionalTells = fingerprint.emotional_tells || fingerprint.emotionalTells;
    if (Array.isArray(emotionalTells) && emotionalTells.length) {
      fp.push(`tells=${emotionalTells.slice(0, 4).join(", ")}`);
    }
    if (fp.length) parts.push(`voice_fingerprint: ${fp.join("; ")}`);
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
  VOICE_TACTICS_MAX,
  EMOTIONAL_TELLS_MAX,
};
