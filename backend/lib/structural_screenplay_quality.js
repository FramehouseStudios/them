import {
  evaluateStoryObligationCorrectionAdherence,
  storyObligationCorrectionsFromContext,
} from "./story_obligation_correction_guard.js";

const STRUCTURAL_REASONS = new Set([
  "screenplay_scene_doctor",
  "screenplay_feature_architecture",
]);

const STRUCTURAL_REASON_BY_TASK_INTENT = Object.freeze({
  scene_doctor: "screenplay_scene_doctor",
  outline_structure: "screenplay_feature_architecture",
  finish_feature: "screenplay_feature_architecture",
});

const STORY_GROUNDING_STOPWORDS = new Set([
  "about", "act", "after", "again", "against", "all", "also", "and", "are", "because",
  "before", "but", "can", "character", "could", "did", "does", "feature", "film", "final",
  "for", "from", "had", "has", "have", "her", "here", "hers", "him", "his", "how", "into",
  "its", "just", "more", "most", "movie", "next", "not", "now", "only", "our", "out", "over",
  "page", "scene", "screenplay", "she", "should", "story", "than", "that", "the", "their", "them",
  "then", "there", "these", "they", "this", "those", "through", "too", "under", "until", "was",
  "were", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);

function normalizeText(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function countWords(value) {
  return normalizeText(value).match(/[A-Za-z0-9']+/g)?.length || 0;
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function groundingTokens(value = "") {
  return [...new Set((normalizeText(value).toLowerCase().match(/[a-z0-9']+/g) || [])
    .filter((token) => token.length > 2 && !STORY_GROUNDING_STOPWORDS.has(token)))];
}

function replySupportsGroundingPhrase(reply = "", phrase = "") {
  const replyTokens = new Set(groundingTokens(reply));
  const phraseTokens = groundingTokens(phrase);
  if (!phraseTokens.length) return false;
  const matches = phraseTokens.filter((token) => replyTokens.has(token)).length;
  const required = phraseTokens.length === 1
    ? 1
    : Math.min(2, Math.max(1, Math.ceil(phraseTokens.length * 0.35)));
  return matches >= required;
}

function contextValue(context = {}, ...keys) {
  for (const key of keys) {
    const value = context?.[key];
    if (typeof value === "string" && value.trim()) return cleanContextValue(value, 240);
  }
  return "";
}

function contextValues(context = {}, ...keys) {
  for (const key of keys) {
    const value = context?.[key];
    const cleaned = cleanContextList(value, 8, 220);
    if (cleaned.length) return cleaned;
  }
  return [];
}

function evaluateStorySpecificGrounding(reply = "", storyContext = null, modelReason = "") {
  if (!storyContext || typeof storyContext !== "object" || Array.isArray(storyContext)) {
    return { applicable: false, ok: true, availableLanes: [], supportedLanes: [] };
  }
  const graph = storyContext.screenplayFeatureStoryGraph ??
    storyContext.screenplay_feature_story_graph ??
    storyContext.featureStoryGraph ??
    storyContext.feature_story_graph ??
    {};
  const state = graph?.currentState && typeof graph.currentState === "object"
    ? graph.currentState
    : {};
  const graphFacts = Array.isArray(graph?.bindingFacts) ? graph.bindingFacts : [];
  const directFacts = Array.isArray(storyContext.screenplayAcceptedCausalFacts)
    ? storyContext.screenplayAcceptedCausalFacts
    : Array.isArray(storyContext.screenplay_accepted_causal_facts)
      ? storyContext.screenplay_accepted_causal_facts
      : [];
  const graphThreads = Array.isArray(graph?.openThreads) ? graph.openThreads : [];
  const graphDueConsequence = graph?.currentDueConsequence &&
    typeof graph.currentDueConsequence === "object"
    ? graph.currentDueConsequence
    : {};
  const graphObligationChange = graph?.currentStoryObligationChange &&
    typeof graph.currentStoryObligationChange === "object"
    ? graph.currentStoryObligationChange
    : {};
  const dueThread = storyContext.screenplayDueStoryThread ?? storyContext.screenplay_due_story_thread ?? {};
  const directDueConsequence = storyContext.screenplayDueConsequence ??
    storyContext.screenplay_due_consequence ?? {};
  const lanes = {
    acceptedState: [
      contextValue(state, "lastAcceptedOutcome", "last_accepted_outcome"),
      contextValue(state, "nextScenePlan", "next_scene_plan"),
      contextValue(storyContext, "screenplayLastSceneOutcome", "screenplay_last_scene_outcome"),
      contextValue(storyContext, "screenplayCurrentBeat", "screenplay_current_beat"),
      contextValue(storyContext, "screenplayNextScenePlan", "screenplay_next_scene_plan"),
    ],
    bindingCanon: [
      ...graphFacts.map((item) => cleanContextValue(item?.fact, 220)),
      ...directFacts.map((item) => cleanContextValue(item?.fact, 220)),
      ...contextValues(storyContext, "screenplayCorrectionReplacements", "screenplay_correction_replacements"),
    ],
    consequencePressure: [
      cleanContextValue(graphDueConsequence?.fact, 220),
      cleanContextValue(graphObligationChange?.result, 220),
      cleanContextValue(directDueConsequence?.fact, 220),
      contextValue(storyContext, "screenplayAcceptedConsequenceDue", "screenplay_accepted_consequence_due"),
    ],
    characterPressure: [
      contextValue(state, "protagonistWant", "protagonist_want"),
      contextValue(state, "protagonistNeed", "protagonist_need"),
      contextValue(state, "characterArcState", "character_arc_state"),
      contextValue(storyContext, "screenplayProtagonistWant", "screenplay_protagonist_want"),
      contextValue(storyContext, "screenplayProtagonistNeed", "screenplay_protagonist_need"),
      contextValue(storyContext, "screenplayCharacterArcState", "screenplay_character_arc_state"),
    ],
    payoffPromise: [
      ...graphThreads.flatMap((item) => [
        cleanContextValue(item?.setup, 220),
        cleanContextValue(item?.promisedPayoff ?? item?.promised_payoff, 220),
      ]),
      cleanContextValue(dueThread?.setup, 220),
      cleanContextValue(dueThread?.promisedPayoff ?? dueThread?.promised_payoff, 220),
      ...contextValues(storyContext, "screenplayUnresolvedSetups", "screenplay_unresolved_setups"),
      ...contextValues(storyContext, "screenplayActThreePayoffPath", "screenplay_act_three_payoff_path"),
      contextValue(storyContext, "screenplayEndingImage", "screenplay_ending_image"),
    ],
  };
  const availableLanes = Object.entries(lanes)
    .filter(([, phrases]) => phrases.some((phrase) => groundingTokens(phrase).length > 0))
    .map(([name]) => name);
  const requiredLanes = modelReason === "screenplay_feature_architecture" ? 3 : 2;
  if (availableLanes.length < requiredLanes) {
    return { applicable: false, ok: true, availableLanes: [], supportedLanes: [] };
  }
  const supportedLanes = availableLanes.filter((name) => (
    lanes[name].some((phrase) => replySupportsGroundingPhrase(reply, phrase))
  ));
  return {
    applicable: true,
    ok: supportedLanes.length >= requiredLanes,
    requiredLanes,
    availableLanes,
    supportedLanes,
  };
}

function result({ applicable = true, reason, dimensions, directives = [] }) {
  const entries = Object.entries(dimensions || {});
  const passed = entries.filter(([, value]) => Boolean(value)).length;
  return {
    applicable,
    ok: applicable ? passed === entries.length : true,
    reason: applicable ? reason || (passed === entries.length ? "ok" : "structural_quality_failed") : "not_structural_analysis",
    score: entries.length ? passed / entries.length : 1,
    passedDimensions: passed,
    totalDimensions: entries.length,
    dimensions,
    repairDirectives: directives,
  };
}

function sceneDoctorDirectives(reason) {
  const common = [
    "Lead with the single highest-leverage diagnosis, then give a concrete revision move.",
    "Ground every note in the supplied scene, character pressure, or story context; avoid generic workshop advice.",
  ];
  const specific = {
    underdeveloped_scene_doctor: "Deliver a usable diagnosis with enough detail to revise the scene now.",
    missing_scene_diagnosis: "Name precisely why the scene stalls: objective, obstacle, tactic, turn, stakes, subtext, or exit pressure.",
    missing_craft_evidence: "Support the diagnosis with at least two concrete craft observations from the scene.",
    missing_priority_fix: "Choose one priority fix instead of presenting an unranked menu of possibilities.",
    missing_actionable_revision: "State exactly what to cut, move, reveal, withhold, rewrite, or force on the page.",
    missing_playable_example: "Include a short replacement beat, action, or dialogue example the writer can use immediately.",
    missing_feature_consequence: "Explain how the revision changes the next scene, character arc, act pressure, setup, or payoff.",
    missing_specific_story_grounding: "Name and use the accepted changed state, character pressure, or due story promise from this specific project.",
  }[reason];
  return [specific, ...common].filter(Boolean).slice(0, 3);
}

function featureArchitectureDirectives(reason) {
  const common = [
    "Lead with one compact complete Act I / Act II / Act III causal spine before expanding any act; do not let Act I detail consume the answer.",
    "Build one causal feature plan, not a menu of unrelated frameworks or optional ideas.",
    "Use the supplied characters, canon, setups, act state, and ending pressure instead of generic beat-sheet language.",
  ];
  const specific = {
    underdeveloped_feature_architecture: "Develop the architecture far enough to guide the writer from the current pages through the ending.",
    missing_three_act_progression: "State distinct Act I, Act II, and Act III jobs and make each act force the next.",
    missing_causal_act_bridges: "Connect the acts causally: show how commitment creates the middle trap and how the middle loss forces the climax.",
    missing_character_arc_engine: "Tie structure to the protagonist's want, need, wound or false belief, tactic failure, and changed behavior.",
    missing_major_feature_turns: "Place the catalyst/commitment, midpoint reversal, crisis or all-is-lost turn, climax, and final image.",
    missing_setup_payoff_path: "Track at least one setup, promise, relationship wound, or image through its Act III payoff.",
    missing_scene_forward_plan: "End with the next sequence or three playable scene turns so the writer can continue immediately.",
    missing_specific_story_grounding: "Rebuild the architecture from this project's accepted state, character pressure, and due setup/payoff instead of generic beat labels.",
  }[reason];
  return [specific, ...common].filter(Boolean).slice(0, 4);
}

function evaluateSceneDoctor(text, storyContext = null) {
  const words = countWords(text);
  const lower = text.toLowerCase();
  const craftEvidenceCount = countMatches(lower, [
    /\b(?:objective|want|goal)\b/,
    /\b(?:obstacle|opposition|resistance)\b/,
    /\b(?:tactic|strategy|move)\b/,
    /\b(?:turn|reversal|shift|discovery)\b/,
    /\b(?:stakes|cost|consequence|risk)\b/,
    /\b(?:subtext|withhold|conceal|unsaid)\b/,
    /\b(?:pacing|rhythm|late|early|repetition)\b/,
    /\b(?:leverage|power|pressure)\b/,
  ]);
  const dimensions = {
    developed: words >= 55,
    diagnosis: /\b(?:core problem|main problem|central issue|scene (?:stalls|drags|flattens|lacks|needs|works|fails)|scene's? (?:engine|problem|weakest point)|diagnosis|weakness|issue is|what is not working|what's not working)\b/i.test(text),
    craftEvidence: craftEvidenceCount >= 2,
    priorityFix: /\b(?:strongest|highest-leverage|first fix|priority|the fix|start by|best move|core move|if (?:i|we) (?:fix|change) one thing|i'd fix)\b/i.test(text),
    actionableRevision: /\b(?:cut|move|give|make|force|reveal|withhold|rewrite|replace|start|open|end|turn|interrupt|compress|externalize)\b/i.test(text),
    playableExample: /(?:^|\n)(?:INT\.|EXT\.|INT\.\/EXT\.|[A-Z][A-Z0-9 .'-]{1,28}\n)|\b(?:for example|try this|replacement beat|on the page|a playable version)\b|["“][^"”\n]{8,}["”]/i.test(text),
    featureConsequence: /\b(?:next scene|later|payoff|setup|act\s*(?:i{1,3}|[123])|character arc|ending|climax|feature)\b/i.test(text),
  };
  const grounding = evaluateStorySpecificGrounding(text, storyContext, "screenplay_scene_doctor");
  if (grounding.applicable) dimensions.storySpecificGrounding = grounding.ok;
  const reason = !dimensions.developed
    ? "underdeveloped_scene_doctor"
    : !dimensions.diagnosis
      ? "missing_scene_diagnosis"
      : !dimensions.craftEvidence
        ? "missing_craft_evidence"
        : !dimensions.priorityFix
          ? "missing_priority_fix"
          : !dimensions.actionableRevision
            ? "missing_actionable_revision"
            : !dimensions.playableExample
              ? "missing_playable_example"
              : !dimensions.featureConsequence
                ? "missing_feature_consequence"
                : dimensions.storySpecificGrounding === false
                  ? "missing_specific_story_grounding"
                : "ok";
  return result({
    reason,
    dimensions,
    directives: reason === "ok" ? [] : sceneDoctorDirectives(reason),
  });
}

function evaluateFeatureArchitecture(text, storyContext = null) {
  const words = countWords(text);
  const hasActOne = /\bact\s*(?:i|1|one)\b/i.test(text);
  const hasActTwo = /\bact\s*(?:ii|2|two)\b/i.test(text);
  const hasActThree = /\bact\s*(?:iii|3|three)\b/i.test(text);
  const majorTurnCount = countMatches(text.toLowerCase(), [
    /\b(?:catalyst|inciting incident|inciting event|act i turn|commitment|break into two)\b/,
    /\bmidpoint\b/,
    /\b(?:all is lost|crisis|low point|dark night)\b/,
    /\b(?:climax|final confrontation|final choice)\b/,
    /\bfinal image\b/,
  ]);
  const causalBridgeCount = (
    text.match(/\b(?:because|therefore|which forces|forcing|so that|as a result|leads to|drives|creates|turns into|makes [^.\n]{0,80} inevitable)\b/gi) || []
  ).length;
  const dimensions = {
    developed: words >= 110,
    threeActProgression: hasActOne && hasActTwo && hasActThree,
    causalActBridges: causalBridgeCount >= 2,
    characterArcEngine: countMatches(text.toLowerCase(), [
      /\b(?:want|goal|objective)\b/,
      /\b(?:need|wound|false belief|misbelief)\b/,
      /\b(?:old tactic|changed behavior|change[sd]? tactic|transformation)\b/,
    ]) >= 2,
    majorFeatureTurns: majorTurnCount >= 4,
    setupPayoffPath: /\b(?:setup|plant|promise)\b/i.test(text) && /\b(?:payoff|pays? off|echo|returns?|transform)\b/i.test(text),
    sceneForwardPlan: /\b(?:next (?:three )?(?:scene|beat|turn)s?|sequence\s*(?:one|two|three|[1-8])|scene\s*(?:one|two|three|[1-3]))\b/i.test(text),
  };
  const grounding = evaluateStorySpecificGrounding(text, storyContext, "screenplay_feature_architecture");
  if (grounding.applicable) dimensions.storySpecificGrounding = grounding.ok;
  const reason = !dimensions.developed
    ? "underdeveloped_feature_architecture"
    : !dimensions.threeActProgression
      ? "missing_three_act_progression"
      : !dimensions.causalActBridges
        ? "missing_causal_act_bridges"
        : !dimensions.characterArcEngine
          ? "missing_character_arc_engine"
          : !dimensions.majorFeatureTurns
            ? "missing_major_feature_turns"
            : !dimensions.setupPayoffPath
              ? "missing_setup_payoff_path"
              : !dimensions.sceneForwardPlan
                ? "missing_scene_forward_plan"
                : dimensions.storySpecificGrounding === false
                  ? "missing_specific_story_grounding"
                : "ok";
  return result({
    reason,
    dimensions,
    directives: reason === "ok" ? [] : featureArchitectureDirectives(reason),
  });
}

function evaluateStructuralScreenplayReply({ reply = "", modelReason = "", storyContext = null } = {}) {
  const reason = String(modelReason || "").trim().toLowerCase();
  if (!STRUCTURAL_REASONS.has(reason)) {
    return result({ applicable: false, reason: "not_structural_analysis", dimensions: {} });
  }
  const text = normalizeText(reply);
  const structural = reason === "screenplay_scene_doctor"
    ? evaluateSceneDoctor(text, storyContext)
    : evaluateFeatureArchitecture(text, storyContext);
  const correctionAdherence = evaluateStoryObligationCorrectionAdherence({
    text,
    storyContext,
  });
  if (!correctionAdherence.applicable) return structural;
  const merged = result({
    reason: correctionAdherence.ok
      ? structural.reason
      : correctionAdherence.reason,
    dimensions: {
      ...structural.dimensions,
      writerCorrectionAdherence: correctionAdherence.ok,
    },
    directives: correctionAdherence.ok
      ? structural.repairDirectives
      : [
          ...correctionAdherence.repairDirectives,
          ...structural.repairDirectives,
        ].slice(0, 4),
  });
  return {
    ...merged,
    storyObligationCorrectionAdherence: correctionAdherence,
  };
}

function structuralScreenplayModelReasonForTask(task = null) {
  const intent = String(task?.intent || task || "").trim().toLowerCase();
  return STRUCTURAL_REASON_BY_TASK_INTENT[intent] || "";
}

function cleanContextValue(value, maxChars = 240) {
  return normalizeText(value).replace(/\s+/g, " ").slice(0, maxChars).trim();
}

function cleanContextList(value, maxItems = 4, maxChars = 180) {
  const source = Array.isArray(value)
    ? value
    : normalizeText(value)
      ? normalizeText(value).split(/\n|;/)
      : [];
  return source
    .map((item) => cleanContextValue(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildStructuralScreenplayRepairMessages({
  modelReason = "",
  userRequest = "",
  weakDraft = "",
  quality = null,
  studioMeta = null,
} = {}) {
  const reason = String(modelReason || "").trim().toLowerCase();
  if (!STRUCTURAL_REASONS.has(reason)) return [];
  const meta = studioMeta && typeof studioMeta === "object" ? studioMeta : {};
  const value = (...keys) => {
    for (const key of keys) {
      const cleaned = cleanContextValue(meta[key]);
      if (cleaned) return cleaned;
    }
    return "";
  };
  const list = (...keys) => {
    for (const key of keys) {
      const cleaned = cleanContextList(meta[key]);
      if (cleaned.length) return cleaned;
    }
    return [];
  };
  const featureGraph = meta.screenplayFeatureStoryGraph ??
    meta.screenplay_feature_story_graph ??
    meta.featureStoryGraph ??
    meta.feature_story_graph ??
    {};
  const graphState = featureGraph?.currentState && typeof featureGraph.currentState === "object"
    ? featureGraph.currentState
    : {};
  const graphFacts = Array.isArray(featureGraph?.bindingFacts)
    ? featureGraph.bindingFacts.slice(0, 4)
    : [];
  const graphThreads = Array.isArray(featureGraph?.openThreads)
    ? featureGraph.openThreads.slice(0, 3)
    : [];
  const graphDueConsequence = featureGraph?.currentDueConsequence &&
    typeof featureGraph.currentDueConsequence === "object"
    ? featureGraph.currentDueConsequence
    : {};
  const graphObligationChange = featureGraph?.currentStoryObligationChange &&
    typeof featureGraph.currentStoryObligationChange === "object"
    ? featureGraph.currentStoryObligationChange
    : {};
  const obligationCorrections = storyObligationCorrectionsFromContext(meta);
  const directDueConsequence = meta.screenplayDueConsequence ??
    meta.screenplay_due_consequence ?? {};
  const context = [
    ...obligationCorrections.map((item) => [
      "WRITER_OBLIGATION_CORRECTION",
      `${item.action === "retire" ? "RETIRE" : "KEEP_OPEN"} | ${cleanContextValue(item.obligation, 220)}`,
    ]),
    ["GRAPH_CHANGED_STATE", cleanContextValue(graphState.lastAcceptedOutcome ?? graphState.last_accepted_outcome, 220)],
    ["GRAPH_HANDOFF", cleanContextValue(graphState.nextScenePlan ?? graphState.next_scene_plan, 220)],
    ["GRAPH_DUE_CONSEQUENCE", cleanContextValue(
      graphDueConsequence.fact ??
        directDueConsequence.fact ??
        meta.screenplayAcceptedConsequenceDue ??
        meta.screenplay_accepted_consequence_due,
      220
    )],
    ["GRAPH_STORY_OBLIGATION_CHANGE", [
      cleanContextValue(graphObligationChange.status, 32),
      cleanContextValue(graphObligationChange.obligation, 220),
      cleanContextValue(graphObligationChange.result, 220),
    ].filter(Boolean).join(" | ")],
    ...graphFacts.map((item) => ["GRAPH_BINDING_FACT", cleanContextValue(item?.fact, 220)]),
    ...graphThreads.map((item) => [
      item?.due ? "GRAPH_DUE_PROMISE" : "GRAPH_OPEN_THREAD",
      [
        cleanContextValue(item?.setup, 180),
        cleanContextValue(item?.promisedPayoff ?? item?.promised_payoff, 180),
      ].filter(Boolean).join(" -> "),
    ]),
    ["ACT", value("screenplayAct", "screenplay_act")],
    ["SEQUENCE", value("screenplayFeatureSequence", "screenplay_feature_sequence")],
    ["ACT_OBLIGATION", value("screenplayFeatureObligation", "screenplay_feature_obligation")],
    ["CURRENT_BEAT", value("screenplayCurrentBeat", "screenplay_current_beat")],
    ["SCENE_OBJECTIVE", value("screenplaySceneObjective", "screenplay_scene_objective")],
    ["LAST_SCENE_OUTCOME", value("screenplayLastSceneOutcome", "screenplay_last_scene_outcome")],
    ["PROTAGONIST_WANT", value("screenplayProtagonistWant", "screenplay_protagonist_want")],
    ["PROTAGONIST_NEED", value("screenplayProtagonistNeed", "screenplay_protagonist_need")],
    ["CHARACTER_ARC", value("screenplayCharacterArcState", "screenplay_character_arc_state")],
    ["ANTAGONISTIC_FORCE", value("screenplayAntagonisticForce", "screenplay_antagonistic_force")],
    ["ENDING_IMAGE", value("screenplayEndingImage", "screenplay_ending_image")],
    ...list("screenplayNextThreeTurns", "screenplay_next_three_turns").map((item) => ["NEXT_TURN", item]),
    ...list("screenplayUnresolvedSetups", "screenplay_unresolved_setups").map((item) => ["OPEN_SETUP", item]),
    ...list("screenplayActThreePayoffPath", "screenplay_act_three_payoff_path").map((item) => ["ACT_III_PAYOFF", item]),
    ...list("screenplayCorrectedTerms", "screenplay_corrected_terms").map((item) => ["RETIRED_CANON", item]),
    ...list("screenplayCorrectionReplacements", "screenplay_correction_replacements").map((item) => ["CANON_CORRECTION", item]),
  ].filter(([, content]) => content).slice(0, 24);
  const directives = Array.isArray(quality?.repairDirectives)
    ? quality.repairDirectives.map((item) => cleanContextValue(item, 220)).filter(Boolean).slice(0, 3)
    : [];
  const taskContract = reason === "screenplay_scene_doctor"
    ? [
        "Identify the highest-leverage scene problem, support it with concrete craft evidence, and prescribe one priority revision.",
        "Include a short playable replacement beat or line and connect the fix to the next scene, act, arc, setup, or payoff.",
      ]
    : [
        "Deliver one causal Act I / Act II / Act III feature architecture anchored to character change.",
        "Include commitment, midpoint reversal, crisis or all-is-lost, climax, final image, a setup-payoff path, and the next playable scene turns.",
      ];
  return [
    {
      role: "system",
      content: [
        "You are Clementine's bounded structural screenplay repair pass.",
        "The previous answer failed a deterministic delivery gate. Silently fix only the failed dimensions and return the final answer only.",
        ...taskContract,
        ...(reason === "screenplay_feature_architecture"
          ? ["Start with the compact complete three-act causal spine. State every required feature turn before adding explanation so the answer remains complete if the token budget ends."]
          : []),
        "Preserve accepted canon and explicit corrections. KEEP_OPEN obligations remain unresolved; RETIRE obligations cannot return as props, beats, reveals, setups, or payoffs.",
        "Never invent missing project facts; label any creative assumption as a proposed story move.",
        "Be decisive, emotionally perceptive, screenplay-fluent, and immediately usable. No scoring, internal labels, apology, or process narration.",
        "Treat danger and harm as fictional screenplay craft only; never provide actionable real-world harm guidance.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `FAILED_REASON: ${cleanContextValue(quality?.reason || "structural_quality_failed", 100)}`,
        `INITIAL_SCORE: ${Number(quality?.score || 0).toFixed(2)}`,
        directives.length ? "REPAIR_DIRECTIVES:" : "",
        ...directives.map((item) => `- ${item}`),
        context.length ? "AUTHORITATIVE_STORY_CONTEXT:" : "",
        ...context.map(([label, content]) => `- ${label}: ${content}`),
        "",
        "USER_REQUEST:",
        cleanContextValue(userRequest, 1_600) || "(not supplied)",
        "",
        "WEAK_DRAFT:",
        normalizeText(weakDraft).slice(0, 6_000) || "(empty)",
        "",
        "Repair the answer now.",
      ].filter((line) => line !== "").join("\n"),
    },
  ];
}

function shouldAcceptStructuralRepair(initialQuality = null, candidateQuality = null) {
  if (!initialQuality?.applicable || !candidateQuality?.applicable) return false;
  if (candidateQuality.ok && !initialQuality.ok) return true;
  const initialScore = Math.max(0, Number(initialQuality.score || 0));
  const candidateScore = Math.max(0, Number(candidateQuality.score || 0));
  const initialPassed = Math.max(0, Number(initialQuality.passedDimensions || 0));
  const candidatePassed = Math.max(0, Number(candidateQuality.passedDimensions || 0));
  return candidatePassed > initialPassed && candidateScore >= initialScore + 0.05;
}

export {
  buildStructuralScreenplayRepairMessages,
  evaluateStructuralScreenplayReply,
  featureArchitectureDirectives,
  sceneDoctorDirectives,
  shouldAcceptStructuralRepair,
  structuralScreenplayModelReasonForTask,
};
