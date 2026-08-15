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

import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { createPersistence } from "./persistence_adapter.js";
import {
  extractTraits,
  mergeTraits as mergeCharacterTraits,
} from "./trait_library.js";
import { isExplicitCanonCorrectionRequest } from "./screenplay_canon_guard.js";
import {
  classifyScreenplayLearningAnswer,
  resolveProvisionalScreenplayOptionSelection,
  sanitizeProvisionalScreenplayOptions,
} from "./screenplay_question_planner.js";
import {
  normalizeStoryMoveFamily,
  normalizeStoryMovePreferenceOverrides,
} from "./story_rescue_move_library.js";
import { buildFeatureStoryGraph } from "./feature_story_graph.js";

const SCHEMA_VERSION = 1;
const LEXICAL_FINGERPRINT_MAX = 64;
const CHARACTERS_MAX = 32;
const CHARACTER_PROMPT_MAX = 16;
const CHARACTER_BIBLE_CANON_MAX = 12;
const CHARACTER_BIBLE_CORRECTIONS_MAX = 8;
const CHARACTER_BIBLE_TERMS_MAX = 12;
const CHARACTER_BIBLE_AUTHORITATIVE_FIELDS_MAX = 8;
const CHARACTER_BIBLE_LEARNED_FIELDS_MAX = 8;
const CHARACTER_ARC_FIELD_MAX_CHARS = 180;
const PROJECT_CONTINUITY_MAX = 24;
const QUESTION_EFFECTIVENESS_MAX = 24;
const STORY_MOVE_PREFERENCE_OVERRIDES_MAX = 9;
const QUESTION_EFFECTIVENESS_ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const PROJECT_CORRECTED_TERMS_MAX = 64;
const ACCEPTED_SCENES_MAX = 96;
const ACCEPTED_SCENE_PROMPT_MAX = 3;
const EPISODIC_MEMORIES_MAX = 64;
const CANON_CORRECTION_RECEIPTS_MAX = 12;
const CANON_CORRECTION_AMBIGUITIES_MAX = 12;
const WRITER_CANON_FACTS_MAX = 32;
const WRITER_CANON_FACT_MAX_CHARS = 220;
const WRITER_CANON_TARGETS_MAX = 16;
const PROJECT_AUTHORITATIVE_FIELDS_MAX = 12;
const PROJECT_LEARNED_FIELDS_MAX = 16;
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
const CORRECTION_KEYWORDS = /(?:\bactually\s*,(?:\s*no\b)?|\b(?:correction|scratch that|not that|instead|retcon|change it to|make it so)\b)/i;
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
const WRITER_CANON_PROJECT_SCALAR_TARGETS = new Set([
  "protagonistWant",
  "protagonistNeed",
  "antagonisticForce",
  "centralQuestion",
  "themeArgument",
  "endingImage",
]);
const WRITER_CANON_PROJECT_LIST_TARGETS = new Set([
  "unresolvedSetups",
  "unresolvedStoryThreads",
  "actThreePayoffPath",
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
  ["correctedTerms", PROJECT_CORRECTED_TERMS_MAX, 120],
  ["correctionReplacements", 8, 160],
]);
const PROJECT_CONTINUITY_INTEGER_FIELDS = Object.freeze([
  ["pageCount", 1_000],
  ["targetPages", 1_000],
]);
const SCREENPLAY_QUESTION_SEQUENCE_KEYS = new Set([
  "opening",
  "commitment",
  "premise",
  "midpoint",
  "fallout",
  "crisis",
  "final_plan",
  "climax",
  "resolution",
]);
const STORY_BLOCK_RESOLVED_SIGNAL = /\b(?:(?:that|this|it)\s+(?:solved|fixed|cleared|broke)\s+(?:the\s+)?(?:block|problem)|i(?:'m| am)\s+(?:unstuck|not\s+stuck)|the\s+(?:writer'?s\s+)?block(?:'s| is)\s+gone|now\s+i\s+(?:know|see)\s+(?:what\s+happens|where\s+(?:the\s+)?story\s+goes|the\s+next\s+(?:beat|scene|move)))\b/i;
const STORY_RESCUE_FAILED_SIGNAL = /\b(?:(?:that|this|it)\s+(?:did(?:n['’]?t| not)\s+help|is(?:n['’]?t| not)\s+working|made\s+(?:it|things)\s+worse)|i(?:['’]?m| am)\s+still\s+(?:stuck|blocked)|(?:that|this)\s+(?:does(?:n['’]?t| not)\s+unlock|won['’]?t\s+unlock)\s+(?:it|the\s+(?:beat|scene|story))|try\s+(?:a\s+)?different\s+(?:move|approach|idea)|give\s+me\s+something\s+else)\b/i;
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
  ["decisions", "decisions", 4, 220],
  ["revelations", "revelations", 4, 220],
  ["relationshipChanges", "relationship_changes", 4, 220],
  ["irreversibleConsequences", "irreversible_consequences", 4, 220],
]);

function isCorrectionTurnText(value = "") {
  const text = String(value || "");
  return CORRECTION_KEYWORDS.test(text) || isExplicitCanonCorrectionRequest(text);
}
const ACCEPTED_CAUSAL_FACT_FIELDS = Object.freeze([
  ["decision", "decisions"],
  ["revelation", "revelations"],
  ["relationship_change", "relationshipChanges"],
  ["irreversible_consequence", "irreversibleConsequences"],
]);
const ACCEPTED_CAUSAL_FACT_PROMPT_MAX = 8;
const WRITER_CANON_AUTHORITY = "writer_correction";
const SCREENPLAY_LEARNING_SOURCE = "screenplay_learning_confirmation";
const SCREENPLAY_LEARNING_CHARACTER_FIELDS = Object.freeze({
  "character.want": "want",
  "character.need": "need",
  "character.wound": "wound",
  "character.false_belief": "falseBelief",
  "character.relationship_pressure": "relationshipPressure",
  "character.current_tactic": "currentTactic",
  "character.next_emotional_turn": "nextEmotionalTurn",
});
const SCREENPLAY_LEARNING_PROJECT_FIELDS = Object.freeze({
  "project.protagonist_want": { field: "protagonistWant", kind: "scalar" },
  "project.protagonist_need": { field: "protagonistNeed", kind: "scalar" },
  "project.antagonistic_force": { field: "antagonisticForce", kind: "scalar" },
  "project.central_question": { field: "centralQuestion", kind: "scalar" },
  "project.theme_argument": { field: "themeArgument", kind: "scalar" },
  "project.ending_image": { field: "endingImage", kind: "scalar" },
  "scene.objective": { field: "sceneObjective", kind: "scalar" },
  "story.next_irreversible_choice": { field: "nextScenePlan", kind: "scalar" },
  "story_thread.payoff_choice": { field: "nextSceneMoves", kind: "list" },
  "story_thread.next_setup": { field: "unresolvedSetups", kind: "list" },
});
const SCREENPLAY_LEARNING_PROJECT_FIELD_NAMES = new Set(
  Object.values(SCREENPLAY_LEARNING_PROJECT_FIELDS).map((item) => item.field)
);
const ACCEPTED_CANON_CORRECTION_AMBIGUITY_MARGIN = 100;
const ACCEPTED_CANON_ACTION_TERMS = new Set([
  "abandon", "admit", "arrest", "betray", "broadcast", "burn", "choose", "confess",
  "chose", "decide", "destroy", "die", "died", "forg", "forgive", "forge", "kill", "leave",
  "left", "publish", "refuse", "reject", "reveal", "shoot", "shot", "sign", "stab",
  "surrender", "trust",
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
    canonCorrectionReceipts: [],
    canonCorrectionAmbiguities: [],
    tone: {},
    habits: {},
  };
}

function hasCreativeMemoryContent(memory) {
  if (!memory || typeof memory !== "object") return false;
  if (
    (Array.isArray(memory.projects) && memory.projects.length) ||
    (Array.isArray(memory.characters) && memory.characters.length) ||
    (Array.isArray(memory.episodicMemories) && memory.episodicMemories.length) ||
    (Array.isArray(memory.canonCorrectionReceipts) && memory.canonCorrectionReceipts.length) ||
    (Array.isArray(memory.canonCorrectionAmbiguities) && memory.canonCorrectionAmbiguities.length)
  ) {
    return true;
  }
  const style = memory.style && typeof memory.style === "object" ? memory.style : {};
  if (Object.entries(style).some(([, value]) => (
    Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ""
  ))) {
    return true;
  }
  return [memory.tone, memory.habits].some((value) => (
    value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0
  ));
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

function normalizeWriterCanonAssertion(value = "") {
  const raw = cleanText(value, 600);
  if (!raw) return "";
  const withoutCue = raw
    .replace(
      /^(?:(?:actually(?:\s*,?\s*no)?|no\s*,?\s*actually|correction|canon correction|retcon|scratch that|not that|that's wrong|that is wrong)\b\s*[:;,\-.\u2013\u2014]?\s*)+/i,
      ""
    )
    .trim();
  const fact = cleanText(withoutCue || raw, WRITER_CANON_FACT_MAX_CHARS);
  if (!fact || /^(?:no|actually|correction|retcon|scratch that|that's wrong|that is wrong)[.!?]*$/i.test(fact)) {
    return "";
  }
  const meaningfulTerms = tokenizeMemoryText(fact)
    .map(normalizeSemanticTerm)
    .filter((term) => term && !["actually", "correction", "retcon", "wrong"].includes(term));
  return meaningfulTerms.length >= 2 ? fact : "";
}

function normalizeWriterCanonTargetField(value = "") {
  const clean = cleanText(value, 64).replace(/[\s-]+/g, "_").toLowerCase();
  const aliases = {
    act: "act",
    want: "want",
    need: "need",
    wound: "wound",
    false_belief: "falseBelief",
    falsebelief: "falseBelief",
    relationship_pressure: "relationshipPressure",
    relationshippressure: "relationshipPressure",
    current_tactic: "currentTactic",
    currenttactic: "currentTactic",
    next_emotional_turn: "nextEmotionalTurn",
    nextemotionalturn: "nextEmotionalTurn",
    protagonist_want: "protagonistWant",
    protagonistwant: "protagonistWant",
    protagonist_need: "protagonistNeed",
    protagonistneed: "protagonistNeed",
    central_question: "centralQuestion",
    centralquestion: "centralQuestion",
    theme_argument: "themeArgument",
    themeargument: "themeArgument",
    ending_image: "endingImage",
    endingimage: "endingImage",
    unresolved_setups: "unresolvedSetups",
    unresolvedsetups: "unresolvedSetups",
    unresolved_story_threads: "unresolvedStoryThreads",
    unresolvedstorythreads: "unresolvedStoryThreads",
    act_three_payoff_path: "actThreePayoffPath",
    actthreepayoffpath: "actThreePayoffPath",
  };
  return aliases[clean] || "";
}

function sanitizeWriterCanonTarget(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const scope = cleanText(value.scope, 24).toLowerCase();
  const field = normalizeWriterCanonTargetField(value.field);
  const maxChars = field === "act" ? 80 : 220;
  const targetValue = cleanText(value.value ?? value.fact ?? value.text, maxChars);
  if (!targetValue || !field) return null;
  if (scope === "character") {
    const character = normalizeCharacterName(
      value.character ?? value.characterName ?? value.character_name
    );
    if (!character || !CHARACTER_ARC_FIELDS.includes(field)) return null;
    return { scope, character, field, value: targetValue };
  }
  if (
    scope === "project" &&
    (WRITER_CANON_PROJECT_SCALAR_TARGETS.has(field) || WRITER_CANON_PROJECT_LIST_TARGETS.has(field))
  ) {
    return { scope, field, value: targetValue };
  }
  return null;
}

function mergeWriterCanonTargets(...sources) {
  const out = [];
  const seen = new Set();
  for (const source of sources) {
    for (const value of Array.isArray(source) ? source : []) {
      const target = sanitizeWriterCanonTarget(value);
      if (!target) continue;
      const key = [
        target.scope,
        target.character || "",
        target.field,
        target.value.toLowerCase(),
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(target);
      if (out.length >= WRITER_CANON_TARGETS_MAX) return out;
    }
  }
  return out;
}

function writerCanonStructuredUpdateLabels(targets = []) {
  return mergeWriterCanonTargets(targets).map((target) => (
    `${target.scope === "character" ? `${target.character}.` : ""}${target.field}: ${target.value}`
  ));
}

function applyWriterCanonTargetsToProject(project = null, targets = []) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return project;
  const cleanTargets = mergeWriterCanonTargets(targets)
    .filter((target) => target.scope === "project");
  if (!cleanTargets.length) return project;
  const out = { ...project };
  const appliedScalarFields = new Set();
  const appliedListFields = new Set();
  for (const target of cleanTargets) {
    if (WRITER_CANON_PROJECT_SCALAR_TARGETS.has(target.field)) {
      if (!appliedScalarFields.has(target.field)) {
        out[target.field] = target.value;
        appliedScalarFields.add(target.field);
      }
      continue;
    }
    if (!WRITER_CANON_PROJECT_LIST_TARGETS.has(target.field)) continue;
    if (appliedListFields.has(target.field)) continue;
    const definition = PROJECT_CONTINUITY_LIST_FIELDS.find(([field]) => field === target.field);
    if (!definition) continue;
    const [, maxItems, maxChars] = definition;
    out[target.field] = normalizeStringList([target.value], maxItems, maxChars);
    appliedListFields.add(target.field);
  }
  const notes = cleanTargets.map((target) => (
    `Authoritative writer correction [${target.field}]: ${target.value}`
  ));
  out.continuityNotes = normalizeStringList(
    [...notes, ...(Array.isArray(out.continuityNotes) ? out.continuityNotes : [])],
    8,
    200
  );
  return out;
}

function sanitizeAuthoritativeProjectField(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = normalizeWriterCanonTargetField(value.field);
  if (
    !WRITER_CANON_PROJECT_SCALAR_TARGETS.has(field) &&
    !WRITER_CANON_PROJECT_LIST_TARGETS.has(field)
  ) return null;
  const fieldValue = cleanText(value.value ?? value.fact ?? value.text, 220);
  if (!fieldValue) return null;
  const sourceCorrectionId = cleanText(
    value.sourceCorrectionId ?? value.source_correction_id ?? value.receiptId ?? value.receipt_id,
    96
  );
  const correctionText = cleanText(value.correctionText ?? value.correction_text, 600);
  const replacesFacts = normalizeStringList(
    value.replacesFacts ?? value.replaces_facts,
    8,
    220
  );
  const rawCreatedAt = Number(value.createdAt ?? value.created_at ?? nowMs());
  const createdAt = Number.isFinite(rawCreatedAt) && rawCreatedAt > 0 ? rawCreatedAt : nowMs();
  const id = cleanText(value.id, 96) || `project_field_${stableHash([
    field,
    fieldValue.toLowerCase(),
    sourceCorrectionId,
  ].join("|"))}`;
  return {
    id,
    field,
    value: fieldValue,
    source: WRITER_CANON_AUTHORITY,
    sourceCorrectionId,
    correctionText,
    replacesFacts,
    createdAt,
  };
}

function mergeAuthoritativeProjectFields(incoming = [], existing = []) {
  const newest = (Array.isArray(incoming) ? incoming : [])
    .map(sanitizeAuthoritativeProjectField)
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const retiredScalarFields = new Set(
    newest
      .filter((item) => WRITER_CANON_PROJECT_SCALAR_TARGETS.has(item.field))
      .map((item) => item.field)
  );
  const older = (Array.isArray(existing) ? existing : [])
    .map(sanitizeAuthoritativeProjectField)
    .filter((item) => item && !retiredScalarFields.has(item.field))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const out = [];
  const seen = new Set();
  for (const item of [...newest, ...older]) {
    const key = WRITER_CANON_PROJECT_SCALAR_TARGETS.has(item.field)
      ? item.field
      : `${item.field}:${item.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= PROJECT_AUTHORITATIVE_FIELDS_MAX) break;
  }
  return out;
}

function buildAuthoritativeProjectFields({
  targets = [],
  sourceCorrectionId = "",
  correctionText = "",
  replacesFacts = [],
  createdAt = nowMs(),
} = {}) {
  return mergeWriterCanonTargets(targets)
    .filter((target) => target.scope === "project")
    .map((target) => sanitizeAuthoritativeProjectField({
      id: `project_field_${stableHash([
        target.field,
        target.value.toLowerCase(),
        sourceCorrectionId,
      ].join("|"))}`,
      field: target.field,
      value: target.value,
      sourceCorrectionId,
      correctionText,
      replacesFacts,
      createdAt,
    }))
    .filter(Boolean);
}

function sanitizeLearnedProjectField(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = normalizeWriterCanonTargetField(value.field) || cleanText(value.field, 64);
  if (!SCREENPLAY_LEARNING_PROJECT_FIELD_NAMES.has(field)) return null;
  const definition = Object.values(SCREENPLAY_LEARNING_PROJECT_FIELDS)
    .find((item) => item.field === field);
  const fieldValue = cleanText(value.value ?? value.fact ?? value.text, 240);
  if (!definition || !fieldValue) return null;
  const questionId = cleanText(value.questionId ?? value.question_id, 120);
  const question = cleanText(value.question, 260);
  const targetLabel = cleanText(value.targetLabel ?? value.target_label, 120);
  const anchor = cleanText(value.anchor, 180);
  const rawLearnedAt = Number(
    value.learnedAt ?? value.learned_at ?? value.createdAt ?? value.created_at ?? nowMs()
  );
  const learnedAt = Number.isFinite(rawLearnedAt) && rawLearnedAt > 0
    ? rawLearnedAt
    : nowMs();
  const rawUpdatedAt = Number(value.updatedAt ?? value.updated_at ?? learnedAt);
  const updatedAt = Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0
    ? Math.max(learnedAt, rawUpdatedAt)
    : learnedAt;
  const id = cleanText(value.id, 96) || `project_learning_${stableHash([
    field,
    fieldValue.toLowerCase(),
    questionId,
  ].join("|"))}`;
  return {
    id,
    field,
    kind: definition.kind,
    value: fieldValue,
    source: SCREENPLAY_LEARNING_SOURCE,
    questionId,
    question,
    targetLabel,
    anchor,
    learnedAt,
    updatedAt,
  };
}

function mergeLearnedProjectFields(incoming = [], existing = []) {
  const newest = (Array.isArray(incoming) ? incoming : [])
    .map(sanitizeLearnedProjectField)
    .filter(Boolean)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const retiredScalarFields = new Set(
    newest.filter((item) => item.kind === "scalar").map((item) => item.field)
  );
  const older = (Array.isArray(existing) ? existing : [])
    .map(sanitizeLearnedProjectField)
    .filter((item) => item && !retiredScalarFields.has(item.field))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const out = [];
  const seen = new Set();
  for (const item of [...newest, ...older]) {
    const key = item.kind === "scalar"
      ? item.field
      : `${item.field}:${item.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= PROJECT_LEARNED_FIELDS_MAX) break;
  }
  return out;
}

function sanitizeWriterCanonFact(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const correctionText = cleanText(value.correctionText ?? value.correction_text, 600);
  const fact = normalizeWriterCanonAssertion(value.fact ?? value.value ?? correctionText);
  const replacesFacts = normalizeStringList(
    value.replacesFacts ?? value.replaces_facts,
    8,
    220
  );
  if (!fact || !replacesFacts.length) return null;
  const receiptId = cleanText(value.receiptId ?? value.receipt_id, 96);
  const rawCreatedAt = Number(value.createdAt ?? value.created_at ?? nowMs());
  const createdAt = Number.isFinite(rawCreatedAt) && rawCreatedAt > 0
    ? rawCreatedAt
    : nowMs();
  const rawUpdatedAt = Number(value.updatedAt ?? value.updated_at ?? createdAt);
  const structuredTargets = mergeWriterCanonTargets(
    value.structuredTargets ?? value.structured_targets
  );
  const id = cleanText(value.id, 96) || `writer_canon_${stableHash([
    fact.toLowerCase(),
    [...replacesFacts].map(acceptedCanonFactKey).sort().join("|"),
  ].join("|"))}`;
  return {
    id,
    fact,
    correctionText: correctionText || fact,
    replacesFacts,
    source: WRITER_CANON_AUTHORITY,
    receiptId,
    structuredTargets,
    createdAt,
    updatedAt: Number.isFinite(rawUpdatedAt)
      ? Math.max(createdAt, rawUpdatedAt)
      : createdAt,
  };
}

function buildWriterCanonFact({
  projectId = "",
  projectTitle = "",
  correctionText = "",
  replacesFacts = [],
  receiptId = "",
  structuredTargets = [],
  createdAt = nowMs(),
} = {}) {
  const fact = normalizeWriterCanonAssertion(correctionText);
  const cleanReplaced = normalizeStringList(replacesFacts, 8, 220);
  if (!fact || !cleanReplaced.length) return null;
  return sanitizeWriterCanonFact({
    id: `writer_canon_${stableHash([
      cleanText(projectId, 96).toLowerCase(),
      cleanText(projectTitle, 160).toLowerCase(),
      fact.toLowerCase(),
      [...cleanReplaced].map(acceptedCanonFactKey).sort().join("|"),
    ].join("|"))}`,
    fact,
    correctionText,
    replacesFacts: cleanReplaced,
    receiptId,
    structuredTargets,
    createdAt,
    updatedAt: createdAt,
  });
}

function writerCanonFactMatchesCorrection(fact = "", correctedTerms = []) {
  const source = cleanText(fact, WRITER_CANON_FACT_MAX_CHARS).toLowerCase();
  if (!source) return false;
  return normalizeStringList(correctedTerms, PROJECT_CORRECTED_TERMS_MAX, 120).some((term) => {
    const retired = cleanText(term, 120).toLowerCase();
    if (!retired) return false;
    if (retired === source) return true;
    return retired.length >= 24 && retired.length >= Math.floor(source.length * 0.5) && source.includes(retired);
  });
}

function mergeWriterCanonFacts(incoming = [], existing = [], correction = null) {
  const merged = [];
  const seen = new Set();
  const correctedTerms = normalizeStringList(
    correction?.correctedTerms ?? correction?.corrected_terms,
    PROJECT_CORRECTED_TERMS_MAX,
    120
  );
  for (const value of [
    ...(Array.isArray(incoming) ? incoming : []),
    ...(Array.isArray(existing) ? existing : []),
  ]) {
    const item = sanitizeWriterCanonFact(value);
    if (!item || writerCanonFactMatchesCorrection(item.fact, correctedTerms)) continue;
    const key = item.id || acceptedCanonFactKey(item.fact);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, WRITER_CANON_FACTS_MAX);
}

function sanitizeQuestionEffectivenessRecord(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const questionId = cleanText(source.questionId ?? source.question_id, 120);
  const targetField = cleanText(source.targetField ?? source.target_field, 64).toLowerCase();
  let askedAt = Math.max(0, Number(source.askedAt ?? source.asked_at ?? 0));
  let answeredAt = Math.max(0, Number(source.answeredAt ?? source.answered_at ?? 0));
  const respondedAt = Math.max(
    0,
    Number(source.respondedAt ?? source.responded_at ?? answeredAt ?? 0)
  );
  if (!askedAt && answeredAt) askedAt = answeredAt;
  const responseStatusRaw = cleanText(
    source.responseStatus ?? source.response_status,
    24
  ).toLowerCase();
  let responseStatus = ["asked", "answered", "declined", "expired"].includes(responseStatusRaw)
    ? responseStatusRaw
    : answeredAt
      ? "answered"
      : "asked";
  if (responseStatus === "answered" && !answeredAt) {
    answeredAt = respondedAt || nowMs();
  }
  if (!questionId || !targetField || !askedAt) return null;
  const actKeyRaw = cleanText(source.actKey ?? source.act_key, 24).toLowerCase();
  const sequenceKeyRaw = cleanText(source.sequenceKey ?? source.sequence_key, 32).toLowerCase();
  const acceptedPageAt = Math.max(
    0,
    Number(source.acceptedPageAt ?? source.accepted_page_at ?? 0)
  );
  const blockResolvedAt = Math.max(
    0,
    Number(source.blockResolvedAt ?? source.block_resolved_at ?? 0)
  );
  const acceptedPageCount = acceptedPageAt
    ? Math.max(1, Math.min(8, Math.floor(Number(
      source.acceptedPageCount ?? source.accepted_page_count ?? 1
    ) || 1)))
    : 0;
  const blockResolutionCount = blockResolvedAt
    ? Math.max(1, Math.min(8, Math.floor(Number(
      source.blockResolutionCount ?? source.block_resolution_count ?? 1
    ) || 1)))
    : 0;
  const rescueFailedAt = Math.max(
    0,
    Number(source.rescueFailedAt ?? source.rescue_failed_at ?? 0)
  );
  const failedRescueCount = rescueFailedAt
    ? Math.max(1, Math.min(8, Math.floor(Number(
      source.failedRescueCount ?? source.failed_rescue_count ?? 1
    ) || 1)))
    : 0;
  const selectedMoveFamily = normalizeStoryMoveFamily(
    source.selectedMoveFamily ??
    source.selected_move_family ??
    source.selectedStoryMove ??
    source.selected_story_move
  );
  const offeredMoveFamilies = normalizeStringList(
    source.offeredMoveFamilies ??
    source.offered_move_families ??
    source.provisionalMoveFamilies ??
    source.provisional_move_families,
    3,
    48
  )
    .map(normalizeStoryMoveFamily)
    .filter((family, index, values) => family && values.indexOf(family) === index);
  if (acceptedPageAt || blockResolvedAt) responseStatus = "answered";
  const outcome = acceptedPageAt && blockResolvedAt
    ? "accepted_pages_and_block_resolved"
    : acceptedPageAt
      ? "accepted_pages"
      : blockResolvedAt
        ? "block_resolved"
        : rescueFailedAt
          ? "rescue_failed"
        : responseStatus === "answered"
          ? "awaiting_outcome"
          : responseStatus === "declined"
            ? "declined"
            : responseStatus === "expired"
              ? "ignored"
              : "awaiting_answer";
  return Object.fromEntries(Object.entries({
    questionId,
    targetField,
    targetLabel: cleanText(source.targetLabel ?? source.target_label, 120),
    question: cleanText(source.question, 260),
    anchor: cleanText(source.anchor, 180),
    actKey: ["act1", "act2", "act3"].includes(actKeyRaw) ? actKeyRaw : "",
    sequenceKey: SCREENPLAY_QUESTION_SEQUENCE_KEYS.has(sequenceKeyRaw) ? sequenceKeyRaw : "",
    writerBlocked: Boolean(source.writerBlocked ?? source.writer_blocked),
    recommendationOnly: Boolean(source.recommendationOnly ?? source.recommendation_only),
    askedAt,
    answeredAt,
    respondedAt: respondedAt || answeredAt,
    responseStatus,
    acceptedPageAt,
    acceptedPageCount,
    blockResolvedAt,
    blockResolutionCount,
    rescueFailedAt,
    failedRescueCount,
    outcome,
    selectedMoveFamily,
    ...(offeredMoveFamilies.length ? { offeredMoveFamilies } : {}),
    updatedAt: Math.max(
      askedAt,
      answeredAt,
      respondedAt,
      acceptedPageAt,
      blockResolvedAt,
      rescueFailedAt,
      Number(source.updatedAt ?? source.updated_at ?? 0)
    ),
  }).filter(([, fieldValue]) => (
    typeof fieldValue === "boolean" ? fieldValue : Boolean(fieldValue)
  )));
}

function mergeQuestionEffectivenessRecords(incoming = [], existing = []) {
  const byQuestionId = new Map();
  for (const raw of [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]) {
    const item = sanitizeQuestionEffectivenessRecord(raw);
    if (!item) continue;
    const previous = byQuestionId.get(item.questionId);
    if (!previous) {
      byQuestionId.set(item.questionId, item);
      continue;
    }
    const responseStatusRank = {
      asked: 0,
      expired: 1,
      declined: 1,
      answered: 2,
    };
    const responseStatus = (
      responseStatusRank[item.responseStatus] >
      responseStatusRank[previous.responseStatus]
    )
      ? item.responseStatus
      : previous.responseStatus;
    byQuestionId.set(item.questionId, sanitizeQuestionEffectivenessRecord({
      ...previous,
      ...item,
      writerBlocked: Boolean(previous.writerBlocked || item.writerBlocked),
      recommendationOnly: Boolean(previous.recommendationOnly || item.recommendationOnly),
      askedAt: Math.min(
        ...[previous.askedAt, item.askedAt].filter((timestamp) => timestamp > 0)
      ),
      answeredAt: Math.max(previous.answeredAt || 0, item.answeredAt || 0),
      respondedAt: Math.max(previous.respondedAt || 0, item.respondedAt || 0),
      responseStatus,
      acceptedPageAt: Math.max(previous.acceptedPageAt || 0, item.acceptedPageAt || 0),
      acceptedPageCount: Math.max(
        previous.acceptedPageCount || 0,
        item.acceptedPageCount || 0
      ),
      blockResolvedAt: Math.max(previous.blockResolvedAt || 0, item.blockResolvedAt || 0),
      blockResolutionCount: Math.max(
        previous.blockResolutionCount || 0,
        item.blockResolutionCount || 0
      ),
      rescueFailedAt: Math.max(previous.rescueFailedAt || 0, item.rescueFailedAt || 0),
      failedRescueCount: Math.max(
        previous.failedRescueCount || 0,
        item.failedRescueCount || 0
      ),
      selectedMoveFamily: item.selectedMoveFamily || previous.selectedMoveFamily,
      offeredMoveFamilies: normalizeStringList(
        [
          ...(item.offeredMoveFamilies || []),
          ...(previous.offeredMoveFamilies || []),
        ],
        3,
        48
      ),
    }));
  }
  return [...byQuestionId.values()]
    .filter(Boolean)
    .sort((left, right) => (
      Number(right.updatedAt || right.answeredAt || right.askedAt || 0) -
      Number(left.updatedAt || left.answeredAt || left.askedAt || 0)
    ))
    .slice(0, QUESTION_EFFECTIVENESS_MAX);
}

function buildAnsweredQuestionEffectivenessRecord(learningContext, answeredAt = nowMs()) {
  return sanitizeQuestionEffectivenessRecord({
    questionId: learningContext?.questionId,
    targetField: learningContext?.targetField,
    targetLabel: learningContext?.targetLabel,
    question: learningContext?.question,
    anchor: learningContext?.anchor,
    actKey: learningContext?.actKey,
    sequenceKey: learningContext?.sequenceKey,
    writerBlocked: learningContext?.writerBlocked,
    selectedMoveFamily: learningContext?.selectedMoveFamily,
    offeredMoveFamilies: learningContext?.offeredMoveFamilies,
    askedAt: learningContext?.askedAt,
    answeredAt,
    respondedAt: answeredAt,
    responseStatus: "answered",
    updatedAt: answeredAt,
  });
}

function buildQuestionInteractionEffectivenessRecord(interaction) {
  if (!interaction) return null;
  const responseStatus = cleanText(interaction.responseStatus, 24).toLowerCase();
  const respondedAt = Math.max(0, Number(interaction.respondedAt || 0));
  return sanitizeQuestionEffectivenessRecord({
    questionId: interaction.questionId,
    targetField: interaction.targetField,
    targetLabel: interaction.targetLabel,
    question: interaction.question,
    anchor: interaction.anchor,
    actKey: interaction.actKey,
    sequenceKey: interaction.sequenceKey,
    writerBlocked: interaction.writerBlocked,
    recommendationOnly: interaction.recommendationOnly,
    selectedMoveFamily: interaction.selectedMoveFamily,
    offeredMoveFamilies: interaction.offeredMoveFamilies,
    askedAt: interaction.askedAt,
    answeredAt: responseStatus === "answered" ? respondedAt : 0,
    respondedAt,
    responseStatus,
    updatedAt: respondedAt || interaction.askedAt,
  });
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
  const authoritativeFields = mergeAuthoritativeProjectFields(
    source.authoritativeFields ?? source.authoritative_fields,
    []
  );
  if (authoritativeFields.length) out.authoritativeFields = authoritativeFields;
  const learnedFields = mergeLearnedProjectFields(
    source.learnedFields ?? source.learned_fields,
    []
  );
  if (learnedFields.length) out.learnedFields = learnedFields;
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
  const writerCanonFacts = value.writerCanonFacts ?? value.writer_canon_facts;
  if (Array.isArray(writerCanonFacts)) {
    out.writerCanonFacts = mergeWriterCanonFacts(writerCanonFacts, [], correction);
  }
  const authoritativeTargets = (out.authoritativeFields || []).map((item) => ({
    scope: "project",
    field: item.field,
    value: item.value,
  }));
  const writerTargets = (out.writerCanonFacts || [])
    .flatMap((item) => item.structuredTargets || []);
  Object.assign(
    out,
    applyWriterCanonTargetsToProject(out, [...authoritativeTargets, ...writerTargets])
  );
  const acceptedScenes = value.acceptedScenes ?? value.accepted_scenes;
  if (Array.isArray(acceptedScenes)) {
    out.acceptedScenes = mergeAcceptedSceneContinuity(acceptedScenes, [], correction);
  }
  const questionEffectiveness = value.questionEffectiveness ?? value.question_effectiveness;
  if (Array.isArray(questionEffectiveness)) {
    out.questionEffectiveness = mergeQuestionEffectivenessRecords(questionEffectiveness, []);
  }
  const storyMovePreferenceOverrides = normalizeStoryMovePreferenceOverrides(
    value.storyMovePreferenceOverrides ?? value.story_move_preference_overrides
  ).slice(0, STORY_MOVE_PREFERENCE_OVERRIDES_MAX);
  if (storyMovePreferenceOverrides.length) {
    out.storyMovePreferenceOverrides = storyMovePreferenceOverrides;
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

function correctionValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneCorrectionValue(value) {
  return value === undefined ? undefined : clone(value);
}

function correctionEntityKey(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const id = cleanText(value.id, 128).toLowerCase();
  if (id) return `id:${id}`;
  const projectId = cleanText(value.projectId ?? value.project_id, 96).toLowerCase();
  if (projectId) return `project:${projectId}`;
  const projectTitle = cleanText(value.projectTitle ?? value.project_title, 160).toLowerCase();
  if (projectTitle) return `project-title:${projectTitle}`;
  const name = cleanText(value.name ?? value.character, 80).toLowerCase();
  if (name) return `name:${name}`;
  return "";
}

function undoCorrectionArray(current = [], before = [], after = []) {
  const currentItems = Array.isArray(current) ? clone(current) : [];
  const beforeItems = Array.isArray(before) ? before : [];
  const afterItems = Array.isArray(after) ? after : [];
  const allObjects = [...currentItems, ...beforeItems, ...afterItems]
    .every((item) => item && typeof item === "object" && !Array.isArray(item));
  const allKeyed = allObjects && [...beforeItems, ...afterItems]
    .every((item) => Boolean(correctionEntityKey(item)));

  if (allKeyed) {
    const beforeByKey = new Map(beforeItems.map((item) => [correctionEntityKey(item), item]));
    const afterByKey = new Map(afterItems.map((item) => [correctionEntityKey(item), item]));
    const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
    const output = currentItems;
    for (const key of keys) {
      const beforeItem = beforeByKey.get(key);
      const afterItem = afterByKey.get(key);
      if (correctionValuesEqual(beforeItem, afterItem)) continue;
      const currentIndex = output.findIndex((item) => correctionEntityKey(item) === key);
      const currentItem = currentIndex >= 0 ? output[currentIndex] : undefined;
      const restored = undoCorrectionValue(currentItem, beforeItem, afterItem);
      if (restored === undefined || (
        restored && typeof restored === "object" && !Array.isArray(restored) && !Object.keys(restored).length
      )) {
        if (currentIndex >= 0) output.splice(currentIndex, 1);
      } else if (currentIndex >= 0) {
        output[currentIndex] = restored;
      } else {
        output.push(restored);
      }
    }
    return output;
  }

  const beforeKeys = new Set(beforeItems.map((item) => JSON.stringify(item)));
  const afterKeys = new Set(afterItems.map((item) => JSON.stringify(item)));
  const addedByCorrection = new Set([...afterKeys].filter((key) => !beforeKeys.has(key)));
  const removedByCorrection = beforeItems.filter((item) => !afterKeys.has(JSON.stringify(item)));
  const output = currentItems.filter((item) => !addedByCorrection.has(JSON.stringify(item)));
  const outputKeys = new Set(output.map((item) => JSON.stringify(item)));
  for (const item of removedByCorrection) {
    const key = JSON.stringify(item);
    if (outputKeys.has(key)) continue;
    output.push(clone(item));
    outputKeys.add(key);
  }
  return output;
}

function undoCorrectionValue(current, before, after) {
  if (correctionValuesEqual(before, after)) return cloneCorrectionValue(current);
  if (correctionValuesEqual(current, after)) return cloneCorrectionValue(before);
  if (Array.isArray(before) || Array.isArray(after)) {
    return undoCorrectionArray(current, before, after);
  }
  const beforeObject = before && typeof before === "object" && !Array.isArray(before);
  const afterObject = after && typeof after === "object" && !Array.isArray(after);
  if (!beforeObject && !afterObject) return cloneCorrectionValue(current);
  if (current === undefined && after !== undefined) return undefined;

  const currentObject = current && typeof current === "object" && !Array.isArray(current)
    ? clone(current)
    : {};
  const beforeValue = beforeObject ? before : {};
  const afterValue = afterObject ? after : {};
  const keys = new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)]);
  for (const key of keys) {
    if (correctionValuesEqual(beforeValue[key], afterValue[key])) continue;
    const restored = undoCorrectionValue(currentObject[key], beforeValue[key], afterValue[key]);
    if (restored === undefined) delete currentObject[key];
    else currentObject[key] = restored;
  }
  return currentObject;
}

function sanitizeCanonCorrectionReceipt(value = null, { includeSnapshots = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = cleanText(value.id, 96);
  const matchedFacts = normalizeStringList(value.matchedFacts ?? value.matched_facts, 8, 220);
  if (!id || !matchedFacts.length) return null;
  const rawStatus = cleanText(value.status, 24).toLowerCase();
  const status = rawStatus === "undone" ? "undone" : "active";
  const out = {
    id,
    status,
    projectId: cleanText(value.projectId ?? value.project_id, 96),
    projectTitle: cleanText(value.projectTitle ?? value.project_title, 160),
    correctionText: cleanText(value.correctionText ?? value.correction_text, 600),
    matchedFacts,
    replacementFacts: normalizeStringList(
      value.replacementFacts ?? value.replacement_facts,
      8,
      WRITER_CANON_FACT_MAX_CHARS
    ),
    replacementFactIds: normalizeStringList(
      value.replacementFactIds ?? value.replacement_fact_ids,
      8,
      96
    ),
    structuredUpdates: normalizeStringList(
      value.structuredUpdates ?? value.structured_updates,
      WRITER_CANON_TARGETS_MAX,
      260
    ),
    correctionMemoryId: cleanText(value.correctionMemoryId ?? value.correction_memory_id, 80),
    createdAt: Math.max(0, Number(value.createdAt ?? value.created_at ?? 0)),
    undoneAt: Math.max(0, Number(value.undoneAt ?? value.undone_at ?? 0)),
  };
  if (includeSnapshots) {
    const beforeState = value.beforeState && typeof value.beforeState === "object"
      ? clone(value.beforeState)
      : null;
    const afterState = value.afterState && typeof value.afterState === "object"
      ? clone(value.afterState)
      : null;
    if (!beforeState || !afterState) return null;
    out.beforeState = beforeState;
    out.afterState = afterState;
  }
  return out;
}

function sanitizeCanonCorrectionAmbiguity(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = cleanText(value.id, 96);
  const candidateFacts = normalizeStringList(
    value.candidateFacts ?? value.candidate_facts,
    8,
    220
  );
  if (!id || candidateFacts.length < 2) return null;
  const rawStatus = cleanText(value.status, 24).toLowerCase();
  const status = rawStatus === "resolved" ? "resolved" : "pending";
  const legacySelectedFact = cleanText(value.selectedFact ?? value.selected_fact, 220);
  const selectedFacts = normalizeStringList(
    value.selectedFacts ?? value.selected_facts ?? (legacySelectedFact ? [legacySelectedFact] : []),
    8,
    220
  );
  const receiptId = cleanText(value.receiptId ?? value.receipt_id, 96);
  return {
    id,
    status,
    projectId: cleanText(value.projectId ?? value.project_id, 96),
    projectTitle: cleanText(value.projectTitle ?? value.project_title, 160),
    correctionText: cleanText(value.correctionText ?? value.correction_text, 600),
    candidateFacts,
    correctionMemoryId: cleanText(value.correctionMemoryId ?? value.correction_memory_id, 80),
    selectedFact: status === "resolved" ? (selectedFacts[0] || legacySelectedFact) : "",
    selectedFacts: status === "resolved" ? selectedFacts : [],
    receiptId: status === "resolved" ? receiptId : "",
    createdAt: Math.max(0, Number(value.createdAt ?? value.created_at ?? 0)),
    resolvedAt: status === "resolved"
      ? Math.max(0, Number(value.resolvedAt ?? value.resolved_at ?? 0))
      : 0,
  };
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
  return collectCharacterBibleItems(terms, PROJECT_CORRECTED_TERMS_MAX, 120).some((term) => {
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

function sanitizeAuthoritativeCharacterField(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = normalizeWriterCanonTargetField(value.field);
  if (!CHARACTER_ARC_FIELDS.includes(field)) return null;
  const maxChars = field === "act" ? 80 : CHARACTER_ARC_FIELD_MAX_CHARS;
  const fieldValue = cleanText(value.value ?? value.fact ?? value.text, maxChars);
  if (!fieldValue) return null;
  const sourceCorrectionId = cleanText(
    value.sourceCorrectionId ?? value.source_correction_id ?? value.receiptId ?? value.receipt_id,
    96
  );
  const correctionText = cleanText(value.correctionText ?? value.correction_text, 600);
  const replacesFacts = normalizeStringList(
    value.replacesFacts ?? value.replaces_facts,
    8,
    220
  );
  const rawCreatedAt = Number(value.createdAt ?? value.created_at ?? nowMs());
  const createdAt = Number.isFinite(rawCreatedAt) && rawCreatedAt > 0 ? rawCreatedAt : nowMs();
  const id = cleanText(value.id, 96) || `character_field_${stableHash([
    field,
    fieldValue.toLowerCase(),
    sourceCorrectionId,
  ].join("|"))}`;
  return {
    id,
    field,
    value: fieldValue,
    source: WRITER_CANON_AUTHORITY,
    sourceCorrectionId,
    correctionText,
    replacesFacts,
    createdAt,
  };
}

function mergeAuthoritativeCharacterFields(incoming = [], existing = []) {
  const newest = (Array.isArray(incoming) ? incoming : [])
    .map(sanitizeAuthoritativeCharacterField)
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const retiredFields = new Set(newest.map((item) => item.field));
  const older = (Array.isArray(existing) ? existing : [])
    .map(sanitizeAuthoritativeCharacterField)
    .filter((item) => item && !retiredFields.has(item.field))
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  const out = [];
  const seenFields = new Set();
  for (const item of [...newest, ...older]) {
    if (seenFields.has(item.field)) continue;
    seenFields.add(item.field);
    out.push(item);
    if (out.length >= CHARACTER_BIBLE_AUTHORITATIVE_FIELDS_MAX) break;
  }
  return out;
}

function applyAuthoritativeCharacterFields(arc = null, fields = []) {
  const current = sanitizeCharacterArcState(arc) || { schemaVersion: 1 };
  for (const item of mergeAuthoritativeCharacterFields(fields, [])) {
    current[item.field] = item.value;
  }
  return sanitizeCharacterArcState(current);
}

function buildAuthoritativeCharacterFields({
  character = "",
  targets = [],
  sourceCorrectionId = "",
  correctionText = "",
  replacesFacts = [],
  createdAt = nowMs(),
} = {}) {
  const cleanCharacter = normalizeCharacterName(character);
  if (!cleanCharacter) return [];
  return mergeWriterCanonTargets(targets)
    .filter((target) => (
      target.scope === "character" &&
      target.character.toLowerCase() === cleanCharacter.toLowerCase()
    ))
    .map((target) => sanitizeAuthoritativeCharacterField({
      id: `character_field_${stableHash([
        cleanCharacter.toLowerCase(),
        target.field,
        target.value.toLowerCase(),
        sourceCorrectionId,
      ].join("|"))}`,
      field: target.field,
      value: target.value,
      sourceCorrectionId,
      correctionText,
      replacesFacts,
      createdAt,
    }))
    .filter(Boolean);
}

function sanitizeLearnedCharacterField(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const field = normalizeWriterCanonTargetField(value.field) || cleanText(value.field, 64);
  if (!CHARACTER_ARC_FIELDS.includes(field)) return null;
  const maxChars = field === "act" ? 80 : CHARACTER_ARC_FIELD_MAX_CHARS;
  const fieldValue = cleanText(value.value ?? value.fact ?? value.text, maxChars);
  if (!fieldValue) return null;
  const questionId = cleanText(value.questionId ?? value.question_id, 120);
  const question = cleanText(value.question, 260);
  const targetLabel = cleanText(value.targetLabel ?? value.target_label, 120);
  const anchor = cleanText(value.anchor, 180);
  const rawLearnedAt = Number(
    value.learnedAt ?? value.learned_at ?? value.createdAt ?? value.created_at ?? nowMs()
  );
  const learnedAt = Number.isFinite(rawLearnedAt) && rawLearnedAt > 0
    ? rawLearnedAt
    : nowMs();
  const rawUpdatedAt = Number(value.updatedAt ?? value.updated_at ?? learnedAt);
  const updatedAt = Number.isFinite(rawUpdatedAt) && rawUpdatedAt > 0
    ? Math.max(learnedAt, rawUpdatedAt)
    : learnedAt;
  const id = cleanText(value.id, 96) || `character_learning_${stableHash([
    field,
    fieldValue.toLowerCase(),
    questionId,
  ].join("|"))}`;
  return {
    id,
    field,
    value: fieldValue,
    source: SCREENPLAY_LEARNING_SOURCE,
    questionId,
    question,
    targetLabel,
    anchor,
    learnedAt,
    updatedAt,
  };
}

function mergeLearnedCharacterFields(incoming = [], existing = []) {
  const newest = (Array.isArray(incoming) ? incoming : [])
    .map(sanitizeLearnedCharacterField)
    .filter(Boolean)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const retiredFields = new Set(newest.map((item) => item.field));
  const older = (Array.isArray(existing) ? existing : [])
    .map(sanitizeLearnedCharacterField)
    .filter((item) => item && !retiredFields.has(item.field))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const out = [];
  const seen = new Set();
  for (const item of [...newest, ...older]) {
    if (seen.has(item.field)) continue;
    seen.add(item.field);
    out.push(item);
    if (out.length >= CHARACTER_BIBLE_LEARNED_FIELDS_MAX) break;
  }
  return out;
}

function applyLearnedCharacterFields(arc = null, fields = []) {
  const current = sanitizeCharacterArcState(arc) || { schemaVersion: 1 };
  for (const item of mergeLearnedCharacterFields(fields, [])) {
    current[item.field] = item.value;
  }
  return sanitizeCharacterArcState(current);
}

function applyWriterCanonCharacterTargetsToRecords(characters = [], {
  targets = [],
  projectId = "",
  projectTitle = "",
  sourceCorrectionId = "",
  correctionText = "",
  replacesFacts = [],
  createdAt = nowMs(),
} = {}) {
  const out = Array.isArray(characters) ? clone(characters) : [];
  const names = mergeWriterCanonTargets(targets)
    .filter((target) => target.scope === "character")
    .map((target) => target.character);
  for (const character of normalizeStringList(names, 8, 48)) {
    const authoritativeFields = buildAuthoritativeCharacterFields({
      character,
      targets,
      sourceCorrectionId,
      correctionText,
      replacesFacts,
      createdAt,
    });
    if (!authoritativeFields.length) continue;
    const correction = extractCharacterMemoryCorrection(correctionText, character);
    const replacementFact = normalizeWriterCanonAssertion(correctionText);
    const incomingBible = sanitizeCharacterBibleDelta({
      canon: replacementFact && textMentionsName(replacementFact, character)
        ? [replacementFact]
        : [],
      corrections: [
        `Authoritative writer correction for ${character}: ${replacementFact || cleanText(correctionText, 220)}`,
      ],
      authoritativeFields,
      correctedTerms: collectCharacterBibleItems(
        [...(correction?.correctedTerms || []), ...replacesFacts],
        CHARACTER_BIBLE_TERMS_MAX,
        120
      ),
      correctionReplacements: correction?.correctionReplacements || [],
      updatedAt: createdAt,
    });
    if (!incomingBible) continue;
    const targetIdentity = projectIdentity({ projectId, projectTitle });
    let index = out.findIndex((item) => {
      if (normalizeCharacterName(item?.name).toLowerCase() !== character.toLowerCase()) return false;
      const identity = projectIdentity(item, "metadata");
      if (targetIdentity.projectId) return identity.projectId === targetIdentity.projectId;
      if (targetIdentity.projectTitle) return identity.projectTitle === targetIdentity.projectTitle;
      return !identity.projectId && !identity.projectTitle;
    });
    if (index < 0 && (targetIdentity.projectId || targetIdentity.projectTitle)) {
      index = out.findIndex((item) => {
        if (normalizeCharacterName(item?.name).toLowerCase() !== character.toLowerCase()) return false;
        const identity = projectIdentity(item, "metadata");
        return !identity.projectId && !identity.projectTitle;
      });
    }
    if (index < 0) {
      out.push({
        name: character,
        voice: "",
        first_seen: createdAt,
        last_referenced: createdAt,
        tags: ["screenplay", "character-bible"],
        source: "writer_correction",
        metadata: {
          ...(cleanText(projectId, 96) ? { projectId: cleanText(projectId, 96) } : {}),
          ...(cleanText(projectTitle, 160) ? { projectTitle: cleanText(projectTitle, 160) } : {}),
        },
        bible: incomingBible,
      });
      continue;
    }
    const mergedBible = mergeCharacterBible(out[index].bible, incomingBible);
    out[index] = {
      ...out[index],
      last_referenced: createdAt,
      source: "writer_correction",
      tags: normalizeStringList(
        [...(Array.isArray(out[index].tags) ? out[index].tags : []), "screenplay", "character-bible"],
        12,
        48
      ),
      metadata: {
        ...(out[index].metadata || {}),
        ...(cleanText(projectId, 96) ? { projectId: cleanText(projectId, 96) } : {}),
        ...(cleanText(projectTitle, 160) ? { projectTitle: cleanText(projectTitle, 160) } : {}),
      },
      bible: mergedBible,
      ...(out[index].traits
        ? { traits: repairCharacterTraitsForCorrection(out[index].traits, mergedBible) }
        : {}),
    };
  }
  return out
    .sort((a, b) => Number(b.last_referenced || 0) - Number(a.last_referenced || 0))
    .slice(0, CHARACTERS_MAX);
}

function sanitizeCharacterBibleDelta(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const canon = collectCharacterBibleItems(value.canon ?? value.facts, CHARACTER_BIBLE_CANON_MAX, 220);
  const corrections = collectCharacterBibleItems(value.corrections, CHARACTER_BIBLE_CORRECTIONS_MAX, 260);
  const authoritativeFields = mergeAuthoritativeCharacterFields(
    value.authoritativeFields ?? value.authoritative_fields,
    []
  );
  const learnedFields = mergeLearnedCharacterFields(
    value.learnedFields ?? value.learned_fields,
    []
  );
  const arc = applyAuthoritativeCharacterFields(
    applyLearnedCharacterFields(
      value.arc ?? value.characterArc ?? value.character_arc,
      learnedFields
    ),
    authoritativeFields
  );
  const correctedTerms = collectCharacterBibleItems(value.correctedTerms, CHARACTER_BIBLE_TERMS_MAX, 120)
    .map((term) => normalizeCharacterCorrectionTerm(term, 120))
    .filter(Boolean);
  const correctionReplacements = collectCharacterBibleItems(
    value.correctionReplacements,
    CHARACTER_BIBLE_TERMS_MAX,
    180
  ).filter((item) => parseCharacterBibleReplacement(item));
  if (
    !canon.length &&
    !corrections.length &&
    !arc &&
    !correctedTerms.length &&
    !correctionReplacements.length &&
    !authoritativeFields.length &&
    !learnedFields.length
  ) return null;
  return {
    schemaVersion: 1,
    canon,
    corrections,
    ...(arc ? { arc } : {}),
    authoritativeFields,
    learnedFields,
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
    authoritativeFields: [],
    learnedFields: [],
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
  const authoritativeFields = mergeAuthoritativeCharacterFields(
    incoming.authoritativeFields,
    existing.authoritativeFields
  );
  const learnedFields = mergeLearnedCharacterFields(
    incoming.learnedFields,
    existing.learnedFields
  );
  const arc = applyAuthoritativeCharacterFields(
    applyLearnedCharacterFields(
      mergeCharacterArcState(existing.arc, incoming.arc, hasCorrection ? correction : null),
      learnedFields
    ),
    authoritativeFields
  );
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
    authoritativeFields,
    learnedFields,
    correctedTerms: correction.correctedTerms,
    correctionReplacements: correction.correctionReplacements,
    updatedAt: Math.max(Number(existing.updatedAt || 0), Number(incoming.updatedAt || 0), nowMs()),
  });
}

export function buildCharacterFieldProvenance(bible = null) {
  const cleanBible = sanitizeCharacterBibleDelta(bible);
  if (!cleanBible) return [];
  const learnedByField = new Map(
    mergeLearnedCharacterFields(cleanBible.learnedFields, [])
      .map((item) => [item.field, item])
  );
  const authoritativeByField = new Map(
    mergeAuthoritativeCharacterFields(cleanBible.authoritativeFields, [])
      .map((item) => [item.field, item])
  );
  const rows = [];
  for (const field of CHARACTER_ARC_FIELDS) {
    const learned = learnedByField.get(field) || null;
    const authoritative = authoritativeByField.get(field) || null;
    if (!learned && !authoritative) continue;
    const value = cleanText(
      authoritative?.value || learned?.value || readArcField(cleanBible.arc, field),
      field === "act" ? 80 : CHARACTER_ARC_FIELD_MAX_CHARS
    );
    if (!value) continue;
    rows.push({
      id: authoritative?.id || learned?.id || `character_field_${field}`,
      field,
      value,
      learnedValue: learned?.value || "",
      source: authoritative?.source || learned?.source || SCREENPLAY_LEARNING_SOURCE,
      status: authoritative ? "corrected" : "current",
      questionId: learned?.questionId || "",
      question: learned?.question || "",
      targetLabel: learned?.targetLabel || "",
      anchor: learned?.anchor || "",
      sourceCorrectionId: authoritative?.sourceCorrectionId || "",
      correctionText: authoritative?.correctionText || "",
      learnedAt: Math.max(0, Number(learned?.learnedAt || 0)),
      updatedAt: Math.max(
        0,
        Number(authoritative?.createdAt || learned?.updatedAt || learned?.learnedAt || 0)
      ),
    });
  }
  return rows.slice(0, CHARACTER_BIBLE_LEARNED_FIELDS_MAX);
}

export function buildProjectFieldProvenance(project = null) {
  const cleanProject = sanitizeProjectContinuity(project);
  if (!cleanProject) return [];
  const learnedByField = new Map();
  for (const item of mergeLearnedProjectFields(cleanProject.learnedFields, [])) {
    if (!learnedByField.has(item.field)) learnedByField.set(item.field, item);
  }
  const authoritativeByField = new Map();
  for (const item of mergeAuthoritativeProjectFields(cleanProject.authoritativeFields, [])) {
    if (!authoritativeByField.has(item.field)) authoritativeByField.set(item.field, item);
  }
  const orderedFields = [
    ...new Set([
      ...Object.values(SCREENPLAY_LEARNING_PROJECT_FIELDS).map((item) => item.field),
      ...authoritativeByField.keys(),
    ]),
  ];
  const rows = [];
  for (const field of orderedFields) {
    const learned = learnedByField.get(field) || null;
    const authoritative = authoritativeByField.get(field) || null;
    if (!learned && !authoritative) continue;
    const currentValue = Array.isArray(cleanProject[field])
      ? cleanProject[field].find((item) => (
        !learned || cleanText(item, 240).toLowerCase() === learned.value.toLowerCase()
      )) || cleanProject[field][0]
      : cleanProject[field];
    const value = cleanText(authoritative?.value || currentValue || learned?.value, 240);
    if (!value) continue;
    rows.push({
      id: authoritative?.id || learned?.id || `project_field_${field}`,
      field,
      value,
      learnedValue: learned?.value || "",
      source: authoritative?.source || learned?.source || SCREENPLAY_LEARNING_SOURCE,
      status: authoritative ? "corrected" : "current",
      questionId: learned?.questionId || "",
      question: learned?.question || "",
      targetLabel: learned?.targetLabel || "",
      anchor: learned?.anchor || "",
      sourceCorrectionId: authoritative?.sourceCorrectionId || "",
      correctionText: authoritative?.correctionText || "",
      learnedAt: Math.max(0, Number(learned?.learnedAt || 0)),
      updatedAt: Math.max(
        0,
        Number(authoritative?.createdAt || learned?.updatedAt || learned?.learnedAt || 0)
      ),
    });
  }
  return rows.slice(0, PROJECT_LEARNED_FIELDS_MAX);
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

const ACCEPTED_PAGE_CAUSAL_PATTERNS = Object.freeze({
  decisions: Object.freeze([
    /\b(?:chooses?|decides?|refuses?|commits?|agrees?|accepts?|rejects?|quits?|surrenders?|votes?|confesses?|admits?)\b/i,
    /\b(?:hands? (?:over|back)|turns? (?:himself|herself|themself|themselves) in|walks? away for good)\b/i,
    /\bI\s+(?:choose|decide|refuse|will|won't|accept|reject|quit|confess|admit)\b/i,
  ]),
  revelations: Object.freeze([
    /\b(?:reveals?|confesses?|admits?|the truth is|turns out|comes clean|was behind it)\b/i,
    /\bI\s+(?:lied|stole|forged|betrayed|killed|hid|covered it up)\b/i,
  ]),
  relationshipChanges: Object.freeze([
    /\b(?:forgives?|betrays?|abandons?|disowns?|embraces?|kisses?|breaks? up|ends? (?:the relationship|the marriage|the engagement))\b/i,
    /\b(?:chooses?|picks?)\s+.{2,80}\s+over\s+.{2,80}\b/i,
    /\b(?:trusts?|protects?)\s+.{2,80}\s+(?:instead of|over)\s+.{2,80}\b/i,
  ]),
  irreversibleConsequences: Object.freeze([
    /\b(?:dies?|died|is dead|was killed|is killed|was arrested|is arrested|burn(?:s|ed)?|destroy(?:s|ed)?|shred(?:s|ded)?|broadcasts?|broadcast|publish(?:es|ed)?|shoots?|shot|stabs?|stabbed)\b/i,
    /\b(?:sets?|set) .{0,60} on fire|\bhand(?:s|ed)? (?:the )?(?:evidence|proof|recording|weapon) over|\bturn(?:s|ed)? (?:himself|herself|themself|themselves) in\b/i,
    /\bsign(?:s|ed)? (?:the )?(?:divorce|confession|deed|contract|plea)|\bwalk(?:s|ed)? away for good|\b(?:leave(?:s|d)?|left) forever\b/i,
  ]),
});

function acceptedPageCausalEvidenceLines(text = "") {
  const out = [];
  let speaker = "";
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const raw = String(rawLine || "").trim();
    if (!raw) {
      speaker = "";
      continue;
    }
    if (/^(?:INT\.|EXT\.|INT\/EXT\.|INT\.\/EXT\.|CUT TO:|FADE (?:IN|OUT)|SMASH CUT:|DISSOLVE TO:)/i.test(raw)) {
      speaker = "";
      continue;
    }
    if (/^[A-Z][A-Z0-9 .'-]{1,48}(?:\s*\([^\n]{1,24}\))?$/.test(raw) && !/[.!?]$/.test(raw)) {
      speaker = cleanText(raw.replace(/\s*\([^\n]{1,24}\)$/, ""), 72);
      continue;
    }
    if (/^\([^\n]{1,80}\)$/.test(raw)) continue;
    const line = cleanText(raw, 220);
    if (!line || line.length < 4) continue;
    out.push({
      text: line,
      evidence: cleanText(speaker ? `${speaker}: ${line}` : line, 220),
    });
  }
  return out;
}

function extractAcceptedPageCausalFacts(text = "") {
  const out = {
    decisions: [],
    revelations: [],
    relationshipChanges: [],
    irreversibleConsequences: [],
  };
  for (const line of acceptedPageCausalEvidenceLines(text)) {
    for (const [field, patterns] of Object.entries(ACCEPTED_PAGE_CAUSAL_PATTERNS)) {
      if (!patterns.some((pattern) => pattern.test(line.text))) continue;
      if (out[field].some((item) => item.toLowerCase() === line.evidence.toLowerCase())) continue;
      out[field].push(line.evidence);
      if (out[field].length > 4) out[field].length = 4;
    }
  }
  return out;
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
  const causalFacts = extractAcceptedPageCausalFacts(rawPage);
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
    decisions: normalizeStringList(
      [...normalizeStringList(continuity.decisions, 4, 220), ...causalFacts.decisions],
      4,
      220
    ),
    revelations: normalizeStringList(
      [...normalizeStringList(continuity.revelations, 4, 220), ...causalFacts.revelations],
      4,
      220
    ),
    relationshipChanges: normalizeStringList(
      [
        ...normalizeStringList(continuity.relationshipChanges ?? continuity.relationship_changes, 4, 220),
        ...causalFacts.relationshipChanges,
      ],
      4,
      220
    ),
    irreversibleConsequences: normalizeStringList(
      [
        ...normalizeStringList(
          continuity.irreversibleConsequences ?? continuity.irreversible_consequences,
          4,
          220
        ),
        ...causalFacts.irreversibleConsequences,
      ],
      4,
      220
    ),
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
    ...(scene.decisions || []),
    ...(scene.revelations || []),
    ...(scene.relationshipChanges || []),
    ...(scene.irreversibleConsequences || []),
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
  const activeAct = normalizeActLabel(project.act);
  if (!openSetups.length && activeAct !== "Act III") return null;
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

function acceptedCausalFactScore(record = {}, query = "", currentAct = "") {
  const kind = cleanText(record.kind, 48);
  const age = Math.max(0, Math.round(Number(record.ageInScenes || 0)));
  const fact = cleanText(record.fact, 220).toLowerCase();
  const queryTokens = new Set(tokenizeMemoryText(query).map(normalizeSemanticTerm).filter(Boolean));
  const factTokens = new Set(tokenizeMemoryText(fact).map(normalizeSemanticTerm).filter(Boolean));
  let queryHits = 0;
  for (const token of queryTokens) {
    if (factTokens.has(token)) queryHits += 1;
  }
  let score = 0;
  if (record.authority === WRITER_CANON_AUTHORITY || kind === "writer_correction") {
    score = 120 + Math.max(0, 24 - age);
  } else if (kind === "irreversible_consequence") score = 64 + Math.min(24, age);
  else if (kind === "relationship_change") score = 54 + Math.max(0, 22 - age * 2);
  else if (kind === "revelation") score = 52 + Math.max(0, 16 - age);
  else score = 48 + Math.max(0, 16 - age);
  score += queryHits * 12;
  const sourceAct = normalizeActLabel(record.sourceAct);
  const activeAct = normalizeActLabel(currentAct);
  if (activeAct && sourceAct === activeAct) score += 5;
  else if (activeAct && sourceAct) score += 8;
  return score;
}

function selectAcceptedCausalFactsForPrompt(project = null, {
  query = "",
  maxItems = ACCEPTED_CAUSAL_FACT_PROMPT_MAX,
} = {}) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return [];
  const scenes = (Array.isArray(project.acceptedScenes) ? project.acceptedScenes : [])
    .map(sanitizeAcceptedSceneContinuity)
    .filter(Boolean)
    .sort((a, b) => Number(b.acceptedAt || b.updatedAt || 0) - Number(a.acceptedAt || a.updatedAt || 0));
  const records = [];
  const seen = new Set();
  const writerCanonFacts = mergeWriterCanonFacts(project.writerCanonFacts, [], {
    correctedTerms: project.correctedTerms,
    correctionReplacements: project.correctionReplacements,
  });
  writerCanonFacts.forEach((item, index) => {
    const key = `writer_correction:${acceptedCanonFactKey(item.fact)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const record = {
      kind: "writer_correction",
      fact: item.fact,
      authority: WRITER_CANON_AUTHORITY,
      sourceCorrectionId: item.receiptId || item.id,
      replacesFacts: item.replacesFacts,
      structuredTargets: item.structuredTargets,
      structuredUpdates: writerCanonStructuredUpdateLabels(item.structuredTargets),
      createdAt: item.createdAt,
      ageInScenes: index,
    };
    records.push({
      ...record,
      score: acceptedCausalFactScore(record, query, project.act),
    });
  });
  scenes.forEach((scene, ageInScenes) => {
    for (const [kind, field] of ACCEPTED_CAUSAL_FACT_FIELDS) {
      for (const fact of normalizeStringList(scene[field], 4, 220)) {
        const key = `${kind}:${fact.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const record = {
          kind,
          fact,
          sourceSceneHeading: cleanText(scene.sceneHeading || scene.sceneLabel, 140),
          sourceAct: normalizeActLabel(scene.act) || cleanText(scene.act, 80),
          ageInScenes,
        };
        records.push({
          ...record,
          score: acceptedCausalFactScore(record, query, project.act),
        });
      }
    }
  });
  if (!records.length) return [];
  const ranked = [...records].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.ageInScenes - b.ageInScenes;
  });
  const requestedLimit = Number(maxItems);
  const limit = Math.max(
    1,
    Math.min(
      ACCEPTED_CAUSAL_FACT_PROMPT_MAX,
      Number.isFinite(requestedLimit) ? Math.round(requestedLimit) : ACCEPTED_CAUSAL_FACT_PROMPT_MAX
    )
  );
  const selected = [];
  const selectedKeys = new Set();
  for (const kind of ["writer_correction", ...ACCEPTED_CAUSAL_FACT_FIELDS.map(([value]) => value)]) {
    const entry = ranked.find((item) => item.kind === kind);
    if (!entry) continue;
    selected.push(entry);
    selectedKeys.add(`${entry.kind}:${entry.fact.toLowerCase()}`);
  }
  for (const entry of ranked) {
    if (selected.length >= limit) break;
    const key = `${entry.kind}:${entry.fact.toLowerCase()}`;
    if (selectedKeys.has(key)) continue;
    selected.push(entry);
    selectedKeys.add(key);
  }
  return selected
    .sort((a, b) => b.score - a.score || a.ageInScenes - b.ageInScenes)
    .slice(0, limit)
    .map(({ score: _score, ...record }) => record);
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
  const canonCorrectionReceipts = (Array.isArray(rec.canonCorrectionReceipts)
    ? rec.canonCorrectionReceipts
    : [])
    .map((item) => sanitizeCanonCorrectionReceipt(item))
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, CANON_CORRECTION_RECEIPTS_MAX);
  if (canonCorrectionReceipts.length) out.canonCorrectionReceipts = canonCorrectionReceipts;
  const canonCorrectionAmbiguities = (Array.isArray(rec.canonCorrectionAmbiguities)
    ? rec.canonCorrectionAmbiguities
    : [])
    .map(sanitizeCanonCorrectionAmbiguity)
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, CANON_CORRECTION_AMBIGUITIES_MAX);
  if (canonCorrectionAmbiguities.length) out.canonCorrectionAmbiguities = canonCorrectionAmbiguities;
  if (rec.tone && typeof rec.tone === "object" && !Array.isArray(rec.tone)) {
    out.tone = clone(rec.tone);
  }
  if (rec.habits && typeof rec.habits === "object" && !Array.isArray(rec.habits)) {
    out.habits = clone(rec.habits);
  }
  return out;
}

function stableRevisionJSON(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(stableRevisionJSON).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableRevisionJSON(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const CREATIVE_MEMORY_REVISION_EPISODIC_MAX = 72;

function creativeMemoryRevisionValue(value) {
  if (Array.isArray(value)) {
    const items = value
      .map(creativeMemoryRevisionValue)
      .filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (["userId", "version", "updatedAt"].includes(key)) continue;
      const item = creativeMemoryRevisionValue(value[key]);
      if (item !== undefined) out[key] = item;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}

export function buildCreativeMemoryRevision(rec = null) {
  const ledger = sanitizeCreativeMemoryLedgerRecord(rec, {
    includeSuperseded: true,
    maxEpisodicMemories: CREATIVE_MEMORY_REVISION_EPISODIC_MAX,
  });
  const revisionValue = creativeMemoryRevisionValue(ledger) || {};
  const digest = createHash("sha256")
    .update(stableRevisionJSON(revisionValue))
    .digest("hex")
    .slice(0, 24);
  return `cm_${digest}`;
}

function creativeMemoryRevisionConflict(expectedRevision, currentRevision) {
  const error = new Error("Creative memory changed on another device.");
  error.code = "stale_creative_memory_revision";
  error.expectedRevision = expectedRevision;
  error.currentRevision = currentRevision;
  return error;
}

export function isCreativeMemoryRevisionConflict(error) {
  return String(error?.code || "") === "stale_creative_memory_revision";
}

function assertCreativeMemoryRevision(current, expectedRevision = "") {
  const cleanExpectedRevision = cleanText(expectedRevision, 96);
  const currentRevision = buildCreativeMemoryRevision(current);
  if (cleanExpectedRevision && cleanExpectedRevision !== currentRevision) {
    throw creativeMemoryRevisionConflict(cleanExpectedRevision, currentRevision);
  }
  return currentRevision;
}

function correctionStateSnapshot(rec = null, { projectId = "", projectTitle = "" } = {}) {
  const record = rec && typeof rec === "object" ? rec : {};
  const project = selectProjectContinuity(record.projects, { projectId, projectTitle });
  const episodicMemories = scopeRecordsToProject(
    (Array.isArray(record.episodicMemories) ? record.episodicMemories : [])
      .map(sanitizeEpisodicMemoryItem)
      .filter(Boolean),
    { projectId, projectTitle }
  ).map((memory) => {
    const item = clone(memory);
    delete item.embedding;
    delete item.semanticFingerprint;
    return item;
  });
  return {
    projects: project ? [clone(project)] : [],
    characters: Array.isArray(record.characters) ? clone(record.characters) : [],
    episodicMemories,
    canonCorrectionAmbiguities: (Array.isArray(record.canonCorrectionAmbiguities)
      ? record.canonCorrectionAmbiguities
      : [])
      .map(sanitizeCanonCorrectionAmbiguity)
      .filter((item) => {
        const identity = projectIdentity(item);
        const targetId = cleanText(projectId, 96).toLowerCase();
        const targetTitle = cleanText(projectTitle, 160).toLowerCase();
        if (targetId && identity.projectId) return identity.projectId === targetId;
        if (targetTitle && identity.projectTitle) return identity.projectTitle === targetTitle;
        return !targetId && !targetTitle;
      }),
  };
}

function restoreCorrectionState(rec = {}, receipt = null) {
  const cleanReceipt = sanitizeCanonCorrectionReceipt(receipt, { includeSnapshots: true });
  if (!cleanReceipt) return rec;
  const before = cleanReceipt.beforeState;
  const after = cleanReceipt.afterState;
  rec.projects = undoCorrectionArray(rec.projects, before.projects, after.projects);
  rec.characters = undoCorrectionArray(rec.characters, before.characters, after.characters);
  rec.episodicMemories = undoCorrectionArray(
    rec.episodicMemories,
    before.episodicMemories,
    after.episodicMemories
  ).filter((memory) => (
    cleanText(memory?.id, 80) !== cleanReceipt.correctionMemoryId
  ));
  rec.canonCorrectionAmbiguities = undoCorrectionArray(
    rec.canonCorrectionAmbiguities,
    before.canonCorrectionAmbiguities,
    after.canonCorrectionAmbiguities
  );
  return rec;
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
  if (isCorrectionTurnText(text)) tags.push(CORRECTION_TAG);
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

function sanitizeScreenplayLearningContext(value, {
  projectId = "",
  projectTitle = "",
} = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const targetField = cleanText(value.targetField ?? value.target_field, 64);
  const targetLabel = cleanText(value.targetLabel ?? value.target_label, 120);
  const question = cleanText(value.question, 260);
  if (!targetField || !targetLabel || !question) return null;
  const contextProjectId = cleanText(value.projectId ?? value.project_id, 96);
  const contextProjectTitle = cleanText(value.projectTitle ?? value.project_title, 160);
  const cleanProjectId = cleanText(projectId, 96);
  const cleanProjectTitle = cleanText(projectTitle, 160);
  if (
    contextProjectId &&
    cleanProjectId &&
    contextProjectId.toLowerCase() !== cleanProjectId.toLowerCase()
  ) return null;
  if (
    !contextProjectId &&
    contextProjectTitle &&
    cleanProjectTitle &&
    contextProjectTitle.toLowerCase() !== cleanProjectTitle.toLowerCase()
  ) return null;
  const provisionalOptions = sanitizeProvisionalScreenplayOptions(
    value.provisionalOptions ?? value.provisional_options
  );
  const selectedOptionId = cleanText(
    value.selectedOptionId ?? value.selected_option_id,
    32
  );
  const selectedOption = provisionalOptions.find((option) => option.id === selectedOptionId);
  const selectedMoveFamily = normalizeStoryMoveFamily(
    selectedOption?.moveFamily ??
    value.selectedMoveFamily ??
    value.selected_move_family
  );
  const offeredMoveFamilies = provisionalOptions
    .map((option) => normalizeStoryMoveFamily(option.moveFamily))
    .filter((family, index, values) => family && values.indexOf(family) === index);
  return {
    questionId: cleanText(value.questionId ?? value.question_id, 120),
    projectId: contextProjectId || cleanProjectId,
    projectTitle: contextProjectTitle || cleanProjectTitle,
    targetField,
    targetLabel,
    anchor: cleanText(value.anchor, 180),
    question,
    authority: "writer_clarification",
    actKey: ["act1", "act2", "act3"].includes(
      cleanText(value.actKey ?? value.act_key, 24).toLowerCase()
    )
      ? cleanText(value.actKey ?? value.act_key, 24).toLowerCase()
      : "",
    sequenceKey: SCREENPLAY_QUESTION_SEQUENCE_KEYS.has(
      cleanText(value.sequenceKey ?? value.sequence_key, 32).toLowerCase()
    )
      ? cleanText(value.sequenceKey ?? value.sequence_key, 32).toLowerCase()
      : "",
    writerBlocked: Boolean(value.writerBlocked ?? value.writer_blocked),
    recommendationOnly: Boolean(value.recommendationOnly ?? value.recommendation_only),
    provisionalOptions,
    selectedOptionId,
    selectedOptionRank: Math.max(
      0,
      Math.floor(Number(value.selectedOptionRank ?? value.selected_option_rank ?? 0) || 0)
    ),
    selectedMoveFamily,
    ...(offeredMoveFamilies.length ? { offeredMoveFamilies } : {}),
    askedAt: Math.max(0, Number(value.askedAt ?? value.asked_at ?? 0)),
  };
}

function sanitizeScreenplayQuestionInteraction(value, {
  projectId = "",
  projectTitle = "",
} = {}) {
  const base = sanitizeScreenplayLearningContext(value, { projectId, projectTitle });
  if (!base?.questionId) return null;
  const responseStatus = cleanText(
    value?.responseStatus ?? value?.response_status,
    24
  ).toLowerCase();
  if (!["asked", "answered", "declined", "expired"].includes(responseStatus)) return null;
  const askedAt = Math.max(0, Number(value?.askedAt ?? value?.asked_at ?? 0));
  if (!askedAt) return null;
  return {
    ...base,
    askedAt,
    respondedAt: responseStatus === "asked"
      ? 0
      : Math.max(
          askedAt,
          Number(value?.respondedAt ?? value?.responded_at ?? nowMs()) || nowMs()
        ),
    responseStatus,
  };
}

function buildScreenplayLearningSummary({ learningContext, transcript = "" } = {}) {
  const label = cleanText(learningContext?.targetLabel, 120) || "the story choice";
  const answer = cleanText(transcript, 260);
  return cleanText(`Writer clarified ${label}: ${answer}`, 420);
}

function buildConfirmedScreenplayLearningPromotion({ learningContext, transcript = "" } = {}) {
  if (!learningContext || typeof learningContext !== "object" || Array.isArray(learningContext)) return null;
  const authority = cleanText(learningContext.authority, 64).toLowerCase();
  const questionId = cleanText(learningContext.questionId ?? learningContext.question_id, 120);
  const targetField = cleanText(learningContext.targetField ?? learningContext.target_field, 64).toLowerCase();
  if (authority !== "writer_clarification" || !questionId || !targetField) return null;

  const rawAnswer = cleanText(transcript, 600);
  if (!rawAnswer || /^(?:yes|yeah|yep|correct|exactly|confirmed|lock\s+(?:it|that)\s+in)[.!\s]*$/i.test(rawAnswer)) {
    return null;
  }
  const answer = normalizeAuthoritativeStoryTargetValue(
    rawAnswer.replace(/^(?:yes|yeah|yep|exactly|definitely|absolutely|confirmed)\s*[,;:\-]\s*/i, ""),
    targetField === "project.central_question" ? 240 : 220
  );
  if (!answer) return null;

  const characterField = SCREENPLAY_LEARNING_CHARACTER_FIELDS[targetField];
  if (characterField) {
    const character = normalizeCharacterName(learningContext.anchor);
    if (!character) return null;
    return {
      scope: "character",
      targetField,
      field: characterField,
      value: answer,
      character,
      projectId: cleanText(learningContext.projectId ?? learningContext.project_id, 96),
      projectTitle: cleanText(learningContext.projectTitle ?? learningContext.project_title, 160),
      questionId,
      question: cleanText(learningContext.question, 260),
      targetLabel: cleanText(learningContext.targetLabel ?? learningContext.target_label, 120),
      anchor: cleanText(learningContext.anchor, 180),
      actKey: cleanText(learningContext.actKey ?? learningContext.act_key, 24),
      sequenceKey: cleanText(learningContext.sequenceKey ?? learningContext.sequence_key, 32),
      writerBlocked: Boolean(learningContext.writerBlocked ?? learningContext.writer_blocked),
    };
  }

  const projectTarget = SCREENPLAY_LEARNING_PROJECT_FIELDS[targetField];
  const projectId = cleanText(learningContext.projectId ?? learningContext.project_id, 96);
  const projectTitle = cleanText(learningContext.projectTitle ?? learningContext.project_title, 160);
  if (!projectTarget || (!projectId && !projectTitle)) return null;
  return {
    scope: "project",
    targetField,
    field: projectTarget.field,
    kind: projectTarget.kind,
    value: answer,
    projectId,
    projectTitle,
    questionId,
    question: cleanText(learningContext.question, 260),
    targetLabel: cleanText(learningContext.targetLabel ?? learningContext.target_label, 120),
    anchor: cleanText(learningContext.anchor, 180),
    actKey: cleanText(learningContext.actKey ?? learningContext.act_key, 24),
    sequenceKey: cleanText(learningContext.sequenceKey ?? learningContext.sequence_key, 32),
    writerBlocked: Boolean(learningContext.writerBlocked ?? learningContext.writer_blocked),
  };
}

function screenplayLearningFieldLabel(field = "") {
  return cleanText(
    String(field || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[._]+/g, " ")
      .toLowerCase(),
    80
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
  if (!raw || !isCorrectionTurnText(raw) || !textMentionsName(raw, characterName)) return null;
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

  const notPattern = /\b(?:not|never)\s+(?:a|an|the|that|this|his|her|their|its)?\s*([A-Za-z0-9][A-Za-z0-9' -]{0,80}?)(?=\.|,|;|$|\s+but\b|\s+instead\b|\s+anymore\b)/gi;
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
      new RegExp(`\\s*,?\\s*\\b(?:not|never)\\s+(?:a|an|the|that|this|his|her|their|its)?\\s*${escapeRegex(term)}\\b(?:\\s+anymore)?`, "ig"),
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
  if (!raw || !isCorrectionTurnText(raw)) return null;
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
  const notButPattern = /\b(?:not|never)\s+(?:a|an|the|that|this|his|her|their|its)?\s*([A-Za-z0-9][A-Za-z0-9' -]{0,80}?)\s*(?:,?\s*(?:but|instead)\s+)([A-Za-z0-9][A-Za-z0-9' -]{1,120}?)(?:[.;]|$)/gi;
  for (const match of raw.matchAll(notButPattern)) addReplacement(match[1], match[2]);
  const notPattern = /\b(?:not|never)\s+(?:a|an|the|that|this|his|her|their|its)?\s*([A-Za-z0-9][A-Za-z0-9' -]{0,80}?)(?=\.|,|;|$|\s+but\b|\s+instead\b|\s+anymore\b)/gi;
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

function acceptedCanonCorrectionMatchScore(fact = "", correctionText = "") {
  const factTerms = new Set(tokenizeMemoryText(fact).map(normalizeSemanticTerm).filter(Boolean));
  const correctionTerms = new Set(
    tokenizeMemoryText(correctionText).map(normalizeSemanticTerm).filter(Boolean)
  );
  if (!factTerms.size || !correctionTerms.size) return 0;
  const shared = [...factTerms].filter((term) => correctionTerms.has(term));
  if (shared.length < 2) return 0;
  const coverage = shared.length / Math.max(1, factTerms.size);
  const actionHits = shared.filter((term) => ACCEPTED_CANON_ACTION_TERMS.has(term)).length;
  return (shared.length * 100) + (actionHits * 250) + Math.round(coverage * 10);
}

function acceptedCanonFactKey(fact = "") {
  return cleanText(fact, 220).toLowerCase();
}

function collectAcceptedCanonCorrectionSignal({
  text = "",
  project = null,
  correction = null,
} = {}) {
  const base = mergeCorrectionSignals(correction);
  if (!isCorrectionTurnText(text) || !project) {
    return { correction: base, matchedFacts: [], ambiguousFacts: [] };
  }
  const ranked = selectAcceptedCausalFactsForPrompt(project, {
    query: text,
    maxItems: ACCEPTED_CAUSAL_FACT_PROMPT_MAX,
  })
    .map((item) => ({
      item,
      score: acceptedCanonCorrectionMatchScore(item.fact, text),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.ageInScenes - b.item.ageInScenes);
  const uniqueRanked = [];
  const seenFacts = new Set();
  for (const entry of ranked) {
    const key = acceptedCanonFactKey(entry.item.fact);
    if (!key || seenFacts.has(key)) continue;
    seenFacts.add(key);
    uniqueRanked.push(entry);
  }
  const top = uniqueRanked[0];
  if (!top?.item?.fact) return { correction: base, matchedFacts: [], ambiguousFacts: [] };
  const ambiguousFacts = uniqueRanked
    .filter((entry) => top.score - entry.score <= ACCEPTED_CANON_CORRECTION_AMBIGUITY_MARGIN)
    .map((entry) => entry.item.fact);
  if (ambiguousFacts.length > 1) {
    return { correction: base, matchedFacts: [], ambiguousFacts };
  }
  const matchedFact = top.item.fact;
  return {
    correction: mergeCorrectionSignals({
      correctedTerms: [matchedFact],
      correctionNote: `Retired accepted canon: ${matchedFact}`,
    }, base),
    matchedFacts: [matchedFact],
    ambiguousFacts: [],
  };
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

function normalizeAuthoritativeStoryTargetValue(value = "", maxChars = 220) {
  let clean = cleanText(value, maxChars)
    .replace(/^[\s:;,.\-]+/, "")
    .trim();
  const contrast = clean.match(/^not\s+(.{1,140}?)\s+(?:but|instead)\s+(.{2,220})$/i);
  if (contrast?.[2]) clean = contrast[2];
  clean = clean
    .replace(/\s*,?\s+(?:not|never)\s+(?:that\s+)?[^,;.!?]+$/i, "")
    .replace(/\s+(?:rather\s+than|instead\s+of)\s+[^,;.!?]+$/i, "")
    .replace(/^(?:that|to)\s+/i, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
  return cleanText(clean, maxChars);
}

function extractWriterCanonTargetCharacterNames(text = "", knownCharacterNames = []) {
  const source = String(text || "");
  const names = normalizeStringList(knownCharacterNames, 16, 48)
    .map(normalizeCharacterName)
    .filter((name) => name && textMentionsName(source, name));
  const labeledCharacterPattern = /\b([A-Z][A-Za-z0-9.'-]{1,31})(?:'s)?\s+(?:want|wants|need|needs|wound|is\s+wounded|false\s+belief|misbelief|lie|believes|relationship\s+pressure|current\s+tactic|tactic|next\s+emotional\s+turn|emotional\s+turn|goal)\b/g;
  for (const match of source.matchAll(labeledCharacterPattern)) {
    const name = normalizeCharacterName(String(match[1] || "").replace(/'s$/i, ""));
    if (name) names.push(name);
  }
  return normalizeStringList(names, 8, 48).map(normalizeCharacterName).filter(Boolean);
}

function firstWriterCanonProjectTarget(source = "", patterns = [], maxChars = 220) {
  for (const pattern of patterns) {
    const match = String(source || "").match(pattern);
    if (!match?.[1]) continue;
    const value = normalizeAuthoritativeStoryTargetValue(match[1], maxChars);
    if (value) return value;
  }
  return "";
}

export function extractWriterCanonStructuredTargets({
  correctionText = "",
  knownCharacterNames = [],
} = {}) {
  const source = cleanText(correctionText, 1_200);
  if (!source || !isCorrectionTurnText(source)) return [];
  const targets = [];
  const characterNames = extractWriterCanonTargetCharacterNames(source, knownCharacterNames);
  for (const character of characterNames) {
    const correction = extractCharacterMemoryCorrection(source, character);
    const arc = extractCharacterArcState({ text: source, characterName: character, correction });
    if (!arc) continue;
    for (const field of CHARACTER_ARC_FIELDS) {
      if (field === "act") continue;
      const value = normalizeAuthoritativeStoryTargetValue(
        arc[field],
        field === "act" ? 80 : CHARACTER_ARC_FIELD_MAX_CHARS
      );
      if (value) targets.push({ scope: "character", character, field, value });
    }
  }

  const projectDefinitions = [
    ["protagonistWant", [
      /\b(?:the\s+)?protagonist(?:'s)?\s+(?:want|external\s+goal)\s+(?:is|is\s+to|should\s+be|=)\s+([^.!?;\n]{2,220})/i,
      /\b(?:the\s+)?protagonist\s+wants\s+to\s+([^.!?;\n]{2,220})/i,
    ]],
    ["protagonistNeed", [
      /\b(?:the\s+)?protagonist(?:'s)?\s+(?:need|inner\s+need)\s+(?:is|is\s+to|should\s+be|=)\s+([^.!?;\n]{2,220})/i,
      /\b(?:the\s+)?protagonist\s+needs\s+to\s+([^.!?;\n]{2,220})/i,
    ]],
    ["antagonisticForce", [
      /\b(?:the\s+)?antagonistic\s+force\s+(?:is|is\s+that|should\s+be|=)\s+([^.!?;\n]{2,220})/i,
      /\b(?:the\s+)?(?:antagonist|opposition)\s+(?:is|comes\s+from|should\s+be|=)\s+([^.!?;\n]{2,220})/i,
    ]],
    ["centralQuestion", [
      /\b(?:the\s+)?central\s+question\s+(?:is|is\s+whether|should\s+be|=)\s+([^.!?;\n]{2,240})/i,
    ]],
    ["themeArgument", [
      /\b(?:the\s+)?theme(?:\s+argument)?\s+(?:is|is\s+that|should\s+be|=)\s+([^.!?;\n]{2,220})/i,
    ]],
    ["endingImage", [
      /\b(?:the\s+)?(?:ending|final)\s+image\s+(?:is|is\s+that|should\s+be|=)\s+([^.!?;\n]{2,200})/i,
    ]],
    ["unresolvedSetups", [
      /\b(?:the\s+)?(?:unresolved\s+)?setup(?:\s+to\s+(?:preserve|pay\s+off))?\s+(?:is|is\s+that|remains|should\s+be|=)\s+([^.!?;\n]{2,220})/i,
      /\bkeep\s+([^.!?;\n]{2,200}?)\s+as\s+(?:an?\s+)?unresolved\s+setup\b/i,
    ]],
    ["unresolvedStoryThreads", [
      /\b(?:the\s+)?(?:unresolved\s+)?(?:story\s+)?thread\s+(?:is|is\s+that|remains|should\s+be|=)\s+([^.!?;\n]{2,220})/i,
    ]],
    ["actThreePayoffPath", [
      /\b(?:the\s+)?(?:act\s*(?:iii|3|three)\s+)?payoff(?:\s+path)?\s+(?:is|is\s+that|should\s+be|=)\s+([^.!?;\n]{2,220})/i,
    ]],
  ];
  for (const [field, patterns] of projectDefinitions) {
    const value = firstWriterCanonProjectTarget(source, patterns);
    if (value) targets.push({ scope: "project", field, value });
  }
  return mergeWriterCanonTargets(targets);
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
  const triggerWriteContext = new AsyncLocalStorage();
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

  async function writeUser(userId, value, {
    expectedValue,
    expectedRevision = "",
  } = {}) {
    const triggerContext = triggerWriteContext.getStore();
    const mutationStartedAt = Math.max(0, Number(triggerContext?.mutationStartedAt || 0));
    const clearedAt = Math.max(0, Number(expectedValue?.clearedAt || 0));
    if (mutationStartedAt && clearedAt >= mutationStartedAt) {
      triggerContext.blockedByClear = true;
      return false;
    }
    if (expectedValue !== undefined && typeof store.compareAndSwap === "function") {
      const swapped = await store.compareAndSwap({
        domain: DOMAIN,
        key: userId,
        expectedValue,
        value,
      });
      if (!swapped) {
        const latest = await readUser(userId);
        throw creativeMemoryRevisionConflict(
          cleanText(expectedRevision, 96) || buildCreativeMemoryRevision(expectedValue),
          buildCreativeMemoryRevision(latest),
        );
      }
      return true;
    }
    await store.put({ domain: DOMAIN, key: userId, value });
    return true;
  }

  async function updateUser(userId, mutator, { expectedRevision = "" } = {}) {
    if (!userId) return;
    return withUserLock(userId, async () => {
      const maxAttempts = expectedRevision ? 1 : 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const persisted = await readUser(userId);
        const current = persisted || makeEmptyMemory(userId);
        const triggerContext = triggerWriteContext.getStore();
        const mutationStartedAt = Math.max(0, Number(triggerContext?.mutationStartedAt || 0));
        const clearedAt = Math.max(0, Number(current.clearedAt || 0));
        if (mutationStartedAt && clearedAt >= mutationStartedAt) {
          triggerContext.blockedByClear = true;
          return false;
        }
        assertCreativeMemoryRevision(current, expectedRevision);
        const next = mutator(clone(current)) || current;
        next.userId = userId;
        next.version = SCHEMA_VERSION;
        next.updatedAt = nowMs();
        try {
          await writeUser(userId, next, {
            expectedValue: persisted,
            expectedRevision,
          });
          return true;
        } catch (error) {
          if (expectedRevision || !isCreativeMemoryRevisionConflict(error) || attempt >= maxAttempts) {
            throw error;
          }
        }
      }
      return false;
    });
  }

  function appendCanonCorrectionReceipt(current, {
    receiptId = "",
    projectId = "",
    projectTitle = "",
    correctionText = "",
    matchedFacts = [],
    replacementFacts = [],
    replacementFactIds = [],
    structuredUpdates = [],
    correctionMemoryId = "",
    beforeState = null,
    afterState = null,
    createdAt = nowMs(),
  } = {}) {
    const cleanFacts = normalizeStringList(matchedFacts, 8, 220);
    if (!current || !cleanFacts.length || !beforeState) return null;
    const receipt = sanitizeCanonCorrectionReceipt({
      id: cleanText(receiptId, 96) || `canon_correction_${randomUUID()}`,
      status: "active",
      projectId,
      projectTitle,
      correctionText,
      matchedFacts: cleanFacts,
      replacementFacts,
      replacementFactIds,
      structuredUpdates,
      correctionMemoryId,
      createdAt,
      beforeState,
      afterState: afterState || correctionStateSnapshot(current, { projectId, projectTitle }),
    }, { includeSnapshots: true });
    if (!receipt) return null;
    const receipts = (Array.isArray(current.canonCorrectionReceipts)
      ? current.canonCorrectionReceipts
      : [])
      .map((item) => sanitizeCanonCorrectionReceipt(item, { includeSnapshots: true }))
      .filter(Boolean);
    current.canonCorrectionReceipts = [receipt, ...receipts]
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, CANON_CORRECTION_RECEIPTS_MAX);
    return receipt;
  }

  async function recordCanonCorrectionReceipt({
    userId,
    receiptId = "",
    projectId = "",
    projectTitle = "",
    correctionText = "",
    matchedFacts = [],
    replacementFacts = [],
    replacementFactIds = [],
    structuredUpdates = [],
    correctionMemoryId = "",
    beforeState = null,
  } = {}) {
    const cleanUserId = cleanText(userId, 128);
    const cleanFacts = normalizeStringList(matchedFacts, 8, 220);
    if (!cleanUserId || !cleanFacts.length || !beforeState) {
      return { ok: false, status: "invalid_correction_receipt" };
    }
    return withUserLock(cleanUserId, async () => {
      const current = await readUser(cleanUserId);
      if (!current) return { ok: false, status: "memory_not_found" };
      const baseline = clone(current);
      const createdAt = nowMs();
      const receipt = appendCanonCorrectionReceipt(current, {
        receiptId,
        projectId,
        projectTitle,
        correctionText,
        matchedFacts: cleanFacts,
        replacementFacts,
        replacementFactIds,
        structuredUpdates,
        correctionMemoryId,
        createdAt,
        beforeState,
      });
      if (!receipt) return { ok: false, status: "invalid_correction_receipt" };
      current.updatedAt = createdAt;
      await writeUser(cleanUserId, current, { expectedValue: baseline });
      return {
        ok: true,
        status: "recorded",
        receipt: sanitizeCanonCorrectionReceipt(receipt),
      };
    });
  }

  async function recordCanonCorrectionAmbiguity({
    userId,
    projectId = "",
    projectTitle = "",
    correctionText = "",
    candidateFacts = [],
    correctionMemoryId = "",
  } = {}) {
    const cleanUserId = cleanText(userId, 128);
    const cleanCandidates = normalizeStringList(candidateFacts, 8, 220);
    if (!cleanUserId || cleanCandidates.length < 2) {
      return { ok: false, status: "invalid_correction_ambiguity" };
    }
    return withUserLock(cleanUserId, async () => {
      const current = await readUser(cleanUserId);
      if (!current) return { ok: false, status: "memory_not_found" };
      const baseline = clone(current);
      const ambiguities = (Array.isArray(current.canonCorrectionAmbiguities)
        ? current.canonCorrectionAmbiguities
        : [])
        .map(sanitizeCanonCorrectionAmbiguity)
        .filter(Boolean);
      const projectKey = cleanText(projectId || projectTitle, 160).toLowerCase();
      const candidateKey = [...cleanCandidates].map(acceptedCanonFactKey).sort().join("|");
      const existingIndex = ambiguities.findIndex((item) => (
        item.status === "pending" &&
        cleanText(item.projectId || item.projectTitle, 160).toLowerCase() === projectKey &&
        [...item.candidateFacts].map(acceptedCanonFactKey).sort().join("|") === candidateKey
      ));
      const createdAt = nowMs();
      const ambiguity = sanitizeCanonCorrectionAmbiguity({
        id: existingIndex >= 0
          ? ambiguities[existingIndex].id
          : `canon_ambiguity_${randomUUID()}`,
        status: "pending",
        projectId,
        projectTitle,
        correctionText,
        candidateFacts: cleanCandidates,
        correctionMemoryId,
        createdAt: existingIndex >= 0 ? ambiguities[existingIndex].createdAt : createdAt,
      });
      if (!ambiguity) return { ok: false, status: "invalid_correction_ambiguity" };
      if (existingIndex >= 0) ambiguities.splice(existingIndex, 1);
      current.canonCorrectionAmbiguities = [ambiguity, ...ambiguities]
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, CANON_CORRECTION_AMBIGUITIES_MAX);
      current.updatedAt = createdAt;
      await writeUser(cleanUserId, current, { expectedValue: baseline });
      return { ok: true, status: existingIndex >= 0 ? "updated" : "recorded", ambiguity };
    });
  }

  async function resolveCanonCorrectionAmbiguity({
    userId,
    ambiguityId = "",
    selectedFacts = [],
    selectedFact = "",
    expectedRevision = "",
  } = {}) {
    const cleanUserId = cleanText(userId, 128);
    const cleanAmbiguityId = cleanText(ambiguityId, 96);
    const requestedFacts = normalizeStringList(
      Array.isArray(selectedFacts) && selectedFacts.length ? selectedFacts : [selectedFact],
      8,
      220
    );
    if (!cleanUserId) return { ok: false, status: "user_id_required" };
    if (!cleanAmbiguityId) return { ok: false, status: "correction_ambiguity_id_required" };
    if (!requestedFacts.length) return { ok: false, status: "selected_facts_required" };

    return withUserLock(cleanUserId, async () => {
      const current = await readUser(cleanUserId);
      if (!current) return { ok: false, status: "memory_not_found" };
      assertCreativeMemoryRevision(current, expectedRevision);
      const baseline = clone(current);
      const ambiguities = (Array.isArray(current.canonCorrectionAmbiguities)
        ? current.canonCorrectionAmbiguities
        : [])
        .map(sanitizeCanonCorrectionAmbiguity)
        .filter(Boolean);
      const ambiguityIndex = ambiguities.findIndex((item) => item.id === cleanAmbiguityId);
      if (ambiguityIndex < 0) return { ok: false, status: "correction_ambiguity_not_found" };
      const ambiguity = ambiguities[ambiguityIndex];
      const selected = requestedFacts.map((requested) => ambiguity.candidateFacts.find((fact) => (
        acceptedCanonFactKey(fact) === acceptedCanonFactKey(requested)
      )) || "");
      if (selected.some((fact) => !fact)) {
        return { ok: false, status: "selected_fact_not_candidate" };
      }
      if (ambiguity.status === "resolved") {
        const receipt = (Array.isArray(current.canonCorrectionReceipts)
          ? current.canonCorrectionReceipts
          : [])
          .map((item) => sanitizeCanonCorrectionReceipt(item))
          .find((item) => item.id === ambiguity.receiptId) || null;
        const resolvedKeys = new Set(
          (ambiguity.selectedFacts?.length ? ambiguity.selectedFacts : [ambiguity.selectedFact])
            .map(acceptedCanonFactKey)
            .filter(Boolean)
        );
        const selectedKeys = new Set(selected.map(acceptedCanonFactKey).filter(Boolean));
        if (
          resolvedKeys.size === selectedKeys.size &&
          [...resolvedKeys].every((key) => selectedKeys.has(key))
        ) {
          return {
            ok: true,
            status: "already_resolved",
            ambiguity,
            receipt,
            creativeMemoryRevision: buildCreativeMemoryRevision(current),
          };
        }
        return { ok: false, status: "correction_ambiguity_already_resolved" };
      }

      const projects = (Array.isArray(current.projects) ? current.projects : [])
        .map(sanitizeProjectContinuity)
        .filter(Boolean);
      const project = selectProjectContinuity(projects, {
        projectId: ambiguity.projectId,
        projectTitle: ambiguity.projectTitle,
      });
      if (!project) return { ok: false, status: "correction_project_not_found" };
      const selectedAcceptedFacts = selected.map((fact) => selectAcceptedCausalFactsForPrompt(project, {
        query: fact,
        maxItems: ACCEPTED_CAUSAL_FACT_PROMPT_MAX,
      }).find((item) => acceptedCanonFactKey(item.fact) === acceptedCanonFactKey(fact)) || null);
      if (selectedAcceptedFacts.some((fact) => !fact)) {
        return { ok: false, status: "accepted_canon_fact_not_found" };
      }

      const beforeState = correctionStateSnapshot(current, {
        projectId: ambiguity.projectId,
        projectTitle: ambiguity.projectTitle,
      });
      const resolvedAt = nowMs();
      const receiptId = `canon_correction_${randomUUID()}`;
      const projectCharacterNames = scopeRecordsToProject(
        Array.isArray(current.characters) ? current.characters : [],
        {
          projectId: ambiguity.projectId,
          projectTitle: ambiguity.projectTitle,
          metadataKey: "metadata",
        }
      )
        .map((character) => normalizeCharacterName(character?.name))
        .filter(Boolean);
      const structuredTargets = extractWriterCanonStructuredTargets({
        correctionText: ambiguity.correctionText,
        knownCharacterNames: projectCharacterNames,
      });
      const replacementFact = buildWriterCanonFact({
        projectId: ambiguity.projectId,
        projectTitle: ambiguity.projectTitle,
        correctionText: ambiguity.correctionText,
        replacesFacts: selected,
        receiptId,
        structuredTargets,
        createdAt: resolvedAt,
      });
      const authoritativeProjectFields = buildAuthoritativeProjectFields({
        targets: structuredTargets,
        sourceCorrectionId: receiptId,
        correctionText: ambiguity.correctionText,
        replacesFacts: selected,
        createdAt: resolvedAt,
      });
      const correctedTerms = normalizeStringList(
        [...selected, ...(project.correctedTerms || [])],
        PROJECT_CORRECTED_TERMS_MAX,
        120
      );
      const correctedProject = sanitizeProjectContinuity({
        ...project,
        correctedTerms,
        authoritativeFields: mergeAuthoritativeProjectFields(
          authoritativeProjectFields,
          project.authoritativeFields
        ),
        writerCanonFacts: replacementFact
          ? [replacementFact, ...(project.writerCanonFacts || [])]
          : project.writerCanonFacts,
        acceptedScenes: project.acceptedScenes || [],
        updatedAt: resolvedAt,
      });
      if (!correctedProject) return { ok: false, status: "correction_project_not_found" };
      const stillAccepted = selected.some((fact) => selectAcceptedCausalFactsForPrompt(correctedProject, {
        query: fact,
        maxItems: ACCEPTED_CAUSAL_FACT_PROMPT_MAX,
      }).some((item) => acceptedCanonFactKey(item.fact) === acceptedCanonFactKey(fact)));
      if (stillAccepted) return { ok: false, status: "accepted_canon_fact_not_retired" };

      const projectTarget = projectIdentity(project);
      const projectIndex = projects.findIndex((item) => {
        const identity = projectIdentity(item);
        if (projectTarget.projectId) return identity.projectId === projectTarget.projectId;
        return identity.projectTitle === projectTarget.projectTitle;
      });
      if (projectIndex < 0) return { ok: false, status: "correction_project_not_found" };
      projects[projectIndex] = correctedProject;
      current.projects = projects
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .slice(0, PROJECT_CONTINUITY_MAX);
      current.characters = applyWriterCanonCharacterTargetsToRecords(current.characters, {
        targets: structuredTargets,
        projectId: ambiguity.projectId,
        projectTitle: ambiguity.projectTitle,
        sourceCorrectionId: receiptId,
        correctionText: ambiguity.correctionText,
        replacesFacts: selected,
        createdAt: resolvedAt,
      });

      const selectedFactKey = [...selected]
        .map(acceptedCanonFactKey)
        .filter(Boolean)
        .sort()
        .join("|");
      const resolutionMemory = sanitizeEpisodicMemoryItem({
        id: `episode_${stableHash(`canon-resolution|${ambiguity.id}|${selectedFactKey}`)}`,
        summary: `Resolved canon correction for ${ambiguity.projectTitle || ambiguity.projectId || "screenplay"}`,
        text: [
          ambiguity.correctionText,
          replacementFact ? `Authoritative writer canon:\n- ${replacementFact.fact}` : "",
          `Retired accepted canon:\n- ${selected.join("\n- ")}`,
        ].filter(Boolean).join("\n"),
        tags: ["screenplay", "project", CORRECTION_TAG, "canon-resolution"],
        projectId: ambiguity.projectId,
        projectTitle: ambiguity.projectTitle,
        source: "memory_canon_correction_resolution",
        createdAt: resolvedAt,
        updatedAt: resolvedAt,
        lastReferencedAt: resolvedAt,
        referenceCount: 1,
      });
      if (!resolutionMemory) return { ok: false, status: "correction_resolution_memory_failed" };
      const memories = (Array.isArray(current.episodicMemories) ? current.episodicMemories : [])
        .map(sanitizeEpisodicMemoryItem)
        .filter(Boolean)
        .filter((item) => item.id !== resolutionMemory.id);
      const repaired = supersedeEpisodicMemoriesForCorrection(
        [...memories, resolutionMemory],
        {
          correctionMemory: resolutionMemory,
          correction: {
            correctedTerms: selected,
            correctionNote: `Writer selected accepted canon to retire: ${selected.join(" / ")}`,
          },
          atMs: resolvedAt,
        }
      );
      current.episodicMemories = sortEpisodicMemoriesForStorage(repaired.memories)
        .slice(0, EPISODIC_MEMORIES_MAX);

      ambiguities[ambiguityIndex] = sanitizeCanonCorrectionAmbiguity({
        ...ambiguity,
        status: "resolved",
        selectedFact: selected[0],
        selectedFacts: selected,
        receiptId,
        resolvedAt,
      });
      current.canonCorrectionAmbiguities = ambiguities;
      const afterState = correctionStateSnapshot(current, {
        projectId: ambiguity.projectId,
        projectTitle: ambiguity.projectTitle,
      });
      const receipt = appendCanonCorrectionReceipt(current, {
        receiptId,
        projectId: ambiguity.projectId,
        projectTitle: ambiguity.projectTitle,
        correctionText: ambiguity.correctionText,
        matchedFacts: selected,
        replacementFacts: replacementFact ? [replacementFact.fact] : [],
        replacementFactIds: replacementFact ? [replacementFact.id] : [],
        structuredUpdates: writerCanonStructuredUpdateLabels(structuredTargets),
        correctionMemoryId: resolutionMemory.id,
        beforeState,
        afterState,
        createdAt: resolvedAt,
      });
      if (!receipt) return { ok: false, status: "correction_receipt_failed" };
      current.updatedAt = resolvedAt;
      await writeUser(cleanUserId, current, {
        expectedValue: baseline,
        expectedRevision,
      });
      return {
        ok: true,
        status: "resolved",
        ambiguity: sanitizeCanonCorrectionAmbiguity(ambiguities[ambiguityIndex]),
        receipt: sanitizeCanonCorrectionReceipt(receipt),
        creativeMemoryRevision: buildCreativeMemoryRevision(current),
      };
    });
  }

  async function undoCanonCorrection({
    userId,
    receiptId = "",
    expectedRevision = "",
  } = {}) {
    const cleanUserId = cleanText(userId, 128);
    const cleanReceiptId = cleanText(receiptId, 96);
    if (!cleanUserId) return { ok: false, status: "user_id_required" };
    if (!cleanReceiptId) return { ok: false, status: "correction_receipt_id_required" };
    return withUserLock(cleanUserId, async () => {
      const current = await readUser(cleanUserId);
      if (!current) return { ok: false, status: "memory_not_found" };
      assertCreativeMemoryRevision(current, expectedRevision);
      const baseline = clone(current);
      const receipts = (Array.isArray(current.canonCorrectionReceipts)
        ? current.canonCorrectionReceipts
        : [])
        .map((item) => sanitizeCanonCorrectionReceipt(item, { includeSnapshots: true }))
        .filter(Boolean);
      const index = receipts.findIndex((item) => item.id === cleanReceiptId);
      if (index < 0) return { ok: false, status: "correction_receipt_not_found" };
      const receipt = receipts[index];
      if (receipt.status === "undone") {
        return {
          ok: true,
          status: "already_undone",
          receipt: sanitizeCanonCorrectionReceipt(receipt),
          creativeMemoryRevision: buildCreativeMemoryRevision(current),
        };
      }
      const projectKey = cleanText(receipt.projectId || receipt.projectTitle, 160).toLowerCase();
      const newerActiveReceipt = receipts.slice(0, index).some((item) => (
        item.status === "active" &&
        cleanText(item.projectId || item.projectTitle, 160).toLowerCase() === projectKey
      ));
      if (newerActiveReceipt) {
        return { ok: false, status: "newer_correction_exists" };
      }

      restoreCorrectionState(current, receipt);
      const undoneAt = nowMs();
      receipts[index] = { ...receipt, status: "undone", undoneAt };
      current.canonCorrectionReceipts = receipts;
      current.updatedAt = undoneAt;
      await writeUser(cleanUserId, current, {
        expectedValue: baseline,
        expectedRevision,
      });
      return {
        ok: true,
        status: "undone",
        receipt: sanitizeCanonCorrectionReceipt(receipts[index]),
        creativeMemoryRevision: buildCreativeMemoryRevision(current),
      };
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
      const baseline = clone(rec);
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
        await writeUser(cleanUserId, rec, { expectedValue: baseline });
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
    if (!rec || !hasCreativeMemoryContent(rec)) return null;
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
      const acceptedCausalFacts = selectAcceptedCausalFactsForPrompt(projectContinuity, { query });
      const acceptedScenes = selectAcceptedScenesForPrompt(projectContinuity.acceptedScenes, {
        query,
        currentAct: projectContinuity.act,
        preferredSceneHeading: dueStoryThread?.sourceSceneHeading,
        preferredSceneSummary: dueStoryThread?.sourceSceneSummary,
      });
      const featureStoryGraph = buildFeatureStoryGraph({
        projectContinuity,
        acceptedScenes: projectContinuity.acceptedScenes,
        acceptedCausalFacts,
        dueStoryThread,
      });
      const promptProjectContinuity = clone(projectContinuity);
      delete promptProjectContinuity.acceptedScenes;
      delete promptProjectContinuity.writerCanonFacts;
      out.projectContinuity = promptProjectContinuity;
      if (acceptedScenes.length) out.acceptedScenes = acceptedScenes;
      if (acceptedCausalFacts.length) out.acceptedCausalFacts = acceptedCausalFacts;
      if (dueStoryThread) out.dueStoryThread = dueStoryThread;
      if (featureStoryGraph) out.featureStoryGraph = featureStoryGraph;
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
    if (!hasCreativeMemoryContent(rec)) return null;
    return sanitizeCreativeMemoryLedgerRecord(rec, {
      includeSuperseded,
      maxEpisodicMemories,
    });
  }

  async function hasMemoryForUser(userId) {
    return hasCreativeMemoryContent(await readUser(userId));
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
                PROJECT_CORRECTED_TERMS_MAX,
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
        if (Object.prototype.hasOwnProperty.call(incoming, "authoritativeFields")) {
          next.authoritativeFields = mergeAuthoritativeProjectFields(
            incoming.authoritativeFields,
            existing.authoritativeFields
          );
        }
        if (Object.prototype.hasOwnProperty.call(incoming, "learnedFields")) {
          next.learnedFields = mergeLearnedProjectFields(
            incoming.learnedFields,
            existing.learnedFields
          );
        }
        if (Object.prototype.hasOwnProperty.call(incoming, "writerCanonFacts")) {
          next.writerCanonFacts = mergeWriterCanonFacts(
            incoming.writerCanonFacts,
            existing.writerCanonFacts,
            {
              correctedTerms: next.correctedTerms,
              correctionReplacements: next.correctionReplacements,
            }
          );
        }
        if (Object.prototype.hasOwnProperty.call(incoming, "questionEffectiveness")) {
          next.questionEffectiveness = mergeQuestionEffectivenessRecords(
            incoming.questionEffectiveness,
            existing.questionEffectiveness
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

  async function recordQuestionEffectivenessOutcome({
    userId,
    projectId = "",
    projectTitle = "",
    acceptedPage = false,
    blockResolved = false,
    rescueFailed = false,
    at = nowMs(),
  } = {}) {
    const cleanUserId = cleanText(userId, 128);
    const cleanProjectId = cleanText(projectId, 96).toLowerCase();
    const cleanProjectTitle = cleanText(projectTitle, 160).toLowerCase();
    const outcomeAt = Math.max(0, Number(at) || nowMs());
    if (!cleanUserId || (!cleanProjectId && !cleanProjectTitle)) {
      return { ok: false, acceptedPages: 0, blockResolutions: 0, failedRescues: 0 };
    }
    if (!acceptedPage && !blockResolved && !rescueFailed) {
      return { ok: true, acceptedPages: 0, blockResolutions: 0, failedRescues: 0 };
    }

    return withUserLock(cleanUserId, async () => {
      const current = await readUser(cleanUserId);
      if (!current) return { ok: true, acceptedPages: 0, blockResolutions: 0, failedRescues: 0 };
      const baseline = clone(current);
      const projects = (Array.isArray(current.projects) ? current.projects : [])
        .map(sanitizeProjectContinuity)
        .filter(Boolean);
      let projectIndex = -1;
      if (cleanProjectId) {
        projectIndex = projects.findIndex((project) => (
          projectIdentity(project).projectId === cleanProjectId
        ));
      }
      if (projectIndex < 0 && cleanProjectTitle) {
        projectIndex = projects.findIndex((project) => {
          const identity = projectIdentity(project);
          return identity.projectTitle === cleanProjectTitle &&
            (!cleanProjectId || !identity.projectId);
        });
      }
      if (projectIndex < 0) {
        return { ok: true, acceptedPages: 0, blockResolutions: 0, failedRescues: 0 };
      }

      const project = projects[projectIndex];
      const outcomes = mergeQuestionEffectivenessRecords(
        project.questionEffectiveness,
        []
      );
      const recent = outcomes.filter((item) => (
        item.responseStatus === "answered" &&
        Number(item.answeredAt || 0) > 0 &&
        outcomeAt >= Number(item.answeredAt || 0) &&
        outcomeAt - Number(item.answeredAt || 0) <= QUESTION_EFFECTIVENESS_ATTRIBUTION_WINDOW_MS
      ));
      let acceptedPages = 0;
      let blockResolutions = 0;
      let failedRescues = 0;
      if (acceptedPage) {
        const latest = recent[0];
        if (latest && !latest.acceptedPageAt) {
          latest.acceptedPageAt = outcomeAt;
          latest.acceptedPageCount = 1;
          delete latest.rescueFailedAt;
          delete latest.failedRescueCount;
          latest.updatedAt = outcomeAt;
          acceptedPages = 1;
        }
      }
      if (blockResolved) {
        const latestBlocked = recent.find((item) => item.writerBlocked);
        if (latestBlocked && !latestBlocked.blockResolvedAt) {
          latestBlocked.blockResolvedAt = outcomeAt;
          latestBlocked.blockResolutionCount = 1;
          delete latestBlocked.rescueFailedAt;
          delete latestBlocked.failedRescueCount;
          latestBlocked.updatedAt = outcomeAt;
          blockResolutions = 1;
        }
      }
      if (rescueFailed && !acceptedPage && !blockResolved) {
        const latestRescue = recent.find((item) => (
          item.writerBlocked &&
          item.recommendationOnly &&
          !item.acceptedPageAt &&
          !item.blockResolvedAt &&
          !item.rescueFailedAt
        ));
        if (latestRescue) {
          latestRescue.rescueFailedAt = outcomeAt;
          latestRescue.failedRescueCount = 1;
          latestRescue.updatedAt = outcomeAt;
          failedRescues = 1;
        }
      }
      if (!acceptedPages && !blockResolutions && !failedRescues) {
        return { ok: true, acceptedPages: 0, blockResolutions: 0, failedRescues: 0 };
      }

      projects[projectIndex] = sanitizeProjectContinuity({
        ...project,
        questionEffectiveness: outcomes,
        updatedAt: outcomeAt,
      });
      current.projects = projects
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
        .slice(0, PROJECT_CONTINUITY_MAX);
      current.updatedAt = outcomeAt;
      await writeUser(cleanUserId, current, { expectedValue: baseline });
      return { ok: true, acceptedPages, blockResolutions, failedRescues };
    });
  }

  async function updateStoryMovePreference({
    userId,
    projectId = "",
    projectTitle = "",
    family = "",
    action = "",
    expectedRevision = "",
    at = nowMs(),
  } = {}) {
    const cleanUserId = cleanText(userId, 128);
    const cleanProjectId = cleanText(projectId, 96).toLowerCase();
    const cleanProjectTitle = cleanText(projectTitle, 160).toLowerCase();
    const cleanFamily = normalizeStoryMoveFamily(family);
    const cleanAction = cleanText(action, 24).toLowerCase();
    const updatedAt = Math.max(0, Number(at) || nowMs());
    if (!cleanUserId || (!cleanProjectId && !cleanProjectTitle)) {
      return { ok: false, reason: "missing_project_identity" };
    }
    if (!["prefer", "avoid", "reset", "reset_all"].includes(cleanAction)) {
      return { ok: false, reason: "invalid_action" };
    }
    if (cleanAction !== "reset_all" && !cleanFamily) {
      return { ok: false, reason: "invalid_story_move_family" };
    }

    return withUserLock(cleanUserId, async () => {
      const current = await readUser(cleanUserId);
      if (!current) return { ok: false, reason: "creative_memory_not_found" };
      assertCreativeMemoryRevision(current, expectedRevision);
      const baseline = clone(current);
      const projects = (Array.isArray(current.projects) ? current.projects : [])
        .map(sanitizeProjectContinuity)
        .filter(Boolean);
      let projectIndex = -1;
      if (cleanProjectId) {
        projectIndex = projects.findIndex((project) => (
          projectIdentity(project).projectId === cleanProjectId
        ));
      }
      if (projectIndex < 0 && cleanProjectTitle) {
        projectIndex = projects.findIndex((project) => (
          projectIdentity(project).projectTitle === cleanProjectTitle
        ));
      }
      if (projectIndex < 0) return { ok: false, reason: "project_not_found" };

      const project = projects[projectIndex];
      let overrides = normalizeStoryMovePreferenceOverrides(
        project.storyMovePreferenceOverrides
      );
      let outcomes = mergeQuestionEffectivenessRecords(
        project.questionEffectiveness,
        []
      );

      if (cleanAction === "prefer" || cleanAction === "avoid") {
        overrides = [
          ...overrides.filter((item) => item.family !== cleanFamily),
          { family: cleanFamily, stance: cleanAction, updatedAt },
        ];
      } else {
        const resetAll = cleanAction === "reset_all";
        overrides = resetAll
          ? []
          : overrides.filter((item) => item.family !== cleanFamily);
        outcomes = outcomes.map((item) => {
          const next = { ...item };
          if (resetAll || next.selectedMoveFamily === cleanFamily) {
            delete next.selectedMoveFamily;
          }
          if (Array.isArray(next.offeredMoveFamilies)) {
            const offeredMoveFamilies = resetAll
              ? []
              : next.offeredMoveFamilies.filter((value) => value !== cleanFamily);
            if (offeredMoveFamilies.length) next.offeredMoveFamilies = offeredMoveFamilies;
            else delete next.offeredMoveFamilies;
          }
          return sanitizeQuestionEffectivenessRecord(next);
        }).filter(Boolean);
      }

      const updatedProject = sanitizeProjectContinuity({
        ...project,
        questionEffectiveness: outcomes,
        storyMovePreferenceOverrides: normalizeStoryMovePreferenceOverrides(overrides),
        updatedAt,
      });
      projects[projectIndex] = updatedProject;
      current.projects = projects
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
        .slice(0, PROJECT_CONTINUITY_MAX);
      current.updatedAt = updatedAt;
      await writeUser(cleanUserId, current, {
        expectedValue: baseline,
        expectedRevision,
      });
      return {
        ok: true,
        action: cleanAction,
        family: cleanFamily,
        projectId: updatedProject?.projectId || project.projectId || "",
        projectTitle: updatedProject?.projectTitle || project.projectTitle || "",
        updatedAt,
        creativeMemoryRevision: buildCreativeMemoryRevision(current),
      };
    });
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
    expectedRevision = "",
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
    let cleanCharacterBible = sanitizeCharacterBibleDelta(characterBible);
    if (cleanSource === "memory_character_bible_edit" && cleanCharacterBible?.arc) {
      const editedAt = nowMs();
      const correctionText = cleanText(
        cleanCharacterBible.corrections?.[0] || `Writer edited ${name}'s Character Bible in Memories.`,
        600
      );
      const authoritativeFields = CHARACTER_ARC_FIELDS
        .map((field) => sanitizeAuthoritativeCharacterField({
          id: `character_field_${stableHash([
            name.toLowerCase(),
            field,
            cleanText(cleanCharacterBible.arc?.[field], CHARACTER_ARC_FIELD_MAX_CHARS).toLowerCase(),
            editedAt,
          ].join("|"))}`,
          field,
          value: cleanCharacterBible.arc?.[field],
          sourceCorrectionId: `memory_edit_${editedAt}`,
          correctionText,
          replacesFacts: cleanCharacterBible.correctedTerms,
          createdAt: editedAt,
        }))
        .filter(Boolean);
      cleanCharacterBible = sanitizeCharacterBibleDelta({
        ...cleanCharacterBible,
        authoritativeFields,
        updatedAt: editedAt,
      });
    }
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
    }, { expectedRevision });
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
    let resolvedMemoryId = item.id;
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
        resolvedMemoryId = existing.id;
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
    return { ok: true, action, memoryId: resolvedMemoryId };
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
    if (!hasCreativeMemoryContent(rec) || !Array.isArray(rec.characters)) return null;
    const characters = scopeRecordsToProject(rec.characters, {
      projectId,
      projectTitle,
      metadataKey: "metadata",
    });
    const projectCharacter = (character) => ({
      name: character.name,
      traits: character.traits || null,
      bible: character.bible
        ? {
          character: character.name,
          ...character.bible,
        }
        : null,
      fieldProvenance: buildCharacterFieldProvenance(character.bible),
      projectId: cleanText(character.metadata?.projectId ?? character.metadata?.project_id, 96),
      projectTitle: cleanText(character.metadata?.projectTitle ?? character.metadata?.project_title, 160),
    });
    if (characterName && typeof characterName === "string") {
      const name = characterName.trim();
      if (!name) return null;
      const found = characters.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!found) return null;
      return projectCharacter(found);
    }
    return characters.map(projectCharacter);
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
    return withUserLock(cleanUserId, async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const current = await readUser(cleanUserId);
        const cleared = hasCreativeMemoryContent(current);
        const clearedAt = Math.max(
          nowMs(),
          Number(current?.updatedAt || 0) + 1,
          Number(current?.clearedAt || 0) + 1,
        );
        const tombstone = makeEmptyMemory(cleanUserId);
        tombstone.clearedAt = clearedAt;
        tombstone.updatedAt = clearedAt;
        try {
          await writeUser(cleanUserId, tombstone, { expectedValue: current });
          return { ok: true, cleared, userId: cleanUserId };
        } catch (error) {
          if (!isCreativeMemoryRevisionConflict(error) || attempt === 3) throw error;
        }
      }
      throw new Error("creative memory changed too often during clear");
    });
  }

  async function forgetMemoryCard({
    userId,
    key,
    expectedRevision = "",
  } = {}) {
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
      assertCreativeMemoryRevision(current, expectedRevision);
      const baseline = clone(current);
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
        await writeUser(cleanUserId, current, {
          expectedValue: baseline,
          expectedRevision,
        });
      }
      return {
        ok: true,
        forgotten,
        type,
        key: cleanKey,
        userId: cleanUserId,
        creativeMemoryRevision: buildCreativeMemoryRevision(current),
      };
    });
  }

  // Test seam — clear all entries in this domain.
  async function _clearAll() {
    if (typeof store.clear === "function") {
      await store.clear({ domain: DOMAIN });
    }
  }

  async function promoteConfirmedScreenplayLearningAnswer({ userId, promotion } = {}) {
    if (!userId || !promotion) return { ok: false, applied: false };
    const promotedAt = nowMs();
    const metadata = {
      ...(promotion.projectId ? { projectId: promotion.projectId } : {}),
      ...(promotion.projectTitle ? { projectTitle: promotion.projectTitle } : {}),
      learningQuestionId: promotion.questionId,
      learningTargetField: promotion.targetField,
    };

    if (promotion.scope === "character") {
      const before = await readUser(userId);
      const existingCharacter = scopeRecordsToProject(before?.characters, {
        projectId: promotion.projectId,
        projectTitle: promotion.projectTitle,
        metadataKey: "metadata",
      }).find((item) => (
        normalizeCharacterName(item?.name).toLowerCase() === promotion.character.toLowerCase()
      ));
      const authoritativeField = (existingCharacter?.bible?.authoritativeFields || [])
        .find((item) => item?.field === promotion.field);
      if (authoritativeField) {
        const effectiveValue = cleanText(
          readArcField(existingCharacter?.bible?.arc, promotion.field),
          CHARACTER_ARC_FIELD_MAX_CHARS
        );
        const applied = effectiveValue.toLowerCase() === promotion.value.toLowerCase();
        return { ok: true, applied, protectedByCorrection: !applied };
      }

      const receipt = await recordCharacterMention({
        userId,
        characterName: promotion.character,
        source: "screenplay_learning_confirmation",
        tags: ["screenplay", "character-bible", "writer-clarification", "question-answer"],
        metadata,
        characterBible: {
          canon: [
            `${promotion.character}'s ${screenplayLearningFieldLabel(promotion.field)}: ${promotion.value}`,
          ],
          arc: { [promotion.field]: promotion.value },
          learnedFields: [{
            field: promotion.field,
            value: promotion.value,
            questionId: promotion.questionId,
            question: promotion.question,
            targetLabel: promotion.targetLabel,
            anchor: promotion.anchor,
            learnedAt: promotedAt,
            updatedAt: promotedAt,
          }],
          updatedAt: promotedAt,
        },
      });
      const current = await readUser(userId);
      const character = scopeRecordsToProject(current?.characters, {
        projectId: promotion.projectId,
        projectTitle: promotion.projectTitle,
        metadataKey: "metadata",
      }).find((item) => (
        normalizeCharacterName(item?.name).toLowerCase() === promotion.character.toLowerCase()
      ));
      const effectiveValue = cleanText(
        readArcField(character?.bible?.arc, promotion.field),
        CHARACTER_ARC_FIELD_MAX_CHARS
      );
      const applied = effectiveValue.toLowerCase() === promotion.value.toLowerCase();
      const protectedByCorrection = !applied && (character?.bible?.authoritativeFields || [])
        .some((item) => item?.field === promotion.field);
      return { ok: Boolean(receipt?.ok), applied, protectedByCorrection };
    }

    const before = await readUser(userId);
    const existingProject = selectProjectContinuity(before?.projects, {
      projectId: promotion.projectId,
      projectTitle: promotion.projectTitle,
    });
    const authoritativeField = (existingProject?.authoritativeFields || [])
      .find((item) => item?.field === promotion.field);
    if (authoritativeField) {
      const applied = promotion.kind === "list"
        ? (existingProject?.[promotion.field] || []).some((item) => (
          cleanText(item, 220).toLowerCase() === promotion.value.toLowerCase()
        ))
        : cleanText(existingProject?.[promotion.field], 240).toLowerCase() === promotion.value.toLowerCase();
      return { ok: true, applied, protectedByCorrection: !applied };
    }
    const note = cleanText(
      `Writer clarified ${screenplayLearningFieldLabel(promotion.field)}: ${promotion.value}`,
      200
    );
    const continuity = {
      projectId: promotion.projectId,
      projectTitle: promotion.projectTitle,
      learnedFields: [{
        field: promotion.field,
        value: promotion.value,
        questionId: promotion.questionId,
        question: promotion.question,
        targetLabel: promotion.targetLabel,
        anchor: promotion.anchor,
        learnedAt: promotedAt,
        updatedAt: promotedAt,
      }],
      continuityNotes: normalizeStringList(
        [note, ...(existingProject?.continuityNotes || [])],
        8,
        200
      ),
    };
    if (promotion.kind === "list") {
      const definition = PROJECT_CONTINUITY_LIST_FIELDS.find(([field]) => field === promotion.field);
      if (!definition) return { ok: false, applied: false };
      const [, maxItems, maxChars] = definition;
      continuity[promotion.field] = normalizeStringList(
        [promotion.value, ...(existingProject?.[promotion.field] || [])],
        maxItems,
        maxChars
      );
    } else {
      continuity[promotion.field] = promotion.value;
    }
    const receipt = await recordProjectContinuity({ userId, continuity });
    const after = await readUser(userId);
    const project = selectProjectContinuity(after?.projects, {
      projectId: promotion.projectId,
      projectTitle: promotion.projectTitle,
    });
    const applied = promotion.kind === "list"
      ? (project?.[promotion.field] || []).some((item) => (
        cleanText(item, 220).toLowerCase() === promotion.value.toLowerCase()
      ))
      : cleanText(project?.[promotion.field], 240).toLowerCase() === promotion.value.toLowerCase();
    const protectedByCorrection = !applied && (project?.authoritativeFields || [])
      .some((item) => item?.field === promotion.field);
    return { ok: Boolean(receipt?.ok), applied, protectedByCorrection };
  }

  // T08w-triggers: extract signals from a /talk turn and fire the
  // appropriate write triggers. Pure-ish: deterministic given inputs;
  // only side effect is the writes through the existing trigger
  // functions above. Safe to call when userId is null (becomes a no-op).
  async function recordTriggersFromTalkTurnWithinContext({
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
    learningContext = null,
    questionInteraction = null,
  } = {}) {
    if (!userId) return { skipped: true, reason: "no userId" };
    const cleanProjectId = cleanText(projectId, 96);
    const cleanProjectTitle = cleanText(projectTitle, 160);
    const cleanSource = cleanText(source || "talk_turn", 64) || "talk_turn";
    const userText = String(transcript || "");
    const assistantText = String(reply || "");
    const combined = `${userText}\n${assistantText}`;
    const isGeneratedScreenplayOutput = cleanSource === "talk_screenplay_output";
    const isCorrectionTurn = isCorrectionTurnText(userText);
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
      acceptedCanonFactsRetired: 0,
      acceptedCanonFactsAmbiguous: 0,
      writerCanonFactsRecorded: 0,
      canonCorrectionReceiptId: "",
      canonCorrectionAmbiguityId: "",
      canonCorrectionAmbiguity: null,
      acceptedPagesPromoted: 0,
      acceptedPagesRecorded: 0,
      learningAnswersRecorded: 0,
      learningAnswersPromoted: 0,
      learningAnswersCorrectionProtected: 0,
      questionInteractionsRecorded: 0,
      questionOutcomesRecorded: 0,
      questionAcceptedPageOutcomes: 0,
      questionBlockResolutions: 0,
      lexicalPhrases: 0,
      projectContinuityRecorded: false,
      sessionRecorded: false,
    };

    const continuitySource = projectContinuity && typeof projectContinuity === "object" && !Array.isArray(projectContinuity)
      ? projectContinuity
      : {};
    const resolvedProjectId = cleanProjectId || cleanText(
      continuitySource.projectId ?? continuitySource.project_id,
      96
    );
    const resolvedProjectTitle = cleanProjectTitle || cleanText(
      continuitySource.projectTitle ?? continuitySource.project_title,
      160
    );
    const cleanLearningContext = sanitizeScreenplayLearningContext(learningContext, {
      projectId: resolvedProjectId,
      projectTitle: resolvedProjectTitle,
    });
    const sanitizedQuestionInteraction = sanitizeScreenplayQuestionInteraction(
      questionInteraction,
      {
        projectId: resolvedProjectId,
        projectTitle: resolvedProjectTitle,
      }
    );
    const provisionalSelection = cleanLearningContext
      ? resolveProvisionalScreenplayOptionSelection(
        userText,
        cleanLearningContext.provisionalOptions
      )
      : null;
    const expectedSelectedOptionId = cleanText(
      cleanLearningContext?.selectedOptionId,
      32
    );
    const validProvisionalSelection = Boolean(
      provisionalSelection &&
      (!expectedSelectedOptionId || provisionalSelection.id === expectedSelectedOptionId)
    );
    const learningAnswerText = validProvisionalSelection
      ? provisionalSelection.value
      : userText;
    const learningAnswerClassification = cleanLearningContext
      ? classifyScreenplayLearningAnswer(learningAnswerText, {
        targetField: cleanLearningContext.targetField,
      })
      : null;
    const isLearningAnswer = Boolean(
      cleanLearningContext && learningAnswerClassification?.accepted
    );
    const rejectedLearningAnswer = Boolean(
      (cleanLearningContext && !learningAnswerClassification?.accepted) ||
      sanitizedQuestionInteraction?.responseStatus === "declined"
    );
    const cleanQuestionInteraction = (
      rejectedLearningAnswer &&
      sanitizedQuestionInteraction?.responseStatus === "answered"
    )
      ? {
        ...sanitizedQuestionInteraction,
        responseStatus: "declined",
      }
      : sanitizedQuestionInteraction;
    const effectiveCorrectionTurn = isCorrectionTurn && !rejectedLearningAnswer;
    const learningPromotion = isLearningAnswer
      ? buildConfirmedScreenplayLearningPromotion({
        learningContext: cleanLearningContext,
        transcript: learningAnswerText,
      })
      : null;
    let learningPromotionProtected = false;
    let projectCorrection = effectiveCorrectionTurn
      ? collectEpisodicCorrectionSignal({ text: userText })
      : null;
    let matchedAcceptedCanonFacts = [];
    let ambiguousAcceptedCanonFacts = [];
    let canonCorrectionBeforeState = null;
    let pendingWriterCanonFact = null;
    let pendingCanonCorrectionReceiptId = "";
    let writerCanonStructuredTargets = effectiveCorrectionTurn
      ? extractWriterCanonStructuredTargets({ correctionText: userText })
      : [];
    const structuredCorrectionAt = nowMs();
    let structuredCorrectionId = writerCanonStructuredTargets.length
      ? `writer_correction_${stableHash([
        resolvedProjectId.toLowerCase(),
        resolvedProjectTitle.toLowerCase(),
        cleanText(userText, 600).toLowerCase(),
      ].join("|"))}`
      : "";
    let correctionMemoryId = "";
    if (effectiveCorrectionTurn && (resolvedProjectId || resolvedProjectTitle)) {
      const currentRecord = await readUser(userId).catch(() => null);
      const projectCharacterNames = scopeRecordsToProject(
        Array.isArray(currentRecord?.characters) ? currentRecord.characters : [],
        {
          projectId: resolvedProjectId,
          projectTitle: resolvedProjectTitle,
          metadataKey: "metadata",
        }
      )
        .map((character) => normalizeCharacterName(character?.name))
        .filter(Boolean);
      writerCanonStructuredTargets = mergeWriterCanonTargets(
        extractWriterCanonStructuredTargets({
          correctionText: userText,
          knownCharacterNames: projectCharacterNames,
        }),
        writerCanonStructuredTargets
      );
      if (writerCanonStructuredTargets.length && !structuredCorrectionId) {
        structuredCorrectionId = `writer_correction_${stableHash([
          resolvedProjectId.toLowerCase(),
          resolvedProjectTitle.toLowerCase(),
          cleanText(userText, 600).toLowerCase(),
        ].join("|"))}`;
      }
      const currentProject = selectProjectContinuity(currentRecord?.projects, {
        projectId: resolvedProjectId,
        projectTitle: resolvedProjectTitle,
      });
      const matched = collectAcceptedCanonCorrectionSignal({
        text: userText,
        project: currentProject,
        correction: projectCorrection,
      });
      projectCorrection = matched.correction;
      matchedAcceptedCanonFacts = matched.matchedFacts;
      ambiguousAcceptedCanonFacts = matched.ambiguousFacts;
      if (currentRecord && matchedAcceptedCanonFacts.length) {
        canonCorrectionBeforeState = correctionStateSnapshot(currentRecord, {
          projectId: resolvedProjectId,
          projectTitle: resolvedProjectTitle,
        });
        pendingCanonCorrectionReceiptId = `canon_correction_${randomUUID()}`;
        structuredCorrectionId = pendingCanonCorrectionReceiptId;
        pendingWriterCanonFact = buildWriterCanonFact({
          projectId: resolvedProjectId,
          projectTitle: resolvedProjectTitle,
          correctionText: userText,
          replacesFacts: matchedAcceptedCanonFacts,
          receiptId: pendingCanonCorrectionReceiptId,
          structuredTargets: writerCanonStructuredTargets,
          createdAt: structuredCorrectionAt,
        });
      }
    }
    summary.acceptedCanonFactsAmbiguous = ambiguousAcceptedCanonFacts.length;
    const deferAmbiguousCorrection = ambiguousAcceptedCanonFacts.length > 1;
    const structuredReplacesFacts = matchedAcceptedCanonFacts.length
      ? matchedAcceptedCanonFacts
      : normalizeStringList(projectCorrection?.correctedTerms, 8, 220);
    const authoritativeProjectFields = deferAmbiguousCorrection || rejectedLearningAnswer
      ? []
      : buildAuthoritativeProjectFields({
        targets: writerCanonStructuredTargets,
        sourceCorrectionId: structuredCorrectionId,
        correctionText: userText,
        replacesFacts: structuredReplacesFacts,
        createdAt: structuredCorrectionAt,
      });
    const continuityForWrite = deferAmbiguousCorrection
      ? {}
      : projectCorrection
      ? {
        ...continuitySource,
        correctedTerms: normalizeStringList(
          [
            ...normalizeStringList(
              projectCorrection.correctedTerms,
              PROJECT_CORRECTED_TERMS_MAX,
              120
            ),
            ...normalizeStringList(
              continuitySource.correctedTerms ?? continuitySource.corrected_terms,
              PROJECT_CORRECTED_TERMS_MAX,
              120
            ),
          ],
          PROJECT_CORRECTED_TERMS_MAX,
          120
        ),
        correctionReplacements: mergeCorrectionReplacements(
          projectCorrection.correctionReplacements,
          continuitySource.correctionReplacements ?? continuitySource.correction_replacements,
          8,
          160
        ),
        ...(authoritativeProjectFields.length
          ? { authoritativeFields: authoritativeProjectFields }
          : {}),
        ...(pendingWriterCanonFact ? { writerCanonFacts: [pendingWriterCanonFact] } : {}),
      }
      : continuitySource;
    const acceptedScene = buildAcceptedSceneContinuity({
      pageText: cleanAcceptedPageText,
      projectId: resolvedProjectId,
      projectTitle: resolvedProjectTitle,
      projectContinuity: continuityForWrite,
      characterNames: structuredArcs.map((item) => item.character),
      context: acceptedSceneContext,
    });
    if ((Object.keys(continuityForWrite).length || acceptedScene) && (resolvedProjectId || resolvedProjectTitle)) {
      try {
        const receipt = await recordProjectContinuity({
          userId,
          continuity: {
            ...continuityForWrite,
            projectId: resolvedProjectId,
            projectTitle: resolvedProjectTitle,
            ...(acceptedScene ? { acceptedScenes: [acceptedScene] } : {}),
          },
        });
        summary.projectContinuityRecorded = Boolean(receipt?.ok);
        summary.acceptedScenesRecorded = receipt?.ok && acceptedScene ? 1 : 0;
        summary.acceptedCanonFactsRetired = receipt?.ok ? matchedAcceptedCanonFacts.length : 0;
        summary.writerCanonFactsRecorded = receipt?.ok && pendingWriterCanonFact ? 1 : 0;
      } catch (_e) { /* never block the response on memory writes */ }
    }

    // Only writer text can mutate canon. Generated pages remain useful for draft continuity and voice.
    const characterDiscoveryText = isGeneratedScreenplayOutput ? combined : userText;
    const traitText = isGeneratedScreenplayOutput ? combined : userText;
    const storyMemoryText = isGeneratedScreenplayOutput && !effectiveCorrectionTurn
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
    const structuredTargetCharacterNames = writerCanonStructuredTargets
      .filter((target) => target.scope === "character")
      .map((target) => target.character);
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
        const traits = !rejectedLearningAnswer && (traitLines.length || traitHint)
          ? extractTraits({ characterName: name, lines: traitLines, hint: traitHint })
          : null;
        let characterBible = deferAmbiguousCorrection || rejectedLearningAnswer
          ? null
          : extractCharacterBibleDelta({
            text: userText,
            characterName: name,
            isCorrectionTurn: effectiveCorrectionTurn,
          });
        const authoritativeFields = deferAmbiguousCorrection || rejectedLearningAnswer
          ? []
          : buildAuthoritativeCharacterFields({
            character: name,
            targets: writerCanonStructuredTargets,
            sourceCorrectionId: structuredCorrectionId,
            correctionText: userText,
            replacesFacts: structuredReplacesFacts,
            createdAt: structuredCorrectionAt,
          });
        if (authoritativeFields.length) {
          characterBible = {
            ...(characterBible || {}),
            authoritativeFields,
            corrections: collectCharacterBibleItems(
              [
                `Authoritative writer correction for ${name}: ${normalizeWriterCanonAssertion(userText) || cleanText(userText, 220)}`,
                ...(characterBible?.corrections || []),
              ],
              CHARACTER_BIBLE_CORRECTIONS_MAX,
              260
            ),
          };
        }
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

    for (const targetName of structuredTargetCharacterNames) {
      if (turnCharacterNames.length >= 8) break;
      await rememberCharacterName(targetName);
    }
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

    if (
      isLearningAnswer &&
      cleanLearningContext.targetField.startsWith("character.") &&
      cleanLearningContext.anchor &&
      turnCharacterNames.length < 8 &&
      !turnCharacterNames.some((item) => item.toLowerCase() === cleanLearningContext.anchor.toLowerCase())
    ) {
      turnCharacterNames.push(cleanLearningContext.anchor);
    }

    if (cleanQuestionInteraction && (resolvedProjectId || resolvedProjectTitle)) {
      try {
        const interactionRecord = buildQuestionInteractionEffectivenessRecord(
          cleanQuestionInteraction
        );
        if (interactionRecord) {
          const interactionReceipt = await recordProjectContinuity({
            userId,
            continuity: {
              projectId: resolvedProjectId,
              projectTitle: resolvedProjectTitle,
              questionEffectiveness: [interactionRecord],
            },
          });
          if (interactionReceipt?.ok) {
            summary.questionInteractionsRecorded += 1;
            summary.projectContinuityRecorded = true;
          }
        }
      } catch (_e) { /* never block the response on question interaction writes */ }
    }

    if (learningPromotion) {
      try {
        const promotionReceipt = await promoteConfirmedScreenplayLearningAnswer({
          userId,
          promotion: learningPromotion,
        });
        if (promotionReceipt?.applied) {
          summary.learningAnswersPromoted += 1;
          if (learningPromotion.scope === "character") {
            summary.structuredCharacterBibles += 1;
          } else {
            summary.projectContinuityRecorded = true;
          }
          const questionOutcome = buildAnsweredQuestionEffectivenessRecord(
            cleanLearningContext
          );
          if (questionOutcome && (resolvedProjectId || resolvedProjectTitle)) {
            const outcomeReceipt = await recordProjectContinuity({
              userId,
              continuity: {
                projectId: resolvedProjectId,
                projectTitle: resolvedProjectTitle,
                questionEffectiveness: [questionOutcome],
              },
            });
            if (outcomeReceipt?.ok) {
              summary.questionOutcomesRecorded += 1;
              summary.projectContinuityRecorded = true;
            }
          }
        } else if (promotionReceipt?.protectedByCorrection) {
          summary.learningAnswersCorrectionProtected += 1;
          learningPromotionProtected = true;
        }
      } catch (_e) { /* never block the response on structured learning promotion */ }
    }

    const blockResolvedSignal = STORY_BLOCK_RESOLVED_SIGNAL.test(userText);
    const rescueFailedSignal = !blockResolvedSignal && STORY_RESCUE_FAILED_SIGNAL.test(userText);
    if (cleanAcceptedPageText || blockResolvedSignal || rescueFailedSignal) {
      try {
        const outcomeReceipt = await recordQuestionEffectivenessOutcome({
          userId,
          projectId: resolvedProjectId,
          projectTitle: resolvedProjectTitle,
          acceptedPage: Boolean(cleanAcceptedPageText),
          blockResolved: blockResolvedSignal,
          rescueFailed: rescueFailedSignal,
        });
        summary.questionAcceptedPageOutcomes = Math.max(
          0,
          Number(outcomeReceipt?.acceptedPages || 0)
        );
        summary.questionBlockResolutions = Math.max(
          0,
          Number(outcomeReceipt?.blockResolutions || 0)
        );
        summary.questionFailedRescues = Math.max(
          0,
          Number(outcomeReceipt?.failedRescues || 0)
        );
      } catch (_e) { /* never block the response on outcome attribution */ }
    }

    const sceneHeading = firstScreenplaySceneHeading(storyMemoryText);
    const moment = firstMemoryMoment(userText) ||
      (isGeneratedScreenplayOutput ? firstMemoryMoment(assistantText) : "");
    if (
      (isLearningAnswer && !learningPromotionProtected) ||
      (!isLearningAnswer && !rejectedLearningAnswer && isStoryMemoryCandidate({
        transcript: userText,
        reply: isGeneratedScreenplayOutput ? assistantText : "",
        projectId: cleanProjectId,
        projectTitle: cleanProjectTitle,
        sceneHeading,
        characterNames: turnCharacterNames,
        source: cleanSource,
        moment,
      }))
    ) {
      const memorySummary = isLearningAnswer
        ? buildScreenplayLearningSummary({
          learningContext: cleanLearningContext,
          transcript: learningAnswerText,
        })
        : buildEpisodicSummary({
          characterNames: turnCharacterNames,
          sceneHeading,
          moment,
          projectTitle: cleanProjectTitle,
          transcript: userText,
          isCorrection: effectiveCorrectionTurn,
        });
      try {
        const correctionSignal = effectiveCorrectionTurn
          ? mergeCorrectionSignals(
            projectCorrection,
            collectEpisodicCorrectionSignal({
              text: userText,
              characterNames: turnCharacterNames,
            })
          )
          : null;
        const tags = buildEpisodicTags({
          transcript: userText,
          source: cleanSource,
          projectId: cleanProjectId,
          projectTitle: cleanProjectTitle,
        });
        if (isLearningAnswer) {
          tags.push("writer-clarification", "question-answer");
          const targetTag = cleanLearningContext.targetField
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 48);
          if (targetTag) tags.push(targetTag);
        }
        const acceptedOutput = Boolean(
          cleanAcceptedPageText &&
          screenplayPageMemoryHash(assistantText) === screenplayPageMemoryHash(cleanAcceptedPageText)
        );
        if (acceptedOutput) tags.push(ACCEPTED_PAGE_TAG);
        const receipt = await recordEpisodicMemory({
          userId,
          summary: memorySummary,
          text: isLearningAnswer ? learningAnswerText : storyMemoryText,
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
        if (receipt?.ok && isLearningAnswer) summary.learningAnswersRecorded += 1;
        if (receipt?.ok && effectiveCorrectionTurn) correctionMemoryId = cleanText(receipt.memoryId, 80);
        if (receipt?.ok && acceptedOutput) summary.acceptedPagesRecorded += 1;
        if (receipt?.ok && effectiveCorrectionTurn) summary.corrections += 1;
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

    if (canonCorrectionBeforeState && summary.acceptedCanonFactsRetired > 0) {
      try {
        const receipt = await recordCanonCorrectionReceipt({
          userId,
          receiptId: pendingCanonCorrectionReceiptId,
          projectId: resolvedProjectId,
          projectTitle: resolvedProjectTitle,
          correctionText: userText,
          matchedFacts: matchedAcceptedCanonFacts,
          replacementFacts: pendingWriterCanonFact ? [pendingWriterCanonFact.fact] : [],
          replacementFactIds: pendingWriterCanonFact ? [pendingWriterCanonFact.id] : [],
          structuredUpdates: writerCanonStructuredUpdateLabels(writerCanonStructuredTargets),
          correctionMemoryId,
          beforeState: canonCorrectionBeforeState,
        });
        if (receipt?.ok) summary.canonCorrectionReceiptId = receipt.receipt?.id || "";
      } catch (_e) { /* never block the response on correction receipt writes */ }
    }

    if (ambiguousAcceptedCanonFacts.length > 1) {
      try {
        const ambiguity = await recordCanonCorrectionAmbiguity({
          userId,
          projectId: resolvedProjectId,
          projectTitle: resolvedProjectTitle,
          correctionText: userText,
          candidateFacts: ambiguousAcceptedCanonFacts,
          correctionMemoryId,
        });
        if (ambiguity?.ok) {
          summary.canonCorrectionAmbiguityId = ambiguity.ambiguity?.id || "";
          summary.canonCorrectionAmbiguity = ambiguity.ambiguity || null;
        }
      } catch (_e) { /* never block the response on ambiguity receipt writes */ }
    }

    return summary;
  }

  async function recordTriggersFromTalkTurn(input = {}) {
    const mutationStartedAt = Math.max(1, Number(input?.turnStartedAt || nowMs()));
    const context = { mutationStartedAt, blockedByClear: false };
    const summary = await triggerWriteContext.run(
      context,
      () => recordTriggersFromTalkTurnWithinContext(input),
    );
    if (!context.blockedByClear) return summary;
    return {
      ...summary,
      skipped: true,
      reason: "cleared_during_turn",
    };
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
    undoCanonCorrection,
    resolveCanonCorrectionAmbiguity,
    recordProjectContinuity,
    updateStoryMovePreference,
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
