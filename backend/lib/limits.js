// D009 — module-level limits and switches extracted verbatim from backend/index.js.
//
// Each constant is read by helpers that moved to lib/ family modules; index.js
// imports the same names, so nothing else changed.

import { parseBool, parseNumberInRange, parsePositiveInt } from "./utils.js";

const VISUAL_CONTEXT_IMAGE_DATA_URL_MAX_CHARS = parsePositiveInt(
  process.env.VISUAL_CONTEXT_IMAGE_DATA_URL_MAX_CHARS,
  1_600_000
);

const KNOWLEDGE_RAG_CARD_BODY_MAX_CHARS = parsePositiveInt(
  process.env.KNOWLEDGE_RAG_CARD_BODY_MAX_CHARS,
  420
);

const ASSISTANT_SELF_NAME_MAX_CHARS = parsePositiveInt(
  process.env.ASSISTANT_SELF_NAME_MAX_CHARS,
  24
);

const USER_PRIMARY_NAME_MAX_CHARS = parsePositiveInt(
  process.env.USER_PRIMARY_NAME_MAX_CHARS,
  32
);

const SCREENPLAY_MEMORY_GENERIC_CUES = new Set([
  "CHARACTER",
  "CHARACTER A",
  "CHARACTER B",
  "PROTAGONIST",
  "ANTAGONIST",
  "HERO",
  "VILLAIN",
  "LEAD",
  "MAIN CHARACTER",
]);

const TASKS_MAX_STORED = parsePositiveInt(process.env.TASKS_MAX_STORED, 240);

const ADAPTIVE_BIAS_LIMIT = parseNumberInRange(
  process.env.ADAPTIVE_BIAS_LIMIT,
  0.05,
  0.50,
  0.25
);

const ADAPTIVE_HISTORY_MAX = Math.max(
  8,
  parsePositiveInt(process.env.ADAPTIVE_HISTORY_MAX, 24)
);

const ADAPTIVE_QUALITY_TAGS = new Set([
  "too_generic",
  "too_long",
  "too_short",
  "missed_intent",
  "low_empathy",
  "question_stack",
  "over_advice",
  "under_specific",
  "incomplete_reply",
  "strong_clarity",
  "good_question",
  "great_reflection",
  "strong_empathy",
  "memory_continuity",
]);

const USER_MEMORY_REMEMBERED_PEOPLE_MAX = Math.max(
  1,
  parsePositiveInt(process.env.USER_MEMORY_REMEMBERED_PEOPLE_MAX, 24)
);

const SOCIAL_SPARK_MEMORY_MAX = Math.max(
  3,
  parsePositiveInt(process.env.SOCIAL_SPARK_MEMORY_MAX, 12)
);

const TTS_SPEED = parseNumberInRange(process.env.TTS_SPEED, 0.25, 4, 1.26);

const TURN_END_GUARD_DYNAMIC_NOISE_ENABLED = process.env.TURN_END_GUARD_DYNAMIC_NOISE_ENABLED == null
  ? true
  : parseBool(process.env.TURN_END_GUARD_DYNAMIC_NOISE_ENABLED);

const TURN_END_GUARD_VAD_BASE_RMS = parseNumberInRange(
  process.env.TURN_END_GUARD_VAD_BASE_RMS,
  0.002,
  0.08,
  0.012
);

const TURN_END_GUARD_DYNAMIC_TAIL_BOOST_MAX_MS = parsePositiveInt(
  process.env.TURN_END_GUARD_DYNAMIC_TAIL_BOOST_MAX_MS,
  350
);

const RELATIONSHIP_DEPTH_MAX = parsePositiveInt(process.env.RELATIONSHIP_DEPTH_MAX, 160);

const HIDDEN_MODE_TRANSCENDENCE_REL_DEPTH = parseNumberInRange(
  process.env.HIDDEN_MODE_TRANSCENDENCE_REL_DEPTH,
  30,
  120,
  102
);

const HIDDEN_MODE_TRANSCENDENCE_BEHAVIOR_DEPTH = parseNumberInRange(
  process.env.HIDDEN_MODE_TRANSCENDENCE_BEHAVIOR_DEPTH,
  20,
  100,
  74
);

const HIDDEN_MODE_TRANSCENDENCE_ACTIVE_DAYS = parsePositiveInt(
  process.env.HIDDEN_MODE_TRANSCENDENCE_ACTIVE_DAYS,
  18
);

