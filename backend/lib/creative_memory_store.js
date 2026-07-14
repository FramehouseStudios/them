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

import { createHash } from "node:crypto";

import { createPersistence } from "./persistence_adapter.js";
import {
  extractTraits,
  mergeTraits as mergeCharacterTraits,
} from "./trait_library.js";

const SCHEMA_VERSION = 1;
const LEXICAL_FINGERPRINT_MAX = 64;
const CHARACTERS_MAX = 32;
const CHARACTER_PROMPT_MAX = 16;
const CHARACTER_BIBLE_CANON_MAX = 12;
const CHARACTER_BIBLE_CORRECTIONS_MAX = 8;
const CHARACTER_BIBLE_TERMS_MAX = 12;
const CHARACTER_ARC_FIELD_MAX_CHARS = 180;
const PROJECT_CONTINUITY_MAX = 24;
const ACCEPTED_SCENES_MAX = 96;
const ACCEPTED_SCENE_PROMPT_MAX = 3;
const EPISODIC_MEMORIES_MAX = 64;
const EPISODIC_MEMORY_PROMPT_MAX = 6;
const EPISODIC_SEMANTIC_FINGERPRINT_MAX = 96;
const EPISODIC_EMBEDDING_DIMENSIONS_MAX = 3_072;
const EPISODIC_EMBEDDING_MIN_SIMILARITY = 0.35;
const EPISODIC_EMBEDDING_SCORE_WEIGHT = 12;
const EPISODIC_EMBEDDING_BACKOFF_MS = 5 * 60 * 1_000;
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
const ACCEPTED_PAGE_TAG = "accepted-pages";
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
const PROJECT_CONTINUITY_SCALAR_FIELDS = Object.freeze([
  ["act", 80],
  ["featureSequence", 180],
  ["featureObligation", 220],
  ["actPressureState", 220],
  ["sceneObjective", 220],
  ["sceneSummary", 240],
  ["currentBeat", 200],
  ["lastSceneOutcome", 220],
  ["nextScenePlan", 280],
  ["logline", 240],
  ["themeArgument", 220],
  ["centralQuestion", 240],
  ["protagonistWant", 180],
  ["protagonistNeed", 180],
  ["antagonisticForce", 180],
  ["endingImage", 200],
  ["characterArcState", 240],
  ["emotionalContinuity", 240],
]);
const PROJECT_CONTINUITY_LIST_FIELDS = Object.freeze([
  ["nextSceneMoves", 5, 180],
  ["nextThreeTurns", 3, 180],
  ["beatSequence", 8, 180],
  ["actThreePayoffPath", 5, 200],
  ["unresolvedSetups", 8, 200],
  ["unresolvedStoryThreads", 8, 200],
  ["characterFocus", 8, 80],
  ["characterArcTurns", 6, 180],
  ["imageMotifs", 6, 140],
  ["continuityNotes", 8, 200],
  ["correctedTerms", 8, 120],
  ["correctionReplacements", 8, 160],
]);
const PROJECT_CONTINUITY_INTEGER_FIELDS = Object.freeze([
  ["pageCount", 1_000],
  ["targetPages", 1_000],
]);
const ACCEPTED_SCENE_SCALAR_FIELDS = Object.freeze([
  ["writeId", "write_id", 80],
  ["anchorSceneId", "anchor_scene_id", 120],
  ["documentRevisionId", "document_revision_id", 120],
  ["sceneLabel", "scene_label", 140],
  ["sceneHeading", "scene_heading", 140],
  ["featureSequence", "feature_sequence", 180],
  ["summary", "scene_summary", 240],
  ["outcome", "scene_outcome", 220],
  ["nextScenePlan", "next_scene_plan", 240],
  ["excerpt", "page_excerpt", 420],
]);
const ACCEPTED_SCENE_LIST_FIELDS = Object.freeze([
  ["characterNames", "character_names", 8, 72],
  ["characterArcTurns", "character_arc_turns", 5, 180],
  ["unresolvedSetups", "unresolved_setups", 6, 200],
  ["actThreePayoffPath", "act_three_payoff_path", 4, 200],
  ["continuityNotes", "continuity_notes", 5, 200],
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
    projects: [],
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

function acceptedSceneHasCausalSignal(scene = {}) {
  return Boolean(
    cleanText(scene.sceneHeading || scene.sceneLabel, 140) ||
    cleanText(scene.summary, 240) ||
    cleanText(scene.outcome, 220) ||
    cleanText(scene.nextScenePlan, 240) ||
    cleanText(scene.excerpt, 420) ||
    ACCEPTED_SCENE_LIST_FIELDS.some(([field]) => Array.isArray(scene[field]) && scene[field].length)
  );
}

function sanitizeAcceptedSceneContinuity(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [field, alias, maxChars] of ACCEPTED_SCENE_SCALAR_FIELDS) {
    const clean = cleanText(value[field] ?? value[alias], maxChars);
    if (clean) out[field] = clean;
  }
  const act = normalizeActLabel(value.act ?? value.currentAct ?? value.current_act) ||
    cleanText(value.act ?? value.currentAct ?? value.current_act, 80);
  if (act) out.act = act;
  for (const [field, alias, maxItems, maxChars] of ACCEPTED_SCENE_LIST_FIELDS) {
    const items = normalizeStringList(value[field] ?? value[alias], maxItems, maxChars);
    if (items.length) out[field] = items;
  }
  const pageCount = Math.max(0, Math.round(Number(value.pageCount ?? value.page_count ?? 0)));
  if (pageCount > 0) out.pageCount = Math.min(1_000, pageCount);
  const rawAcceptedAt = Number(value.acceptedAt ?? value.accepted_at ?? nowMs());
  const acceptedAt = Number.isFinite(rawAcceptedAt) ? Math.max(0, rawAcceptedAt) : nowMs();
  const rawUpdatedAt = Number(value.updatedAt ?? value.updated_at ?? acceptedAt);
  const updatedAt = Number.isFinite(rawUpdatedAt) ? Math.max(acceptedAt, rawUpdatedAt) : acceptedAt;
  out.acceptedAt = acceptedAt;
  out.updatedAt = updatedAt;
  if (!acceptedSceneHasCausalSignal(out)) return null;
  out.id = cleanText(
    value.id || `accepted_scene_${stableHash([
      out.anchorSceneId,
      out.writeId,
      out.sceneHeading,
      out.summary,
      out.excerpt,
    ].filter(Boolean).join("|"))}`,
    80
  );
  return out;
}

function repairAcceptedSceneForCorrection(scene = null, correction = null) {
  const current = sanitizeAcceptedSceneContinuity(scene);
  if (!current || !correction) return current;
  const terms = collectCharacterBibleItems(
    correction.correctedTerms || [],
    CHARACTER_BIBLE_TERMS_MAX,
    120
  );
  const replacements = correction.correctionReplacements || [];
  const out = { ...current };
  for (const [field, _alias, maxChars] of ACCEPTED_SCENE_SCALAR_FIELDS) {
    if (field === "writeId" || field === "anchorSceneId" || field === "documentRevisionId") continue;
    if (!current[field]) continue;
    const repaired = applyCharacterBibleReplacements(current[field], replacements, maxChars);
    if (!repaired || textContainsCharacterCorrectionTerm(repaired, terms)) delete out[field];
    else out[field] = repaired;
  }
  for (const [field, _alias, maxItems, maxChars] of ACCEPTED_SCENE_LIST_FIELDS) {
    if (!Array.isArray(current[field])) continue;
    out[field] = current[field]
      .map((item) => applyCharacterBibleReplacements(item, replacements, maxChars))
      .filter((item) => item && !textContainsCharacterCorrectionTerm(item, terms))
      .slice(0, maxItems);
    if (!out[field].length) delete out[field];
  }
  return acceptedSceneHasCausalSignal(out) ? out : null;
}

function acceptedSceneIdentity(scene = {}) {
  const anchorSceneId = cleanText(scene.anchorSceneId ?? scene.anchor_scene_id, 120).toLowerCase();
  if (anchorSceneId) return `anchor:${anchorSceneId}`;
  const writeId = cleanText(scene.writeId ?? scene.write_id, 80).toLowerCase();
  if (writeId) return `write:${writeId}`;
  return `id:${cleanText(scene.id, 80).toLowerCase()}`;
}

function mergeAcceptedSceneContinuity(incoming = [], existing = [], correction = null) {
  const merged = [];
  const seen = new Set();
  for (const value of [...(Array.isArray(incoming) ? incoming : []), ...(Array.isArray(existing) ? existing : [])]) {
    const scene = repairAcceptedSceneForCorrection(value, correction);
    if (!scene) continue;
    const key = acceptedSceneIdentity(scene);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(scene);
  }
  return merged
    .sort((a, b) => Number(b.acceptedAt || b.updatedAt || 0) - Number(a.acceptedAt || a.updatedAt || 0))
    .slice(0, ACCEPTED_SCENES_MAX);
}

function sanitizeProjectContinuity(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const projectId = cleanText(source.projectId ?? source.project_id, 96);
  const projectTitle = cleanText(source.projectTitle ?? source.project_title, 160);
  if (!projectId && !projectTitle) return null;
  const out = {
    projectId,
    projectTitle,
    updatedAt: Math.max(0, Number(source.updatedAt ?? source.updated_at ?? nowMs())),
  };
  for (const [field, maxChars] of PROJECT_CONTINUITY_SCALAR_FIELDS) {
    const clean = cleanText(source[field], maxChars);
    if (clean) out[field] = clean;
  }
  for (const [field, maxItems, maxChars] of PROJECT_CONTINUITY_LIST_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    out[field] = normalizeStringList(source[field], maxItems, maxChars);
  }
  for (const [field, maxValue] of PROJECT_CONTINUITY_INTEGER_FIELDS) {
    const value = Number(source[field]);
    if (!Number.isFinite(value) || value <= 0) continue;
    out[field] = Math.min(maxValue, Math.round(value));
  }
  const correction = {
    correctedTerms: out.correctedTerms || [],
    correctionReplacements: out.correctionReplacements || [],
  };
  if (correction.correctedTerms.length || correction.correctionReplacements.length) {
    for (const [field, maxChars] of PROJECT_CONTINUITY_SCALAR_FIELDS) {
      if (!out[field]) continue;
      const repaired = applyCharacterBibleReplacements(out[field], correction.correctionReplacements, maxChars);
      if (!repaired || textContainsCharacterCorrectionTerm(repaired, correction.correctedTerms)) delete out[field];
      else out[field] = repaired;
    }
    for (const [field, maxItems, maxChars] of PROJECT_CONTINUITY_LIST_FIELDS) {
      if (field === "correctedTerms" || field === "correctionReplacements" || !Array.isArray(out[field])) continue;
      out[field] = out[field]
        .map((item) => applyCharacterBibleReplacements(item, correction.correctionReplacements, maxChars))
        .filter((item) => item && !textContainsCharacterCorrectionTerm(item, correction.correctedTerms))
        .slice(0, maxItems);
    }
  }
  const acceptedScenes = value.acceptedScenes ?? value.accepted_scenes;
  if (Array.isArray(acceptedScenes)) {
    out.acceptedScenes = mergeAcceptedSceneContinuity(acceptedScenes, [], correction);
  }
  return out;
}

function projectIdentity(value = {}, metadataKey = "") {
  const source = metadataKey && value?.[metadataKey] && typeof value[metadataKey] === "object"
    ? value[metadataKey]
    : value;
  return {
    projectId: cleanText(source?.projectId ?? source?.project_id, 96).toLowerCase(),
    projectTitle: cleanText(source?.projectTitle ?? source?.project_title, 160).toLowerCase(),
  };
}

function scopeRecordsToProject(records = [], {
  projectId = "",
  projectTitle = "",
  metadataKey = "",
} = {}) {
  const source = Array.isArray(records) ? records : [];
  const activeProjectId = cleanText(projectId, 96).toLowerCase();
  const activeProjectTitle = cleanText(projectTitle, 160).toLowerCase();
  if (!activeProjectId && !activeProjectTitle) return source;
  if (activeProjectId) {
    const idMatches = source.filter((item) => projectIdentity(item, metadataKey).projectId === activeProjectId);
    if (idMatches.length) return idMatches;
  }
  if (activeProjectTitle) {
    const titleMatches = source.filter((item) => {
      const identity = projectIdentity(item, metadataKey);
      return identity.projectTitle === activeProjectTitle &&
        (!activeProjectId || !identity.projectId);
    });
    if (titleMatches.length) return titleMatches;
  }
  return source.filter((item) => {
    const identity = projectIdentity(item, metadataKey);
    return !identity.projectId && !identity.projectTitle;
  });
}

function selectProjectContinuity(projects = [], { projectId = "", projectTitle = "" } = {}) {
  const scoped = scopeRecordsToProject(
    (Array.isArray(projects) ? projects : []).map(sanitizeProjectContinuity).filter(Boolean),
    { projectId, projectTitle }
  );
  return scoped
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] || null;
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

function mergeCorrectionReplacements(incoming = [], existing = [], maxItems = 8, maxChars = 160) {
  const limit = Math.max(1, Number(maxItems || 8));
  const charLimit = Math.max(1, Number(maxChars || 160));
  const newest = normalizeStringList(incoming, limit, charLimit);
  const retiredKeys = new Set(
    newest
      .map((item) => parseCharacterBibleReplacement(item)?.from?.toLowerCase() || "")
      .filter(Boolean)
  );
  const older = normalizeStringList(existing, limit, charLimit).filter((item) => {
    const retired = parseCharacterBibleReplacement(item)?.from?.toLowerCase() || "";
    return !retired || !retiredKeys.has(retired);
  });
  return normalizeStringList([...newest, ...older], limit, charLimit);
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

function sanitizeStructuredCharacterArcMemory(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const character = normalizeCharacterName(
    value.character ?? value.characterName ?? value.character_name ?? value.name
  );
  const source = value.bible?.arc && typeof value.bible.arc === "object"
    ? value.bible.arc
    : value.arc && typeof value.arc === "object"
      ? value.arc
      : value;
  const arc = sanitizeCharacterArcState(source);
  return character && arc ? { character, arc } : null;
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
    correctedTerms: collectCharacterBibleItems(
      [...incoming.correctedTerms, ...existing.correctedTerms],
      CHARACTER_BIBLE_TERMS_MAX,
      120
    ),
    correctionReplacements: mergeCorrectionReplacements(
      incoming.correctionReplacements,
      existing.correctionReplacements,
      CHARACTER_BIBLE_TERMS_MAX,
      180
    ),
  };
  const hasCorrection = Boolean(correction.correctedTerms.length || correction.correctionReplacements.length);
  const existingCanon = hasCorrection
    ? filterCharacterBibleItems(existing.canon, correction, CHARACTER_BIBLE_CANON_MAX, 220)
    : existing.canon;
  const incomingCanon = hasCorrection
    ? filterCharacterBibleItems(incoming.canon, correction, CHARACTER_BIBLE_CANON_MAX, 220)
    : incoming.canon;
  const arc = mergeCharacterArcState(existing.arc, incoming.arc, hasCorrection ? correction : null);
  const existingCorrections = filterCharacterBibleItems(
    existing.corrections,
    { correctedTerms: [], correctionReplacements: correction.correctionReplacements },
    CHARACTER_BIBLE_CORRECTIONS_MAX,
    260
  );
  return sanitizeCharacterBibleDelta({
    canon: collectCharacterBibleItems(
      [...incomingCanon, ...existingCanon],
      CHARACTER_BIBLE_CANON_MAX,
      220
    ),
    corrections: collectCharacterBibleItems(
      [...incoming.corrections, ...existingCorrections],
      CHARACTER_BIBLE_CORRECTIONS_MAX,
      260
    ),
    ...(arc ? { arc } : {}),
    correctedTerms: correction.correctedTerms,
    correctionReplacements: correction.correctionReplacements,
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

function acceptedPageExcerpt(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line, 180))
    .filter(Boolean)
    .filter((line) => !/^(?:INT\.|EXT\.|INT\/EXT\.|INT\.\/EXT\.|CUT TO:|FADE (?:IN|OUT)|SMASH CUT:|DISSOLVE TO:)/i.test(line));
  return cleanText(lines.slice(0, 4).join(" "), 420);
}

function buildAcceptedSceneContinuity({
  pageText = "",
  projectId = "",
  projectTitle = "",
  projectContinuity = null,
  characterNames = [],
  context = null,
} = {}) {
  const rawPage = String(pageText || "").trim().slice(0, 20_000);
  if (!rawPage) return null;
  const continuity = projectContinuity && typeof projectContinuity === "object" && !Array.isArray(projectContinuity)
    ? projectContinuity
    : {};
  const sceneContext = context && typeof context === "object" && !Array.isArray(context) ? context : {};
  const pageHash = screenplayPageMemoryHash(rawPage);
  const anchorSceneId = cleanText(
    sceneContext.anchorSceneId ?? sceneContext.anchor_scene_id ?? sceneContext.sceneId ?? sceneContext.scene_id,
    120
  );
  const writeId = cleanText(sceneContext.writeId ?? sceneContext.write_id, 80);
  const sceneHeading = firstScreenplaySceneHeading(rawPage);
  const excerpt = acceptedPageExcerpt(rawPage);
  const identity = anchorSceneId || writeId || pageHash;
  return sanitizeAcceptedSceneContinuity({
    id: `accepted_scene_${stableHash(`${cleanText(projectId, 96)}|${identity}`)}`,
    writeId,
    anchorSceneId,
    documentRevisionId: sceneContext.documentRevisionId ?? sceneContext.document_revision_id,
    sceneLabel: sceneContext.sceneLabel ?? sceneContext.scene_label,
    sceneHeading,
    act: continuity.act,
    featureSequence: continuity.featureSequence,
    summary: continuity.sceneSummary || continuity.currentBeat || excerpt,
    outcome: continuity.lastSceneOutcome,
    nextScenePlan: continuity.nextScenePlan,
    characterNames: normalizeStringList(
      [...normalizeStringList(continuity.characterFocus, 8, 72), ...normalizeStringList(characterNames, 8, 72)],
      8,
      72
    ),
    characterArcTurns: continuity.characterArcTurns,
    unresolvedSetups: continuity.unresolvedSetups,
    actThreePayoffPath: continuity.actThreePayoffPath,
    continuityNotes: continuity.continuityNotes,
    excerpt,
    pageCount: continuity.pageCount,
    acceptedAt: nowMs(),
    updatedAt: nowMs(),
    projectId,
    projectTitle,
  });
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

function sanitizeEmbeddingVector(vector) {
  if (!Array.isArray(vector) || !vector.length || vector.length > EPISODIC_EMBEDDING_DIMENSIONS_MAX) {
    return null;
  }
  const out = [];
  for (const value of vector) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    out.push(number);
  }
  return out;
}

function embeddingVectorNorm(vector) {
  if (!Array.isArray(vector) || !vector.length) return 0;
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

function sanitizeEpisodicEmbedding(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const vector = sanitizeEmbeddingVector(value.vector ?? value.embedding);
  const model = cleanText(value.model, 96);
  const textHash = cleanText(value.textHash ?? value.text_hash, 96);
  if (!vector || !model || !textHash) return null;
  const norm = Number(value.norm);
  const resolvedNorm = Number.isFinite(norm) && norm > 0 ? norm : embeddingVectorNorm(vector);
  if (!(resolvedNorm > 0)) return null;
  return {
    model,
    dimensions: vector.length,
    textHash,
    norm: resolvedNorm,
    updatedAt: Math.max(0, Number(value.updatedAt ?? value.updated_at ?? nowMs())),
    vector,
  };
}

function buildEpisodicEmbeddingText(memory = {}) {
  return cleanText([
    memory.projectTitle ? `Project: ${memory.projectTitle}` : "",
    memory.summary ? `Memory: ${memory.summary}` : "",
    memory.excerpt ? `Excerpt: ${memory.excerpt}` : "",
    memory.text ? `Story context: ${memory.text}` : "",
  ].filter(Boolean).join("\n"), 1_800);
}

function screenplayPageMemoryHash(text = "") {
  const normalized = cleanText(text, 20_000);
  return normalized
    ? createHash("sha256").update(`screenplay-page|${normalized}`).digest("hex")
    : "";
}

function episodicEmbeddingTextHash(memory = {}, model = "") {
  const text = buildEpisodicEmbeddingText(memory);
  return text ? stableHash(`${cleanText(model, 96)}|${text}`) : "";
}

function sanitizeQueryEmbedding(value = null, model = "") {
  const source = Array.isArray(value) ? { vector: value } : value;
  if (!source || typeof source !== "object") return null;
  const vector = sanitizeEmbeddingVector(source.vector ?? source.embedding);
  const resolvedModel = cleanText(source.model || model, 96);
  if (!vector || !resolvedModel) return null;
  const norm = Number(source.norm);
  const resolvedNorm = Number.isFinite(norm) && norm > 0 ? norm : embeddingVectorNorm(vector);
  if (!(resolvedNorm > 0)) return null;
  return { model: resolvedModel, vector, norm: resolvedNorm };
}

function cosineSimilarityForEpisodicMemory(memory = {}, queryEmbedding = null) {
  const stored = sanitizeEpisodicEmbedding(memory.embedding);
  if (!stored || !queryEmbedding) return null;
  if (stored.model !== queryEmbedding.model || stored.vector.length !== queryEmbedding.vector.length) return null;
  const denominator = stored.norm * queryEmbedding.norm;
  if (!(denominator > 0)) return null;
  let dot = 0;
  for (let index = 0; index < stored.vector.length; index += 1) {
    dot += stored.vector[index] * queryEmbedding.vector[index];
  }
  const similarity = dot / denominator;
  return Number.isFinite(similarity) ? Math.max(-1, Math.min(1, similarity)) : null;
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
  const embedding = sanitizeEpisodicEmbedding(item.embedding);
  const contentHash = cleanText(item.contentHash ?? item.content_hash, 96);
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
    ...(contentHash ? { contentHash } : {}),
    ...(embedding ? { embedding } : {}),
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
  queryEmbedding = null,
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
  const embeddingSimilarity = cosineSimilarityForEpisodicMemory(memory, queryEmbedding);
  const embeddingScore = Number.isFinite(embeddingSimilarity) &&
    embeddingSimilarity >= EPISODIC_EMBEDDING_MIN_SIMILARITY
    ? embeddingSimilarity * EPISODIC_EMBEDDING_SCORE_WEIGHT
    : 0;
  if (!queryTokens.size) {
    let score = Math.min(4, Number(memory.referenceCount || 0)) +
      Math.min(3, Math.floor(Number(memory.updatedAt || 0) / 86_400_000_000));
    if (cleanProjectId && cleanText(memory.projectId, 96).toLowerCase() === cleanProjectId) score += 8;
    if (cleanProjectTitle && cleanText(memory.projectTitle, 160).toLowerCase() === cleanProjectTitle) score += 5;
    return score + correctionBoost + semanticScore + embeddingScore;
  }
  let score = correctionBoost + semanticScore + embeddingScore;
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

function scoreAcceptedSceneForQuery(scene, query = "", activeAct = "", recencyIndex = 0) {
  const cleanQuery = cleanText(query, 2_000).toLowerCase();
  const queryTokens = new Set(tokenizeMemoryText(cleanQuery));
  const searchable = [
    scene.act,
    scene.featureSequence,
    scene.sceneLabel,
    scene.sceneHeading,
    scene.summary,
    scene.outcome,
    scene.nextScenePlan,
    scene.excerpt,
    ...(scene.characterNames || []),
    ...(scene.characterArcTurns || []),
    ...(scene.unresolvedSetups || []),
    ...(scene.actThreePayoffPath || []),
    ...(scene.continuityNotes || []),
  ].join(" ").toLowerCase();
  let score = Math.max(0, 4 - Math.max(0, Number(recencyIndex || 0)));
  const sceneAct = normalizeActLabel(scene.act);
  if (activeAct && sceneAct === activeAct) score += 8;
  for (const token of queryTokens) {
    if (searchable.includes(token)) score += 1;
  }
  for (const name of scene.characterNames || []) {
    const cleanName = String(name || "").toLowerCase();
    if (cleanName && cleanQuery.includes(cleanName)) score += 6;
  }
  return score;
}

function selectAcceptedScenesForPrompt(items = [], {
  query = "",
  currentAct = "",
  preferredSceneHeading = "",
  preferredSceneSummary = "",
  maxItems = ACCEPTED_SCENE_PROMPT_MAX,
} = {}) {
  const scenes = (Array.isArray(items) ? items : [])
    .map(sanitizeAcceptedSceneContinuity)
    .filter(Boolean)
    .sort((a, b) => Number(b.acceptedAt || b.updatedAt || 0) - Number(a.acceptedAt || a.updatedAt || 0));
  if (!scenes.length) return [];
  const requestedLimit = Number(maxItems);
  const limit = Math.max(
    1,
    Math.min(
      ACCEPTED_SCENE_PROMPT_MAX,
      Number.isFinite(requestedLimit) ? Math.round(requestedLimit) : ACCEPTED_SCENE_PROMPT_MAX
    )
  );
  const cleanQuery = cleanText(query, 2_000);
  const activeAct = normalizeActLabel(cleanQuery) || normalizeActLabel(currentAct);
  const selected = [scenes[0]];
  const selectedIds = new Set([acceptedSceneIdentity(scenes[0])]);
  const cleanPreferredHeading = cleanText(preferredSceneHeading, 140).toLowerCase();
  const cleanPreferredSummary = cleanText(preferredSceneSummary, 220);
  if (selected.length < limit && cleanPreferredHeading) {
    const preferred = scenes.find((scene) => {
      const heading = cleanText(scene.sceneHeading || scene.sceneLabel, 140).toLowerCase();
      if (heading !== cleanPreferredHeading) return false;
      return !cleanPreferredSummary || storyThreadMatchScore(
        cleanPreferredSummary,
        scene.summary || scene.excerpt
      ) > 0;
    }) || scenes.find((scene) => (
      cleanText(scene.sceneHeading || scene.sceneLabel, 140).toLowerCase() === cleanPreferredHeading
    ));
    const key = preferred ? acceptedSceneIdentity(preferred) : "";
    if (preferred && key && !selectedIds.has(key)) {
      selected.push(preferred);
      selectedIds.add(key);
    }
  }
  const ranked = scenes
    .slice(1)
    .map((scene, index) => ({
      scene,
      score: scoreAcceptedSceneForQuery(scene, cleanQuery, activeAct, index + 1),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.scene.acceptedAt || 0) - Number(a.scene.acceptedAt || 0);
    });
  for (const entry of ranked) {
    if (selected.length >= limit) break;
    const key = acceptedSceneIdentity(entry.scene);
    if (selectedIds.has(key)) continue;
    selectedIds.add(key);
    selected.push(entry.scene);
  }
  return selected
    .sort((a, b) => Number(b.acceptedAt || b.updatedAt || 0) - Number(a.acceptedAt || a.updatedAt || 0))
    .map(stripAcceptedScenePrivateFields);
}

function stripAcceptedScenePrivateFields(scene = {}) {
  const out = clone(scene);
  delete out.id;
  delete out.writeId;
  delete out.anchorSceneId;
  delete out.documentRevisionId;
  return out;
}

function storyThreadMatchScore(left = "", right = "") {
  const leftText = cleanText(left, 240).toLowerCase();
  const rightText = cleanText(right, 240).toLowerCase();
  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;
  const leftTerms = new Set(tokenizeMemoryText(leftText).map(normalizeSemanticTerm).filter(Boolean));
  const rightTerms = new Set(tokenizeMemoryText(rightText).map(normalizeSemanticTerm).filter(Boolean));
  if (!leftTerms.size || !rightTerms.size) return 0;
  let overlap = 0;
  for (const term of leftTerms) {
    if (rightTerms.has(term)) overlap += 1;
  }
  if (overlap <= 0) return 0;
  const coverage = overlap / Math.max(1, Math.min(leftTerms.size, rightTerms.size));
  return overlap >= 2 || Math.min(leftTerms.size, rightTerms.size) === 1 ? coverage : 0;
}

function bestStoryThreadMatch(target = "", candidates = []) {
  let best = "";
  let bestScore = 0;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const score = storyThreadMatchScore(target, candidate);
    if (score <= bestScore) continue;
    best = cleanText(candidate, 220);
    bestScore = score;
  }
  return { value: best, score: bestScore };
}

function selectDueStoryThreadForPrompt(project = null) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return null;
  const openSetups = normalizeStringList(project.unresolvedSetups, 8, 220);
  const promisedPayoffs = normalizeStringList(project.actThreePayoffPath, 5, 220);
  if (!openSetups.length && !promisedPayoffs.length) return null;
  const scenes = (Array.isArray(project.acceptedScenes) ? project.acceptedScenes : [])
    .map(sanitizeAcceptedSceneContinuity)
    .filter(Boolean)
    .sort((a, b) => Number(b.acceptedAt || b.updatedAt || 0) - Number(a.acceptedAt || a.updatedAt || 0));

  const setupCandidates = openSetups.length ? openSetups : [""];
  const candidates = setupCandidates.map((setup, setupIndex) => {
    let sourceScene = null;
    let ageInScenes = 0;
    for (let index = scenes.length - 1; index >= 0; index -= 1) {
      const sceneThreads = setup
        ? scenes[index].unresolvedSetups
        : scenes[index].actThreePayoffPath;
      if (!bestStoryThreadMatch(setup || promisedPayoffs[0], sceneThreads).value) continue;
      sourceScene = scenes[index];
      ageInScenes = index;
      break;
    }
    const payoffMatch = setup ? bestStoryThreadMatch(setup, promisedPayoffs) : { value: promisedPayoffs[0] || "", score: 0 };
    const unambiguousPayoff = setup && setupCandidates.length === 1 && promisedPayoffs.length === 1
      ? promisedPayoffs[0]
      : "";
    return {
      setup,
      setupIndex,
      sourceScene,
      ageInScenes,
      promisedPayoff: payoffMatch.value || unambiguousPayoff || (!setup ? promisedPayoffs[0] : "") || "",
    };
  }).filter((candidate) => candidate.sourceScene);
  candidates.sort((a, b) => b.ageInScenes - a.ageInScenes || a.setupIndex - b.setupIndex);
  const selected = candidates[0];
  if (!selected) return null;
  const activeAct = normalizeActLabel(project.act);
  const kind = selected.promisedPayoff && (activeAct === "Act III" || !selected.setup)
    ? "payoff"
    : "setup";
  const source = selected.sourceScene;
  const out = {
    kind,
    setup: cleanText(selected.setup, 220),
    promisedPayoff: cleanText(selected.promisedPayoff, 220),
    sourceSceneHeading: cleanText(source?.sceneHeading || source?.sceneLabel, 140),
    sourceSceneSummary: cleanText(source?.summary || source?.excerpt, 220),
    sourceSceneOutcome: cleanText(source?.outcome, 220),
    sourceAct: normalizeActLabel(source?.act) || cleanText(source?.act, 80),
    ageInScenes: Math.max(0, Math.round(Number(selected.ageInScenes || 0))),
    acceptedSceneCount: scenes.length,
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, value]) => typeof value === "number" || Boolean(value))
  );
}

