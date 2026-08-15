const STRUCTURAL_REASONS = new Set([
  "screenplay_scene_doctor",
  "screenplay_feature_architecture",
]);

const STRUCTURAL_REASON_BY_TASK_INTENT = Object.freeze({
  scene_doctor: "screenplay_scene_doctor",
  outline_structure: "screenplay_feature_architecture",
  finish_feature: "screenplay_feature_architecture",
});

function normalizeText(value) {
  return String(value || "").replace(/\r\n?/g, "\n").trim();
}

function countWords(value) {
  return normalizeText(value).match(/[A-Za-z0-9']+/g)?.length || 0;
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
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
  }[reason];
  return [specific, ...common].filter(Boolean).slice(0, 3);
}

function featureArchitectureDirectives(reason) {
  const common = [
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
  }[reason];
  return [specific, ...common].filter(Boolean).slice(0, 3);
}

function evaluateSceneDoctor(text) {
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
                : "ok";
  return result({
    reason,
    dimensions,
    directives: reason === "ok" ? [] : sceneDoctorDirectives(reason),
  });
}

function evaluateFeatureArchitecture(text) {
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
                : "ok";
  return result({
    reason,
    dimensions,
    directives: reason === "ok" ? [] : featureArchitectureDirectives(reason),
  });
}

function evaluateStructuralScreenplayReply({ reply = "", modelReason = "" } = {}) {
  const reason = String(modelReason || "").trim().toLowerCase();
  if (!STRUCTURAL_REASONS.has(reason)) {
    return result({ applicable: false, reason: "not_structural_analysis", dimensions: {} });
  }
  const text = normalizeText(reply);
  return reason === "screenplay_scene_doctor"
    ? evaluateSceneDoctor(text)
    : evaluateFeatureArchitecture(text);
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
  const context = [
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
  ].filter(([, content]) => content).slice(0, 20);
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
        "Preserve accepted canon and explicit corrections. Never invent missing project facts; label any creative assumption as a proposed story move.",
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