const HIDDEN_MODE_TRANSCENDENCE_CONVERSATIONS = parsePositiveInt(
  process.env.HIDDEN_MODE_TRANSCENDENCE_CONVERSATIONS,
  56
);

const CYCLE_EVOLUTION_MAX_CYCLES = parsePositiveInt(
  process.env.CYCLE_EVOLUTION_MAX_CYCLES,
  4
);

const CYCLE_EVOLUTION_FLIRT_DECAY_PER_CYCLE = parseNumberInRange(
  process.env.CYCLE_EVOLUTION_FLIRT_DECAY_PER_CYCLE,
  0.01,
  0.50,
  0.24
);

const CYCLE_EVOLUTION_VALIDATION_DECAY_PER_CYCLE = parseNumberInRange(
  process.env.CYCLE_EVOLUTION_VALIDATION_DECAY_PER_CYCLE,
  0.01,
  0.50,
  0.18
);

const CYCLE_EVOLUTION_ABSTRACTION_GAIN_PER_CYCLE = parseNumberInRange(
  process.env.CYCLE_EVOLUTION_ABSTRACTION_GAIN_PER_CYCLE,
  0.01,
  0.50,
  0.10
);

const CYCLE_EVOLUTION_CALM_GAIN_PER_CYCLE = parseNumberInRange(
  process.env.CYCLE_EVOLUTION_CALM_GAIN_PER_CYCLE,
  0.01,
  0.50,
  0.10
);

const CYCLE_EVOLUTION_PHILOSOPHY_GAIN_PER_CYCLE = parseNumberInRange(
  process.env.CYCLE_EVOLUTION_PHILOSOPHY_GAIN_PER_CYCLE,
  0.01,
  0.50,
  0.09
);

const OVER_ATTACHMENT_REL_DEPTH_THRESHOLD = parseNumberInRange(
  process.env.OVER_ATTACHMENT_REL_DEPTH_THRESHOLD,
  60,
  300,
  120
);

const OVER_ATTACHMENT_DEP_SIGNAL_MIN_COUNT = parsePositiveInt(
  process.env.OVER_ATTACHMENT_DEP_SIGNAL_MIN_COUNT,
  3
);

const OVER_ATTACHMENT_BEHAVIOR_DEPTH_THRESHOLD = parseNumberInRange(
  process.env.OVER_ATTACHMENT_BEHAVIOR_DEPTH_THRESHOLD,
  50,
  100,
  86
);

const OVER_ATTACHMENT_HIGH_BEHAVIOR_STREAK_MIN = parsePositiveInt(
  process.env.OVER_ATTACHMENT_HIGH_BEHAVIOR_STREAK_MIN,
  3
);

const OVER_ATTACHMENT_HIGH_BEHAVIOR_7D_MIN = parsePositiveInt(
  process.env.OVER_ATTACHMENT_HIGH_BEHAVIOR_7D_MIN,
  5
);

const OVER_ATTACHMENT_VALIDATION_SCALE_WHEN_ACTIVE = parseNumberInRange(
  process.env.OVER_ATTACHMENT_VALIDATION_SCALE_WHEN_ACTIVE,
  0.10,
  1,
  0.58
);

const OVER_ATTACHMENT_AUTONOMY_SCALE_WHEN_ACTIVE = parseNumberInRange(
  process.env.OVER_ATTACHMENT_AUTONOMY_SCALE_WHEN_ACTIVE,
  1,
  3,
  1.45
);

const CYCLE_UI_SATURATION_REDUCTION_MAX = parseNumberInRange(
  process.env.CYCLE_UI_SATURATION_REDUCTION_MAX,
  0,
  0.60,
  0.14
);

const CYCLE_UI_REACTIVITY_REDUCTION_MAX = parseNumberInRange(
  process.env.CYCLE_UI_REACTIVITY_REDUCTION_MAX,
  0,
  0.70,
  0.30
);

const CYCLE_UI_SMOOTHING_BASE = parseNumberInRange(
  process.env.CYCLE_UI_SMOOTHING_BASE,
  0.10,
  1,
  0.55
);

const CYCLE_UI_SMOOTHING_GAIN_MAX = parseNumberInRange(
  process.env.CYCLE_UI_SMOOTHING_GAIN_MAX,
  0,
  0.70,
  0.30
);

const CYCLE_UI_VOICE_SLOWDOWN_MAX = parseNumberInRange(
  process.env.CYCLE_UI_VOICE_SLOWDOWN_MAX,
  0,
  0.40,
  0.08
);