function selectEpisodicMemoriesForPrompt(items = [], {
  query = "",
  projectId = "",
  projectTitle = "",
  maxItems = EPISODIC_MEMORY_PROMPT_MAX,
  queryEmbedding = null,
} = {}) {
  const sanitized = scopeRecordsToProject(
    (Array.isArray(items) ? items : [])
    .map(sanitizeEpisodicMemoryItem)
    .filter((item) => item && !item.supersededAt),
    { projectId, projectTitle }
  );
  if (!sanitized.length) return [];
  const cleanQuery = cleanText(query, 2_000);
  return sanitized
    .map((item) => ({
      item,
      score: scoreEpisodicMemoryForQuery(item, cleanQuery, {
        projectId,
        projectTitle,
        queryEmbedding,
      }),
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
      delete out.embedding;
      delete out.contentHash;
      return out;
    });
}

function collectSearchableStrings(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const clean = cleanText(value, 500);
    if (clean) out.push(clean);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSearchableStrings(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectSearchableStrings(item, out);
  }
  return out;
}

function characterSearchableText(character = {}) {
  return collectSearchableStrings({
    name: character.name,
    voice: character.voice,
    tags: character.tags,
    traits: character.traits,
    bible: character.bible,
    metadata: character.metadata,
  }).join(" ").toLowerCase();
}

function scoreCharacterForPrompt(character = {}, {
  query = "",
  projectId = "",
  projectTitle = "",
} = {}) {
  const cleanQuery = cleanText(query, 2_000).toLowerCase();
  const cleanProjectId = cleanText(projectId, 96).toLowerCase();
  const cleanProjectTitle = cleanText(projectTitle, 160).toLowerCase();
  const name = normalizeCharacterName(character.name);
  const nameLower = name.toLowerCase();
  const searchable = characterSearchableText(character);
  const queryTokens = new Set(tokenizeMemoryText(cleanQuery));
  const bible = character.bible && typeof character.bible === "object" ? character.bible : null;
  const metadata = character.metadata && typeof character.metadata === "object" ? character.metadata : {};
  const metadataProjectId = cleanText(metadata.projectId ?? metadata.project_id, 96).toLowerCase();
  const metadataProjectTitle = cleanText(metadata.projectTitle ?? metadata.project_title, 160).toLowerCase();

  let score = 0;
  if (nameLower && cleanQuery.includes(nameLower)) score += 24;
  for (const part of name.split(/\s+/)) {
    const cleanPart = normalizeSemanticTerm(part);
    if (cleanPart && cleanQuery.includes(cleanPart)) score += 4;
  }
  for (const token of queryTokens) {
    if (searchable.includes(token)) score += 1;
  }
  if (cleanProjectId && metadataProjectId && metadataProjectId === cleanProjectId) score += 16;
  if (cleanProjectTitle && metadataProjectTitle && metadataProjectTitle === cleanProjectTitle) score += 10;
  if (cleanProjectTitle && searchable.includes(cleanProjectTitle)) score += 5;
  if (bible) score += 4;
  if (bible?.arc && typeof bible.arc === "object") score += 5;
  if (Array.isArray(bible?.corrections) && bible.corrections.length) score += 5;
  if (Array.isArray(bible?.correctedTerms) && bible.correctedTerms.length) score += 4;
  if (Array.isArray(bible?.correctionReplacements) && bible.correctionReplacements.length) score += 4;
  if (Array.isArray(character.tags) && character.tags.some((tag) => String(tag || "").toLowerCase() === "protagonist")) score += 2;
  return score;
}

function selectCharactersForPrompt(characters = [], {
  query = "",
  projectId = "",
  projectTitle = "",
  maxItems = CHARACTER_PROMPT_MAX,
} = {}) {
  const source = scopeRecordsToProject(characters, {
    projectId,
    projectTitle,
    metadataKey: "metadata",
  });
  if (!source.length) return [];
  return source
    .map((character, index) => ({
      character,
      index,
      score: scoreCharacterForPrompt(character, { query, projectId, projectTitle }),
      lastReferenced: Math.max(0, Number(character?.last_referenced || character?.lastReferenced || 0)),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.lastReferenced !== a.lastReferenced) return b.lastReferenced - a.lastReferenced;
      return a.index - b.index;
    })
    .slice(0, Math.max(1, Number(maxItems || CHARACTER_PROMPT_MAX)))
    .map(({ character }) => clone(character));
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
  if (Array.isArray(rec.projects) && rec.projects.length) {
    out.projects = rec.projects.map(sanitizeProjectContinuity).filter(Boolean).map(clone);
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
      delete item.embedding;
      delete item.contentHash;
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
  const voiceFingerprint = traits.voice_fingerprint && typeof traits.voice_fingerprint === "object"
    ? traits.voice_fingerprint
    : traits.voiceFingerprint && typeof traits.voiceFingerprint === "object"
      ? traits.voiceFingerprint
      : null;
  if (voiceFingerprint) {
    if (Array.isArray(voiceFingerprint.tactics) && voiceFingerprint.tactics.length) return true;
    if (voiceFingerprint.silence) return true;
    if (Array.isArray(voiceFingerprint.emotional_tells) && voiceFingerprint.emotional_tells.length) return true;
    if (Array.isArray(voiceFingerprint.emotionalTells) && voiceFingerprint.emotionalTells.length) return true;
  }
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

function createCreativeMemoryStore({
  persistence,
  embedTexts = null,
  embedQuery = null,
  embeddingModel = "",
} = {}) {
  const store = persistence || createPersistence();
  const writeChain = new Map(); // userId -> Promise
  const embeddingBackfillByUser = new Map();
  const resolvedEmbeddingModel = cleanText(embeddingModel, 96);
  let embeddingBackoffUntil = 0;

  async function buildEmbeddingsForMemories(memories = []) {
    if (typeof embedTexts !== "function" || !resolvedEmbeddingModel) return null;
    if (nowMs() < embeddingBackoffUntil) return null;
    const candidates = (Array.isArray(memories) ? memories : [])
      .map((memory) => ({ memory, text: buildEpisodicEmbeddingText(memory) }))
      .filter((item) => item.text);
    if (!candidates.length) return [];
    try {
      const rows = await embedTexts(candidates.map((item) => item.text));
      if (!Array.isArray(rows) || rows.length !== candidates.length) return [];
      return candidates.map((candidate, index) => {
        const row = rows[index];
        const vector = Array.isArray(row) ? row : row?.vector ?? row?.embedding;
        return sanitizeEpisodicEmbedding({
          model: resolvedEmbeddingModel,
          textHash: episodicEmbeddingTextHash(candidate.memory, resolvedEmbeddingModel),
          vector,
          updatedAt: nowMs(),
        });
      });
    } catch (_err) {
      embeddingBackoffUntil = nowMs() + EPISODIC_EMBEDDING_BACKOFF_MS;
      return null;
    }
  }

  async function buildEmbeddingForMemory(memory) {
    const embeddings = await buildEmbeddingsForMemories([memory]);
    return Array.isArray(embeddings) ? embeddings[0] || null : null;
  }

  async function buildQueryEmbedding(query, episodicMemories = []) {
    if (typeof embedQuery !== "function" || !resolvedEmbeddingModel || !cleanText(query, 2_000)) {
      return null;
    }
    if (nowMs() < embeddingBackoffUntil) return null;
    const hasCompatibleMemory = (Array.isArray(episodicMemories) ? episodicMemories : [])
      .some((memory) => sanitizeEpisodicEmbedding(memory?.embedding)?.model === resolvedEmbeddingModel);
    if (!hasCompatibleMemory) return null;
    try {
      const value = await embedQuery(query);
      return sanitizeQueryEmbedding(value, resolvedEmbeddingModel);
    } catch (_err) {
      embeddingBackoffUntil = nowMs() + EPISODIC_EMBEDDING_BACKOFF_MS;
      return null;
    }
  }

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

  async function promoteAcceptedGeneratedPageMemory({
    userId,
    projectId = "",
    projectTitle = "",
    acceptedPageText = "",
    contentHash = "",
  } = {}) {
    const cleanUserId = cleanText(userId, 128);
    if (!cleanUserId) return { ok: false, promoted: 0, reason: "missing_userId" };
    const acceptedHash = cleanText(contentHash, 96) || screenplayPageMemoryHash(acceptedPageText);
    if (!acceptedHash) return { ok: false, promoted: 0, reason: "missing_page_text" };
    const cleanProjectId = cleanText(projectId, 96);
    const cleanProjectTitle = cleanText(projectTitle, 160).toLowerCase();
    return withUserLock(cleanUserId, async () => {
      const rec = await readUser(cleanUserId);
      if (!rec) return { ok: true, promoted: 0, reason: "cold_user" };
      let matched = 0;
      let promoted = 0;
      rec.episodicMemories = sortEpisodicMemoriesForStorage(
        (Array.isArray(rec.episodicMemories) ? rec.episodicMemories : [])
          .map(sanitizeEpisodicMemoryItem)
          .filter(Boolean)
          .map((memory) => {
            if (memory.supersededAt || memory.source !== "talk_screenplay_output") return memory;
            if (cleanText(memory.contentHash, 96) !== acceptedHash) return memory;
            if (cleanProjectId && memory.projectId !== cleanProjectId) return memory;
            if (!cleanProjectId && cleanProjectTitle && memory.projectTitle.toLowerCase() !== cleanProjectTitle) {
              return memory;
            }
            matched += 1;
            if (hasTag(memory, ACCEPTED_PAGE_TAG)) return memory;
            promoted += 1;
            return {
              ...memory,
              tags: normalizeStringList([...(memory.tags || []), ACCEPTED_PAGE_TAG], 8, 48)
                .map((tag) => tag.toLowerCase()),
              updatedAt: nowMs(),
            };
          })
      ).slice(0, EPISODIC_MEMORIES_MAX);
      if (promoted > 0) {
        rec.updatedAt = nowMs();
        await writeUser(cleanUserId, rec);
      }
      return {
        ok: true,
        promoted,
        reason: promoted > 0 ? "accepted" : matched > 0 ? "already_accepted" : "no_matching_draft",
      };
    });
  }

  function episodicEmbeddingCoverage(memories = [], {
    projectId = "",
    projectTitle = "",
  } = {}) {
    const scoped = scopeRecordsToProject(
      (Array.isArray(memories) ? memories : [])
        .map(sanitizeEpisodicMemoryItem)
        .filter((memory) => memory && !memory.supersededAt),
      { projectId, projectTitle }
    );
    const missing = [];
    let embedded = 0;
    for (const memory of scoped) {
      const embedding = sanitizeEpisodicEmbedding(memory.embedding);
      const current = embedding &&
        embedding.model === resolvedEmbeddingModel &&
        embedding.textHash === episodicEmbeddingTextHash(memory, resolvedEmbeddingModel);
      if (current) embedded += 1;
      else missing.push(memory);
    }
    return {
      memories: scoped,
      total: scoped.length,
      embedded,
      missing,
    };
  }

  async function backfillEpisodicEmbeddings({
    userId,
    projectId = "",
    projectTitle = "",
    maxItems = 16,
  } = {}) {
    const cleanUserId = cleanText(userId, 128);
    if (!cleanUserId) return { ok: false, updated: 0, reason: "missing_userId" };
    if (typeof embedTexts !== "function" || !resolvedEmbeddingModel) {
      return { ok: false, updated: 0, reason: "embeddings_disabled" };
    }
    if (nowMs() < embeddingBackoffUntil) {
      return { ok: false, updated: 0, reason: "provider_backoff" };
    }
    const active = embeddingBackfillByUser.get(cleanUserId);
    if (active) return active;

    const task = (async () => {
      const rec = await readUser(cleanUserId);
      if (!rec) return { ok: true, attempted: 0, updated: 0, reason: "cold_user" };
      const coverage = episodicEmbeddingCoverage(rec.episodicMemories, {
        projectId,
        projectTitle,
      });
      const candidates = coverage.missing.slice(0, Math.max(1, Math.min(24, Number(maxItems || 16))));
      if (!candidates.length) {
        return { ok: true, attempted: 0, updated: 0, reason: "current" };
      }
      const embeddings = await buildEmbeddingsForMemories(candidates);
      if (!Array.isArray(embeddings)) {
        return { ok: false, attempted: candidates.length, updated: 0, reason: "provider_unavailable" };
      }
      const updates = new Map();
      for (let index = 0; index < candidates.length; index += 1) {
        const embedding = embeddings[index];
        if (embedding) updates.set(candidates[index].id, embedding);
      }
      if (!updates.size) {
        return { ok: false, attempted: candidates.length, updated: 0, reason: "invalid_vectors" };
      }
      let updated = 0;
      await updateUser(cleanUserId, (latest) => {
        latest.episodicMemories = sortEpisodicMemoriesForStorage(
          (Array.isArray(latest.episodicMemories) ? latest.episodicMemories : [])
            .map(sanitizeEpisodicMemoryItem)
            .filter(Boolean)
            .map((memory) => {
              const embedding = updates.get(memory.id);
              if (!embedding || memory.supersededAt) return memory;
              const expectedHash = episodicEmbeddingTextHash(memory, resolvedEmbeddingModel);
              if (embedding.textHash !== expectedHash) return memory;
              updated += 1;
              return { ...memory, embedding };
            })
        ).slice(0, EPISODIC_MEMORIES_MAX);
        return latest;
      });
      return {
        ok: true,
        attempted: candidates.length,
        updated,
        remaining: Math.max(0, coverage.missing.length - updated),
        reason: updated > 0 ? "backfilled" : "stale_candidates",
      };
    })().catch((_err) => ({
      ok: false,
      attempted: 0,
      updated: 0,
      reason: "backfill_failed",
    }));
    embeddingBackfillByUser.set(cleanUserId, task);
    try {
      return await task;
    } finally {
      if (embeddingBackfillByUser.get(cleanUserId) === task) {
        embeddingBackfillByUser.delete(cleanUserId);
      }
    }
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
    const coverage = episodicEmbeddingCoverage(rec.episodicMemories, {
      projectId,
      projectTitle,
    });
    const queryEmbedding = await buildQueryEmbedding(query, rec.episodicMemories);
    const semanticUsed = Boolean(queryEmbedding && coverage.embedded > 0);
    const canBackfill = Boolean(
      coverage.missing.length &&
      typeof embedTexts === "function" &&
      resolvedEmbeddingModel &&
      nowMs() >= embeddingBackoffUntil
    );
    if (canBackfill) {
      void backfillEpisodicEmbeddings({
        userId,
        projectId,
        projectTitle,
        maxItems: 16,
      });
    }
    const out = {
      userId: rec.userId,
      version: rec.version,
      updatedAt: rec.updatedAt,
    };
    const projectContinuity = selectProjectContinuity(rec.projects, { projectId, projectTitle });
    if (projectContinuity) {
      const dueStoryThread = selectDueStoryThreadForPrompt(projectContinuity);
      const acceptedScenes = selectAcceptedScenesForPrompt(projectContinuity.acceptedScenes, {
        query,
        currentAct: projectContinuity.act,
        preferredSceneHeading: dueStoryThread?.sourceSceneHeading,
        preferredSceneSummary: dueStoryThread?.sourceSceneSummary,
      });
      const promptProjectContinuity = clone(projectContinuity);
      delete promptProjectContinuity.acceptedScenes;
      out.projectContinuity = promptProjectContinuity;
      if (acceptedScenes.length) out.acceptedScenes = acceptedScenes;
      if (dueStoryThread) out.dueStoryThread = dueStoryThread;
    }
    if (rec.style && Object.keys(rec.style).length) {
      const style = clone(rec.style);
      if (Array.isArray(style.lexicalFingerprint) && style.lexicalFingerprint.length === 0) {
        delete style.lexicalFingerprint;
      }
      if (Object.keys(style).length) out.style = style;
    }
    const promptCharacters = selectCharactersForPrompt(rec.characters, {
      query,
      projectId,
      projectTitle,
    });
    if (promptCharacters.length) {
      out.characters = promptCharacters;
      out.characterSelection = { strategy: "relevance" };
    }
    const episodicMemories = selectEpisodicMemoriesForPrompt(rec.episodicMemories, {
      query,
      projectId,
      projectTitle,
      maxItems: maxEpisodicMemories,
      queryEmbedding,
    });
    if (episodicMemories.length) out.episodicMemories = episodicMemories;
    if (coverage.total > 0) {
      out.episodicSelection = {
        strategy: semanticUsed ? "hybrid_embedding" : "deterministic_fallback",
        semanticUsed,
        embeddedCandidates: coverage.embedded,
        missingEmbeddings: coverage.missing.length,
        coverageRatio: Math.round((coverage.embedded / coverage.total) * 1000) / 1000,
        backfillQueued: canBackfill,
      };
    }
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

  async function recordProjectContinuity({ userId, continuity } = {}) {
    if (!userId) return { ok: false, action: "skipped", reason: "missing_userId" };
    const incoming = sanitizeProjectContinuity(continuity);
    if (!incoming) return { ok: false, action: "skipped", reason: "missing_project_identity" };
    let action = "recorded";
    await updateUser(userId, (rec) => {
      const projects = (Array.isArray(rec.projects) ? rec.projects : [])
        .map(sanitizeProjectContinuity)
        .filter(Boolean);
      const incomingIdentity = projectIdentity(incoming);
      let existingIdx = -1;
      if (incomingIdentity.projectId) {
        existingIdx = projects.findIndex((project) => (
          projectIdentity(project).projectId === incomingIdentity.projectId
        ));
      }
      if (existingIdx < 0 && incomingIdentity.projectTitle) {
        existingIdx = projects.findIndex((project) => {
          const identity = projectIdentity(project);
          return !identity.projectId && identity.projectTitle === incomingIdentity.projectTitle;
        });
      }
      if (existingIdx >= 0) {
        action = "updated";
        const existing = projects[existingIdx];
        const next = { ...existing, ...incoming, updatedAt: nowMs() };
        for (const [field] of PROJECT_CONTINUITY_LIST_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(incoming, field)) {
            if (field === "correctedTerms") {
              next[field] = normalizeStringList(
                [...incoming[field], ...(existing[field] || [])],
                8,
                120
              );
            } else if (field === "correctionReplacements") {
              next[field] = mergeCorrectionReplacements(incoming[field], existing[field]);
            } else {
              next[field] = incoming[field];
            }
          }
        }
        if (Object.prototype.hasOwnProperty.call(incoming, "acceptedScenes")) {
          next.acceptedScenes = mergeAcceptedSceneContinuity(
            incoming.acceptedScenes,
            existing.acceptedScenes,
            {
              correctedTerms: next.correctedTerms,
              correctionReplacements: next.correctionReplacements,
            }
          );
        }
        projects[existingIdx] = sanitizeProjectContinuity(next);
      } else {
        projects.push({ ...incoming, updatedAt: nowMs() });
      }
      rec.projects = projects
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .slice(0, PROJECT_CONTINUITY_MAX);
      return rec;
    });
    return {
      ok: true,
      action,
      projectId: incoming.projectId,
      projectTitle: incoming.projectTitle,
    };
  }

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
      const namedIndexes = characters
        .map((character, index) => ({ character, index }))
        .filter(({ character }) => (
          String(character.name || "").toLowerCase() === name.toLowerCase()
        ));
      const incomingIdentity = projectIdentity({ metadata: cleanMetadata }, "metadata");
      let existingIdx = -1;
      if (incomingIdentity.projectId) {
        existingIdx = namedIndexes.find(({ character }) => (
          projectIdentity(character, "metadata").projectId === incomingIdentity.projectId
        ))?.index ?? -1;
      }
      if (existingIdx < 0 && incomingIdentity.projectTitle) {
        existingIdx = namedIndexes.find(({ character }) => {
          const identity = projectIdentity(character, "metadata");
          return !identity.projectId && identity.projectTitle === incomingIdentity.projectTitle;
        })?.index ?? -1;
      }
      if (existingIdx < 0 && (incomingIdentity.projectId || incomingIdentity.projectTitle)) {
        existingIdx = namedIndexes.find(({ character }) => {
          const identity = projectIdentity(character, "metadata");
          return !identity.projectId && !identity.projectTitle;
        })?.index ?? -1;
      }
      if (existingIdx < 0 && !incomingIdentity.projectId && !incomingIdentity.projectTitle) {
        existingIdx = namedIndexes[0]?.index ?? -1;
      }
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
          const mergedBible = mergeCharacterBible(
            characters[existingIdx].bible,
            cleanCharacterBible,
          );
          characters[existingIdx].bible = mergedBible;
          if (characters[existingIdx].traits) {
            characters[existingIdx].traits = repairCharacterTraitsForCorrection(
              characters[existingIdx].traits,
              mergedBible,
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
    contentHash = "",
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
      contentHash,
      createdAt: nowMs(),
      updatedAt: nowMs(),
      lastReferencedAt: nowMs(),
      referenceCount: 1,
    });
    if (!item) return { ok: false, action: "skipped", reason: "empty_memory" };
    const embedding = await buildEmbeddingForMemory(item);
    if (embedding) item.embedding = embedding;
    let action = "recorded";
    await updateUser(userId, (rec) => {
      const memories = Array.isArray(rec.episodicMemories)
        ? rec.episodicMemories.map(sanitizeEpisodicMemoryItem).filter(Boolean)
        : [];
      const itemCharacters = new Set((item.characterNames || []).map((name) => name.toLowerCase()));
      const duplicateIdx = memories.findIndex((memory) => {
        if (memory.id === item.id) return true;
        const itemHasProject = Boolean(item.projectId || item.projectTitle);
        const memoryHasProject = Boolean(memory.projectId || memory.projectTitle);
        const projectMatches = item.projectId && memory.projectId
          ? item.projectId === memory.projectId
          : item.projectTitle && memory.projectTitle
            ? item.projectTitle.toLowerCase() === memory.projectTitle.toLowerCase()
            : !itemHasProject && !memoryHasProject;
        if (!projectMatches) return false;
        if (memory.summary.toLowerCase() === item.summary.toLowerCase()) return true;
        if (!itemCharacters.size) return false;
        const memoryCharacters = new Set((memory.characterNames || []).map((name) => name.toLowerCase()));
        const overlap = [...itemCharacters].some((name) => memoryCharacters.has(name));
        if (!overlap) return false;
        return memory.summary.toLowerCase().includes(item.summary.toLowerCase().slice(0, 80));
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
        const nextMemory = {
          ...existing,
          summary: item.summary || existing.summary,
          excerpt: item.excerpt || existing.excerpt,
          text: item.text || existing.text,
          characterNames: mergedCharacters,
          tags: mergedTags,
          projectId: item.projectId || existing.projectId,
          projectTitle: item.projectTitle || existing.projectTitle,
          source: item.source || existing.source,
          contentHash: item.contentHash || existing.contentHash,
          updatedAt: nowMs(),
          lastReferencedAt: nowMs(),
          referenceCount: Math.max(0, Number(existing.referenceCount || 0)) + 1,
        };
        const embeddingModelForHash = resolvedEmbeddingModel || existing.embedding?.model || "";
        const embeddingTextUnchanged = existing.embedding?.textHash &&
          existing.embedding.textHash === episodicEmbeddingTextHash(nextMemory, embeddingModelForHash);
        if (item.embedding) {
          nextMemory.embedding = item.embedding;
        } else if (!embeddingTextUnchanged) {
          delete nextMemory.embedding;
        }
        memories[duplicateIdx] = nextMemory;
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
  async function getCharacterTraits({
    userId,
    characterName = null,
    projectId = "",
    projectTitle = "",
  } = {}) {
    if (!userId) return null;
    const rec = await readUser(userId);
    if (!rec || !Array.isArray(rec.characters)) return null;
    const characters = scopeRecordsToProject(rec.characters, {
      projectId,
      projectTitle,
      metadataKey: "metadata",
    });
    if (characterName && typeof characterName === "string") {
      const name = characterName.trim();
      if (!name) return null;
      const found = characters.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!found) return null;
      return { name: found.name, traits: found.traits || null };
    }
    return characters.map((c) => ({ name: c.name, traits: c.traits || null }));
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

  async function clearUserMemory({ userId } = {}) {
    const cleanUserId = String(userId || "").trim();
    if (!cleanUserId) {
      return { ok: false, cleared: false, reason: "user_id_required" };
    }
    if (typeof store.delete !== "function") {
      throw new Error("creative memory persistence must support per-user deletion");
    }
    return withUserLock(cleanUserId, async () => {
      const existed = (await readUser(cleanUserId)) !== null;
      await store.delete({ domain: DOMAIN, key: cleanUserId });
      return { ok: true, cleared: existed, userId: cleanUserId };
    });
  }

  async function forgetMemoryCard({ userId, key } = {}) {
    const cleanUserId = String(userId || "").trim();
    const cleanKey = String(key || "").trim();
    const separatorIndex = cleanKey.indexOf(":");
    const type = separatorIndex > 0 ? cleanKey.slice(0, separatorIndex).toLowerCase() : "";
    const target = separatorIndex > 0 ? cleanKey.slice(separatorIndex + 1).trim() : "";
    if (!cleanUserId) {
      return { ok: false, forgotten: false, reason: "user_id_required" };
    }
    if (!target || (type !== "character" && type !== "episode")) {
      return { ok: false, forgotten: false, reason: "unsupported_memory_key" };
    }

    return withUserLock(cleanUserId, async () => {
      const current = await readUser(cleanUserId);
      if (!current) {
        return { ok: true, forgotten: false, type, key: cleanKey, userId: cleanUserId };
      }
      let forgotten = false;
      if (type === "character") {
        const targetName = target.toLowerCase();
        const characters = Array.isArray(current.characters) ? current.characters : [];
        const remaining = characters.filter((character) => (
          String(character?.name || "").trim().toLowerCase() !== targetName
        ));
        forgotten = remaining.length !== characters.length;
        current.characters = remaining;
      } else {
        const memories = Array.isArray(current.episodicMemories) ? current.episodicMemories : [];
        const remaining = memories.filter((memory) => String(memory?.id || "").trim() !== target);
        forgotten = remaining.length !== memories.length;
        current.episodicMemories = remaining;
      }
      if (forgotten) {
        current.updatedAt = nowMs();
        await writeUser(cleanUserId, current);
      }
      return { ok: true, forgotten, type, key: cleanKey, userId: cleanUserId };
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
    projectContinuity = null,
    characterArcMemories = [],
    acceptedSceneContext = null,
    acceptedPageText = "",
    source = "talk_turn",
  } = {}) {
    if (!userId) return { skipped: true, reason: "no userId" };
    const cleanProjectId = cleanText(projectId, 96);
    const cleanProjectTitle = cleanText(projectTitle, 160);
    const cleanSource = cleanText(source || "talk_turn", 64) || "talk_turn";
    const userText = String(transcript || "");
    const assistantText = String(reply || "");
    const cleanAcceptedPageText = String(acceptedPageText || "").trim().slice(0, 20_000);
    const structuredArcSources = Array.isArray(characterArcMemories)
      ? characterArcMemories.slice(0, 8)
      : characterArcMemories && typeof characterArcMemories === "object"
        ? [characterArcMemories]
        : [];
    const structuredArcs = structuredArcSources
      .map(sanitizeStructuredCharacterArcMemory)
      .filter(Boolean);
    const summary = {
      characterMentions: 0,
      episodicMemories: 0,
      corrections: 0,
      structuredCharacterBibles: 0,
      acceptedScenesRecorded: 0,
      acceptedPagesPromoted: 0,
      acceptedPagesRecorded: 0,
      lexicalPhrases: 0,
      projectContinuityRecorded: false,
      sessionRecorded: false,
    };

    const continuitySource = projectContinuity && typeof projectContinuity === "object" && !Array.isArray(projectContinuity)
      ? projectContinuity
      : {};
    const acceptedScene = buildAcceptedSceneContinuity({
      pageText: cleanAcceptedPageText,
      projectId: cleanProjectId || continuitySource.projectId,
      projectTitle: cleanProjectTitle || continuitySource.projectTitle,
      projectContinuity: continuitySource,
      characterNames: structuredArcs.map((item) => item.character),
      context: acceptedSceneContext,
    });
    if ((Object.keys(continuitySource).length || acceptedScene) && (cleanProjectId || cleanProjectTitle || continuitySource.projectId || continuitySource.projectTitle)) {
      try {
        const receipt = await recordProjectContinuity({
          userId,
          continuity: {
            ...continuitySource,
            projectId: cleanProjectId || continuitySource.projectId,
            projectTitle: cleanProjectTitle || continuitySource.projectTitle,
            ...(acceptedScene ? { acceptedScenes: [acceptedScene] } : {}),
          },
        });
        summary.projectContinuityRecorded = Boolean(receipt?.ok);
        summary.acceptedScenesRecorded = receipt?.ok && acceptedScene ? 1 : 0;
      } catch (_e) { /* never block the response on memory writes */ }
    }

    // Only writer text can mutate canon. Generated pages remain useful for draft continuity and voice.
    const combined = `${userText}\n${assistantText}`;
    const isGeneratedScreenplayOutput = cleanSource === "talk_screenplay_output";
    const isCorrectionTurn = CORRECTION_KEYWORDS.test(userText);
    const characterDiscoveryText = isGeneratedScreenplayOutput ? combined : userText;
    const traitText = isGeneratedScreenplayOutput ? combined : userText;
    const storyMemoryText = isGeneratedScreenplayOutput && !isCorrectionTurn
      ? combined
      : userText;
    if (cleanAcceptedPageText) {
      try {
        const receipt = await promoteAcceptedGeneratedPageMemory({
          userId,
          projectId: cleanProjectId,
          projectTitle: cleanProjectTitle,
          acceptedPageText: cleanAcceptedPageText,
        });
        summary.acceptedPagesPromoted = Math.max(0, Number(receipt?.promoted || 0));
      } catch (_e) { /* never block the response on memory promotion */ }
    }

    const structuredCharacterNames = [];
    if (cleanProjectId || cleanProjectTitle) {
      for (const structured of structuredArcs) {
        try {
          const receipt = await recordCharacterMention({
            userId,
            characterName: structured.character,
            source: cleanSource,
            tags: ["screenplay", "character-bible"],
            metadata: {
              ...(cleanProjectId ? { projectId: cleanProjectId } : {}),
              ...(cleanProjectTitle ? { projectTitle: cleanProjectTitle } : {}),
            },
            characterBible: { arc: structured.arc },
          });
          if (receipt?.ok) {
            summary.structuredCharacterBibles += 1;
            structuredCharacterNames.push(structured.character);
          }
        } catch (_e) { /* never block the response on memory writes */ }
      }
    }
    const knownCharacterNames = await readUser(userId)
      .then((rec) => (Array.isArray(rec?.characters) ? rec.characters : []))
      .catch(() => [])
      .then((characters) => scopeRecordsToProject(characters, {
        projectId: cleanProjectId,
        projectTitle: cleanProjectTitle,
        metadataKey: "metadata",
      }))
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
        const traitLines = extractTraitLinesForCharacter(traitText, name);
        const traitHint = extractTraitHintForCharacter(traitText, name);
        const traits = traitLines.length || traitHint
          ? extractTraits({ characterName: name, lines: traitLines, hint: traitHint })
          : null;
        const characterBible = extractCharacterBibleDelta({
          text: userText,
          characterName: name,
          isCorrectionTurn,
        });
        await recordCharacterMention({
          userId,
          characterName: name,
          source: cleanSource,
          tags: ["screenplay"],
          metadata: cleanProjectId || cleanProjectTitle
            ? {
              ...(cleanProjectId ? { projectId: cleanProjectId } : {}),
              ...(cleanProjectTitle ? { projectTitle: cleanProjectTitle } : {}),
            }
            : null,
          traits: traitsHaveSignal(traits) ? traits : null,
          characterBible,
        });
        summary.characterMentions += 1;
      } catch (_e) { /* never block the response on memory writes */ }
      return true;
    };

    for (const declaredName of extractDeclaredCharacterNames(userText)) {
      if (turnCharacterNames.length >= 8) break;
      await rememberCharacterName(declaredName);
    }
    for (const knownName of knownCharacterNames) {
      if (turnCharacterNames.length >= 8) break;
      if (textMentionsName(characterDiscoveryText, knownName)) {
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
    while (limit > 0 && (match = cueRegex.exec(characterDiscoveryText)) !== null) {
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

    for (const name of structuredCharacterNames) {
      if (turnCharacterNames.length >= 8) break;
      if (!turnCharacterNames.some((item) => item.toLowerCase() === name.toLowerCase())) {
        turnCharacterNames.push(name);
      }
    }

    const sceneHeading = firstScreenplaySceneHeading(storyMemoryText);
    const moment = firstMemoryMoment(userText) ||
      (isGeneratedScreenplayOutput ? firstMemoryMoment(assistantText) : "");
    if (isStoryMemoryCandidate({
      transcript: userText,
      reply: isGeneratedScreenplayOutput ? assistantText : "",
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
        transcript: userText,
        isCorrection: isCorrectionTurn,
      });
      try {
        const correctionSignal = isCorrectionTurn
          ? collectEpisodicCorrectionSignal({
            text: userText,
            characterNames: turnCharacterNames,
          })
          : null;
        const tags = buildEpisodicTags({
          transcript: userText,
          source: cleanSource,
          projectId: cleanProjectId,
          projectTitle: cleanProjectTitle,
        });
        const acceptedOutput = Boolean(
          cleanAcceptedPageText &&
          screenplayPageMemoryHash(assistantText) === screenplayPageMemoryHash(cleanAcceptedPageText)
        );
        if (acceptedOutput) tags.push(ACCEPTED_PAGE_TAG);
        const receipt = await recordEpisodicMemory({
          userId,
          summary: memorySummary,
          text: storyMemoryText,
          characterNames: turnCharacterNames,
          tags,
          projectId: cleanProjectId,
          projectTitle: cleanProjectTitle,
          source: cleanSource,
          contentHash: isGeneratedScreenplayOutput
            ? screenplayPageMemoryHash(assistantText)
            : "",
          correction: correctionSignal,
        });
        if (receipt?.ok) summary.episodicMemories += 1;
        if (receipt?.ok && acceptedOutput) summary.acceptedPagesRecorded += 1;
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
    backfillEpisodicEmbeddings,
    promoteAcceptedGeneratedPageMemory,
    getCharacterTraits,
    getHabitsForUser,
    hasMemoryForUser,
    clearUserMemory,
    forgetMemoryCard,
    recordProjectContinuity,
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
