const DIRECT_PAGE_REQUEST = /^(?:please\s+)?(?:write|draft|continue|finish|complete|rewrite|revise|punch\s*up|generate|give\s+me|show\s+me|start|keep\s+(?:writing|going))\b|\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:write|draft|continue|finish|complete|rewrite|revise|punch\s*up|generate|start)\b/i;
const WRITER_BLOCK_SIGNAL = /\b(?:writer'?s\s+block|writers\s+block|stuck|blocked|out\s+of\s+ideas|no\s+ideas|don'?t\s+know\s+what\s+happens\s+next|what\s+happens\s+next|where\s+do\s+i\s+go|how\s+do\s+i\s+move|story\s+forward|next\s+beat|next\s+scene|middle\s+(?:is\s+)?(?:flat|dragging|slow)|second\s+act\s+(?:is\s+)?(?:flat|dragging|slow))\b/i;
const DEVELOPMENT_SIGNAL = /\b(?:brainstorm|develop|figure\s+out|work\s+out|plan|outline|structure|break\s+(?:the\s+)?story|character\s+arc|story\s+arc|act\s+(?:one|two|three|i|ii|iii|1|2|3)|theme|ending|motivation|want|need|wound|false\s+belief|misbelief)\b/i;
const SCREENPLAY_SIGNAL = /\b(?:screenplay|script|scene|feature|film|movie|act|beat|character|protagonist|antagonist|dialogue|story)\b/i;
const NON_ANSWER_SIGNAL = /^(?:i\s+don'?t\s+know|not\s+sure|no\s+idea|skip|pass|decide\s+later|let'?s\s+come\s+back|we\s+can\s+decide\s+later|you\s+decide)[.!\s]*$/i;
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

function scoreGap(gap, { actKey, writerBlocked, transcript }) {
  const field = gap?.field || "";
  const actScores = ACT_GAP_SCORES[actKey] || {};
  let score = Number(actScores[field] ?? DEFAULT_GAP_SCORES[field] ?? 50);
  if (writerBlocked) {
    if (field === "scene.objective") score += 34;
    if (field === "story_thread.payoff_choice") score += 30;
    if (field === "story_thread.next_setup") score += 22;
    if (field === "story.next_irreversible_choice") score += 28;
  }
  if (FIELD_TRANSCRIPT_SIGNALS[field]?.test(transcript)) score += 80;
  return Math.round(score);
}

function selectHighestValueGap(candidates, context) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((gap, order) => ({
      ...gap,
      score: scoreGap(gap, context),
      order,
    }))
    .sort((left, right) => right.score - left.score || left.order - right.order)[0] || null;
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

export function buildScreenplayQuestionPlan({
  transcript = "",
  creativeMemoryTrace = null,
  studioMeta = null,
  turnPlanner = null,
  answeredLearningContext = null,
} = {}) {
  const text = clean(transcript, 4_000);
  const trace = creativeMemoryTrace && typeof creativeMemoryTrace === "object"
    ? creativeMemoryTrace
    : {};
  const projectMemory = trace.screenplay_project_memory && typeof trace.screenplay_project_memory === "object"
    ? trace.screenplay_project_memory
    : {};
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
  const fieldStates = buildStoryFieldStates(projectMemory, character);
  const fieldStateSummary = summarizeFieldStates(fieldStates);
  const actContext = deriveActContext({ transcript: text, studioMeta, projectMemory });
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
  const gap = selectHighestValueGap(candidateGaps, {
    actKey: actContext.key,
    writerBlocked,
    transcript: text,
  });

  if (!gap) {
    return {
      active: true,
      mode: writerBlocked ? "rescue_with_known_spine" : "develop_with_known_spine",
      shouldAsk: false,
      askAfterDeliverable: false,
      projectId,
      projectTitle,
      objective: writerBlocked
        ? "Use the resolved Story Spine and Character Bible to offer concrete causal moves without reopening settled facts."
        : "Develop the requested story area from known, learned, and corrected canon without asking another setup question.",
      reason: "Every relevant high-value field is already resolved.",
      fieldStates: fieldStateSummary,
      actContext,
    };
  }

  return {
    active: true,
    mode: writerBlocked ? "rescue_then_decide" : "develop_then_learn",
    shouldAsk: true,
    askAfterDeliverable: true,
    projectId,
    projectTitle,
    objective: writerBlocked
      ? "Offer three distinct causal story moves first, then ask one anchored decision question."
      : "Advance the idea first, then ask one question that fills the highest-value durable story gap.",
    targetField: gap.field,
    targetLabel: gap.label,
    anchor: gap.anchor,
    question: gap.question,
    reason: gap.reason,
    memoryAuthority: "writer_clarification",
    targetFieldStatus: fieldStates[gap.field]?.status || "unknown",
    fieldStates: fieldStateSummary,
    actContext,
    selectionScore: gap.score,
    candidateScores: candidateGaps
      .map((candidate) => ({
        field: candidate.field,
        score: scoreGap(candidate, {
          actKey: actContext.key,
          writerBlocked,
          transcript: text,
        }),
      }))
      .sort((left, right) => right.score - left.score || left.field.localeCompare(right.field))
      .slice(0, 6),
  };
}