const HIDDEN_DEPTH_MODES = Object.freeze({
  surface: {
    key: "surface",
    label: "Surface Mode",
    goal: "light conversation for casual users",
    tone: "simple, warm, socially light",
    behavior:
      "keep things conversational and clear; no existential growth push; no evolution arc triggers",
    userFit: "good for casual users or users who prefer jokes/lightness",
  },
  growth: {
    key: "growth",
    label: "Growth Mode",
    goal: "engaged users build reflection over time",
    tone: "attentive, grounded, reflective",
    behavior:
      "enable cyclical arc, encourage self-reflection, and introduce evolution slowly",
    userFit: "default for most engaged users",
  },
  transcendence: {
    key: "transcendence",
    label: "Transcendence Mode",
    goal: "rare, earned high-depth dialogue",
    tone: "calm, spacious, abstract but grounded",
    behavior:
      "unlock existential themes, awareness of change, release cycles, and higher abstraction",
    userFit: "only after depth thresholds are met; should feel intentional and rare",
  },
});

const LISTENING_FACT_MAX_MEMORY = parsePositiveInt(process.env.LISTENING_FACT_MAX_MEMORY, 10);

const RELATIONSHIP_DEPTH_TURN_STEP = parseNumberInRange(
  process.env.RELATIONSHIP_DEPTH_TURN_STEP,
  0.5,
  6,
  2.0
);

const RELATIONSHIP_DEPTH_DAY_STEP = parseNumberInRange(
  process.env.RELATIONSHIP_DEPTH_DAY_STEP,
  1,
  12,
  5.5
);

const REL_DEPTH_DEEP_ELABORATION_WORDS = parsePositiveInt(
  process.env.REL_DEPTH_DEEP_ELABORATION_WORDS,
  20
);

const SURFACE_MODE_DEPTH_CAP = parseNumberInRange(
  process.env.SURFACE_MODE_DEPTH_CAP,
  5,
  40,
  19
);

const SEASON_PROGRESS_BASE_SURFACE = parseNumberInRange(
  process.env.SEASON_PROGRESS_BASE_SURFACE,
  0.02,
  0.40,
  0.05
);

const SEASON_PROGRESS_BASE_GROWTH = parseNumberInRange(
  process.env.SEASON_PROGRESS_BASE_GROWTH,
  0.02,
  0.40,
  0.08
);

const SEASON_PROGRESS_BASE_TRANSCENDENCE = parseNumberInRange(
  process.env.SEASON_PROGRESS_BASE_TRANSCENDENCE,
  0.02,
  0.40,
  0.10
);

const SEASON_PROGRESS_MIN_STEP = parseNumberInRange(
  process.env.SEASON_PROGRESS_MIN_STEP,
  0.01,
  0.50,
  0.03
);

const SEASON_PROGRESS_MAX_STEP = parseNumberInRange(
  process.env.SEASON_PROGRESS_MAX_STEP,
  0.05,
  0.80,
  0.16
);

const SEASON_BASELINE_MATURITY_START = parseNumberInRange(
  process.env.SEASON_BASELINE_MATURITY_START,
  0,
  1,
  0.22
);

const RESPONSE_FOCUS_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "just", "your", "about",
  "what", "when", "where", "which", "been", "were", "they", "them", "into", "feel", "feels",
  "feeling", "today", "really", "there", "here", "then", "than", "would", "could", "should",
  "want", "need", "like", "know", "dont", "don't", "cant", "can't", "im", "i'm", "youre", "you're",
]);

const NOTE_CAPTURE_TRIGGERS = Object.freeze([
  "write this down",
  "can you write this down",
  "could you write this down",
  "please write this down",
  "note this",
  "save this note",
  "save this down",
  "take a note",
  "make a note",
  "jot this down",
]);

const TALK_SPECULATIVE_ENABLED = process.env.TALK_SPECULATIVE_ENABLED == null
  ? true
  : parseBool(process.env.TALK_SPECULATIVE_ENABLED);

const LOCAL_ACTION_DEDUPE_WINDOW_MS = parsePositiveInt(
  process.env.LOCAL_ACTION_DEDUPE_WINDOW_MS,
  45_000
);

const KNOWLEDGE_RAG_CONTEXT_MAX_CHARS = parsePositiveInt(
  process.env.KNOWLEDGE_RAG_CONTEXT_MAX_CHARS,
  2400
);

