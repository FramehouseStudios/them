// Creative-companion memory store (T08 + T08-postgres).
//
// A per-user record capturing the four pillars of longitudinal
// learning: style, characters, tone, habits. The shape mirrors
// the schema in docs/T08-prompt-centralization-and-memory-tier.md.
//
// Persistence is the canonical T07 adapter (Postgres when DATABASE_URL
// is set, JSON-file-backed otherwise). The store is keyed by userId in
// the `creative_memory` domain — one row per user. The previous file-
// backed MVP (single JSON document at backend/creative_memory_store.json
// containing all users) is superseded by this layout; legacy data can
// be migrated by reading the old file and writing each entry to the
// adapter once at startup if needed.
//
// Concurrency: writes serialize per-user via an in-process mutex chain.
// Cross-process safety comes from the adapter's underlying store
// (Postgres in production; single-process discipline in JSON mode).

import { createPersistence } from "./persistence_adapter.js";
import {
  extractTraits,
  mergeTraits as mergeCharacterTraits,
} from "./trait_library.js";

const SCHEMA_VERSION = 1;
const LEXICAL_FINGERPRINT_MAX = 64;
const CHARACTERS_MAX = 32;
const CHARACTER_BIBLE_CANON_MAX = 12;
const CHARACTER_BIBLE_CORRECTIONS_MAX = 8;
const CHARACTER_BIBLE_TERMS_MAX = 12;
const CHARACTER_ARC_FIELD_MAX_CHARS = 180;
const EPISODIC_MEMORIES_MAX = 64;
const EPISODIC_MEMORY_PROMPT_MAX = 6;
const EPISODIC_SEMANTIC_FINGERPRINT_MAX = 96;
const DOMAIN = "creative_memory";
const EPISODIC_MEMORY_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "before",
  "between",
  "character",
  "characters",
  "could",
  "feature",
  "for",
  "from",
  "have",
  "help",
  "into",
  "just",
  "like",
  "movie",
  "need",
  "next",
  "page",
  "pages",
  "scene",
  "screenplay",
  "script",
  "should",
  "story",
  "the",
  "that",
  "their",
  "there",
  "they",
  "this",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "write",
]);
const EPISODIC_CHARACTER_NAME_BLOCKLIST = new Set([
  "A",
  "An",
  "And",
  "Act",
  "The",
  "This",
  "That",
  "She",
  "He",
  "They",
  "We",
  "You",
  "My",
  "Our",
]);
const STORY_MEMORY_KEYWORDS = /\b(?:act\s*(?:i|ii|iii|1|2|3|one|two|three)|all[- ]is[- ]lost|antagonist|arc|beat|beats|character|climax|continue|ending|ending image|feature|film|final image|finale|first act|inciting incident|logline|midpoint|motif|movie|payoff|premise|protagonist|rewrite|scene|screenplay|script|sequence|setup|theme|third act|tone|voice|want|wound)\b/i;
const EXPLICIT_MEMORY_KEYWORDS = /\b(?:remember|keep in mind|do not forget|don't forget|note that|important|actually,\s*no|correction|for this movie|for this film|for this screenplay|in this movie|in this film|in this script|in my movie|in my film|in my screenplay|in my script)\b/i;
const CORRECTION_KEYWORDS = /\b(?:actually,\s*no|correction|scratch that|not that|instead|retcon|change it to|make it so)\b/i;
const CORRECTION_TAG = "correction";
const SUPERSEDED_TAG = "superseded";
const CHARACTER_BIBLE_FACT_KEYWORDS = /\b(?:is|was|becomes|became|turns out|wants|needs|must|believes|hides|knows|protects|fears|misses|betrays|trusts|forgives|loves|hates|secret|wound|goal|arc|relationship|mother|father|sister|brother|daughter|son|wife|husband|partner)\b/i;
const CHARACTER_ARC_FIELDS = Object.freeze([
  "act",
  "want",
  "need",
  "wound",
  "falseBelief",
  "relationshipPressure",
  "currentTactic",
  "nextEmotionalTurn",
]);
const EPISODIC_SEMANTIC_EXPANSIONS = Object.freeze([
  {
    concept: "recorded_evidence",
    terms: [
      "affidavit",
      "audio",
      "cassette",
      "clue",
      "document",
      "evidence",
      "file",
      "footage",
      "proof",
      "record",
      "recording",
      "reel",
      "tape",
      "testimony",
      "vhs",
      "video",
    ],
  },
  {
    concept: "concealed_secret",
    terms: [
      "buried",
      "conceal",
      "covered",
      "coverup",
      "hidden",
      "hide",
      "hides",
      "hiding",
      "keeps",
      "secret",
      "under",
      "withheld",
    ],
  },
  {
    concept: "family_pressure",
    terms: [
      "brother",
      "daughter",
      "father",
      "family",
      "husband",
      "mother",
      "parent",
      "partner",
      "sibling",
      "sister",
      "son",
      "wife",
    ],
  },
  {
    concept: "relationship_betrayal",
    terms: [
      "betray",
      "betrayal",
      "forgive",
      "forgives",
      "lie",
      "lying",
      "protect",
      "protects",
      "trust",
      "trusts",
    ],
  },
  {
    concept: "feature_structure",
    terms: [
      "act",
      "allislost",
      "beat",
      "beats",
      "climax",
      "ending",
      "feature",
      "finale",
      "midpoint",
      "payoff",
      "sequence",
      "setup",
      "turn",
    ],
  },
  {
    concept: "emotional_arc",
    terms: [
      "arc",
      "belief",
      "falsebelief",
      "fear",
      "need",
      "tactic",
      "want",
      "wound",
    ],
  },
]);
const EPISODIC_SEMANTIC_GENERIC_TAGS = new Set([
  "generated-pages",
  "project",
  "screenplay",
]);

function nowMs() {
  return Date.now();
}

function makeEmptyMemory(userId) {
  return {
    userId: String(userId || ""),
    version: SCHEMA_VERSION,
    updatedAt: nowMs(),
    style: {
      lexicalFingerprint: [],
    },
    characters: [],
    episodicMemories: [],
    tone: {},
    habits: {},
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function cleanText(value, maxChars = 800) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 800)))
    .trim();
}

