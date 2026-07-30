import {
  DEFAULT_FEATURE_TARGET_PAGES,
  FEATURE_SEQUENCE_TEMPLATE,
  findSequenceForPage,
} from "./feature_screenplay_map.js";

const DIRECT_PAGE_REQUEST = /^(?:please\s+)?(?:write|draft|continue|finish|complete|rewrite|revise|punch\s*up|generate|give\s+me|show\s+me|start|keep\s+(?:writing|going))\b|\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:write|draft|continue|finish|complete|rewrite|revise|punch\s*up|generate|start)\b/i;
const WRITER_BLOCK_SIGNAL = /\b(?:writer'?s\s+block|writers\s+block|stuck|blocked|out\s+of\s+ideas|no\s+ideas|don'?t\s+know\s+what\s+happens\s+next|what\s+happens\s+next|where\s+do\s+i\s+go|how\s+do\s+i\s+move|story\s+forward|next\s+beat|next\s+scene|middle\s+(?:is\s+)?(?:flat|dragging|slow)|second\s+act\s+(?:is\s+)?(?:flat|dragging|slow))\b/i;
const DEVELOPMENT_SIGNAL = /\b(?:brainstorm|develop|figure\s+out|work\s+out|plan|outline|structure|break\s+(?:the\s+)?story|character\s+arc|story\s+arc|act\s+(?:one|two|three|i|ii|iii|1|2|3)|theme|ending|motivation|want|need|wound|false\s+belief|misbelief)\b/i;
const SCREENPLAY_SIGNAL = /\b(?:screenplay|script|scene|feature|film|movie|act|beat|character|protagonist|antagonist|dialogue|story)\b/i;
const LEARNING_UNCERTAINTY_SIGNAL = /^(?:(?:well|actually|honestly|uh+|um+|h+m+|to\s+be\s+honest)\s*[,;-]?\s*)*(?:(?:i(?:['’]m| am)?\s+)?not\s+sure|i\s+don['’]?t\s+know|i\s+do\s+not\s+know|i(?:['’]m| am)\s+unsure|unsure|no\s+idea|i\s+have\s+no\s+idea|i\s+can['’]?t\s+decide|i\s+cannot\s+decide|i\s+haven['’]?t\s+decided|i\s+have\s+not\s+decided|i\s+need\s+(?:some\s+)?time\s+to\s+think|i\s+need\s+to\s+think|let\s+me\s+think|maybe|perhaps|i\s+guess|i\s+think\s+maybe)(?:\b|[\s,.!?;:])/i;
const LEARNING_DEFERRAL_SIGNAL = /^(?:(?:well|actually|honestly|uh+|um+|h+m+|to\s+be\s+honest)\s*[,;-]?\s*)*(?:skip|let['’]?s\s+skip|pass|not\s+now|later|decide\s+later|let['’]?s\s+come\s+back(?:\s+to\s+(?:it|that|this))?|(?:can|could)\s+we\s+(?:come|circle)\s+back(?:\s+to\s+(?:it|that|this))?|we\s+can\s+decide\s+later|you\s+decide|up\s+to\s+you)(?:\b|[\s,.!?;:])/i;
const LEARNING_IDEATION_REQUEST_SIGNAL = /\b(?:help\s+me\s+(?:decide|choose|figure\s+(?:it|that|this)\s+out|brainstorm)|give\s+me\s+(?:some\s+)?(?:ideas|options|choices)|show\s+me\s+(?:some\s+)?(?:ideas|options|choices)|brainstorm\s+(?:it|that|this|with\s+me)|what\s+(?:do|would)\s+you\s+think|pick\s+(?:one|for\s+me)|surprise\s+me)\b/i;
const LEARNING_CONFIRMATION_ONLY_SIGNAL = /^(?:yes|yeah|yep|correct|exactly|confirmed|definitely|absolutely|no|nope|that\s+one|this\s+one|lock\s+(?:it|that)\s+in)[.!\s]*$/i;
const LEARNING_VAGUE_SIGNAL = /^(?:whatever|anything|either|neither|both|something|same\s+as\s+before|what\s+you\s+said|whatever\s+works|i\s+don['’]?t\s+care|it\s+doesn['’]?t\s+matter|good\s+question|that['’]?s\s+a\s+good\s+question)[.!\s]*$/i;
const LEARNING_OPTION_REFERENCE_SIGNAL = /^(?:(?:i(?:['’]ll| will)?|let(?:['’]s| us)|we(?:['’]ll| will)?)\s+)?(?:(?:pick|choose|want|take|prefer|like|use|go\s+with)\s+)?(?:the\s+)?(?:(?:option|number)\s*)?(?:1|2|3|one|two|three|first|second|third)(?:\s+(?:one|option))?(?:\s*,?\s*please)?[.!\s]*$/i;
const PROVISIONAL_SCREENPLAY_OPTION_COUNT = 3;
const PROVISIONAL_SCREENPLAY_OPTION_MAX_CHARS = 360;
const STORY_SPINE_FIELD_DEFINITIONS = Object.freeze([
  ["project.protagonist_want", "protagonist_want", "protagonistWant"],
  ["project.central_question", "central_question", "centralQuestion"],
  ["project.antagonistic_force", "antagonistic_force", "antagonisticForce"],
  ["project.protagonist_need", "protagonist_need", "protagonistNeed"],
  ["project.ending_image", "ending_image", "endingImage"],
  ["project.theme_argument", "theme_argument", "themeArgument"],
  ["scene.objective", "scene_objective", "sceneObjective"],
  ["story.next_irreversible_choice", "next_scene_plan", "nextScenePlan"],
  ["story_thread.payoff_choice", "next_scene_moves", "nextSceneMoves"],
  ["story_thread.next_setup", "unresolved_setups", "unresolvedSetups"],
]);
const CHARACTER_FIELD_DEFINITIONS = Object.freeze([
  ["character.want", "want", "want"],
  ["character.need", "need", "need"],
  ["character.wound", "wound", "wound"],
  ["character.false_belief", "false_belief", "falseBelief"],
  ["character.relationship_pressure", "relationship_pressure", "relationshipPressure"],
  ["character.current_tactic", "current_tactic", "currentTactic"],
  ["character.next_emotional_turn", "next_emotional_turn", "nextEmotionalTurn"],
]);
const DEFAULT_GAP_SCORES = Object.freeze({
  "project.protagonist_want": 100,
  "project.central_question": 95,
  "project.antagonistic_force": 90,
  "project.protagonist_need": 85,
  "project.ending_image": 80,
  "project.theme_argument": 75,
  "character.want": 72,
  "character.wound": 70,
  "character.false_belief": 68,
  "character.current_tactic": 66,
  "character.next_emotional_turn": 64,
  "scene.objective": 110,
  "story_thread.payoff_choice": 115,
  "story_thread.next_setup": 92,
  "story.next_irreversible_choice": 60,
});
const ACT_GAP_SCORES = Object.freeze({
  act1: Object.freeze({
    "project.protagonist_want": 125,
    "project.antagonistic_force": 118,
    "project.central_question": 112,
    "character.wound": 108,
    "character.false_belief": 104,
    "project.protagonist_need": 88,
    "project.theme_argument": 82,
    "project.ending_image": 68,
    "story_thread.next_setup": 90,
    "story.next_irreversible_choice": 96,
  }),
  act2: Object.freeze({
    "character.current_tactic": 124,
    "story.next_irreversible_choice": 120,
    "story_thread.payoff_choice": 118,
    "story_thread.next_setup": 114,
    "project.antagonistic_force": 110,
    "character.false_belief": 106,
    "project.protagonist_need": 102,
    "character.next_emotional_turn": 98,
    "project.central_question": 86,
    "project.theme_argument": 84,
    "project.ending_image": 78,
    "project.protagonist_want": 72,
  }),
  act3: Object.freeze({
    "story_thread.payoff_choice": 132,
    "project.ending_image": 126,
    "project.protagonist_need": 120,
    "character.next_emotional_turn": 116,
    "project.theme_argument": 112,
    "project.central_question": 106,
    "story_thread.next_setup": 102,
    "story.next_irreversible_choice": 100,
    "project.antagonistic_force": 82,
    "character.false_belief": 80,
    "project.protagonist_want": 62,
  }),
});
const FIELD_TRANSCRIPT_SIGNALS = Object.freeze({
  "project.protagonist_want": /\b(?:(?:protagonist|character|hero)(?:'s)?\s+(?:want|goal|pursuit|objective)|(?:dramatic|external|feature)\s+(?:want|goal)|what\s+does\s+[a-z][a-z'-]*\s+want)\b/i,
  "project.central_question": /\b(?:central|dramatic)\s+question\b/i,
  "project.antagonistic_force": /\b(?:antagonist|opposition|antagonistic|obstacle)\b/i,
  "project.protagonist_need": /\b(?:(?:protagonist|character|hero)(?:'s)?\s+need|(?:deeper|internal)\s+need|transformation|character\s+arc)\b/i,
  "project.ending_image": /\b(?:ending|final\s+image|last\s+image|closing\s+image)\b/i,
  "project.theme_argument": /\b(?:theme|meaning|argument)\b/i,
  "character.wound": /\b(?:wound|trauma|past)\b/i,
  "character.false_belief": /\b(?:false\s+belief|misbelief|lie)\b/i,
  "character.current_tactic": /\b(?:tactic|strategy|approach)\b/i,
  "character.next_emotional_turn": /\b(?:emotional\s+turn|emotion|feeling)\b/i,
  "scene.objective": /\b(?:scene\s+objective|scene\s+goal)\b/i,
  "story_thread.payoff_choice": /\b(?:payoff|pay\s+off|reveal|reversal)\b/i,
  "story_thread.next_setup": /\b(?:setup|plant|promise)\b/i,
  "story.next_irreversible_choice": /\b(?:choice|decision|turn|next\s+(?:beat|scene|move))\b/i,
});
const SEQUENCE_GAP_BONUSES = Object.freeze({
  opening: Object.freeze({
    "character.wound": 70,
    "project.protagonist_want": 60,
    "project.theme_argument": 50,
    "project.ending_image": 30,
    "character.false_belief": 28,
  }),
  commitment: Object.freeze({
    "story.next_irreversible_choice": 80,
    "project.antagonistic_force": 65,
    "project.protagonist_want": 50,
    "scene.objective": 40,
    "project.central_question": 35,
  }),
  premise: Object.freeze({
    "character.current_tactic": 80,
    "project.antagonistic_force": 55,
    "story.next_irreversible_choice": 50,
    "scene.objective": 45,
    "character.next_emotional_turn": 35,
  }),
  midpoint: Object.freeze({
    "story_thread.payoff_choice": 85,
    "story.next_irreversible_choice": 80,
    "project.central_question": 70,
    "project.antagonistic_force": 50,
    "character.current_tactic": 45,
  }),
  fallout: Object.freeze({
    "character.current_tactic": 85,
    "character.false_belief": 70,
    "character.next_emotional_turn": 65,
    "project.protagonist_need": 50,
    "project.theme_argument": 45,
  }),
  crisis: Object.freeze({
    "story_thread.payoff_choice": 90,
    "project.protagonist_need": 85,
    "character.false_belief": 75,
    "character.next_emotional_turn": 65,
    "story.next_irreversible_choice": 55,
  }),
  final_plan: Object.freeze({
    "project.protagonist_need": 90,
    "story_thread.payoff_choice": 80,
    "character.next_emotional_turn": 70,
    "story.next_irreversible_choice": 65,
    "project.theme_argument": 55,
  }),
  climax: Object.freeze({
    "story_thread.payoff_choice": 95,
    "project.protagonist_need": 90,
    "project.central_question": 75,
    "character.next_emotional_turn": 75,
    "project.ending_image": 60,
    "project.theme_argument": 60,
  }),
  resolution: Object.freeze({
    "project.ending_image": 110,
    "project.theme_argument": 75,
    "character.next_emotional_turn": 65,
    "project.central_question": 50,
  }),
});
const SEQUENCE_QUESTION_LEADS = Object.freeze({
  opening: "For the opening sequence",
  commitment: "To lock the Act I commitment",
  premise: "For this premise-testing sequence",
  midpoint: "To make the midpoint irreversible",
  fallout: "In the midpoint fallout",
  crisis: "To power the all-is-lost turn",
  final_plan: "To make the final plan express change",
  climax: "Under climax pressure",
  resolution: "To complete the resolution",
});
const ACTIVE_WRITING_MOMENTUM_WINDOW_MS = 30 * 60 * 1_000;
const MIN_WRITING_MOMENTUM_WINDOW_MS = 20 * 60 * 1_000;
const MAX_WRITING_MOMENTUM_WINDOW_MS = 75 * 60 * 1_000;
const ACCEPTED_SCENE_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const SUBSTANTIAL_INSERTED_TEXT_CHARS = 120;
const PENDING_SCREENPLAY_LEARNING_QUESTIONS_MAX = 8;
const QUESTION_QUIET_WINDOW_MS = Object.freeze({
  asked: 10 * 60 * 1_000,
  declined: 45 * 60 * 1_000,
  expired: 45 * 60 * 1_000,
});

function clean(value, maxChars = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars).trim();
}

function cleanList(value, maxItems = 6, maxChars = 180) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const item of source) {
    const normalized = clean(item, maxChars);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function deriveWritingMomentum({
  now,
  transcript,
  trace,
  studioMeta,
  writerBlocked,
  interventionProfile,
}) {
  const resolvedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const acceptedScenes = Array.isArray(trace?.accepted_scenes) ? trace.accepted_scenes : [];
  const latestAcceptedAt = acceptedScenes.reduce((latest, scene) => {
    const acceptedAt = Number(scene?.accepted_at ?? scene?.acceptedAt ?? 0);
    return Number.isFinite(acceptedAt) && acceptedAt > latest ? acceptedAt : latest;
  }, 0);
  const acceptedSceneAgeMs = latestAcceptedAt > 0 ? resolvedNow - latestAcceptedAt : null;
  const momentumWindowMs = Math.max(
    MIN_WRITING_MOMENTUM_WINDOW_MS,
    Math.min(
      MAX_WRITING_MOMENTUM_WINDOW_MS,
      Number(interventionProfile?.windowMs) || ACTIVE_WRITING_MOMENTUM_WINDOW_MS
    )
  );
  const acceptedSceneIsRecent = acceptedSceneAgeMs !== null &&
    acceptedSceneAgeMs >= -ACCEPTED_SCENE_CLOCK_SKEW_MS &&
    acceptedSceneAgeMs <= momentumWindowMs;
  const insertedTextChars = clean(studioMeta?.screenplayInsertedText, 6_000).length;
  const substantialPageInsertion = insertedTextChars >= SUBSTANTIAL_INSERTED_TEXT_CHARS;
  const explicitCraftFields = Object.entries(FIELD_TRANSCRIPT_SIGNALS)
    .filter(([, signal]) => signal.test(transcript))
    .map(([field]) => field);
  const sources = [
    acceptedSceneIsRecent ? "recent_accepted_page" : "",
    substantialPageInsertion ? "current_page_insertion" : "",
  ].filter(Boolean);
  return {
    active: !writerBlocked && sources.length > 0,
    source: sources.join("+") || "none",
    acceptedSceneIsRecent,
    latestAcceptedAt,
    acceptedSceneAgeSeconds: acceptedSceneAgeMs === null
      ? null
      : Math.max(0, Math.round(acceptedSceneAgeMs / 1_000)),
    insertedTextChars,
    explicitCraftFocus: explicitCraftFields.length > 0,
    explicitCraftFields,
    windowSeconds: momentumWindowMs / 1_000,
    interventionProfile,
  };
}

function firstValue(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return "";
}

function hasFieldValue(value) {
  if (Array.isArray(value)) return cleanList(value, 1, 240).length > 0;
  return Boolean(clean(value, 240));
}

function normalizeFieldName(value) {
  return clean(value, 80).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function provenanceForField(rows, field) {
  const normalizedField = normalizeFieldName(field);
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    normalizeFieldName(row?.field) === normalizedField
  ));
}

function buildFieldState({
  targetField,
  value,
  provenance = [],
  provenanceField,
}) {
  const entries = provenanceForField(provenance, provenanceField);
  const corrected = entries.find((entry) => clean(entry?.status, 32).toLowerCase() === "corrected");
  const learned = entries.find((entry) => (
    clean(entry?.source, 64).toLowerCase() === "screenplay_learning_confirmation" ||
    clean(entry?.status, 32).toLowerCase() === "current"
  ));
  const status = corrected
    ? "corrected"
    : learned
      ? "learned"
      : hasFieldValue(value)
        ? "known"
        : "unknown";
  return {
    targetField,
    status,
    valuePresent: hasFieldValue(value),
    provenance: entries,
  };
}

function aliasedFieldState(state, targetField, resolvedBy) {
  if (!state || state.status === "unknown") return state;
  return {
    ...state,
    targetField,
    resolvedBy,
  };
}

function buildStoryFieldStates(projectMemory, character) {
  const projectProvenance = Array.isArray(projectMemory?.field_provenance)
    ? projectMemory.field_provenance
    : [];
  const characterArc = character?.arc && typeof character.arc === "object"
    ? character.arc
    : {};
  const characterProvenance = Array.isArray(character?.field_provenance)
    ? character.field_provenance
    : [];
  const states = {};
  for (const [targetField, valueField, provenanceField] of STORY_SPINE_FIELD_DEFINITIONS) {
    states[targetField] = buildFieldState({
      targetField,
      value: projectMemory?.[valueField],
      provenance: projectProvenance,
      provenanceField,
    });
  }
  for (const [targetField, valueField, provenanceField] of CHARACTER_FIELD_DEFINITIONS) {
    states[targetField] = buildFieldState({
      targetField,
      value: characterArc?.[valueField] ?? characterArc?.[provenanceField],
      provenance: characterProvenance,
      provenanceField,
    });
  }

  const projectWant = states["project.protagonist_want"];
  const characterWant = states["character.want"];
  if (character) {
    if (projectWant.status === "unknown" && characterWant.status !== "unknown") {
      states["project.protagonist_want"] = aliasedFieldState(
        characterWant,
        "project.protagonist_want",
        "character.want"
      );
    } else if (characterWant.status === "unknown" && projectWant.status !== "unknown") {
      states["character.want"] = aliasedFieldState(
        projectWant,
        "character.want",
        "project.protagonist_want"
      );
    }

    const projectNeed = states["project.protagonist_need"];
    const characterNeed = states["character.need"];
    if (projectNeed.status === "unknown" && characterNeed.status !== "unknown") {
      states["project.protagonist_need"] = aliasedFieldState(
        characterNeed,
        "project.protagonist_need",
        "character.need"
      );
    } else if (characterNeed.status === "unknown" && projectNeed.status !== "unknown") {
      states["character.need"] = aliasedFieldState(
        projectNeed,
        "character.need",
        "project.protagonist_need"
      );
    }
  }
  return states;
}

function summarizeFieldStates(states) {
  const summary = {
    unknown: [],
    known: [],
    learned: [],
    corrected: [],
  };
  for (const [field, state] of Object.entries(states || {})) {
    const status = Object.prototype.hasOwnProperty.call(summary, state?.status)
      ? state.status
      : "unknown";
    summary[status].push(field);
  }
  return summary;
}

function questionFieldLane(field) {
  const normalized = clean(field, 64).toLowerCase();
  if (!normalized) return "";
  if (normalized.startsWith("story_thread.")) return "story_thread";
  if (normalized.startsWith("story.")) return "story";
  return normalized.split(".")[0] || "";
}

function normalizeQuestionEffectiveness(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const targetField = clean(row?.target_field ?? row?.targetField, 64).toLowerCase();
      const askedAt = Math.max(0, Number(row?.asked_at ?? row?.askedAt ?? 0));
      const answeredAt = Math.max(0, Number(row?.answered_at ?? row?.answeredAt ?? 0));
      if (!targetField || (!askedAt && !answeredAt)) return null;
      const acceptedPageCount = Math.max(
        0,
        Math.floor(Number(row?.accepted_page_count ?? row?.acceptedPageCount ?? 0))
      );
      const blockResolutionCount = Math.max(
        0,
        Math.floor(Number(row?.block_resolution_count ?? row?.blockResolutionCount ?? 0))
      );
      const outcome = clean(row?.outcome, 48).toLowerCase();
      const responseStatusRaw = clean(
        row?.response_status ?? row?.responseStatus,
        24
      ).toLowerCase();
      const responseStatus = ["asked", "answered", "declined", "expired"].includes(responseStatusRaw)
        ? responseStatusRaw
        : answeredAt
          ? "answered"
          : outcome === "ignored"
            ? "expired"
            : outcome === "declined"
              ? "declined"
              : "asked";
      return {
        questionId: clean(row?.question_id ?? row?.questionId, 120),
        targetField,
        lane: questionFieldLane(targetField),
        actKey: clean(row?.act_key ?? row?.actKey, 24).toLowerCase(),
        sequenceKey: clean(row?.sequence_key ?? row?.sequenceKey, 32).toLowerCase(),
        writerBlocked: Boolean(row?.writer_blocked ?? row?.writerBlocked),
        askedAt: askedAt || answeredAt,
        answeredAt,
        responseStatus,
        acceptedPageCount,
        blockResolutionCount,
        successful: acceptedPageCount > 0 || blockResolutionCount > 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      Math.max(right.answeredAt, right.askedAt) -
      Math.max(left.answeredAt, left.askedAt)
    ))
    .slice(0, 24);
}

function applyAnsweredQuestionResolutions(states, questionEffectiveness = []) {
  const next = { ...(states || {}) };
  for (const outcome of questionEffectiveness) {
    if (outcome?.responseStatus !== "answered") continue;
    const targetField = clean(outcome.targetField, 64).toLowerCase();
    if (!targetField.startsWith("project.") && !targetField.startsWith("character.")) continue;
    const current = next[targetField];
    if (!current || current.status !== "unknown") continue;
    next[targetField] = {
      ...current,
      status: "learned",
      resolvedBy: "answered_question_outcome",
      provenance: [{
        source: "screenplay_learning_confirmation",
        status: "current",
        question_id: outcome.questionId,
        answered_at: outcome.answeredAt,
      }],
    };
  }
  return next;
}

function buildQuestionQuietWindow(
  questionEffectiveness = [],
  fieldStates = {},
  now = Date.now()
) {
  const resolvedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  for (const outcome of questionEffectiveness) {
    const status = clean(outcome?.responseStatus, 24).toLowerCase();
    const windowMs = Number(QUESTION_QUIET_WINDOW_MS[status] || 0);
    if (!windowMs) continue;
    const targetField = clean(outcome?.targetField, 64).toLowerCase();
    if (fieldStates?.[targetField]?.status !== "unknown") continue;
    const eventAt = Math.max(0, Number(outcome?.answeredAt || outcome?.askedAt || 0));
    if (!eventAt) continue;
    const ageMs = resolvedNow - eventAt;
    if (ageMs < -ACCEPTED_SCENE_CLOCK_SKEW_MS || ageMs > windowMs) continue;
    return {
      active: true,
      responseStatus: status,
      targetField,
      ageSeconds: Math.max(0, Math.round(ageMs / 1_000)),
      remainingSeconds: Math.max(0, Math.ceil((windowMs - Math.max(0, ageMs)) / 1_000)),
      windowSeconds: Math.round(windowMs / 1_000),
    };
  }
  return {
    active: false,
    responseStatus: "",
    targetField: "",
    ageSeconds: null,
    remainingSeconds: 0,
    windowSeconds: 0,
  };
}

function buildQuestionInterventionProfile(questionEffectiveness = []) {
  const sample = (Array.isArray(questionEffectiveness) ? questionEffectiveness : []).slice(0, 8);
  const answeredCount = sample.filter((item) => (
    item.responseStatus === "answered" || item.successful
  )).length;
  const ignoredCount = sample.filter((item) => (
    item.responseStatus === "declined" || item.responseStatus === "expired"
  )).length;
  const successfulCount = sample.filter((item) => item.successful).length;
  const resolvedCount = answeredCount + ignoredCount;
  const responseRate = resolvedCount > 0 ? answeredCount / resolvedCount : 0;
  let windowMs = ACTIVE_WRITING_MOMENTUM_WINDOW_MS;
  let strategy = "balanced";
  if (ignoredCount >= 3 && responseRate < 0.5) {
    windowMs = MAX_WRITING_MOMENTUM_WINDOW_MS;
    strategy = "strongly_protect_flow";
  } else if (ignoredCount >= 2 && responseRate < 0.5) {
    windowMs = 60 * 60 * 1_000;
    strategy = "protect_flow";
  } else if (ignoredCount >= 1 && ignoredCount >= answeredCount) {
    windowMs = 45 * 60 * 1_000;
    strategy = "favor_silence";
  } else if (successfulCount >= 2 && responseRate >= 0.6) {
    windowMs = MIN_WRITING_MOMENTUM_WINDOW_MS;
    strategy = "questions_proven_helpful";
  }
  return {
    strategy,
    sampleCount: sample.length,
    answeredCount,
    ignoredCount,
    successfulCount,
    responseRate: Number(responseRate.toFixed(2)),
    windowMs,
    windowMinutes: Math.round(windowMs / 60_000),
  };
}

function questionEffectivenessBonus(field, {
  actKey,
  sequenceKey,
  writerBlocked,
  questionEffectiveness = [],
}) {
  const targetField = clean(field, 64).toLowerCase();
  const targetLane = questionFieldLane(targetField);
  let bonus = 0;
  let matched = 0;
  for (const outcome of questionEffectiveness) {
    if (!outcome?.successful) continue;
    const exactField = outcome.targetField === targetField;
    const sameLane = Boolean(targetLane && outcome.lane === targetLane);
    const sameSequence = Boolean(sequenceKey && outcome.sequenceKey === sequenceKey);
    const sameAct = Boolean(actKey && outcome.actKey === actKey);
    if (!exactField && !sameLane && !sameSequence) continue;
    let outcomeBonus = exactField ? 18 : sameLane ? 4 : 0;
    if (sameSequence) outcomeBonus += 5;
    if (sameAct) outcomeBonus += 2;
    if (outcome.acceptedPageCount > 0) {
      outcomeBonus += exactField ? 12 : sameLane ? 4 : 2;
    }
    if (
      writerBlocked &&
      outcome.writerBlocked &&
      outcome.blockResolutionCount > 0
    ) {
      outcomeBonus += exactField ? 10 : 4;
    }
    bonus += outcomeBonus;
    matched += 1;
    if (matched >= 2 || bonus >= 42) break;
  }
  return Math.min(42, Math.max(0, Math.round(bonus)));
}

function hasProvenBlockRecovery(field, {
  actKey,
  sequenceKey,
  questionEffectiveness = [],
}) {
  const targetField = clean(field, 64).toLowerCase();
  const targetLane = questionFieldLane(targetField);
  return questionEffectiveness.some((outcome) => {
    if (!outcome?.writerBlocked || outcome.blockResolutionCount < 1) return false;
    const exactField = outcome.targetField === targetField;
    const sameLane = Boolean(targetLane && outcome.lane === targetLane);
    const sameSequence = Boolean(sequenceKey && outcome.sequenceKey === sequenceKey);
    const sameAct = Boolean(actKey && outcome.actKey === actKey);
    return exactField || sameSequence || (sameLane && sameAct);
  });
}

function normalizedAnchor(value) {
  return clean(value, 240)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function provenanceResolvesAnchor(state, anchor) {
  const normalized = normalizedAnchor(anchor);
  if (!normalized || !state || state.status === "unknown") return false;
  if (state.status === "corrected") return true;
  for (const entry of state.provenance || []) {
    const haystack = normalizedAnchor([
      entry?.anchor,
      entry?.question,
      entry?.target_label,
      entry?.targetLabel,
    ].filter(Boolean).join(" "));
    if (haystack && (haystack.includes(normalized) || normalized.includes(haystack))) return true;
    const tokens = normalized.split(" ").filter((token) => token.length > 3);
    if (tokens.length && tokens.filter((token) => haystack.includes(token)).length >= Math.min(3, tokens.length)) {
      return true;
    }
  }
  return false;
}

function fieldIsUnknown(states, targetField) {
  return states?.[targetField]?.status === "unknown";
}

function actKeyFromValue(value) {
  const normalized = clean(value, 240).toLowerCase();
  if (!normalized) return "";
  if (/\b(?:act\s*(?:iii|3|three)|third\s+act)\b/.test(normalized)) return "act3";
  if (/\b(?:act\s*(?:ii|2|two)|second\s+act)\b/.test(normalized)) return "act2";
  if (/\b(?:act\s*(?:i|1|one)|first\s+act)\b/.test(normalized)) return "act1";
  return "";
}

function deriveActContext({ transcript, studioMeta, projectMemory }) {
  const candidates = [
    ["transcript", transcript],
    ["studio", studioMeta?.screenplayAct],
    ["memory", projectMemory?.act],
    ["sequence", studioMeta?.screenplayFeatureSequence],
    ["sequence", projectMemory?.feature_sequence],
  ];
  for (const [source, value] of candidates) {
    const key = actKeyFromValue(value);
    if (key) {
      return {
        key,
        label: key === "act1" ? "Act I" : key === "act2" ? "Act II" : "Act III",
        source,
      };
    }
  }
  return { key: "unknown", label: "Unknown act", source: "none" };
}

function positiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function sequenceKeyForTemplateId(value) {
  switch (clean(value, 40).toLowerCase()) {
    case "sequence-1": return "opening";
    case "sequence-2": return "commitment";
    case "sequence-3": return "premise";
    case "sequence-4": return "midpoint";
    case "sequence-5": return "fallout";
    case "sequence-6": return "crisis";
    case "sequence-7": return "final_plan";
    case "sequence-8": return "climax";
    default: return "";
  }
}

function sequenceKeyFromText(value) {
  const text = clean(value, 500).toLowerCase();
  if (!text) return "";
  if (/\b(?:resolution|denouement|epilogue)\b/.test(text) ||
      (/\b(?:final|closing|last)\s+image\b/.test(text) && !/\bclimax\b/.test(text))) {
    return "resolution";
  }
  if (/\b(?:climax|final\s+battle|decisive\s+choice)\b/.test(text)) return "climax";
  if (/\b(?:break\s+into\s+three|final\s+plan|new\s+plan)\b/.test(text)) return "final_plan";
  if (/\b(?:all\s+is\s+lost|low\s+point|collapse|dark\s+night)\b/.test(text)) return "crisis";
  if (/\b(?:reversal\s+fallout|bad\s+guys\s+close\s+in|midpoint\s+fallout)\b/.test(text)) return "fallout";
  if (/\bmidpoint\b/.test(text)) return "midpoint";
  if (/\b(?:promise\s+of\s+the\s+premise|fun\s+and\s+games|premise[-\s]+testing)\b/.test(text)) {
    return "premise";
  }
  if (/\b(?:catalyst|inciting\s+incident|debate|commitment|break\s+into\s+two|lock[-\s]+in)\b/.test(text)) {
    return "commitment";
  }
  if (/\b(?:opening\s+image|ordinary\s+world|opening\s+sequence)\b/.test(text)) return "opening";
  return "";
}

function templateForSequenceKey(key) {
  const templateId = {
    opening: "sequence-1",
    commitment: "sequence-2",
    premise: "sequence-3",
    midpoint: "sequence-4",
    fallout: "sequence-5",
    crisis: "sequence-6",
    final_plan: "sequence-7",
    climax: "sequence-8",
    resolution: "sequence-8",
  }[key];
  return FEATURE_SEQUENCE_TEMPLATE.find((item) => item.id === templateId) || null;
}

function buildSequenceContext(key, source, {
  obligation = "",
  currentBeat = "",
  payoffRunway = [],
  template = null,
} = {}) {
  const sequence = template || templateForSequenceKey(key);
  const resolvedLabel = key === "resolution"
    ? "Resolution / Final Image"
    : clean(sequence?.label, 160) || "Unknown sequence";
  return {
    key: key || "unknown",
    label: resolvedLabel,
    source: key ? source : "none",
    obligation: firstValue(obligation, sequence?.obligation),
    currentBeat: clean(currentBeat, 220),
    payoffRunway: cleanList(payoffRunway, 3, 200),
  };
}

function deriveSequenceContext({ transcript, studioMeta, projectMemory }) {
  const progress = projectMemory?.act_progress && typeof projectMemory.act_progress === "object"
    ? projectMemory.act_progress
    : {};
  const obligation = firstValue(
    studioMeta?.screenplayFeatureObligation,
    projectMemory?.feature_obligation,
    progress.current_obligation
  );
  const currentBeat = firstValue(
    studioMeta?.screenplayCurrentBeat,
    projectMemory?.current_beat
  );
  const payoffRunway = cleanList(projectMemory?.act_three_payoff_path, 3, 200);
  const explicitKey = sequenceKeyFromText(transcript);
  if (explicitKey) {
    return buildSequenceContext(explicitKey, "transcript", {
      obligation,
      currentBeat,
      payoffRunway,
    });
  }

  const namedCandidates = [
    ["studio", studioMeta?.screenplayFeatureSequence],
    ["memory", projectMemory?.feature_sequence],
    ["act_progress", progress.current_sequence],
  ];
  for (const [source, value] of namedCandidates) {
    const text = clean(value, 220);
    if (!text) continue;
    const template = FEATURE_SEQUENCE_TEMPLATE.find((item) => (
      text.toLowerCase().includes(item.label.toLowerCase())
    ));
    const key = sequenceKeyForTemplateId(template?.id) || sequenceKeyFromText(text);
    if (key) {
      return buildSequenceContext(key, source, {
        obligation,
        currentBeat,
        payoffRunway,
        template,
      });
    }
  }

  const pageCount = positiveInteger(
    studioMeta?.screenplayPageCount ?? progress.page_count
  );
  const targetPages = positiveInteger(
    studioMeta?.screenplayTargetPages ?? progress.target_pages
  ) || DEFAULT_FEATURE_TARGET_PAGES;
  const pageSequence = findSequenceForPage(pageCount, targetPages);
  const pageKey = sequenceKeyForTemplateId(pageSequence?.id);
  if (pageKey) {
    return buildSequenceContext(pageKey, "page_position", {
      obligation,
      currentBeat,
      payoffRunway,
      template: pageSequence,
    });
  }

  for (const [source, value] of [
    ["current_beat", currentBeat],
    ["obligation", obligation],
  ]) {
    const key = sequenceKeyFromText(value);
    if (key) {
      return buildSequenceContext(key, source, {
        obligation,
        currentBeat,
        payoffRunway,
      });
    }
  }
  return buildSequenceContext("", "none", { obligation, currentBeat, payoffRunway });
}

function scoreGap(gap, {
  actKey,
  sequenceKey,
  writerBlocked,
  transcript,
  questionEffectiveness = [],
}) {
  const field = gap?.field || "";
  const actScores = ACT_GAP_SCORES[actKey] || {};
  let score = Number(actScores[field] ?? DEFAULT_GAP_SCORES[field] ?? 50);
  score += Number(SEQUENCE_GAP_BONUSES[sequenceKey]?.[field] || 0);
  if (writerBlocked) {
    if (field === "scene.objective") score += 34;
    if (field === "story_thread.payoff_choice") score += 30;
    if (field === "story_thread.next_setup") score += 22;
    if (field === "story.next_irreversible_choice") score += 28;
  }
  if (FIELD_TRANSCRIPT_SIGNALS[field]?.test(transcript)) score += 80;
  score += questionEffectivenessBonus(field, {
    actKey,
    sequenceKey,
    writerBlocked,
    questionEffectiveness,
  });
  return Math.round(score);
}

function selectHighestValueGap(candidates, context) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((gap, order) => ({
      ...gap,
      score: scoreGap(gap, context),
      effectivenessBonus: questionEffectivenessBonus(gap?.field, context),
      order,
    }))
    .sort((left, right) => right.score - left.score || left.order - right.order)[0] || null;
}

function contextualizeGapForSequence(gap, sequenceContext) {
  if (!gap || !sequenceContext || sequenceContext.key === "unknown") return gap;
  const lead = SEQUENCE_QUESTION_LEADS[sequenceContext.key];
  if (!lead) return gap;
  const question = clean(gap.question, 260);
  const contextualQuestion = question
    ? `${lead}, ${question.charAt(0).toLowerCase()}${question.slice(1)}`
    : "";
  return {
    ...gap,
    question: clean(contextualQuestion, 260),
    reason: clean(
      `${gap.reason} Current sequence: ${sequenceContext.label}.`,
      180
    ),
  };
}

function sequenceExecutionDirective(sequenceContext) {
  if (!sequenceContext || sequenceContext.key === "unknown") return "";
  const directives = [`Keep the work inside ${sequenceContext.label}.`];
  if (sequenceContext.obligation) {
    directives.push(`Sequence obligation: ${sequenceContext.obligation}`);
  }
  if (sequenceContext.currentBeat) {
    directives.push(`Spend the current beat first: ${sequenceContext.currentBeat}`);
  }
  if (sequenceContext.payoffRunway?.length) {
    directives.push(`Protect the remembered payoff runway, beginning with: ${sequenceContext.payoffRunway[0]}`);
  }
  return ` ${directives.join(" ")}`;
}

function firstNamedCharacter(characters, transcript, characterFocus = []) {
  const items = Array.isArray(characters) ? characters.filter(Boolean) : [];
  const lowerTranscript = String(transcript || "").toLowerCase();
  const focus = cleanList(characterFocus, 8, 80).map((name) => name.toLowerCase());
  return items.find((character) => {
    const name = clean(character?.name, 80).toLowerCase();
    return name && lowerTranscript.includes(name);
  }) || items.find((character) => focus.includes(clean(character?.name, 80).toLowerCase())) || items[0] || null;
}

function projectLabel(trace, projectMemory, studioMeta) {
  return firstValue(
    trace?.project_title,
    projectMemory?.project_title,
    studioMeta?.screenplayProjectTitle
  );
}

function buildGap({ field, label, anchor, question, reason }) {
  return {
    field: clean(field, 64),
    label: clean(label, 120),
    anchor: clean(anchor, 180),
    question: clean(question, 260),
    reason: clean(reason, 180),
  };
}

function characterGaps(character, fieldStates) {
  if (!character || typeof character !== "object") return [];
  const name = clean(character.name, 80) || "the protagonist";
  const gaps = [];
  if (fieldIsUnknown(fieldStates, "character.want")) {
    gaps.push(buildGap({
      field: "character.want",
      label: `${name}'s dramatic want`,
      anchor: name,
      question: `What does ${name} want badly enough to keep choosing danger instead of safety?`,
      reason: "A durable want gives the feature a repeatable engine.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "character.wound")) {
    gaps.push(buildGap({
      field: "character.wound",
      label: `${name}'s wound`,
      anchor: name,
      question: `What old wound makes ${name}'s current goal emotionally dangerous?`,
      reason: "The wound turns external plot pressure into personal cost.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "character.false_belief")) {
    gaps.push(buildGap({
      field: "character.false_belief",
      label: `${name}'s false belief`,
      anchor: name,
      question: `What false belief is ${name} still using to survive?`,
      reason: "A false belief creates an act-spanning inner argument.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "character.current_tactic")) {
    gaps.push(buildGap({
      field: "character.current_tactic",
      label: `${name}'s current tactic`,
      anchor: name,
      question: `What tactic is ${name} relying on right now that the next scene can make fail?`,
      reason: "A failing tactic produces behavior, escalation, and a new choice.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "character.next_emotional_turn")) {
    gaps.push(buildGap({
      field: "character.next_emotional_turn",
      label: `${name}'s next emotional turn`,
      anchor: name,
      question: `What should ${name} feel by the end of the next scene that they cannot admit at its start?`,
      reason: "The emotional turn keeps plot movement from feeling mechanical.",
    }));
  }
  return gaps;
}

function projectGaps({ fieldStates, projectName, protagonistName }) {
  const subject = protagonistName || "the protagonist";
  const gaps = [];
  if (fieldIsUnknown(fieldStates, "project.protagonist_want")) {
    gaps.push(buildGap({
      field: "project.protagonist_want",
      label: `${subject}'s feature want`,
      anchor: subject,
      question: `What does ${subject} want badly enough to carry ${projectName} through all three acts?`,
      reason: "The feature needs one durable external pursuit before more beats are added.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "project.central_question")) {
    gaps.push(buildGap({
      field: "project.central_question",
      label: "the feature's central dramatic question",
      anchor: projectName,
      question: `What single dramatic question should ${projectName} keep tightening until the climax answers it?`,
      reason: "A central question lets every sequence advance the same movie.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "project.antagonistic_force")) {
    gaps.push(buildGap({
      field: "project.antagonistic_force",
      label: "the antagonistic force",
      anchor: projectName,
      question: `What force can actively punish ${subject} for pursuing that want?`,
      reason: "Active opposition creates escalation instead of incident accumulation.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "project.protagonist_need")) {
    gaps.push(buildGap({
      field: "project.protagonist_need",
      label: `${subject}'s deeper need`,
      anchor: subject,
      question: `What must ${subject} learn or surrender to become capable of the ending?`,
      reason: "The need connects the external climax to an internal transformation.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "project.ending_image")) {
    gaps.push(buildGap({
      field: "project.ending_image",
      label: "the ending image",
      anchor: projectName,
      question: `What final image would prove ${projectName} has emotionally changed, without explaining it in dialogue?`,
      reason: "An ending image gives earlier acts a visible destination.",
    }));
  }
  if (fieldIsUnknown(fieldStates, "project.theme_argument")) {
    gaps.push(buildGap({
      field: "project.theme_argument",
      label: "the theme argument",
      anchor: projectName,
      question: `What does ${projectName} ultimately argue about how a person should live?`,
      reason: "A theme argument helps Clementine judge competing story moves by meaning, not novelty.",
    }));
  }
  return gaps;
}

function dueThreadGap(dueThread) {
  if (!dueThread || typeof dueThread !== "object") return null;
  const setup = clean(dueThread.setup, 180);
  if (!setup) return null;
  const promisedPayoff = clean(dueThread.promised_payoff, 180);
  return buildGap({
    field: "story_thread.payoff_choice",
    label: "the next payoff choice",
    anchor: setup,
    question: promisedPayoff
      ? `Should the next scene pay off "${setup}" as a revelation, a sacrifice, or a reversal?`
      : `What consequence should "${setup}" create when it returns?`,
    reason: "A due setup is the fastest source of forward motion that still belongs to this movie.",
  });
}

function unresolvedSetupGap(values) {
  const setup = cleanList(values, 1, 180)[0] || "";
  if (!setup) return null;
  return buildGap({
    field: "story_thread.next_setup",
    label: "the next setup to reactivate",
    anchor: setup,
    question: `What would make "${setup}" return now with a worse consequence than the audience expects?`,
    reason: "Reactivating an existing promise preserves continuity while restoring momentum.",
  });
}

function fallbackChoiceGap({ protagonistName, projectName }) {
  const subject = protagonistName || "the protagonist";
  return buildGap({
    field: "story.next_irreversible_choice",
    label: "the next irreversible choice",
    anchor: subject || projectName,
    question: `Which safe option should ${subject} lose in the next scene?`,
    reason: "Closing a safe option makes the following beat causally necessary.",
  });
}

function shouldOfferProvisionalOptions(resolution) {
  const reason = clean(resolution?.answerClassification?.reason, 64);
  return resolution?.status === "provisional_options" ||
    reason === "uncertain" ||
    reason === "ideation_request";
}

function buildProvisionalOptionSelectionQuestion(pending) {
  const label = clean(pending?.targetLabel, 120) || "this story choice";
  return clean(
    `Which path should become true for ${label}: Option 1, 2, or 3?`,
    260
  );
}

function buildProvisionalOptionObjective(pending, actContext, sequenceContext) {
  const label = clean(pending?.targetLabel, 120) || "the unresolved story choice";
  const actLabel = actContext?.key === "unknown" ? "the current act" : actContext.label;
  const sequenceLabel = sequenceContext?.key === "unknown"
    ? "the current sequence"
    : sequenceContext.label;
  const sequenceDirective = sequenceExecutionDirective(sequenceContext);
  return [
    `Give exactly three mutually exclusive, canon-compatible choices for ${label}, ranked for ${actLabel} / ${sequenceLabel}.`,
    "Option 1 must be your strongest recommendation: the choice with the clearest causal pressure and feature-length consequences.",
    "Option 2 must prioritize character and emotional reversal. Option 3 must be the boldest credible complication or payoff path.",
    "Use exactly these three newline-delimited labels:\nOption 1 (recommended): <one complete story fact>\nOption 2: <one complete story fact>\nOption 3: <one complete story fact>",
    "After each option line, you may add one short consequence sentence, but never present any option as remembered or decided.",
    "Treat all three as provisional. Do not save, assume, or write forward from one until the writer explicitly chooses it.",
    sequenceDirective.trim(),
  ].filter(Boolean).join(" ");
}

export function buildScreenplayQuestionPlan({
  transcript = "",
  creativeMemoryTrace = null,
  studioMeta = null,
  turnPlanner = null,
  answeredLearningContext = null,
  pendingLearningQuestion = null,
  pendingLearningResolution = null,
  now = Date.now(),
} = {}) {
  const text = clean(transcript, 4_000);
  const trace = creativeMemoryTrace && typeof creativeMemoryTrace === "object"
    ? creativeMemoryTrace
    : {};
  const projectMemory = trace.screenplay_project_memory && typeof trace.screenplay_project_memory === "object"
    ? trace.screenplay_project_memory
    : {};
  const questionEffectiveness = normalizeQuestionEffectiveness(
    projectMemory.question_effectiveness ?? projectMemory.questionEffectiveness
  );
  const target = clean(studioMeta?.screenplayTarget, 32).toLowerCase();
  const projectId = firstValue(
    studioMeta?.screenplayProjectId,
    trace.project_id,
    projectMemory.project_id
  );
  const projectTitle = projectLabel(trace, projectMemory, studioMeta);
  const projectName = projectTitle || "this feature";
  const hasScreenplayContext = Boolean(
    projectId ||
    target ||
    trace.screenplay_project_memory ||
    (trace.character_count > 0 && SCREENPLAY_SIGNAL.test(text)) ||
    SCREENPLAY_SIGNAL.test(text)
  );
  if (!hasScreenplayContext) {
    return {
      active: false,
      mode: "none",
      shouldAsk: false,
      reason: "No screenplay context detected.",
    };
  }

  const directPageRequest = target === "page" || DIRECT_PAGE_REQUEST.test(text);
  if (directPageRequest) {
    return {
      active: true,
      mode: "answer_now",
      shouldAsk: false,
      askAfterDeliverable: false,
      reason: "The writer requested pages or a concrete rewrite; questions must not block execution.",
      projectId,
      projectTitle,
    };
  }

  const provisionalPending = sanitizePendingScreenplayLearningQuestion(
    pendingLearningQuestion
  );
  if (
    provisionalPending &&
    shouldOfferProvisionalOptions(pendingLearningResolution)
  ) {
    const actContext = deriveActContext({ transcript: text, studioMeta, projectMemory });
    const sequenceContext = deriveSequenceContext({ transcript: text, studioMeta, projectMemory });
    return {
      active: true,
      mode: "provisional_options",
      shouldAsk: true,
      askAfterDeliverable: true,
      reason: "The writer asked Clementine to help decide instead of confirming a story fact.",
      objective: buildProvisionalOptionObjective(
        provisionalPending,
        actContext,
        sequenceContext
      ),
      projectId: provisionalPending.projectId || projectId,
      projectTitle: provisionalPending.projectTitle || projectTitle,
      targetField: provisionalPending.targetField,
      targetLabel: provisionalPending.targetLabel,
      anchor: provisionalPending.anchor,
      question: buildProvisionalOptionSelectionQuestion(provisionalPending),
      originalQuestion: provisionalPending.question,
      memoryAuthority: "writer_clarification",
      writerBlocked: true,
      targetFieldStatus: "unknown",
      actContext,
      sequenceContext,
      questionStrategy: "provisional_ranked_choice",
      provisionalChoice: true,
      optionCount: PROVISIONAL_SCREENPLAY_OPTION_COUNT,
    };
  }

  if (answeredLearningContext && typeof answeredLearningContext === "object") {
    return {
      active: true,
      mode: "apply_learning",
      shouldAsk: false,
      askAfterDeliverable: false,
      reason: "The writer answered the previous story question; apply the answer before opening another gap.",
      objective: "Reflect the clarification through one concrete story consequence or next move without asking another question.",
      projectId,
      projectTitle,
      targetField: clean(answeredLearningContext.targetField, 64),
      targetLabel: clean(answeredLearningContext.targetLabel, 120),
    };
  }

  const writerBlocked = WRITER_BLOCK_SIGNAL.test(text) || clean(turnPlanner?.intent, 64) === "momentum_rescue";
  const developmentTurn = writerBlocked || DEVELOPMENT_SIGNAL.test(text) || clean(turnPlanner?.intent, 64) === "idea_development";
  if (!developmentTurn) {
    return {
      active: true,
      mode: "none",
      shouldAsk: false,
      askAfterDeliverable: false,
      reason: "The turn does not need a screenplay-learning question.",
      projectId,
      projectTitle,
    };
  }

  const characters = Array.isArray(trace.characters) ? trace.characters : [];
  const character = firstNamedCharacter(
    characters,
    text,
    studioMeta?.screenplayCharacterFocus
  );
  const protagonistName = clean(character?.name, 80) || "";
  const fieldStates = applyAnsweredQuestionResolutions(
    buildStoryFieldStates(projectMemory, character),
    questionEffectiveness
  );
  const fieldStateSummary = summarizeFieldStates(fieldStates);
  const actContext = deriveActContext({ transcript: text, studioMeta, projectMemory });
  const sequenceContext = deriveSequenceContext({ transcript: text, studioMeta, projectMemory });
  const interventionProfile = buildQuestionInterventionProfile(questionEffectiveness);
  const questionQuietWindow = buildQuestionQuietWindow(
    questionEffectiveness,
    fieldStates,
    now
  );
  const writingMomentum = deriveWritingMomentum({
    now,
    transcript: text,
    trace,
    studioMeta,
    writerBlocked,
    interventionProfile,
  });
  if (writingMomentum.active && !writingMomentum.explicitCraftFocus) {
    const sequenceDirective = sequenceExecutionDirective(sequenceContext);
    return {
      active: true,
      mode: "protect_momentum",
      shouldAsk: false,
      askAfterDeliverable: false,
      projectId,
      projectTitle,
      objective: `Keep advancing the writer's current work from known canon without opening a new intake question.${sequenceDirective}`,
      reason: "Recent accepted pages show active writing momentum; a generic learning question would interrupt useful flow.",
      fieldStates: fieldStateSummary,
      actContext,
      sequenceContext,
      writingMomentum,
      questionStrategy: "suppress_low_value_question",
    };
  }
  if (questionQuietWindow.active) {
    const sequenceDirective = sequenceExecutionDirective(sequenceContext);
    const awaitingAnswer = questionQuietWindow.responseStatus === "asked";
    return {
      active: true,
      mode: writerBlocked ? "rescue_without_question" : "develop_without_question",
      shouldAsk: false,
      askAfterDeliverable: false,
      projectId,
      projectTitle,
      objective: writerBlocked
        ? `Offer three distinct causal story moves, recommend the strongest, and advance it from known canon without asking another intake question.${sequenceDirective}`
        : `Develop the requested story area from known canon without opening another intake question yet.${sequenceDirective}`,
      reason: awaitingAnswer
        ? "A screenplay question is already awaiting a response; Clementine will not stack another."
        : "The writer recently declined or skipped a screenplay question; Clementine will protect flow before asking again.",
      fieldStates: fieldStateSummary,
      actContext,
      sequenceContext,
      writingMomentum,
      questionQuietWindow,
      questionStrategy: "respect_question_quiet_window",
    };
  }
  const dueGapCandidate = dueThreadGap(trace.due_story_thread);
  const dueGap = dueGapCandidate && !provenanceResolvesAnchor(
    fieldStates["story_thread.payoff_choice"],
    dueGapCandidate.anchor
  )
    ? dueGapCandidate
    : null;
  const unresolvedSetupCandidate = unresolvedSetupGap(projectMemory.unresolved_setups);
  const unresolvedSetup = unresolvedSetupCandidate && !provenanceResolvesAnchor(
    fieldStates["story_thread.next_setup"],
    unresolvedSetupCandidate.anchor
  )
    ? unresolvedSetupCandidate
    : null;
  const projectStoryGaps = projectGaps({
    fieldStates,
    projectName,
    protagonistName,
  });
  const characterStoryGaps = characterGaps(character, fieldStates);
  const fallbackGap = fieldIsUnknown(fieldStates, "story.next_irreversible_choice")
    ? fallbackChoiceGap({ protagonistName, projectName })
    : null;
  const sceneObjectiveGap = writerBlocked && fieldIsUnknown(fieldStates, "scene.objective")
    ? buildGap({
        field: "scene.objective",
        label: "the next scene objective",
        anchor: protagonistName || projectName,
        question: `What must ${protagonistName || "the protagonist"} get before the next scene can end?`,
        reason: "A concrete scene objective converts abstract block into playable action.",
      })
    : null;
  const candidateGaps = [
    dueGap,
    sceneObjectiveGap,
    unresolvedSetup,
    ...projectStoryGaps,
    ...characterStoryGaps,
    fallbackGap,
  ].filter(Boolean);
  const selectedGap = selectHighestValueGap(candidateGaps, {
    actKey: actContext.key,
    sequenceKey: sequenceContext.key,
    writerBlocked,
    transcript: text,
    questionEffectiveness,
  });
  const gap = contextualizeGapForSequence(selectedGap, sequenceContext);

  if (!gap) {
    const sequenceDirective = sequenceExecutionDirective(sequenceContext);
    return {
      active: true,
      mode: writerBlocked ? "rescue_with_known_spine" : "develop_with_known_spine",
      shouldAsk: false,
      askAfterDeliverable: false,
      projectId,
      projectTitle,
      objective: writerBlocked
        ? `Use the resolved Story Spine and Character Bible to offer concrete causal moves without reopening settled facts.${sequenceDirective}`
        : `Develop the requested story area from known, learned, and corrected canon without asking another setup question.${sequenceDirective}`,
      reason: "Every relevant high-value field is already resolved.",
      fieldStates: fieldStateSummary,
      actContext,
      sequenceContext,
      writingMomentum,
      questionQuietWindow,
    };
  }

  const sequenceObjective = sequenceExecutionDirective(sequenceContext);
  const questionStrategy = writerBlocked
    ? hasProvenBlockRecovery(gap.field, {
        actKey: actContext.key,
        sequenceKey: sequenceContext.key,
        questionEffectiveness,
      })
      ? "proven_block_recovery"
      : "block_recovery"
    : "highest_value_gap";
  return {
    active: true,
    mode: writerBlocked ? "rescue_then_decide" : "develop_then_learn",
    shouldAsk: true,
    askAfterDeliverable: true,
    projectId,
    projectTitle,
    objective: writerBlocked
      ? `Offer three distinct causal story moves first, then ask one anchored decision question.${sequenceObjective}`
      : `Advance the idea first, then ask one question that fills the highest-value durable story gap.${sequenceObjective}`,
    targetField: gap.field,
    targetLabel: gap.label,
    anchor: gap.anchor,
    question: gap.question,
    reason: gap.reason,
    memoryAuthority: "writer_clarification",
    writerBlocked,
    targetFieldStatus: fieldStates[gap.field]?.status || "unknown",
    fieldStates: fieldStateSummary,
    actContext,
    sequenceContext,
    writingMomentum,
    questionQuietWindow,
    questionStrategy,
    selectionScore: gap.score,
    effectivenessBonus: gap.effectivenessBonus || 0,
    successfulQuestionOutcomes: questionEffectiveness.filter((item) => item.successful).length,
    candidateScores: candidateGaps
      .map((candidate) => ({
        field: candidate.field,
        effectiveness_bonus: questionEffectivenessBonus(candidate.field, {
          actKey: actContext.key,
          sequenceKey: sequenceContext.key,
          writerBlocked,
          questionEffectiveness,
        }),
        score: scoreGap(candidate, {
          actKey: actContext.key,
          sequenceKey: sequenceContext.key,
          writerBlocked,
          transcript: text,
          questionEffectiveness,
        }),
      }))
      .sort((left, right) => right.score - left.score || left.field.localeCompare(right.field))
      .slice(0, 6),
  };
}

export function sanitizeProvisionalScreenplayOptions(values) {
  const source = Array.isArray(values) ? values : [];
  const byRank = new Map();
  for (const value of source) {
    const rank = Math.floor(Number(value?.rank ?? value?.option ?? value?.id));
    const optionValue = clean(
      value?.value ?? value?.text ?? value?.choice,
      PROVISIONAL_SCREENPLAY_OPTION_MAX_CHARS
    );
    if (
      rank < 1 ||
      rank > PROVISIONAL_SCREENPLAY_OPTION_COUNT ||
      !optionValue ||
      byRank.has(rank)
    ) {
      continue;
    }
    byRank.set(rank, {
      id: `option-${rank}`,
      rank,
      value: optionValue,
      recommended: rank === 1,
    });
  }
  const options = [...byRank.values()].sort((left, right) => left.rank - right.rank);
  const complete = options.length === PROVISIONAL_SCREENPLAY_OPTION_COUNT &&
    options.every((option, index) => option.rank === index + 1);
  return complete ? options : [];
}

export function extractProvisionalScreenplayOptions(value) {
  const lines = String(value || "").split(/\r?\n/);
  const options = [];
  for (const rawLine of lines) {
    const line = rawLine
      .trim()
      .replace(/^[-*]\s+/, "")
      .replace(/[*_`]/g, "")
      .trim();
    const match = line.match(
      /^(?:option\s*)?([123])\s*(?:\(\s*recommended\s*\))?\s*[:.)-]\s*(.+)$/i
    );
    if (!match) continue;
    const rank = Number(match[1]);
    const optionValue = clean(
      match[2].replace(
        /\s+(?:why\s+now|why\s+it\s+works|consequence|tradeoff)\s*:\s*.*$/i,
        ""
      ),
      PROVISIONAL_SCREENPLAY_OPTION_MAX_CHARS
    );
    if (!optionValue) continue;
    options.push({ rank, value: optionValue });
  }
  return sanitizeProvisionalScreenplayOptions(options);
}

export function resolveProvisionalScreenplayOptionSelection(value, options) {
  const available = sanitizeProvisionalScreenplayOptions(options);
  const answer = clean(value, 500);
  if (!available.length || !answer) return null;
  const words = answer.split(/\s+/).filter(Boolean);
  if (
    words.length > 14 ||
    /\b(?:but|except|change|modify|rewrite|different|instead|only\s+if)\b/i.test(answer)
  ) {
    return null;
  }

  const normalized = answer.toLowerCase();
  const ranks = new Set();
  const digitOrWord = /\b(?:option|number)\s*(1|2|3|one|two|three)\b/g;
  for (const match of normalized.matchAll(digitOrWord)) {
    ranks.add({ one: 1, two: 2, three: 3 }[match[1]] || Number(match[1]));
  }
  const ordinal = /\b(first|second|third)\s+(?:one|option)\b/g;
  for (const match of normalized.matchAll(ordinal)) {
    ranks.add({ first: 1, second: 2, third: 3 }[match[1]]);
  }
  if (!ranks.size) {
    const bare = normalized
      .replace(/[.!]/g, "")
      .trim()
      .match(/^(?:1|2|3|one|two|three|first|second|third)$/);
    if (bare) {
      ranks.add({
        one: 1,
        two: 2,
        three: 3,
        first: 1,
        second: 2,
        third: 3,
      }[bare[0]] || Number(bare[0]));
    }
  }
  if (ranks.size !== 1) return null;
  const [rank] = ranks;
  return available.find((option) => option.rank === rank) || null;
}

export function createPendingScreenplayLearningQuestion(plan, {
  askedAtTurn = 0,
  now = Date.now(),
  provisionalOptions = [],
} = {}) {
  if (!plan?.active || !plan?.shouldAsk || !clean(plan?.question, 260)) return null;
  const safeProvisionalOptions = sanitizeProvisionalScreenplayOptions(provisionalOptions);
  if (
    plan.mode === "provisional_options" &&
    safeProvisionalOptions.length !== PROVISIONAL_SCREENPLAY_OPTION_COUNT
  ) {
    return null;
  }
  const turn = Math.max(0, Math.floor(Number(askedAtTurn) || 0));
  const targetField = clean(plan.targetField, 64);
  return {
    id: `screenplay-learning-${turn}-${targetField || "story"}`,
    projectId: clean(plan.projectId, 96),
    projectTitle: clean(plan.projectTitle, 160),
    targetField,
    targetLabel: clean(plan.targetLabel, 120),
    anchor: clean(plan.anchor, 180),
    question: clean(plan.question, 260),
    actKey: clean(plan.actContext?.key, 24),
    sequenceKey: clean(plan.sequenceContext?.key, 32),
    writerBlocked: Boolean(plan.writerBlocked || plan.mode === "rescue_then_decide"),
    provisionalOptions: plan.mode === "provisional_options"
      ? safeProvisionalOptions
      : [],
    askedAtTurn: turn,
    expiresAfterTurn: turn + 2,
    askedAt: Math.max(0, Number(now) || Date.now()),
  };
}

export function createProvisionalScreenplayOptionQuestion(pending, options, {
  askedAtTurn = 0,
  now = Date.now(),
} = {}) {
  const target = sanitizePendingScreenplayLearningQuestion(pending);
  const provisionalOptions = sanitizeProvisionalScreenplayOptions(options);
  if (!target || provisionalOptions.length !== PROVISIONAL_SCREENPLAY_OPTION_COUNT) {
    return null;
  }
  const turn = Math.max(0, Math.floor(Number(askedAtTurn) || 0));
  return sanitizePendingScreenplayLearningQuestion({
    ...target,
    id: `screenplay-options-${turn}-${target.targetField || "story"}`,
    question: buildProvisionalOptionSelectionQuestion(target),
    provisionalOptions,
    writerBlocked: true,
    askedAtTurn: turn,
    expiresAfterTurn: turn + 2,
    askedAt: Math.max(0, Number(now) || Date.now()),
  });
}

export function sanitizePendingScreenplayLearningQuestion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = clean(value.id ?? value.questionId, 120);
  const projectId = clean(value.projectId ?? value.project_id, 96);
  const projectTitle = clean(value.projectTitle ?? value.project_title, 160);
  const targetField = clean(value.targetField ?? value.target_field, 64);
  const question = clean(value.question, 260);
  if (!id || (!projectId && !projectTitle) || !targetField || !question) return null;
  const askedAtTurn = Math.max(
    0,
    Math.floor(Number(value.askedAtTurn ?? value.asked_at_turn ?? 0) || 0)
  );
  const expiresAfterTurn = Math.max(
    askedAtTurn + 1,
    Math.floor(Number(value.expiresAfterTurn ?? value.expires_after_turn ?? 0) || 0)
  );
  return {
    id,
    projectId,
    projectTitle,
    targetField,
    targetLabel: clean(value.targetLabel ?? value.target_label, 120),
    anchor: clean(value.anchor, 180),
    question,
    actKey: clean(value.actKey ?? value.act_key, 24),
    sequenceKey: clean(value.sequenceKey ?? value.sequence_key, 32),
    writerBlocked: Boolean(value.writerBlocked ?? value.writer_blocked),
    provisionalOptions: sanitizeProvisionalScreenplayOptions(
      value.provisionalOptions ?? value.provisional_options
    ),
    askedAtTurn,
    expiresAfterTurn,
    askedAt: Math.max(0, Number(value.askedAt ?? value.asked_at ?? 0) || 0),
  };
}

function pendingQuestionProjectKey(value) {
  const pending = sanitizePendingScreenplayLearningQuestion(value);
  if (!pending) return "";
  if (pending.projectId) return `id:${pending.projectId.toLowerCase()}`;
  return `title:${pending.projectTitle.toLowerCase()}`;
}

export function sanitizePendingScreenplayLearningQuestions(values) {
  const source = Array.isArray(values) ? values : [];
  const sanitized = source
    .map(sanitizePendingScreenplayLearningQuestion)
    .filter(Boolean)
    .sort((left, right) => (
      Number(right.askedAt || 0) - Number(left.askedAt || 0) ||
      right.askedAtTurn - left.askedAtTurn
    ));
  const seenProjects = new Set();
  const out = [];
  for (const pending of sanitized) {
    const projectKey = pendingQuestionProjectKey(pending);
    if (!projectKey || seenProjects.has(projectKey)) continue;
    seenProjects.add(projectKey);
    out.push(pending);
    if (out.length >= PENDING_SCREENPLAY_LEARNING_QUESTIONS_MAX) break;
  }
  return out;
}

export function upsertPendingScreenplayLearningQuestion(values, pending) {
  const next = sanitizePendingScreenplayLearningQuestion(pending);
  if (!next) return sanitizePendingScreenplayLearningQuestions(values);
  const nextProjectKey = pendingQuestionProjectKey(next);
  const existing = sanitizePendingScreenplayLearningQuestions(values)
    .filter((item) => (
      item.id !== next.id &&
      pendingQuestionProjectKey(item) !== nextProjectKey
    ));
  return sanitizePendingScreenplayLearningQuestions([next, ...existing]);
}

function projectMatches(pending, { projectId = "", projectTitle = "" } = {}) {
  const pendingId = clean(pending?.projectId, 96).toLowerCase();
  const currentId = clean(projectId, 96).toLowerCase();
  if (pendingId && currentId) return pendingId === currentId;
  const pendingTitle = clean(pending?.projectTitle, 160).toLowerCase();
  const currentTitle = clean(projectTitle, 160).toLowerCase();
  if (pendingTitle && currentTitle) return pendingTitle === currentTitle;
  return false;
}

export function selectPendingScreenplayLearningQuestion(values, {
  projectId = "",
  projectTitle = "",
} = {}) {
  return sanitizePendingScreenplayLearningQuestions(values)
    .find((pending) => projectMatches(pending, { projectId, projectTitle })) || null;
}

export function removePendingScreenplayLearningQuestion(values, pending) {
  const target = sanitizePendingScreenplayLearningQuestion(pending);
  if (!target) return sanitizePendingScreenplayLearningQuestions(values);
  const projectKey = pendingQuestionProjectKey(target);
  return sanitizePendingScreenplayLearningQuestions(values)
    .filter((item) => (
      item.id !== target.id &&
      pendingQuestionProjectKey(item) !== projectKey
    ));
}

function buildPendingQuestionInteraction(pending, responseStatus, now) {
  const status = clean(responseStatus, 24).toLowerCase();
  if (!["asked", "answered", "declined", "expired"].includes(status)) return null;
  const respondedAt = status === "asked"
    ? 0
    : Math.max(0, Number(now) || Date.now());
  return {
    questionId: clean(pending?.id ?? pending?.questionId, 120),
    projectId: clean(pending?.projectId, 96),
    projectTitle: clean(pending?.projectTitle, 160),
    targetField: clean(pending?.targetField, 64),
    targetLabel: clean(pending?.targetLabel, 120),
    anchor: clean(pending?.anchor, 180),
    question: clean(pending?.question, 260),
    actKey: clean(pending?.actKey, 24),
    sequenceKey: clean(pending?.sequenceKey, 32),
    writerBlocked: Boolean(pending?.writerBlocked),
    askedAt: Math.max(0, Number(pending?.askedAt) || respondedAt || Date.now()),
    responseStatus: status,
    respondedAt,
  };
}

export function classifyScreenplayLearningAnswer(value, {
  targetField = "",
} = {}) {
  const answer = clean(value, 2_000);
  if (!answer) {
    return { accepted: false, status: "empty", reason: "empty", wordCount: 0 };
  }
  const words = answer.split(/\s+/).filter(Boolean);
  if (words.length > 140) {
    return {
      accepted: false,
      status: "declined",
      reason: "too_long_for_clarification",
      wordCount: words.length,
    };
  }
  if (LEARNING_UNCERTAINTY_SIGNAL.test(answer)) {
    return {
      accepted: false,
      status: "declined",
      reason: "uncertain",
      wordCount: words.length,
    };
  }
  if (LEARNING_DEFERRAL_SIGNAL.test(answer)) {
    return {
      accepted: false,
      status: "declined",
      reason: "deferred",
      wordCount: words.length,
    };
  }
  if (LEARNING_IDEATION_REQUEST_SIGNAL.test(answer)) {
    return {
      accepted: false,
      status: "declined",
      reason: "ideation_request",
      wordCount: words.length,
    };
  }
  if (DIRECT_PAGE_REQUEST.test(answer)) {
    return {
      accepted: false,
      status: "declined",
      reason: "page_or_execution_request",
      wordCount: words.length,
    };
  }
  if (LEARNING_CONFIRMATION_ONLY_SIGNAL.test(answer)) {
    return {
      accepted: false,
      status: "insufficient",
      reason: "confirmation_without_value",
      wordCount: words.length,
    };
  }
  if (LEARNING_VAGUE_SIGNAL.test(answer)) {
    return {
      accepted: false,
      status: "declined",
      reason: "vague",
      wordCount: words.length,
    };
  }
  if (LEARNING_OPTION_REFERENCE_SIGNAL.test(answer)) {
    return {
      accepted: false,
      status: "insufficient",
      reason: "option_reference_without_context",
      wordCount: words.length,
    };
  }
  const looksLikeQuestion = /\?\s*$/.test(answer) && !/[.!]\s+/.test(answer);
  const acceptsQuestionValue = clean(targetField, 64).toLowerCase() === "project.central_question";
  if (looksLikeQuestion && !acceptsQuestionValue) {
    return {
      accepted: false,
      status: "declined",
      reason: "question_instead_of_answer",
      wordCount: words.length,
    };
  }
  return {
    accepted: true,
    status: "answered",
    reason: "substantive_answer",
    wordCount: words.length,
  };
}

export function resolvePendingScreenplayLearningAnswer({
  pending = null,
  transcript = "",
  projectId = "",
  projectTitle = "",
  currentTurn = 0,
  now = Date.now(),
} = {}) {
  const target = sanitizePendingScreenplayLearningQuestion(pending);
  if (!target) {
    return { status: "none", shouldClear: false, learningContext: null, interaction: null };
  }
  const turn = Math.max(0, Math.floor(Number(currentTurn) || 0));
  const expiresAfterTurn = Math.max(0, Math.floor(Number(target.expiresAfterTurn) || 0));
  if (expiresAfterTurn && turn > expiresAfterTurn) {
    return {
      status: "expired",
      shouldClear: true,
      learningContext: null,
      interaction: buildPendingQuestionInteraction(target, "expired", now),
    };
  }
  if (!projectMatches(target, { projectId, projectTitle })) {
    return {
      status: "different_project",
      shouldClear: false,
      learningContext: null,
      interaction: null,
    };
  }
  const answer = clean(transcript, 2_000);
  if (!answer) {
    return { status: "empty", shouldClear: false, learningContext: null, interaction: null };
  }
  const targetField = clean(target.targetField, 64);
  const selectedOption = resolveProvisionalScreenplayOptionSelection(
    answer,
    target.provisionalOptions
  );
  const answerForLearning = selectedOption?.value || answer;
  const answerClassification = classifyScreenplayLearningAnswer(
    answerForLearning,
    { targetField }
  );
  if (!answerClassification.accepted) {
    if (["uncertain", "ideation_request"].includes(answerClassification.reason)) {
      return {
        status: "provisional_options",
        shouldClear: false,
        learningContext: null,
        interaction: null,
        answerClassification,
      };
    }
    if (answerClassification.status === "insufficient") {
      return {
        status: "insufficient",
        shouldClear: false,
        learningContext: null,
        interaction: null,
        answerClassification,
      };
    }
    return {
      status: "declined",
      shouldClear: true,
      learningContext: null,
      interaction: buildPendingQuestionInteraction(target, "declined", now),
      answerClassification,
    };
  }
  return {
    status: "answered",
    shouldClear: true,
    interaction: buildPendingQuestionInteraction(target, "answered", now),
    answerClassification: {
      ...answerClassification,
      selectedOptionId: selectedOption?.id || null,
      selectedOptionRank: selectedOption?.rank || null,
    },
    learningContext: {
      ...buildScreenplayLearningContext(target, {
        projectId,
        projectTitle,
        targetField,
      }),
      selectedOptionId: selectedOption?.id || "",
      selectedOptionRank: selectedOption?.rank || 0,
    },
  };
}

function buildScreenplayLearningContext(pending, {
  projectId = "",
  projectTitle = "",
  targetField = "",
} = {}) {
  return {
    questionId: clean(pending?.id, 120),
    projectId: clean(pending?.projectId || projectId, 96),
    projectTitle: clean(pending?.projectTitle || projectTitle, 160),
    targetField: clean(targetField || pending?.targetField, 64),
    targetLabel: clean(pending?.targetLabel, 120),
    anchor: clean(pending?.anchor, 180),
    question: clean(pending?.question, 260),
    actKey: clean(pending?.actKey, 24),
    sequenceKey: clean(pending?.sequenceKey, 32),
    writerBlocked: Boolean(pending?.writerBlocked),
    provisionalOptions: sanitizeProvisionalScreenplayOptions(
      pending?.provisionalOptions
    ),
    askedAt: Math.max(0, Number(pending?.askedAt) || 0),
    authority: "writer_clarification",
  };
}

export function resolvePendingScreenplayLearningAction({
  pending = null,
  responseStatus = "",
  answer = "",
  projectId = "",
  projectTitle = "",
  currentTurn = 0,
  now = Date.now(),
} = {}) {
  const target = sanitizePendingScreenplayLearningQuestion(pending);
  if (!target) {
    return { status: "none", shouldClear: false, learningContext: null, interaction: null };
  }
  const normalizedStatus = clean(responseStatus, 24).toLowerCase();
  if (!["answered", "declined"].includes(normalizedStatus)) {
    return { status: "invalid", shouldClear: false, learningContext: null, interaction: null };
  }
  const turn = Math.max(0, Math.floor(Number(currentTurn) || 0));
  if (target.expiresAfterTurn && turn > target.expiresAfterTurn) {
    return {
      status: "expired",
      shouldClear: true,
      learningContext: null,
      interaction: buildPendingQuestionInteraction(target, "expired", now),
    };
  }
  if (!projectMatches(target, { projectId, projectTitle })) {
    return {
      status: "different_project",
      shouldClear: false,
      learningContext: null,
      interaction: null,
    };
  }
  if (normalizedStatus === "declined") {
    return {
      status: "declined",
      shouldClear: true,
      learningContext: null,
      interaction: buildPendingQuestionInteraction(target, "declined", now),
    };
  }

  const normalizedAnswer = clean(answer, 2_000);
  if (!normalizedAnswer) {
    return { status: "empty", shouldClear: false, learningContext: null, interaction: null };
  }
  const selectedOption = resolveProvisionalScreenplayOptionSelection(
    normalizedAnswer,
    target.provisionalOptions
  );
  const answerForLearning = selectedOption?.value || normalizedAnswer;
  const answerClassification = classifyScreenplayLearningAnswer(
    answerForLearning,
    { targetField: target.targetField }
  );
  if (!answerClassification.accepted) {
    if (["uncertain", "ideation_request"].includes(answerClassification.reason)) {
      return {
        status: "provisional_options",
        shouldClear: false,
        learningContext: null,
        interaction: null,
        answerClassification,
      };
    }
    if (answerClassification.status === "insufficient") {
      return {
        status: "insufficient",
        shouldClear: false,
        learningContext: null,
        interaction: null,
        answerClassification,
      };
    }
    return {
      status: "declined",
      shouldClear: true,
      learningContext: null,
      interaction: buildPendingQuestionInteraction(target, "declined", now),
      answerClassification,
    };
  }
  return {
    status: "answered",
    shouldClear: true,
    interaction: buildPendingQuestionInteraction(target, "answered", now),
    answerClassification: {
      ...answerClassification,
      selectedOptionId: selectedOption?.id || null,
      selectedOptionRank: selectedOption?.rank || null,
    },
    learningContext: {
      ...buildScreenplayLearningContext(target, {
        projectId,
        projectTitle,
      }),
      selectedOptionId: selectedOption?.id || "",
      selectedOptionRank: selectedOption?.rank || 0,
    },
  };
}

function normalizeQuestion(value) {
  return clean(value, 320)
    .toLowerCase()
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuestionSentences(value) {
  const lines = String(value || "").split("\n");
  const kept = [];
  for (const line of lines) {
    if (!line.includes("?")) {
      kept.push(line);
      continue;
    }
    const sentences = line.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g) || [];
    const statement = sentences
      .filter((sentence) => !sentence.includes("?"))
      .join(" ")
      .trim();
    if (statement) kept.push(statement);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function enforceScreenplayQuestionPlan(reply, plan) {
  const text = String(reply || "").trim();
  const question = clean(plan?.question, 260);
  if (!text || !plan?.active || !plan?.shouldAsk || !question) return text;
  const body = stripQuestionSentences(text);
  if (!body || normalizeQuestion(body) === normalizeQuestion(question)) return question;
  return `${body}\n\n${question}`;
}