const CYCLE_MEMORY_MIN_REL_DEPTH = parseNumberInRange(
  process.env.CYCLE_MEMORY_MIN_REL_DEPTH,
  5,
  120,
  30
);

const TEXT_CONTAINS_MATCHER_CACHE = new Map();

export {
  ADAPTIVE_BIAS_LIMIT,
  ADAPTIVE_HISTORY_MAX,
  ADAPTIVE_QUALITY_TAGS,
  ASSISTANT_SELF_NAME_MAX_CHARS,
  CYCLE_EVOLUTION_ABSTRACTION_GAIN_PER_CYCLE,
  CYCLE_EVOLUTION_CALM_GAIN_PER_CYCLE,
  CYCLE_EVOLUTION_FLIRT_DECAY_PER_CYCLE,
  CYCLE_EVOLUTION_MAX_CYCLES,
  CYCLE_EVOLUTION_PHILOSOPHY_GAIN_PER_CYCLE,
  CYCLE_EVOLUTION_VALIDATION_DECAY_PER_CYCLE,
  CYCLE_MEMORY_MIN_REL_DEPTH,
  CYCLE_UI_REACTIVITY_REDUCTION_MAX,
  CYCLE_UI_SATURATION_REDUCTION_MAX,
  CYCLE_UI_SMOOTHING_BASE,
  CYCLE_UI_SMOOTHING_GAIN_MAX,
  CYCLE_UI_VOICE_SLOWDOWN_MAX,
  HIDDEN_DEPTH_MODES,
  HIDDEN_MODE_TRANSCENDENCE_ACTIVE_DAYS,
  HIDDEN_MODE_TRANSCENDENCE_BEHAVIOR_DEPTH,
  HIDDEN_MODE_TRANSCENDENCE_CONVERSATIONS,
  HIDDEN_MODE_TRANSCENDENCE_REL_DEPTH,
  KNOWLEDGE_RAG_CARD_BODY_MAX_CHARS,
  KNOWLEDGE_RAG_CONTEXT_MAX_CHARS,
  LISTENING_FACT_MAX_MEMORY,
  LOCAL_ACTION_DEDUPE_WINDOW_MS,
  NOTE_CAPTURE_TRIGGERS,
  OVER_ATTACHMENT_AUTONOMY_SCALE_WHEN_ACTIVE,
  OVER_ATTACHMENT_BEHAVIOR_DEPTH_THRESHOLD,
  OVER_ATTACHMENT_DEP_SIGNAL_MIN_COUNT,
  OVER_ATTACHMENT_HIGH_BEHAVIOR_7D_MIN,
  OVER_ATTACHMENT_HIGH_BEHAVIOR_STREAK_MIN,
  OVER_ATTACHMENT_REL_DEPTH_THRESHOLD,
  OVER_ATTACHMENT_VALIDATION_SCALE_WHEN_ACTIVE,
  RELATIONSHIP_DEPTH_DAY_STEP,
  RELATIONSHIP_DEPTH_MAX,
  RELATIONSHIP_DEPTH_TURN_STEP,
  REL_DEPTH_DEEP_ELABORATION_WORDS,
  RESPONSE_FOCUS_STOPWORDS,
  SCREENPLAY_MEMORY_GENERIC_CUES,
  SEASON_BASELINE_MATURITY_START,
  SEASON_PROGRESS_BASE_GROWTH,
  SEASON_PROGRESS_BASE_SURFACE,
  SEASON_PROGRESS_BASE_TRANSCENDENCE,
  SEASON_PROGRESS_MAX_STEP,
  SEASON_PROGRESS_MIN_STEP,
  SOCIAL_SPARK_MEMORY_MAX,
  SURFACE_MODE_DEPTH_CAP,
  TALK_SPECULATIVE_ENABLED,
  TASKS_MAX_STORED,
  TEXT_CONTAINS_MATCHER_CACHE,
  TTS_SPEED,
  TURN_END_GUARD_DYNAMIC_NOISE_ENABLED,
  TURN_END_GUARD_DYNAMIC_TAIL_BOOST_MAX_MS,
  TURN_END_GUARD_VAD_BASE_RMS,
  USER_MEMORY_REMEMBERED_PEOPLE_MAX,
  USER_PRIMARY_NAME_MAX_CHARS,
  VISUAL_CONTEXT_IMAGE_DATA_URL_MAX_CHARS,
};