function titleCaseName(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => {
      const clean = part.trim();
      if (!clean) return "";
      if (/^[A-Z0-9 .'-]+$/.test(clean) && clean.length > 1) return clean;
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .filter(Boolean)
    .join(" ");
}

function normalizeCharacterName(value) {
  const clean = titleCaseName(
    String(value ?? "")
      .replace(/[^A-Za-z0-9 .'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48)
  );
  if (!clean || EPISODIC_CHARACTER_NAME_BLOCKLIST.has(clean)) return "";
  if (clean.length < 2) return "";
  return clean;
}

function normalizeStringList(items, maxItems = 8, maxChars = 80) {
  const source = Array.isArray(items)
    ? items
    : cleanText(items, maxItems * maxChars)
      ? String(items).split(/\r?\n|;|,/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const clean = cleanText(item, maxChars);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeCharacterBibleFact(value = "", maxChars = 220) {
  return cleanText(value, maxChars)
    .replace(/^\s*(?:actually,?\s*no,?|no,?|correction:?|scratch that,?|retcon:?|not that,?)\s*/i, "")
    .trim();
}

function normalizeCharacterCorrectionTerm(value = "", maxChars = 120) {
  return cleanText(value, maxChars)
    .replace(/^(?:a|an|the|that|this|his|her|their|its)\s+/i, "")
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectCharacterBibleItems(items = [], maxItems = CHARACTER_BIBLE_CANON_MAX, maxChars = 220) {
  return normalizeStringList(items, maxItems, maxChars);
}

function parseCharacterBibleReplacement(value = "") {
  const clean = cleanText(value, 180);
  const parts = clean.split(/\s*->\s*/);
  if (parts.length !== 2) return null;
  const from = normalizeCharacterCorrectionTerm(parts[0], 90);
  const to = normalizeCharacterCorrectionTerm(parts[1], 120);
  if (!from || !to || from.toLowerCase() === to.toLowerCase()) return null;
  return { from, to };
}

function textContainsCharacterCorrectionTerm(value = "", terms = []) {
  const text = cleanText(value, 1_000).toLowerCase();
  if (!text) return false;
  return collectCharacterBibleItems(terms, CHARACTER_BIBLE_TERMS_MAX, 120).some((term) => {
    const lower = term.toLowerCase();
    return lower && text.includes(lower);
  });
}

function applyCharacterBibleReplacements(value = "", replacements = [], maxChars = 1_000) {
  let out = cleanText(value, maxChars);
  if (!out) return "";
  for (const item of Array.isArray(replacements) ? replacements : []) {
    const parsed = parseCharacterBibleReplacement(item);
    if (!parsed) continue;
    out = out.replace(new RegExp(`\\b${escapeRegex(parsed.from)}\\b`, "gi"), parsed.to);
  }
  return cleanText(out, maxChars);
}

function filterCharacterBibleItems(items = [], correction = null, maxItems = CHARACTER_BIBLE_CANON_MAX, maxChars = 220) {
  const terms = collectCharacterBibleItems(correction?.correctedTerms || [], CHARACTER_BIBLE_TERMS_MAX, 120);
  const replacements = correction?.correctionReplacements || [];
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (textContainsCharacterCorrectionTerm(item, terms)) continue;
    const replaced = applyCharacterBibleReplacements(item, replacements, maxChars);
    if (!replaced) continue;
    if (textContainsCharacterCorrectionTerm(replaced, terms)) continue;
    const key = replaced.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(replaced);
    if (out.length >= maxItems) break;
  }
  return out;
}

function readArcField(value = {}, field = "") {
  if (!value || typeof value !== "object") return "";
  if (field === "falseBelief") return value.falseBelief ?? value.false_belief ?? "";
  if (field === "relationshipPressure") return value.relationshipPressure ?? value.relationship_pressure ?? "";
  if (field === "currentTactic") return value.currentTactic ?? value.current_tactic ?? "";
  if (field === "nextEmotionalTurn") return value.nextEmotionalTurn ?? value.next_emotional_turn ?? "";
  return value[field] ?? "";
}

function sanitizeCharacterArcState(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = { schemaVersion: 1 };
  for (const field of CHARACTER_ARC_FIELDS) {
    const maxChars = field === "act" ? 80 : CHARACTER_ARC_FIELD_MAX_CHARS;
    const clean = cleanText(readArcField(value, field), maxChars);
    if (clean) out[field] = clean;
  }
  return Object.keys(out).length > 1 ? out : null;
}

function repairCharacterArcStateForCorrection(arc = null, correction = null) {
  const current = sanitizeCharacterArcState(arc);
  if (!current || !correction) return current;
  const terms = collectCharacterBibleItems(correction.correctedTerms || [], CHARACTER_BIBLE_TERMS_MAX, 120);
  const replacements = correction.correctionReplacements || [];
  const out = { schemaVersion: 1 };
  for (const field of CHARACTER_ARC_FIELDS) {
    const maxChars = field === "act" ? 80 : CHARACTER_ARC_FIELD_MAX_CHARS;
    const repaired = applyCharacterBibleReplacements(current[field], replacements, maxChars);
    if (!repaired || textContainsCharacterCorrectionTerm(repaired, terms)) continue;
    out[field] = repaired;
  }
  return Object.keys(out).length > 1 ? out : null;
}

function mergeCharacterArcState(existingArc = null, incomingArc = null, correction = null) {
  const existing = repairCharacterArcStateForCorrection(existingArc, correction) || {};
  const incoming = repairCharacterArcStateForCorrection(incomingArc, correction) || sanitizeCharacterArcState(incomingArc);
  const out = { schemaVersion: 1 };
  for (const field of CHARACTER_ARC_FIELDS) {
    const cleanIncoming = cleanText(incoming?.[field], field === "act" ? 80 : CHARACTER_ARC_FIELD_MAX_CHARS);
    const cleanExisting = cleanText(existing?.[field], field === "act" ? 80 : CHARACTER_ARC_FIELD_MAX_CHARS);
    if (cleanIncoming) out[field] = cleanIncoming;
    else if (cleanExisting) out[field] = cleanExisting;
  }
  return Object.keys(out).length > 1 ? out : null;
}

function sanitizeCharacterBibleDelta(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const canon = collectCharacterBibleItems(value.canon ?? value.facts, CHARACTER_BIBLE_CANON_MAX, 220);
  const corrections = collectCharacterBibleItems(value.corrections, CHARACTER_BIBLE_CORRECTIONS_MAX, 260);
  const arc = sanitizeCharacterArcState(value.arc ?? value.characterArc ?? value.character_arc);
  const correctedTerms = collectCharacterBibleItems(value.correctedTerms, CHARACTER_BIBLE_TERMS_MAX, 120)
    .map((term) => normalizeCharacterCorrectionTerm(term, 120))
    .filter(Boolean);
  const correctionReplacements = collectCharacterBibleItems(
    value.correctionReplacements,
    CHARACTER_BIBLE_TERMS_MAX,
    180
  ).filter((item) => parseCharacterBibleReplacement(item));
  if (!canon.length && !corrections.length && !arc && !correctedTerms.length && !correctionReplacements.length) return null;
  return {
    schemaVersion: 1,
    canon,
    corrections,
    ...(arc ? { arc } : {}),
    correctedTerms,
    correctionReplacements,
    updatedAt: Math.max(0, Number(value.updatedAt || nowMs())),
  };
}

function repairCharacterTraitsForCorrection(traits = null, correction = null) {
  if (!traits || typeof traits !== "object" || !correction) return traits;
  const terms = collectCharacterBibleItems(correction.correctedTerms || [], CHARACTER_BIBLE_TERMS_MAX, 120);
  const replacements = correction.correctionReplacements || [];
  const replacementKeywords = replacements
    .map(parseCharacterBibleReplacement)
    .filter(Boolean)
    .map((item) => item.to)
    .filter((item) => /^[a-z][a-z'-]{2,24}$/i.test(item));
  const cleanList = (items, maxChars = 120) => filterCharacterBibleItems(items, correction, 32, maxChars);
  const next = {
    ...traits,
    vocabulary: cleanList(traits.vocabulary, 120),
    keywords: collectCharacterBibleItems(
      [...cleanList(traits.keywords, 48), ...replacementKeywords],
      16,
      48
    ),
    goals: cleanList(traits.goals, 140),
    speech_style: traits.speech_style && typeof traits.speech_style === "object"
      ? { ...traits.speech_style }
      : traits.speech_style,
    relationships: {},
  };
  if (traits.emotional_default) {
    const repairedEmotion = applyCharacterBibleReplacements(traits.emotional_default, replacements, 48);
    next.emotional_default = textContainsCharacterCorrectionTerm(repairedEmotion, terms)
      ? ""
      : repairedEmotion;
  }
  if (traits.relationships && typeof traits.relationships === "object" && !Array.isArray(traits.relationships)) {
    for (const [rawName, rawValue] of Object.entries(traits.relationships)) {
      const value = applyCharacterBibleReplacements(rawValue, replacements, 120);
      if (!value || textContainsCharacterCorrectionTerm(value, terms)) continue;
      next.relationships[rawName] = value;
    }
  }
  return next;
}

function mergeCharacterBible(existingBible = null, incomingBible = null) {
  const existing = sanitizeCharacterBibleDelta(existingBible) || {
    schemaVersion: 1,
    canon: [],
    corrections: [],
    correctedTerms: [],
    correctionReplacements: [],
    updatedAt: 0,
  };
  const incoming = sanitizeCharacterBibleDelta(incomingBible);
  if (!incoming) return existing;
  const correction = {
    correctedTerms: incoming.correctedTerms,
    correctionReplacements: incoming.correctionReplacements,
  };
  const hasCorrection = Boolean(correction.correctedTerms.length || correction.correctionReplacements.length);
  const existingCanon = hasCorrection
    ? filterCharacterBibleItems(existing.canon, correction, CHARACTER_BIBLE_CANON_MAX, 220)
    : existing.canon;
  const arc = mergeCharacterArcState(existing.arc, incoming.arc, hasCorrection ? correction : null);
  const existingCorrections = filterCharacterBibleItems(
    existing.corrections,
    { correctedTerms: [], correctionReplacements: correction.correctionReplacements },
    CHARACTER_BIBLE_CORRECTIONS_MAX,
    260
  );
  return sanitizeCharacterBibleDelta({
    canon: collectCharacterBibleItems(
      [...incoming.canon, ...existingCanon],
      CHARACTER_BIBLE_CANON_MAX,
      220
    ),
    corrections: collectCharacterBibleItems(
      [...incoming.corrections, ...existingCorrections],
      CHARACTER_BIBLE_CORRECTIONS_MAX,
      260
    ),
    ...(arc ? { arc } : {}),
    correctedTerms: collectCharacterBibleItems(
      [...incoming.correctedTerms, ...existing.correctedTerms],
      CHARACTER_BIBLE_TERMS_MAX,
      120
    ),
    correctionReplacements: collectCharacterBibleItems(
      [...incoming.correctionReplacements, ...existing.correctionReplacements],
      CHARACTER_BIBLE_TERMS_MAX,
      180
    ),
    updatedAt: Math.max(Number(existing.updatedAt || 0), Number(incoming.updatedAt || 0), nowMs()),
  });
}

function tokenizeMemoryText(value) {
  const tokens = String(value || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{1,}/g) || [];
  return tokens.filter((token) => token.length > 2 && !EPISODIC_MEMORY_STOPWORDS.has(token));
}

function normalizeSemanticTerm(value) {
  let clean = String(value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (!clean || clean.length < 3 || EPISODIC_MEMORY_STOPWORDS.has(clean)) return "";
  if (clean === "coverup") return "coverup";
  if (clean.length > 5 && clean.endsWith("ies")) clean = `${clean.slice(0, -3)}y`;
  else if (clean.length > 5 && clean.endsWith("ing")) clean = clean.slice(0, -3);
  else if (clean.length > 4 && clean.endsWith("ed")) clean = clean.slice(0, -2);
  else if (clean.length > 4 && clean.endsWith("es")) clean = clean.slice(0, -2);
  else if (clean.length > 4 && clean.endsWith("s") && !clean.endsWith("ss")) clean = clean.slice(0, -1);
  if (clean.length < 3 || EPISODIC_MEMORY_STOPWORDS.has(clean)) return "";
  return clean;
}

function addSemanticTerm(terms, value) {
  const clean = normalizeSemanticTerm(value);
  if (clean) terms.add(clean);
}

function addSemanticExpansionTerms(terms, sourceText = "") {
  const normalized = ` ${String(sourceText || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const normalizedTerms = new Set(tokenizeMemoryText(sourceText).map(normalizeSemanticTerm).filter(Boolean));
  if (!normalized.trim()) return;
  for (const group of EPISODIC_SEMANTIC_EXPANSIONS) {
    const matched = group.terms.some((term) => {
      const clean = normalizeSemanticTerm(term);
      const raw = String(term || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return clean && (normalizedTerms.has(clean) || (raw && normalized.includes(` ${raw} `)));
    });
    if (!matched) continue;
    addSemanticTerm(terms, group.concept);
    for (const term of group.terms) addSemanticTerm(terms, term);
  }
}

function buildEpisodicSemanticFingerprint({
  summary = "",
  excerpt = "",
  text = "",
  characterNames = [],
  tags = [],
  projectTitle = "",
} = {}) {
  const terms = new Set();
  const textParts = [
    summary,
    excerpt,
    text,
    projectTitle,
    ...(Array.isArray(characterNames) ? characterNames : []),
  ].filter(Boolean);
  const source = textParts.join(" ");
  for (const token of tokenizeMemoryText(source)) addSemanticTerm(terms, token);
  for (const tag of Array.isArray(tags) ? tags : []) {
    const cleanTag = String(tag || "").toLowerCase();
    if (!cleanTag || EPISODIC_SEMANTIC_GENERIC_TAGS.has(cleanTag)) continue;
    addSemanticTerm(terms, cleanTag);
  }
  for (const name of Array.isArray(characterNames) ? characterNames : []) {
    const cleanName = normalizeCharacterName(name);
    if (!cleanName) continue;
    addSemanticTerm(terms, cleanName);
    for (const part of cleanName.split(/\s+/)) addSemanticTerm(terms, part);
  }
  addSemanticExpansionTerms(terms, source);
  return [...terms]
    .filter(Boolean)
    .slice(0, EPISODIC_SEMANTIC_FINGERPRINT_MAX);
}

function semanticFingerprintForQuery(query = "") {
  return buildEpisodicSemanticFingerprint({ text: query });
}

function scoreSemanticFingerprintMatch(queryTerms = [], memoryTerms = []) {
  const query = new Set((Array.isArray(queryTerms) ? queryTerms : [])
    .map(normalizeSemanticTerm)
    .filter(Boolean));
  const memory = new Set((Array.isArray(memoryTerms) ? memoryTerms : [])
    .map(normalizeSemanticTerm)
    .filter(Boolean));
  if (!query.size || !memory.size) return 0;
  let hits = 0;
  let conceptHits = 0;
  for (const term of query) {
    if (!memory.has(term)) continue;
    hits += 1;
    if (EPISODIC_SEMANTIC_EXPANSIONS.some((group) => normalizeSemanticTerm(group.concept) === term)) {
      conceptHits += 1;
    }
  }
  if (hits <= 0) return 0;
  const precision = hits / Math.max(1, query.size);
  const conceptBoost = conceptHits > 0 ? 2 + conceptHits : 0;
  return (hits * 1.5) + (precision * 3) + conceptBoost;
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractDeclaredCharacterNames(text = "") {
  const source = String(text || "");
  if (!source.trim()) return [];
  const patterns = [
    /\b(?:my|the|our)\s+(?:protagonist|lead|main character|hero|heroine|detective|writer|lawyer|mother|father|sister|brother|villain|antagonist)\s+(?:is\s+)?(?:named|called)?\s*([A-Za-z][A-Za-z'-]{1,32})\b/gi,
    /\b(?:character|protagonist|lead|hero|heroine)\s+(?:named|called)\s+([A-Za-z][A-Za-z'-]{1,32})\b/gi,
    /\b([A-Z][A-Za-z'-]{2,32})\s+is\s+(?:a|an|the)\s+(?:protagonist|lead|detective|writer|lawyer|courier|public defender|mother|father|sister|brother)\b/g,
  ];
  const out = [];
  const seen = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const name = normalizeCharacterName(match[1]);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

function textMentionsName(text = "", name = "") {
  const cleanName = normalizeCharacterName(name);
  if (!cleanName) return false;
  return new RegExp(`\\b${escapeRegex(cleanName)}\\b`, "i").test(String(text || ""));
}

function firstScreenplaySceneHeading(text = "") {
  const match = String(text || "").match(/(?:^|\n)\s*((?:INT\.|EXT\.|INT\/EXT\.|INT\.\/EXT\.)[^\n]{3,120})/i);
  return cleanText(match?.[1] || "", 140);
}

function firstMemoryMoment(text = "") {
  const lines = String(text || "")
    .split(/\r?\n|[.!?]\s+/)
    .map((line) => cleanText(line, 220))
    .filter((line) => {
      if (!line) return false;
      if (/^(INT\.|EXT\.|CUT TO|FADE|TITLE|END)$/i.test(line)) return false;
      return tokenizeMemoryText(line).length >= 4;
    });
  return lines[0] || "";
}

function sanitizeEpisodicMemoryItem(item = {}) {
  if (!item || typeof item !== "object") return null;
  const characterNames = normalizeStringList(item.characterNames ?? item.characters, 8, 48)
    .map(normalizeCharacterName)
    .filter(Boolean);
  const tags = normalizeStringList(item.tags, 8, 48)
    .map((tag) => tag.toLowerCase())
    .filter(Boolean);
  const summary = cleanText(item.summary, 280);
  const text = cleanText(item.text ?? item.excerpt, 900);
  const projectId = cleanText(item.projectId ?? item.project_id, 96);
  const projectTitle = cleanText(item.projectTitle ?? item.project_title, 160);
  if (!summary && !text && !characterNames.length && !projectTitle) return null;
  const createdAt = Math.max(0, Number(item.createdAt ?? item.created_at ?? nowMs()));
  const updatedAt = Math.max(createdAt, Number(item.updatedAt ?? item.updated_at ?? createdAt));
  const supersededAt = Math.max(0, Number(item.supersededAt ?? item.superseded_at ?? 0));
  const id = cleanText(
    item.id || `episode_${stableHash([projectId, projectTitle, summary, text, characterNames.join("|")].join("|"))}`,
    80
  );
  return {
    id,
    summary: summary || firstMemoryMoment(text) || (characterNames.length ? `Story memory for ${characterNames.join(", ")}` : "Story memory"),
    excerpt: cleanText(item.excerpt || text, 420),
    text,
    characterNames,
    tags,
    projectId,
    projectTitle,
    source: cleanText(item.source, 64),
    semanticFingerprint: buildEpisodicSemanticFingerprint({
      summary: summary || firstMemoryMoment(text) || (characterNames.length ? `Story memory for ${characterNames.join(", ")}` : "Story memory"),
      excerpt: cleanText(item.excerpt || text, 420),
      text,
      characterNames,
      tags,
      projectTitle,
    }),
    createdAt,
    updatedAt,
    lastReferencedAt: Math.max(0, Number(item.lastReferencedAt ?? item.last_referenced_at ?? updatedAt)),
    referenceCount: Math.max(0, Number(item.referenceCount ?? item.reference_count ?? 0)),
    ...(supersededAt ? {
      supersededAt,
      supersededByMemoryId: cleanText(item.supersededByMemoryId ?? item.superseded_by_memory_id, 80),
      supersededReason: cleanText(item.supersededReason ?? item.superseded_reason, 220),
      supersededTerms: collectCharacterBibleItems(
        item.supersededTerms ?? item.superseded_terms,
        CHARACTER_BIBLE_TERMS_MAX,
        120
      ),
    } : {}),
  };
}

function hasTag(memory, tag) {
  const cleanTag = String(tag || "").toLowerCase();
  return Array.isArray(memory?.tags) && memory.tags.some((item) => String(item || "").toLowerCase() === cleanTag);
}

function scoreEpisodicMemoryForQuery(memory, query = "", {
  projectId = "",
  projectTitle = "",
} = {}) {
  const cleanQuery = cleanText(query, 2_000).toLowerCase();
  const cleanProjectId = cleanText(projectId, 96).toLowerCase();
  const cleanProjectTitle = cleanText(projectTitle, 160).toLowerCase();
  const queryTokens = new Set(tokenizeMemoryText(cleanQuery));
  const searchable = [
    memory.summary,
    memory.excerpt,
    memory.text,
    memory.projectTitle,
    ...(memory.characterNames || []),
    ...(memory.tags || []),
  ].join(" ").toLowerCase();
  const correctionBoost = hasTag(memory, CORRECTION_TAG) ? 10 : 0;
  const semanticScore = scoreSemanticFingerprintMatch(
    semanticFingerprintForQuery(cleanQuery),
    Array.isArray(memory.semanticFingerprint) && memory.semanticFingerprint.length
      ? memory.semanticFingerprint
      : buildEpisodicSemanticFingerprint(memory)
  );
  if (!queryTokens.size) {
    let score = Math.min(4, Number(memory.referenceCount || 0)) +
      Math.min(3, Math.floor(Number(memory.updatedAt || 0) / 86_400_000_000));
    if (cleanProjectId && cleanText(memory.projectId, 96).toLowerCase() === cleanProjectId) score += 8;
    if (cleanProjectTitle && cleanText(memory.projectTitle, 160).toLowerCase() === cleanProjectTitle) score += 5;
    return score + correctionBoost + semanticScore;
  }
  let score = correctionBoost + semanticScore;
  for (const token of queryTokens) {
    if (searchable.includes(token)) score += 1;
  }
  for (const name of memory.characterNames || []) {
    const cleanName = String(name || "").toLowerCase();
    if (cleanName && cleanQuery.includes(cleanName)) score += 6;
  }
  for (const tag of memory.tags || []) {
    const cleanTag = String(tag || "").toLowerCase();
    if (cleanTag && cleanQuery.includes(cleanTag)) score += 2;
  }
  if (memory.projectTitle && cleanQuery.includes(String(memory.projectTitle).toLowerCase())) score += 4;
  if (cleanProjectId && cleanText(memory.projectId, 96).toLowerCase() === cleanProjectId) score += 8;
  if (cleanProjectTitle && cleanText(memory.projectTitle, 160).toLowerCase() === cleanProjectTitle) score += 5;
  return score;
}

function selectEpisodicMemoriesForPrompt(items = [], {
  query = "",
  projectId = "",
  projectTitle = "",
  maxItems = EPISODIC_MEMORY_PROMPT_MAX,
} = {}) {
  const sanitized = (Array.isArray(items) ? items : [])
    .map(sanitizeEpisodicMemoryItem)
    .filter((item) => item && !item.supersededAt);
  if (!sanitized.length) return [];
  const cleanQuery = cleanText(query, 2_000);
  return sanitized
    .map((item) => ({
      item,
      score: scoreEpisodicMemoryForQuery(item, cleanQuery, { projectId, projectTitle }),
    }))
    .filter((entry) => !cleanQuery || entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aCorrection = hasTag(a.item, CORRECTION_TAG) ? 1 : 0;
      const bCorrection = hasTag(b.item, CORRECTION_TAG) ? 1 : 0;
      if (bCorrection !== aCorrection) return bCorrection - aCorrection;
      return Number(b.item.updatedAt || 0) - Number(a.item.updatedAt || 0);
    })
    .slice(0, Math.max(1, Number(maxItems || EPISODIC_MEMORY_PROMPT_MAX)))
    .map(({ item }) => {
      const out = clone(item);
      delete out.text;
      delete out.semanticFingerprint;
      return out;
    });
}

function sortEpisodicMemoriesForStorage(memories = []) {
  return (Array.isArray(memories) ? memories : [])
    .sort((a, b) => {
      const aSuperseded = a?.supersededAt ? 1 : 0;
      const bSuperseded = b?.supersededAt ? 1 : 0;
      if (aSuperseded !== bSuperseded) return aSuperseded - bSuperseded;
      return Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0);
    });
}

function sanitizeCreativeMemoryLedgerRecord(rec = null, {
  includeSuperseded = true,
  maxEpisodicMemories = EPISODIC_MEMORIES_MAX,
} = {}) {
  if (!rec || typeof rec !== "object") return null;
  const out = {
    userId: cleanText(rec.userId, 128),
    version: SCHEMA_VERSION,
    updatedAt: Math.max(0, Number(rec.updatedAt || 0)),
  };
  if (rec.style && typeof rec.style === "object" && !Array.isArray(rec.style)) {
    out.style = clone(rec.style);
  }
  if (Array.isArray(rec.characters) && rec.characters.length) {
    out.characters = clone(rec.characters);
  }
  const episodicMemories = sortEpisodicMemoriesForStorage(
    (Array.isArray(rec.episodicMemories) ? rec.episodicMemories : [])
      .map(sanitizeEpisodicMemoryItem)
      .filter((item) => item && (includeSuperseded || !item.supersededAt))
  )
    .slice(0, Math.max(1, Number(maxEpisodicMemories || EPISODIC_MEMORIES_MAX)))
    .map((memory) => {
      const item = clone(memory);
      delete item.text;
      delete item.semanticFingerprint;
      return item;
    });
  if (episodicMemories.length) out.episodicMemories = episodicMemories;
  if (rec.tone && typeof rec.tone === "object" && !Array.isArray(rec.tone)) {
    out.tone = clone(rec.tone);
  }
  if (rec.habits && typeof rec.habits === "object" && !Array.isArray(rec.habits)) {
    out.habits = clone(rec.habits);
  }
  return out;
}

function touchReferencedEpisodicMemories(memories = [], memoryIds = [], atMs = nowMs()) {
  const ids = new Set(
    (Array.isArray(memoryIds) ? memoryIds : [])
      .map((id) => cleanText(id, 80))
      .filter(Boolean)
  );
  if (!ids.size) {
    return {
      memories: (Array.isArray(memories) ? memories : [])
        .map(sanitizeEpisodicMemoryItem)
        .filter(Boolean),
      touched: 0,
    };
  }
  let touched = 0;
  const next = (Array.isArray(memories) ? memories : [])
    .map(sanitizeEpisodicMemoryItem)
    .filter(Boolean)
    .map((memory) => {
      if (!ids.has(memory.id)) return memory;
      touched += 1;
      return {
        ...memory,
        lastReferencedAt: Math.max(Number(memory.lastReferencedAt || 0), atMs),
        referenceCount: Math.max(0, Number(memory.referenceCount || 0)) + 1,
      };
    });
  return { memories: next, touched };
}

function isStoryMemoryCandidate({
  transcript = "",
  reply = "",
  projectId = "",
  projectTitle = "",
  sceneHeading = "",
  characterNames = [],
  source = "",
  moment = "",
} = {}) {
  if (characterNames.length || sceneHeading) return true;
  const cleanTranscript = cleanText(transcript, 2_000);
  const cleanReply = cleanText(reply, 2_000);
  const combined = `${cleanTranscript} ${cleanReply}`.trim();
  if (!combined || !moment) return false;
  const hasProjectIdentity = Boolean(cleanText(projectId, 96) || cleanText(projectTitle, 160));
  const sourceLooksLikeScreenplay = /\bscreenplay|page|studio|script\b/i.test(String(source || ""));
  if (hasProjectIdentity && tokenizeMemoryText(combined).length >= 6) return true;
  if (sourceLooksLikeScreenplay && tokenizeMemoryText(combined).length >= 8) return true;
  return EXPLICIT_MEMORY_KEYWORDS.test(combined) || STORY_MEMORY_KEYWORDS.test(combined);
}

function buildEpisodicTags({ transcript = "", source = "", projectId = "", projectTitle = "" } = {}) {
  const tags = ["screenplay"];
  const text = String(transcript || "");
  if (cleanText(projectId, 96) || cleanText(projectTitle, 160)) tags.push("project");
  if (EXPLICIT_MEMORY_KEYWORDS.test(text)) tags.push("user-note");
  if (CORRECTION_KEYWORDS.test(text)) tags.push(CORRECTION_TAG);
  if (/\boutput|page|studio\b/i.test(String(source || ""))) tags.push("generated-pages");
  return [...new Set(tags)];
}

function buildEpisodicSummary({
  characterNames = [],
  sceneHeading = "",
  moment = "",
  projectTitle = "",
  transcript = "",
  isCorrection = false,
} = {}) {
  const cleanCharacters = normalizeStringList(characterNames, 8, 48)
    .map(normalizeCharacterName)
    .filter(Boolean);
  const cleanProjectTitle = cleanText(projectTitle, 120);
  const cleanSceneHeading = cleanText(sceneHeading, 140);
  const cleanMoment = cleanText(moment || firstMemoryMoment(transcript), 180);
  const subject = isCorrection
    ? cleanCharacters.length
      ? `Correction for ${cleanCharacters.join(", ")}`
      : cleanProjectTitle
        ? `Correction for ${cleanProjectTitle}`
        : "Correction"
    : cleanCharacters.length
      ? `Story memory for ${cleanCharacters.join(", ")}`
      : cleanProjectTitle
        ? `Project memory for ${cleanProjectTitle}`
        : "Story memory";
  return cleanText(
    [
      subject,
      cleanSceneHeading,
      cleanMoment,
    ].filter(Boolean).join(": "),
    280
  );
}

function traitsHaveSignal(traits) {
  if (!traits || typeof traits !== "object") return false;
  if (Array.isArray(traits.vocabulary) && traits.vocabulary.length) return true;
  if (Array.isArray(traits.keywords) && traits.keywords.length) return true;
  if (Array.isArray(traits.goals) && traits.goals.length) return true;
  if (traits.relationships && typeof traits.relationships === "object" && Object.keys(traits.relationships).length) return true;
  if (traits.emotional_default) return true;
  return Boolean(traits.speech_style?.pace || traits.speech_style?.syntax);
}

function lineLooksLikeCharacterCue(line) {
  const raw = String(line || "").trim();
  if (!raw || raw.length > 36) return false;
  if (/^(INT\.|EXT\.|INT\/EXT|FADE|CUT TO|CUT|END|TITLE|MONTAGE|FLASHBACK|SUPER|SMASH CUT|MATCH CUT|DISSOLVE)/.test(raw)) return false;
  return /^[A-Z][A-Z0-9 .'-]{1,34}[A-Z0-9](?:\s*\([^)]+\))?$/.test(raw);
}

function extractTraitLinesForCharacter(text = "", characterName = "") {
  const cleanName = normalizeCharacterName(characterName);
  if (!cleanName) return [];
  const nameRegex = new RegExp(`\\b${escapeRegex(cleanName)}\\b`, "i");
  const out = [];
  const seen = new Set();
  const push = (line) => {
    const clean = cleanText(line, 220);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };

  for (const sentence of String(text || "").split(/[.!?]\s+|\r?\n/)) {
    if (out.length >= 8) break;
    if (nameRegex.test(sentence)) push(sentence);
  }

  const lines = String(text || "").split(/\r?\n/);
  const cueKey = cleanName.toUpperCase();
  for (let i = 0; i < lines.length && out.length < 8; i += 1) {
    const raw = String(lines[i] || "").trim();
    const cue = raw.replace(/\s*\([^)]+\)\s*$/, "").trim().toUpperCase();
    if (cue !== cueKey) continue;
    for (let j = i + 1; j < lines.length && out.length < 8; j += 1) {
      const next = String(lines[j] || "").trim();
      if (!next) break;
      if (/^(INT\.|EXT\.|INT\/EXT)/i.test(next)) break;
      if (lineLooksLikeCharacterCue(next)) break;
      push(next);
    }
  }
  return out.slice(0, 8);
}

function extractTraitHintForCharacter(text = "", characterName = "") {
  const cleanName = normalizeCharacterName(characterName);
  if (!cleanName) return null;
  const source = String(text || "");
  const escaped = escapeRegex(cleanName);
  const goals = [];
  const goalPatterns = [
    new RegExp(`\\b${escaped}\\s+(?:wants|needs|tries|is trying|has)\\s+to\\s+([^.!?\\n]{3,120})`, "i"),
    new RegExp(`\\b${escaped}\\s+must\\s+([^.!?\\n]{3,120})`, "i"),
  ];
  for (const pattern of goalPatterns) {
    const match = source.match(pattern);
    if (match?.[1]) goals.push(cleanText(match[1], 120));
  }

  const relationships = {};
  const relationPattern = new RegExp(`\\b${escaped}\\s+(loves|hates|protects|fears|misses|betrays|trusts|forgives)\\s+([A-Z][A-Za-z'-]{1,32})\\b`, "g");
  let match;
  while ((match = relationPattern.exec(source)) !== null) {
    const verb = cleanText(match[1], 32);
    const other = normalizeCharacterName(match[2]);
    if (!verb || !other || other.toLowerCase() === cleanName.toLowerCase()) continue;
    relationships[other] = verb;
    if (Object.keys(relationships).length >= 6) break;
  }

  return goals.length || Object.keys(relationships).length
    ? { goals, relationships }
    : null;
}

function splitCharacterBibleSentences(text = "") {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((line) => normalizeCharacterBibleFact(line, 260))
    .filter(Boolean);
}

function extractCharacterReplacementBeforeNot(text = "", notIndex = -1, characterName = "") {
  const beforeNot = cleanText(String(text || "").slice(0, Math.max(0, notIndex)), 260);
  if (!beforeNot) return "";
  const cleanName = normalizeCharacterName(characterName);
  const escapedName = cleanName ? escapeRegex(cleanName) : "";
  const patterns = [
    escapedName
      ? new RegExp(`\\b${escapedName}(?:'s)?\\s+(?:false\\s+belief|misbelief|lie|wound|need|want|current\\s+tactic|tactic|next\\s+emotional\\s+turn|emotional\\s+turn|relationship\\s+pressure)(?:\\s+with\\s+[A-Z][A-Za-z'-]{1,32})?\\s+(?:is|is that|is to|should be|becomes|=)\\s+(.{2,120})$`, "i")
      : null,
    escapedName
      ? new RegExp(`\\b${escapedName}\\s+(?:is|was|becomes|became|turns out to be|acts as)\\s+(.{2,120})$`, "i")
      : null,
    /\b(?:is|was|becomes|became|turns out to be|acts as)\s+(.{2,120})$/i,
    /\b(?:hides|finds|carries|keeps|protects|wants|needs)\s+(.{2,120})$/i,
  ].filter(Boolean);
  for (const pattern of patterns) {
    const match = beforeNot.match(pattern);
    if (!match?.[1]) continue;
    const clean = normalizeCharacterCorrectionTerm(
      String(match[1])
        .replace(/\s+(?:under|inside|behind|before|after|with|to|from|because|while)\b.*$/i, ""),
      120
    );
    if (clean && !/\b(?:scene|act|page|story|character|canon)\b/i.test(clean)) return clean;
  }
  return "";
}

function extractCharacterMemoryCorrection(text = "", characterName = "") {
  const raw = cleanText(text, 1_200);
  if (!raw || !CORRECTION_KEYWORDS.test(raw) || !textMentionsName(raw, characterName)) return null;
  let correctedFact = normalizeCharacterBibleFact(raw, 420);
  const correctedTerms = [];
  const correctionReplacements = [];
  const addTerm = (value) => {
    const clean = normalizeCharacterCorrectionTerm(value, 120);
    if (!clean) return;
    if (!correctedTerms.some((item) => item.toLowerCase() === clean.toLowerCase())) correctedTerms.push(clean);
  };
  const addReplacement = (fromValue, toValue) => {
    const from = normalizeCharacterCorrectionTerm(fromValue, 90);
    const to = normalizeCharacterCorrectionTerm(toValue, 120);
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
    addTerm(from);
    const replacement = `${from} -> ${to}`;
    if (!correctionReplacements.some((item) => item.toLowerCase() === replacement.toLowerCase())) {
      correctionReplacements.push(replacement);
    }
  };

  const changeMatch = raw.match(/\bchange\s+(.{1,90}?)\s+to\s+(.{1,160}?)(?:[.;]|$)/i);
  if (changeMatch) {
    addReplacement(changeMatch[1], changeMatch[2]);
    correctedFact = `Change ${normalizeCharacterCorrectionTerm(changeMatch[1], 90)} to ${normalizeCharacterCorrectionTerm(changeMatch[2], 160)}.`;
  }

  const notPattern = /\bnot\s+(?:a|an|the|that|this|his|her|their|its)?\s*([A-Za-z0-9][A-Za-z0-9' -]{0,80}?)(?=\.|,|;|$|\s+but\b|\s+instead\b|\s+anymore\b)/gi;
  for (const match of raw.matchAll(notPattern)) {
    const removed = normalizeCharacterCorrectionTerm(match[1], 90);
    if (!removed) continue;
    addTerm(removed);
    const replacement = extractCharacterReplacementBeforeNot(raw, match.index || 0, characterName);
    if (replacement) addReplacement(removed, replacement);
  }

  let authoritativeFact = correctedFact;
  for (const term of correctedTerms) {
    authoritativeFact = authoritativeFact.replace(
      new RegExp(`\\s*,?\\s*\\bnot\\s+(?:a|an|the|that|this|his|her|their|its)?\\s*${escapeRegex(term)}\\b(?:\\s+anymore)?`, "ig"),
      ""
    );
  }
  authoritativeFact = normalizeCharacterBibleFact(authoritativeFact, 420) || correctedFact;
  return {
    correctedFact: authoritativeFact,
    correctionNote: normalizeCharacterBibleFact(correctedFact, 420),
    correctedTerms: collectCharacterBibleItems(correctedTerms, CHARACTER_BIBLE_TERMS_MAX, 120),
    correctionReplacements: collectCharacterBibleItems(correctionReplacements, CHARACTER_BIBLE_TERMS_MAX, 180),
  };
}

function mergeCorrectionSignals(...signals) {
  const correctedTerms = [];
  const correctionReplacements = [];
  const correctionNotes = [];
  const addTerm = (value) => {
    const clean = normalizeCharacterCorrectionTerm(value, 120);
    if (!clean) return;
    if (!correctedTerms.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      correctedTerms.push(clean);
    }
  };
  const addReplacement = (value) => {
    const parsed = parseCharacterBibleReplacement(value);
    if (!parsed) return;
    addTerm(parsed.from);
    const replacement = `${parsed.from} -> ${parsed.to}`;
    if (!correctionReplacements.some((item) => item.toLowerCase() === replacement.toLowerCase())) {
      correctionReplacements.push(replacement);
    }
  };
  for (const signal of signals) {
    if (!signal || typeof signal !== "object") continue;
    for (const term of collectCharacterBibleItems(signal.correctedTerms, CHARACTER_BIBLE_TERMS_MAX, 120)) {
      addTerm(term);
    }
    for (const replacement of collectCharacterBibleItems(signal.correctionReplacements, CHARACTER_BIBLE_TERMS_MAX, 180)) {
      addReplacement(replacement);
    }
    const note = normalizeCharacterBibleFact(signal.correctionNote || signal.correctedFact || "", 220);
    if (note && !correctionNotes.some((item) => item.toLowerCase() === note.toLowerCase())) {
      correctionNotes.push(note);
    }
  }
  return correctedTerms.length || correctionReplacements.length
    ? {
      correctedTerms: correctedTerms.slice(0, CHARACTER_BIBLE_TERMS_MAX),
      correctionReplacements: correctionReplacements.slice(0, CHARACTER_BIBLE_TERMS_MAX),
      correctionNotes: correctionNotes.slice(0, 4),
    }
    : null;
}

function extractGenericEpisodicCorrectionSignal(text = "") {
  const raw = cleanText(text, 1_200);
  if (!raw || !CORRECTION_KEYWORDS.test(raw)) return null;
  const correctedTerms = [];
  const correctionReplacements = [];
  const addTerm = (value) => {
    const clean = normalizeCharacterCorrectionTerm(value, 120);
    if (!clean || /\b(?:scene|act|page|story|character|script|screenplay)\b/i.test(clean)) return;
    if (!correctedTerms.some((item) => item.toLowerCase() === clean.toLowerCase())) correctedTerms.push(clean);
  };
  const addReplacement = (fromValue, toValue) => {
    const from = normalizeCharacterCorrectionTerm(fromValue, 90);
    const to = normalizeCharacterCorrectionTerm(toValue, 120);
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
    addTerm(from);
    const replacement = `${from} -> ${to}`;
    if (!correctionReplacements.some((item) => item.toLowerCase() === replacement.toLowerCase())) {
      correctionReplacements.push(replacement);
    }
  };

  const changeMatch = raw.match(/\bchange\s+(.{1,90}?)\s+to\s+(.{1,160}?)(?:[.;]|$)/i);
  if (changeMatch) addReplacement(changeMatch[1], changeMatch[2]);
  const notButPattern = /\bnot\s+(?:a|an|the|that|this|his|her|their|its)?\s*([A-Za-z0-9][A-Za-z0-9' -]{0,80}?)\s*(?:,?\s*(?:but|instead)\s+)([A-Za-z0-9][A-Za-z0-9' -]{1,120}?)(?:[.;]|$)/gi;
  for (const match of raw.matchAll(notButPattern)) addReplacement(match[1], match[2]);
  const notPattern = /\bnot\s+(?:a|an|the|that|this|his|her|their|its)?\s*([A-Za-z0-9][A-Za-z0-9' -]{0,80}?)(?=\.|,|;|$|\s+but\b|\s+instead\b|\s+anymore\b)/gi;
  for (const match of raw.matchAll(notPattern)) addTerm(match[1]);

  return mergeCorrectionSignals({
    correctedTerms,
    correctionReplacements,
    correctionNote: normalizeCharacterBibleFact(raw, 220),
  });
}

function collectEpisodicCorrectionSignal({ text = "", characterNames = [] } = {}) {
  const cleanNames = normalizeStringList(characterNames, 8, 48)
    .map(normalizeCharacterName)
    .filter(Boolean);
  const characterSignals = cleanNames
    .map((name) => extractCharacterMemoryCorrection(text, name))
    .filter(Boolean);
  return mergeCorrectionSignals(
    ...characterSignals,
    extractGenericEpisodicCorrectionSignal(text)
  );
}

function memoryMatchesCorrectionSignal(memory = {}, correction = null) {
  const signal = mergeCorrectionSignals(correction);
  if (!signal) return false;
  const source = [
    memory.summary,
    memory.excerpt,
    memory.text,
    memory.projectTitle,
    ...(Array.isArray(memory.characterNames) ? memory.characterNames : []),
  ].filter(Boolean).join(" ").toLowerCase();
  if (!source) return false;
  return signal.correctedTerms.some((term) => {
    const clean = normalizeCharacterCorrectionTerm(term, 120).toLowerCase();
    return clean && source.includes(clean);
  });
}

function memorySharesCorrectionScope(memory = {}, correctionMemory = {}) {
  const correctionProjectId = cleanText(correctionMemory.projectId, 96).toLowerCase();
  const correctionProjectTitle = cleanText(correctionMemory.projectTitle, 160).toLowerCase();
  const memoryProjectId = cleanText(memory.projectId, 96).toLowerCase();
  const memoryProjectTitle = cleanText(memory.projectTitle, 160).toLowerCase();
  if (correctionProjectId && memoryProjectId && correctionProjectId !== memoryProjectId) return false;
  if (correctionProjectTitle && memoryProjectTitle && correctionProjectTitle !== memoryProjectTitle) return false;

  const correctionNames = new Set((correctionMemory.characterNames || []).map((name) => String(name || "").toLowerCase()));
  if (!correctionNames.size) return true;
  const memoryNames = new Set((memory.characterNames || []).map((name) => String(name || "").toLowerCase()));
  return [...correctionNames].some((name) => memoryNames.has(name));
}

function supersedeEpisodicMemoriesForCorrection(memories = [], {
  correctionMemory = null,
  correction = null,
  atMs = nowMs(),
} = {}) {
  const current = (Array.isArray(memories) ? memories : [])
    .map(sanitizeEpisodicMemoryItem)
    .filter(Boolean);
  const cleanCorrectionMemory = sanitizeEpisodicMemoryItem(correctionMemory);
  const signal = mergeCorrectionSignals(correction);
  if (!cleanCorrectionMemory || !signal) return { memories: current, superseded: 0 };
  const reason = cleanText(
    signal.correctionNotes?.[0] ||
      `Superseded by correction ${cleanCorrectionMemory.id}`,
    220
  );
  let superseded = 0;
  const next = current.map((memory) => {
    if (memory.id === cleanCorrectionMemory.id) return memory;
    if (hasTag(memory, CORRECTION_TAG)) return memory;
    if (!memorySharesCorrectionScope(memory, cleanCorrectionMemory)) return memory;
    if (!memoryMatchesCorrectionSignal(memory, signal)) return memory;
    superseded += memory.supersededAt ? 0 : 1;
    return {
      ...memory,
      tags: normalizeStringList([...(memory.tags || []), SUPERSEDED_TAG], 8, 48)
        .map((tag) => tag.toLowerCase()),
      supersededAt: Math.max(Number(memory.supersededAt || 0), atMs),
      supersededByMemoryId: cleanCorrectionMemory.id,
      supersededReason: reason,
      supersededTerms: signal.correctedTerms,
    };
  });
  return { memories: next, superseded };
}

function normalizeActLabel(value = "") {
  const clean = cleanText(value, 40).toLowerCase();
  if (!clean) return "";
  if (/^(?:i|1|one)$/.test(clean)) return "Act I";
  if (/^(?:ii|2|two)$/.test(clean)) return "Act II";
  if (/^(?:iii|3|three)$/.test(clean)) return "Act III";
  if (/act\s*(?:i|1|one)\b/i.test(clean)) return "Act I";
  if (/act\s*(?:ii|2|two)\b/i.test(clean)) return "Act II";
  if (/act\s*(?:iii|3|three)\b/i.test(clean)) return "Act III";
  return "";
}

function inferCharacterArcAct(text = "") {
  const match = String(text || "").match(/\bAct\s*(I{1,3}|1|2|3|one|two|three)\b/i);
  return normalizeActLabel(match?.[1] || "");
}

function normalizeCharacterArcValue(value = "", maxChars = CHARACTER_ARC_FIELD_MAX_CHARS) {
  return cleanText(value, maxChars)
    .replace(/^(?:to|that|is|as)\s+/i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
}

function firstCharacterArcMatch(source = "", patterns = [], maxChars = CHARACTER_ARC_FIELD_MAX_CHARS) {
  for (const pattern of patterns) {
    const match = String(source || "").match(pattern);
    if (!match) continue;
    const raw = typeof pattern._format === "function"
      ? pattern._format(match)
      : (match[2] || match[1]);
    const clean = normalizeCharacterArcValue(raw, maxChars);
    if (clean) return clean;
  }
  return "";
}

function withArcFormatter(pattern, format) {
  pattern._format = format;
  return pattern;
}

function extractCharacterArcState({ text = "", characterName = "", correction = null } = {}) {
  const cleanName = normalizeCharacterName(characterName);
  if (!cleanName) return null;
  const escaped = escapeRegex(cleanName);
  const source = [
    correction?.correctedFact || "",
    text || "",
  ].filter(Boolean).join("\n");
  const arc = {
    act: inferCharacterArcAct(source),
    want: firstCharacterArcMatch(source, [
      new RegExp(`\\b${escaped}\\s+wants\\s+to\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
      new RegExp(`\\b${escaped}(?:'s)?\\s+(?:want|external\\s+want|goal)\\s+(?:is|is to|=)\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
    ]),
    need: firstCharacterArcMatch(source, [
      new RegExp(`\\b${escaped}\\s+needs\\s+to\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
      new RegExp(`\\b${escaped}(?:'s)?\\s+(?:need|inner\\s+need)\\s+(?:is|is to|=)\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
    ]),
    wound: firstCharacterArcMatch(source, [
      new RegExp(`\\b${escaped}(?:'s)?\\s+wound\\s+(?:is|is that|comes from|=)\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
      new RegExp(`\\b${escaped}\\s+is\\s+wounded\\s+by\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
    ]),
    falseBelief: firstCharacterArcMatch(source, [
      new RegExp(`\\b${escaped}(?:'s)?\\s+(?:false\\s+belief|misbelief|lie)\\s+(?:is|is that|=)\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
      new RegExp(`\\b${escaped}\\s+believes\\s+(?:that\\s+)?([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
    ]),
    relationshipPressure: firstCharacterArcMatch(source, [
      withArcFormatter(
        new RegExp(`\\b${escaped}(?:'s)?\\s+relationship\\s+pressure(?:\\s+with\\s+([A-Z][A-Za-z'-]{1,32}))?\\s+(?:is|is to|comes from|=)\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
        (match) => match[1] ? `with ${normalizeCharacterName(match[1])}: ${match[2]}` : match[2]
      ),
      new RegExp(`\\b${escaped}\\s+(?:protects|fears|misses|betrays|trusts|forgives|loves|hates)\\s+([A-Z][A-Za-z'-]{1,32}[^.!?\\n;]{0,120})`, "i"),
    ]),
    currentTactic: firstCharacterArcMatch(source, [
      new RegExp(`\\b${escaped}(?:'s)?\\s+(?:current\\s+tactic|tactic)\\s+(?:is|is to|becomes|should be|=)\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
      new RegExp(`\\b${escaped}\\s+(?:tries|is trying)\\s+to\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
    ]),
    nextEmotionalTurn: firstCharacterArcMatch(source, [
      new RegExp(`\\b${escaped}(?:'s)?\\s+(?:next\\s+emotional\\s+turn|emotional\\s+turn|next\\s+turn)\\s+(?:is|is to|becomes|should be|=)\\s+([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
      new RegExp(`\\b${escaped}\\s+must\\s+(?:finally\\s+)?([^.!?\\n;]{3,${CHARACTER_ARC_FIELD_MAX_CHARS}})`, "i"),
    ]),
  };
  const sanitized = sanitizeCharacterArcState(arc);
  return correction
    ? repairCharacterArcStateForCorrection(sanitized, correction)
    : sanitized;
}

function extractCharacterBibleDelta({ text = "", characterName = "", isCorrectionTurn = false } = {}) {
  const cleanName = normalizeCharacterName(characterName);
  if (!cleanName) return null;
  const sentences = splitCharacterBibleSentences(text);
  const correction = isCorrectionTurn
    ? extractCharacterMemoryCorrection(text, cleanName)
    : null;
  const canon = [];
  const pushCanon = (value) => {
    const clean = normalizeCharacterBibleFact(value, 220);
    if (!clean || !textMentionsName(clean, cleanName)) return;
    if (!CHARACTER_BIBLE_FACT_KEYWORDS.test(clean)) return;
    if (textContainsCharacterCorrectionTerm(clean, correction?.correctedTerms || [])) return;
    if (!canon.some((item) => item.toLowerCase() === clean.toLowerCase())) canon.push(clean);
  };
  if (correction?.correctedFact) pushCanon(correction.correctedFact);
  for (const sentence of sentences) {
    if (canon.length >= 4) break;
    pushCanon(sentence);
  }
  const corrections = correction?.correctedFact
    ? [`Authoritative correction for ${cleanName}: ${correction.correctionNote || correction.correctedFact}`]
    : [];
  const arc = extractCharacterArcState({ text, characterName: cleanName, correction });
  return sanitizeCharacterBibleDelta({
    canon,
    corrections,
    arc,
    correctedTerms: correction?.correctedTerms || [],
    correctionReplacements: correction?.correctionReplacements || [],
    updatedAt: nowMs(),
  });
}

function createCreativeMemoryStore({ persistence } = {}) {
  const store = persistence || createPersistence();
  const writeChain = new Map(); // userId -> Promise

  function withUserLock(userId, fn) {
    const prev = writeChain.get(userId) || Promise.resolve();
    const next = prev.then(() => fn());
    writeChain.set(userId, next.catch(() => {}));
    return next;
  }

  async function readUser(userId) {
    if (!userId) return null;
    const raw = await store.get({ domain: DOMAIN, key: userId });
    if (!raw) return null;
    if (raw.version !== SCHEMA_VERSION) {
      // Future migrations live here. Refuse stale shapes for now.
      return null;
    }
    return clone(raw);
  }

  async function writeUser(userId, value) {
    await store.put({ domain: DOMAIN, key: userId, value });
  }

  async function updateUser(userId, mutator) {
    if (!userId) return;
    await withUserLock(userId, async () => {
      const current = (await readUser(userId)) || makeEmptyMemory(userId);
      const next = mutator(clone(current)) || current;
      next.userId = userId;
      next.version = SCHEMA_VERSION;
      next.updatedAt = nowMs();
      await writeUser(userId, next);
    });
  }

  // ---------- public reads ----------

  async function getCreativeMemoryForPrompt({
    userId,
    query = "",
    projectId = "",
    projectTitle = "",
    maxEpisodicMemories = EPISODIC_MEMORY_PROMPT_MAX,
    recordEpisodicRecall = false,
  } = {}) {
    const rec = await readUser(userId);
    if (!rec) return null;
    const out = {
      userId: rec.userId,
      version: rec.version,
      updatedAt: rec.updatedAt,
    };
    if (rec.style && Object.keys(rec.style).length) {
      const style = clone(rec.style);
      if (Array.isArray(style.lexicalFingerprint) && style.lexicalFingerprint.length === 0) {
        delete style.lexicalFingerprint;
      }
      if (Object.keys(style).length) out.style = style;
    }
    if (Array.isArray(rec.characters) && rec.characters.length) out.characters = clone(rec.characters);
    const episodicMemories = selectEpisodicMemoriesForPrompt(rec.episodicMemories, {
      query,
      projectId,
      projectTitle,
      maxItems: maxEpisodicMemories,
    });
    if (episodicMemories.length) out.episodicMemories = episodicMemories;
    if (recordEpisodicRecall && episodicMemories.length) {
      const recalledIds = episodicMemories.map((memory) => memory.id).filter(Boolean);
      await updateUser(userId, (latest) => {
        const { memories, touched } = touchReferencedEpisodicMemories(
          latest.episodicMemories,
          recalledIds,
          nowMs()
        );
        if (touched > 0) {
          latest.episodicMemories = sortEpisodicMemoriesForStorage(memories)
            .slice(0, EPISODIC_MEMORIES_MAX);
        }
        return latest;
      });
    }
    if (rec.tone && Object.keys(rec.tone).length) out.tone = clone(rec.tone);
    if (rec.habits && Object.keys(rec.habits).length) out.habits = clone(rec.habits);
    return out;
  }

  async function getCreativeMemoryLedger({
    userId,
    includeSuperseded = true,
    maxEpisodicMemories = EPISODIC_MEMORIES_MAX,
  } = {}) {
    const rec = await readUser(userId);
    return sanitizeCreativeMemoryLedgerRecord(rec, {
      includeSuperseded,
      maxEpisodicMemories,
    });
  }

  async function hasMemoryForUser(userId) {
    return (await readUser(userId)) !== null;
  }

  // ---------- write triggers ----------

  // T30: optional `source` and `metadata` thread through so callers can
  // distinguish reply-side rendered mentions (e.g. `ios_screenplay_render`)
  // from user-input mentions. Schema stays backward-compatible: existing
  // callers pass nothing for these fields and the character record adds
  // them only when supplied. Returns a small action receipt so route
  // handlers can build a typed response without a second read; legacy
  // callers can ignore the return value.
  // T30: optional `source` and `metadata` thread through.
  // T-trait-library: optional `traits` delta merges into character.traits
  // (canonical merge via trait_library.mergeTraits). All three fields are
  // additive — existing callers pass nothing and nothing changes.
  async function recordCharacterMention({
    userId,
    characterName,
    voice = "",
    tags = [],
    source = "",
    metadata = null,
    traits = null,
    characterBible = null,
  }) {
    if (!userId || !characterName || typeof characterName !== "string") {
      return { ok: false, action: "skipped", reason: "missing_userId_or_name" };
    }
    const name = characterName.trim();
    if (!name) {
      return { ok: false, action: "skipped", reason: "empty_name" };
    }
    const cleanSource = typeof source === "string" ? source.trim() : "";
    const cleanMetadata = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : null;
    const cleanTraits = traits && typeof traits === "object" && !Array.isArray(traits)
      ? traits
      : null;
    const cleanCharacterBible = sanitizeCharacterBibleDelta(characterBible);
    let resolvedAction = "recorded";
    await updateUser(userId, (rec) => {
      const characters = Array.isArray(rec.characters) ? rec.characters : [];
      const existingIdx = characters.findIndex((c) => c.name === name);
      const now = nowMs();
      if (existingIdx >= 0) {
        resolvedAction = "updated";
        characters[existingIdx].last_referenced = now;
        if (voice) characters[existingIdx].voice = voice;
        if (Array.isArray(tags) && tags.length) {
          const set = new Set([...(characters[existingIdx].tags || []), ...tags]);
          characters[existingIdx].tags = [...set];
        }
        if (cleanSource) characters[existingIdx].source = cleanSource;
        if (cleanMetadata) {
          characters[existingIdx].metadata = {
            ...(characters[existingIdx].metadata || {}),
            ...cleanMetadata,
          };
        }
        if (cleanTraits) {
          characters[existingIdx].traits = mergeCharacterTraits(
            characters[existingIdx].traits,
            cleanTraits,
          );
        }
        if (cleanCharacterBible) {
          characters[existingIdx].bible = mergeCharacterBible(
            characters[existingIdx].bible,
            cleanCharacterBible,
          );
          if (characters[existingIdx].traits) {
            characters[existingIdx].traits = repairCharacterTraitsForCorrection(
              characters[existingIdx].traits,
              cleanCharacterBible,
            );
          }
        }
      } else {
        const entry = {
          name,
          voice: voice || "",
          first_seen: now,
          last_referenced: now,
          tags: Array.isArray(tags) ? [...new Set(tags)] : [],
        };
        if (cleanSource) entry.source = cleanSource;
        if (cleanMetadata) entry.metadata = { ...cleanMetadata };
        if (cleanTraits) entry.traits = mergeCharacterTraits(null, cleanTraits);
        if (cleanCharacterBible) {
          entry.bible = cleanCharacterBible;
          if (entry.traits) {
            entry.traits = repairCharacterTraitsForCorrection(entry.traits, cleanCharacterBible);
          }
        }
        characters.push(entry);
      }
      characters.sort((a, b) => (b.last_referenced || 0) - (a.last_referenced || 0));
      rec.characters = characters.slice(0, CHARACTERS_MAX);
      return rec;
    });
    return { ok: true, action: resolvedAction, characterName: name, source: cleanSource };
  }

  async function recordEpisodicMemory({
    userId,
    summary = "",
    text = "",
    characterNames = [],
    tags = [],
    projectId = "",
    projectTitle = "",
    source = "",
    correction = null,
  } = {}) {
    if (!userId) return { ok: false, action: "skipped", reason: "missing_userId" };
    const item = sanitizeEpisodicMemoryItem({
      summary,
      text,
      characterNames,
      tags,
      projectId,
      projectTitle,
      source,
      createdAt: nowMs(),
      updatedAt: nowMs(),
      lastReferencedAt: nowMs(),
      referenceCount: 1,
    });
    if (!item) return { ok: false, action: "skipped", reason: "empty_memory" };
    let action = "recorded";
    await updateUser(userId, (rec) => {
      const memories = Array.isArray(rec.episodicMemories)
        ? rec.episodicMemories.map(sanitizeEpisodicMemoryItem).filter(Boolean)
        : [];
      const itemCharacters = new Set((item.characterNames || []).map((name) => name.toLowerCase()));
      const duplicateIdx = memories.findIndex((memory) => {
        if (memory.id === item.id) return true;
        if (memory.summary.toLowerCase() === item.summary.toLowerCase()) return true;
        if (!itemCharacters.size) return false;
        const memoryCharacters = new Set((memory.characterNames || []).map((name) => name.toLowerCase()));
        const overlap = [...itemCharacters].some((name) => memoryCharacters.has(name));
        if (!overlap) return false;
        const projectMatches = item.projectId && memory.projectId
          ? item.projectId === memory.projectId
          : item.projectTitle && memory.projectTitle
            ? item.projectTitle.toLowerCase() === memory.projectTitle.toLowerCase()
            : true;
        return projectMatches && memory.summary.toLowerCase().includes(item.summary.toLowerCase().slice(0, 80));
      });
      if (duplicateIdx >= 0) {
        action = "updated";
        const existing = memories[duplicateIdx];
        const mergedCharacters = normalizeStringList(
          [...(existing.characterNames || []), ...(item.characterNames || [])],
          8,
          48
        ).map(normalizeCharacterName).filter(Boolean);
        const mergedTags = normalizeStringList(
          [...(existing.tags || []), ...(item.tags || [])],
          8,
          48
        ).map((tag) => tag.toLowerCase());
        memories[duplicateIdx] = {
          ...existing,
          summary: item.summary || existing.summary,
          excerpt: item.excerpt || existing.excerpt,
          text: item.text || existing.text,
          characterNames: mergedCharacters,
          tags: mergedTags,
          projectId: item.projectId || existing.projectId,
          projectTitle: item.projectTitle || existing.projectTitle,
          source: item.source || existing.source,
          updatedAt: nowMs(),
          lastReferencedAt: nowMs(),
          referenceCount: Math.max(0, Number(existing.referenceCount || 0)) + 1,
        };
      } else {
        memories.push(item);
      }
      const correctionSignal = hasTag(item, CORRECTION_TAG)
        ? mergeCorrectionSignals(
          correction,
          collectEpisodicCorrectionSignal({
            text: item.text || text,
            characterNames: item.characterNames || characterNames,
          })
        )
        : null;
      if (correctionSignal) {
        const correctionMemory = duplicateIdx >= 0
          ? memories[duplicateIdx]
          : item;
        const repaired = supersedeEpisodicMemoriesForCorrection(memories, {
          correctionMemory,
          correction: correctionSignal,
          atMs: nowMs(),
        });
        memories.splice(0, memories.length, ...repaired.memories);
      }
      rec.episodicMemories = sortEpisodicMemoriesForStorage(memories).slice(0, EPISODIC_MEMORIES_MAX);
      return rec;
    });
    return { ok: true, action, memoryId: item.id };
  }

  // T-trait-library: reader for one or all character trait records.
  async function getCharacterTraits({ userId, characterName = null } = {}) {
    if (!userId) return null;
    const rec = await readUser(userId);
    if (!rec || !Array.isArray(rec.characters)) return null;
    if (characterName && typeof characterName === "string") {
      const name = characterName.trim();
      if (!name) return null;
      const found = rec.characters.find((c) => c.name === name);
      if (!found) return null;
      return { name: found.name, traits: found.traits || null };
    }
    return rec.characters.map((c) => ({ name: c.name, traits: c.traits || null }));
  }

  async function recordSceneCompletion({ userId, scenePageCount }) {
    if (!userId || typeof scenePageCount !== "number" || !Number.isFinite(scenePageCount)) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      const prev = Number(rec.habits.preferred_scene_length_pages);
      const prevCount = Number(rec.habits._scene_completion_count) || 0;
      const nextCount = prevCount + 1;
      const nextAvg = Number.isFinite(prev) && prev > 0
        ? (prev * prevCount + scenePageCount) / nextCount
        : scenePageCount;
      rec.habits.preferred_scene_length_pages = Math.round(nextAvg * 100) / 100;
      rec.habits._scene_completion_count = nextCount;
      const completed = Number(rec.habits._scenes_completed) || 0;
      rec.habits._scenes_completed = completed + 1;
      const attempted = Math.max(rec.habits._scenes_completed, Number(rec.habits._scenes_attempted) || rec.habits._scenes_completed);
      rec.habits._scenes_attempted = attempted;
      rec.habits.page_completion_rate = Math.round(
        (rec.habits._scenes_completed / Math.max(1, attempted)) * 100,
      ) / 100;
      // T-block-detector: completing a scene clears the recent-short-turn
      // streak (the writer is no longer stuck) and stamps the activity
      // timestamps the block_detector reads.
      rec.habits.last_scene_completion_at = nowMs();
      rec.habits.last_scene_attempt_at = rec.habits.last_scene_completion_at;
      rec.habits.recent_short_turns = 0;
      return rec;
    });
  }

  async function recordSceneAttempt({ userId }) {
    if (!userId) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      const attempted = Number(rec.habits._scenes_attempted) || 0;
      rec.habits._scenes_attempted = attempted + 1;
      const completed = Number(rec.habits._scenes_completed) || 0;
      rec.habits.page_completion_rate = Math.round(
        (completed / Math.max(1, rec.habits._scenes_attempted)) * 100,
      ) / 100;
      // T-block-detector: stamp the attempt time so block_detector can
      // measure dry spells. Completion stamps both fields; attempt-only
      // stamps just `last_scene_attempt_at`.
      rec.habits.last_scene_attempt_at = nowMs();
      return rec;
    });
  }

  // T-block-detector: record a /talk turn's contribution to the block
  // signal. Updates `last_talk_turn_at` and maintains a small rolling
  // counter `recent_short_turns` (transcripts under SHORT_TURN_LEN_CHARS).
  // Capped at SHORT_TURN_WINDOW so the counter doesn't grow unbounded.
  // Long turns decay the counter toward zero so the user's recovery is
  // observable in the next signal computation.
  async function recordTalkTurnForBlockSignal({ userId, transcript = "", nowAtMs = nowMs() } = {}) {
    if (!userId) return;
    const len = typeof transcript === "string" ? transcript.trim().length : 0;
    const SHORT_TURN_LEN_CHARS = 40;
    const SHORT_TURN_WINDOW = 8;
    const isShort = len > 0 && len < SHORT_TURN_LEN_CHARS;
    const isLong = len >= SHORT_TURN_LEN_CHARS;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      rec.habits.last_talk_turn_at = Number(nowAtMs) || nowMs();
      const prev = Number(rec.habits.recent_short_turns) || 0;
      if (isShort) {
        rec.habits.recent_short_turns = Math.min(prev + 1, SHORT_TURN_WINDOW);
      } else if (isLong) {
        // Long turn → fade the short-turn signal one step toward zero.
        rec.habits.recent_short_turns = Math.max(prev - 1, 0);
      }
      return rec;
    });
  }

  // T-block-signal-history-tracking: append a sample of the computed
  // block signal to habits.block_signal_history (ring buffer, cap 30).
  // Debounced: skip if a sample with the same level was recorded
  // within the last 60 seconds, so a busy GET /memory/block-signal
  // poll loop doesn't flood the buffer with redundant entries.
  async function recordBlockSignalSample({ userId, score, level, atMs = nowMs() } = {}) {
    if (!userId) return { skipped: true, reason: "no userId" };
    // Resolve atMs:
    //   - explicit number (including 0) → honored verbatim
    //   - null / undefined / "" / non-numeric string → nowMs() fallback
    //   - non-finite number (NaN / Infinity) → nowMs() fallback
    //
    // Naive `Number(atMs) || nowMs()` had the falsy-zero bug (PR #120
    // side finding). Naive `Number.isFinite(Number(atMs))` silently
    // coerced `null` and `""` to 0 (because Number(null)=0,
    // Number("")=0) — Codex review on #124 flagged this.
    // The explicit null/blank check below distinguishes them.
    let n;
    if (atMs === null || atMs === undefined || atMs === "") {
      n = nowMs();
    } else if (typeof atMs === "number") {
      n = Number.isFinite(atMs) ? atMs : nowMs();
    } else {
      // String / other coercible. Reject NaN explicitly.
      const candidate = Number(atMs);
      n = Number.isFinite(candidate) ? candidate : nowMs();
    }
    const cleanLevel = typeof level === "string" && level.trim() ? level.trim() : "low";
    const cleanScore = Number.isFinite(score) ? Math.round(Number(score) * 1000) / 1000 : 0;
    const BLOCK_SIGNAL_HISTORY_MAX = 30;
    const BLOCK_SIGNAL_DEBOUNCE_MS = 60_000;
    let recorded = false;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      const history = Array.isArray(rec.habits.block_signal_history)
        ? rec.habits.block_signal_history
        : [];
      const last = history.length ? history[history.length - 1] : null;
      if (last
        && last.level === cleanLevel
        && Number.isFinite(last.at)
        && n - last.at < BLOCK_SIGNAL_DEBOUNCE_MS
      ) {
        return rec;
      }
      history.push({ score: cleanScore, level: cleanLevel, at: n });
      if (history.length > BLOCK_SIGNAL_HISTORY_MAX) {
        history.splice(0, history.length - BLOCK_SIGNAL_HISTORY_MAX);
      }
      rec.habits.block_signal_history = history;
      recorded = true;
      return rec;
    });
    return { skipped: !recorded };
  }

  async function recordToneSignal({ userId, signal }) {
    if (!userId || !signal || typeof signal !== "object") return;
    await updateUser(userId, (rec) => {
      rec.tone = rec.tone || {};
      if (typeof signal.emotional_default === "string" && signal.emotional_default.trim()) {
        rec.tone.emotional_default = signal.emotional_default.trim();
      }
      if (typeof signal.humor_register === "string" && signal.humor_register.trim()) {
        rec.tone.humor_register = signal.humor_register.trim();
      }
      if (typeof signal.violence_tolerance === "string" && signal.violence_tolerance.trim()) {
        rec.tone.violence_tolerance = signal.violence_tolerance.trim();
      }
      if (typeof signal.preferredTone === "string" && signal.preferredTone.trim()) {
        rec.style = rec.style || {};
        rec.style.preferredTone = signal.preferredTone.trim();
      }
      return rec;
    });
  }

  async function recordSessionEnd({ userId, sessionDurationMs, sessionStartedAt }) {
    if (!userId) return;
    await updateUser(userId, (rec) => {
      rec.habits = rec.habits || {};
      if (Number.isFinite(sessionStartedAt)) {
        const hour = new Date(sessionStartedAt).getHours();
        let bucket = "burst";
        if (hour >= 5 && hour < 11) bucket = "morning";
        else if (hour >= 11 && hour < 17) bucket = "afternoon";
        else if (hour >= 17 && hour < 22) bucket = "evening";
        else bucket = "late-night";
        rec.habits.session_pattern = bucket;
      }
      if (Number.isFinite(sessionDurationMs) && sessionDurationMs > 0) {
        rec.habits._last_session_duration_ms = Math.round(sessionDurationMs);
      }
      return rec;
    });
  }

  async function recordLexicalFingerprint({ userId, phrases }) {
    if (!userId || !Array.isArray(phrases) || phrases.length === 0) return;
    await updateUser(userId, (rec) => {
      rec.style = rec.style || {};
      const existing = Array.isArray(rec.style.lexicalFingerprint) ? rec.style.lexicalFingerprint : [];
      const seen = new Set(existing.map((p) => String(p).toLowerCase()));
      for (const raw of phrases) {
        const phrase = String(raw || "").trim();
        if (!phrase) continue;
        const key = phrase.toLowerCase();
        if (seen.has(key)) continue;
        existing.push(phrase);
        seen.add(key);
      }
      rec.style.lexicalFingerprint = existing.slice(-LEXICAL_FINGERPRINT_MAX);
      return rec;
    });
  }

  // Test seam — clear all entries in this domain.
  async function _clearAll() {
    if (typeof store.clear === "function") {
      await store.clear({ domain: DOMAIN });
    }
  }

  // T08w-triggers: extract signals from a /talk turn and fire the
  // appropriate write triggers. Pure-ish: deterministic given inputs;
  // only side effect is the writes through the existing trigger
  // functions above. Safe to call when userId is null (becomes a no-op).
  async function recordTriggersFromTalkTurn({
    userId,
    transcript = "",
    reply = "",
    sessionStartedAt = null,
    sessionDurationMs = null,
    projectId = "",
    projectTitle = "",
    source = "talk_turn",
  } = {}) {
    if (!userId) return { skipped: true, reason: "no userId" };
    const cleanProjectId = cleanText(projectId, 96);
    const cleanProjectTitle = cleanText(projectTitle, 160);
    const cleanSource = cleanText(source || "talk_turn", 64) || "talk_turn";
    const summary = {
      characterMentions: 0,
      episodicMemories: 0,
      corrections: 0,
      lexicalPhrases: 0,
      sessionRecorded: false,
    };

    const combined = `${String(transcript || "")}\n${String(reply || "")}`;
    const isCorrectionTurn = CORRECTION_KEYWORDS.test(combined);
    const knownCharacterNames = await readUser(userId)
      .then((rec) => (Array.isArray(rec?.characters) ? rec.characters : []))
      .catch(() => [])
      .then((characters) => characters
        .map((character) => normalizeCharacterName(character?.name))
        .filter(Boolean));
    const turnCharacterNames = [];
    const rememberCharacterName = async (rawName) => {
      const name = normalizeCharacterName(rawName);
      if (!name) return false;
      const key = name.toUpperCase();
      if (turnCharacterNames.map((item) => item.toUpperCase()).includes(key)) return false;
      if (turnCharacterNames.length >= 8) return false;
      turnCharacterNames.push(name);
      try {
        const traitLines = extractTraitLinesForCharacter(combined, name);
        const traitHint = extractTraitHintForCharacter(combined, name);
        const traits = traitLines.length || traitHint
          ? extractTraits({ characterName: name, lines: traitLines, hint: traitHint })
          : null;
        const characterBible = extractCharacterBibleDelta({
          text: combined,
          characterName: name,
          isCorrectionTurn,
        });
        await recordCharacterMention({
          userId,
          characterName: name,
          source: "talk_turn",
          traits: traitsHaveSignal(traits) ? traits : null,
          characterBible,
        });
        summary.characterMentions += 1;
      } catch (_e) { /* never block the response on memory writes */ }
      return true;
    };

    for (const declaredName of extractDeclaredCharacterNames(transcript)) {
      if (turnCharacterNames.length >= 8) break;
      await rememberCharacterName(declaredName);
    }
    for (const knownName of knownCharacterNames) {
      if (turnCharacterNames.length >= 8) break;
      if (textMentionsName(combined, knownName)) {
        await rememberCharacterName(knownName);
      }
    }

    // Character mentions: screenplay character cue lines are CAPITALIZED
    // names on their own line, optionally followed by a parenthetical.
    // Allow letters, digits ("GUARD 2"), spaces, periods, apostrophes,
    // and hyphens. Bounded — we cap at 8 unique names per turn.
    // Use [ \t]* (horizontal whitespace) rather than \s* — \s would
    // greedily consume trailing newlines and skip the next cue line.
    const cueRegex = /(?:^|\n)[ \t]*([A-Z][A-Z0-9 .'-]{1,34}[A-Z0-9])(?:[ \t]*\([^)]+\))?[ \t]*\n/g;
    const seen = new Set();
    let match;
    let limit = 8;
    while (limit > 0 && (match = cueRegex.exec(combined)) !== null) {
      const raw = String(match[1] || "").trim();
      if (!raw || raw.length < 2) continue;
      // Skip screenplay scene headings (INT./EXT. + LOCATION) and common
      // transition words. Prefix match catches "INT. KITCHEN - NIGHT".
      if (/^(INT\.|EXT\.|INT\/EXT|INT|EXT|FADE|CUT TO|CUT|END|TITLE|MONTAGE|FLASHBACK|SUPER|SMASH CUT|MATCH CUT|DISSOLVE)/.test(raw)) continue;
      // Skip lines that look like scene actions (multiple spaces after a hyphen).
      if (raw.includes(" - ") && raw.split(" ").length > 4) continue;
      const key = raw.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      await rememberCharacterName(raw);
      limit -= 1;
    }

    const sceneHeading = firstScreenplaySceneHeading(combined);
    const moment = firstMemoryMoment(transcript) || firstMemoryMoment(reply);
    if (isStoryMemoryCandidate({
      transcript,
      reply,
      projectId: cleanProjectId,
      projectTitle: cleanProjectTitle,
      sceneHeading,
      characterNames: turnCharacterNames,
      source: cleanSource,
      moment,
    })) {
      const memorySummary = buildEpisodicSummary({
        characterNames: turnCharacterNames,
        sceneHeading,
        moment,
        projectTitle: cleanProjectTitle,
        transcript,
        isCorrection: isCorrectionTurn,
      });
      try {
        const correctionSignal = isCorrectionTurn
          ? collectEpisodicCorrectionSignal({
            text: combined,
            characterNames: turnCharacterNames,
          })
          : null;
        const receipt = await recordEpisodicMemory({
          userId,
          summary: memorySummary,
          text: combined,
          characterNames: turnCharacterNames,
          tags: buildEpisodicTags({
            transcript,
            source: cleanSource,
            projectId: cleanProjectId,
            projectTitle: cleanProjectTitle,
          }),
          projectId: cleanProjectId,
          projectTitle: cleanProjectTitle,
          source: cleanSource,
          correction: correctionSignal,
        });
        if (receipt?.ok) summary.episodicMemories += 1;
        if (receipt?.ok && isCorrectionTurn) summary.corrections += 1;
      } catch (_e) { /* never block the response on memory writes */ }
    }

    // Lexical fingerprint: capture short evocative phrases from the
    // user's transcript (4-10 words, ending at sentence boundary).
    // Bounded — top 4 sentences from this turn.
    if (transcript && typeof transcript === "string") {
      const sentences = transcript
        .split(/[.!?]\s+/)
        .map((s) => s.trim())
        .filter((s) => {
          const wc = s.split(/\s+/).filter(Boolean).length;
          return wc >= 4 && wc <= 12;
        })
        .slice(0, 4);
      if (sentences.length) {
        try {
          await recordLexicalFingerprint({ userId, phrases: sentences });
          summary.lexicalPhrases = sentences.length;
        } catch (_e) { /* */ }
      }
    }

    // Session pattern: derive from the session start time when supplied.
    if (Number.isFinite(sessionStartedAt)) {
      try {
        await recordSessionEnd({ userId, sessionStartedAt, sessionDurationMs });
        summary.sessionRecorded = true;
      } catch (_e) { /* */ }
    }

    // T-block-detector: stamp last_talk_turn_at and maintain the short-
    // turn counter. Single write; never blocks the response.
    try {
      await recordTalkTurnForBlockSignal({ userId, transcript });
      summary.blockSignalUpdated = true;
    } catch (_e) { /* */ }

    return summary;
  }

  // T-block-detector: expose the raw habits object so the route layer
  // can compute a block signal without re-reading the full record.
  async function getHabitsForUser(userId) {
    const rec = await readUser(userId);
    if (!rec || !rec.habits || typeof rec.habits !== "object") return null;
    return clone(rec.habits);
  }

  return {
    SCHEMA_VERSION,
    DOMAIN,
    getCreativeMemoryForPrompt,
    getCreativeMemoryLedger,
    getCharacterTraits,
    getHabitsForUser,
    hasMemoryForUser,
    recordEpisodicMemory,
    recordCharacterMention,
    recordSceneCompletion,
    recordSceneAttempt,
    recordToneSignal,
    recordSessionEnd,
    recordLexicalFingerprint,
    recordTalkTurnForBlockSignal,
    recordBlockSignalSample,
    recordTriggersFromTalkTurn,
    _clearAll,
  };
}

export {
  createCreativeMemoryStore,
  extractCharacterMemoryCorrection,
  SCHEMA_VERSION as CREATIVE_MEMORY_SCHEMA_VERSION,
};