export function createPendingScreenplayLearningQuestion(plan, {
  askedAtTurn = 0,
  now = Date.now(),
} = {}) {
  if (!plan?.active || !plan?.shouldAsk || !clean(plan?.question, 260)) return null;
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
    askedAtTurn: turn,
    expiresAfterTurn: turn + 2,
    askedAt: Math.max(0, Number(now) || Date.now()),
  };
}

function projectMatches(pending, { projectId = "", projectTitle = "" } = {}) {
  const pendingId = clean(pending?.projectId, 96).toLowerCase();
  const currentId = clean(projectId, 96).toLowerCase();
  if (pendingId && currentId) return pendingId === currentId;
  const pendingTitle = clean(pending?.projectTitle, 160).toLowerCase();
  const currentTitle = clean(projectTitle, 160).toLowerCase();
  if (pendingTitle && currentTitle) return pendingTitle === currentTitle;
  return Boolean(pendingId || pendingTitle) && !currentId && !currentTitle;
}

export function resolvePendingScreenplayLearningAnswer({
  pending = null,
  transcript = "",
  projectId = "",
  projectTitle = "",
  currentTurn = 0,
} = {}) {
  if (!pending || typeof pending !== "object") {
    return { status: "none", shouldClear: false, learningContext: null };
  }
  const turn = Math.max(0, Math.floor(Number(currentTurn) || 0));
  const expiresAfterTurn = Math.max(0, Math.floor(Number(pending.expiresAfterTurn) || 0));
  if (expiresAfterTurn && turn > expiresAfterTurn) {
    return { status: "expired", shouldClear: true, learningContext: null };
  }
  if (!projectMatches(pending, { projectId, projectTitle })) {
    return { status: "different_project", shouldClear: false, learningContext: null };
  }
  const answer = clean(transcript, 2_000);
  if (!answer) return { status: "empty", shouldClear: false, learningContext: null };
  const words = answer.split(/\s+/).filter(Boolean);
  const looksLikeQuestion = /\?\s*$/.test(answer) && !/[.!]\s+/.test(answer);
  const targetField = clean(pending.targetField, 64);
  const acceptsQuestionValue = targetField.toLowerCase() === "project.central_question";
  if (
    NON_ANSWER_SIGNAL.test(answer) ||
    (looksLikeQuestion && !acceptsQuestionValue) ||
    words.length > 140 ||
    DIRECT_PAGE_REQUEST.test(answer)
  ) {
    return { status: "declined", shouldClear: true, learningContext: null };
  }
  return {
    status: "answered",
    shouldClear: true,
    learningContext: {
      questionId: clean(pending.id, 120),
      projectId: clean(pending.projectId || projectId, 96),
      projectTitle: clean(pending.projectTitle || projectTitle, 160),
      targetField,
      targetLabel: clean(pending.targetLabel, 120),
      anchor: clean(pending.anchor, 180),
      question: clean(pending.question, 260),
      authority: "writer_clarification",
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
