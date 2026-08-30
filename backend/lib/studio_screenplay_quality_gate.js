import { inferScreenplayTask } from "./prompt_assembly.js";
import {
  classifyScreenplayLines,
  evaluateScreenplayPageQuality,
} from "./screenplay_page_quality.js";
import {
  evaluateScreenplayCanonContinuity,
  normalizeAcceptedCausalFacts,
} from "./screenplay_canon_guard.js";
import { normalizeScreenplayOutputContractText } from "./screenplay_output_contract.js";
import {
  buildStructuralScreenplayRepairMessages,
  evaluateStructuralScreenplayReply,
  shouldAcceptStructuralRepair,
} from "./structural_screenplay_quality.js";
import {
  evaluateStoryObligationCorrectionAdherence,
  storyObligationCorrectionsFromContext,
} from "./story_obligation_correction_guard.js";

const MAX_REPAIR_SYSTEM_CONTEXT_CHARS = 11_000;
const MAX_REPAIR_FAILED_DRAFT_CHARS = 4_800;
const MAX_REPAIR_USER_REQUEST_CHARS = 1_400;

function cleanInline(value = "", maxChars = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 240)))
    .trim();
}

function cleanMultiline(value = "", maxChars = 4_000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 4_000)))
    .trim();
}

function firstBodyValue(body = {}, keys = []) {
  for (const key of keys) {
    const value = body?.[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    return value;
  }
  return "";
}

function positiveIntegerOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function studioScreenplayRequestedPages({ body = {}, transcript = "" } = {}) {
  const explicit = positiveIntegerOrZero(firstBodyValue(body, [
    "screenplay_requested_pages",
    "screenplayRequestedPages",
    "screenplay_page_batch",
    "screenplayPageBatch",
    "requested_pages",
    "requestedPages",
    "page_batch",
    "pageBatch",
  ]));
  if (explicit > 0) return Math.min(30, explicit);
  const taskHint = cleanInline(firstBodyValue(body, [
    "screenplay_task_hint",
    "screenplayTaskHint",
  ]) || transcript, 2_000);
  const task = inferScreenplayTask(taskHint);
  return Math.min(30, positiveIntegerOrZero(task?.requestedPages ?? task?.requested_pages));
}

function studioScreenplayMaxTokens(requestedPages = 0) {
  const pages = Math.max(0, Math.min(30, positiveIntegerOrZero(requestedPages)));
  if (pages < 1) return 1_600;
  return Math.min(8_000, Math.max(1_600, (pages * 600) + 400));
}

function studioScreenplayFeatureContext(body = {}) {
  const read = (...keys) => firstBodyValue(body, keys);
  const directExecutionBrief = read(
    "screenplay_next_scene_execution_brief",
    "screenplayNextSceneExecutionBrief",
    "next_scene_execution_brief",
    "nextSceneExecutionBrief",
  );
  const briefSource = directExecutionBrief && typeof directExecutionBrief === "object"
    ? directExecutionBrief
    : {};
  const nextSceneExecutionBrief = {
    assignment: briefSource.assignment ?? read("screenplay_scene_assignment", "screenplaySceneAssignment", "screenplay_next_scene_assignment", "screenplayNextSceneAssignment"),
    consequence: briefSource.consequence ?? briefSource.acceptedConsequenceDue ?? briefSource.accepted_consequence_due ?? read("screenplay_accepted_consequence_due", "screenplayAcceptedConsequenceDue"),
    obstacle: briefSource.obstacle ?? briefSource.obstacleToPressurize ?? briefSource.obstacle_to_pressurize ?? read("screenplay_obstacle_to_pressurize", "screenplayObstacleToPressurize"),
    arc: briefSource.arc ?? briefSource.changedBehaviorDue ?? briefSource.changed_behavior_due ?? read("screenplay_changed_behavior_due", "screenplayChangedBehaviorDue"),
    payoff: briefSource.payoff ?? briefSource.payoffOrSetupToSpend ?? briefSource.payoff_or_setup_to_spend ?? read("screenplay_payoff_or_setup_to_spend", "screenplayPayoffOrSetupToSpend"),
    image: briefSource.image ?? briefSource.imageToStage ?? briefSource.image_to_stage ?? read("screenplay_image_to_stage", "screenplayImageToStage"),
    exit: briefSource.exit ?? briefSource.exitHandoff ?? briefSource.exit_handoff ?? read("screenplay_exit_handoff", "screenplayExitHandoff"),
  };
  const context = {
    projectId: read("screenplay_project_id", "screenplayProjectId", "project_id", "projectId"),
    versionId: read("screenplay_document_revision_id", "screenplayDocumentRevisionId", "version_id", "versionId"),
    projectTitle: read("screenplay_project_title", "screenplayProjectTitle", "project_title", "projectTitle"),
    phase: read("screenplay_phase", "screenplayPhase", "phase"),
    pack: read("screenplay_pack", "screenplayPack", "pack"),
    scene: read("screenplay_anchor_scene_label", "screenplayAnchorSceneLabel", "scene"),
    draftExcerpt: read("screenplay_draft_excerpt", "screenplayDraftExcerpt", "draft_excerpt", "draftExcerpt"),
    act: read("screenplay_act", "screenplayAct", "act"),
    featureSequence: read("screenplay_feature_sequence", "screenplayFeatureSequence", "feature_sequence", "featureSequence"),
    featureObligation: read("screenplay_feature_obligation", "screenplayFeatureObligation", "feature_obligation", "featureObligation"),
    pageCount: read("screenplay_page_count", "screenplayPageCount", "page_count", "pageCount"),
    targetPages: read("screenplay_target_pages", "screenplayTargetPages", "target_pages", "targetPages"),
    sceneObjective: read("screenplay_scene_objective", "screenplaySceneObjective", "scene_objective", "sceneObjective"),
    sceneSummary: read("screenplay_scene_summary", "screenplaySceneSummary", "scene_summary", "sceneSummary"),
    currentBeat: read("screenplay_current_beat", "screenplayCurrentBeat", "current_beat", "currentBeat"),
    logline: read("screenplay_logline", "screenplayLogline", "logline"),
    themeArgument: read("screenplay_theme_argument", "screenplayThemeArgument", "theme_argument", "themeArgument"),
    centralQuestion: read("screenplay_central_question", "screenplayCentralQuestion", "central_question", "centralQuestion"),
    protagonistWant: read("screenplay_protagonist_want", "screenplayProtagonistWant", "protagonist_want", "protagonistWant"),
    protagonistNeed: read("screenplay_protagonist_need", "screenplayProtagonistNeed", "protagonist_need", "protagonistNeed"),
    antagonisticForce: read("screenplay_antagonistic_force", "screenplayAntagonisticForce", "antagonistic_force", "antagonisticForce"),
    endingImage: read("screenplay_ending_image", "screenplayEndingImage", "ending_image", "endingImage"),
    actPressureState: read("screenplay_act_pressure_state", "screenplayActPressureState", "act_pressure_state", "actPressureState"),
    characterArcState: read("screenplay_character_arc_state", "screenplayCharacterArcState", "character_arc_state", "characterArcState"),
    characterArcMemory: read("screenplay_character_arc_memory", "screenplayCharacterArcMemory", "character_arc_memory", "characterArcMemory"),
    characterVoiceMemory: read("screenplay_character_voice_memory", "screenplayCharacterVoiceMemory", "character_voice_memory", "characterVoiceMemory"),
    characterVoiceMemories: read("screenplay_character_voice_memories", "screenplayCharacterVoiceMemories", "character_voice_memories", "characterVoiceMemories"),
    nextScenePlan: read("screenplay_next_scene_plan", "screenplayNextScenePlan", "next_scene_plan", "nextScenePlan"),
    nextSceneMoves: read("screenplay_next_scene_moves", "screenplayNextSceneMoves", "next_scene_moves", "nextSceneMoves"),
    nextThreeTurns: read("screenplay_next_three_turns", "screenplayNextThreeTurns", "next_three_turns", "nextThreeTurns"),
    actThreePayoffPath: read("screenplay_act_three_payoff_path", "screenplayActThreePayoffPath", "act_three_payoff_path", "actThreePayoffPath"),
    beatSequence: read("screenplay_beat_sequence", "screenplayBeatSequence", "beat_sequence", "beatSequence"),
    characterFocus: read("screenplay_character_focus", "screenplayCharacterFocus", "character_focus", "characterFocus"),
    unresolvedSetups: read("screenplay_unresolved_setups", "screenplayUnresolvedSetups", "unresolved_setups", "unresolvedSetups"),
    unresolvedStoryThreads: read("screenplay_unresolved_story_threads", "screenplayUnresolvedStoryThreads", "unresolved_story_threads", "unresolvedStoryThreads"),
    characterArcTurns: read("screenplay_character_arc_turns", "screenplayCharacterArcTurns", "character_arc_turns", "characterArcTurns"),
    imageMotifs: read("screenplay_image_motifs", "screenplayImageMotifs", "image_motifs", "imageMotifs"),
    continuityNotes: read("screenplay_continuity_notes", "screenplayContinuityNotes", "continuity_notes", "continuityNotes"),
    emotionalContinuity: read("screenplay_emotional_continuity", "screenplayEmotionalContinuity", "emotional_continuity", "emotionalContinuity"),
    lastSceneOutcome: read("screenplay_last_scene_outcome", "screenplayLastSceneOutcome", "last_scene_outcome", "lastSceneOutcome"),
    acceptedCausalFacts: normalizeAcceptedCausalFacts(read(
      "screenplay_accepted_causal_facts",
      "screenplayAcceptedCausalFacts",
      "accepted_causal_facts",
      "acceptedCausalFacts",
    )),
    storyObligationCorrections: storyObligationCorrectionsFromContext(body),
  };
  if (Object.values(nextSceneExecutionBrief).some((value) => cleanInline(value, 240))) {
    context.nextSceneExecutionBrief = nextSceneExecutionBrief;
  }
  return context;
}

function hasStudioScreenplaySceneAnchor(body = {}) {
  return Boolean(cleanInline(firstBodyValue(body, [
    "screenplay_anchor_scene_label",
    "screenplayAnchorSceneLabel",
    "screenplay_resolved_anchor_excerpt",
    "screenplayResolvedAnchorExcerpt",
    "screenplay_draft_excerpt",
    "screenplayDraftExcerpt",
    "draft_excerpt",
    "draftExcerpt",
  ]), 300));
}

function compactQualityCounts(counts = {}) {
  return {
    words: Math.max(0, Number(counts?.words || 0)),
    scene_headings: Math.max(0, Number(counts?.sceneHeading || 0)),
    playable_actions: Math.max(0, Number(counts?.playableAction || 0)),
    specific_actions: Math.max(0, Number(counts?.specificAction || 0)),
    characters: Math.max(0, Number(counts?.character || 0)),
    dialogue: Math.max(0, Number(counts?.dialogue || 0)),
    scene_turns: Math.max(0, Number(counts?.turnEventAction || 0)),
    artifacts: Math.max(0, Number(counts?.artifact || 0)),
    placeholders: Math.max(0, Number(counts?.placeholder || 0)),
  };
}

function evaluateStudioScreenplayReply({ reply = "", transcript = "", body = {} } = {}) {
  const text = normalizeScreenplayOutputContractText(String(reply || "").trim());
  const lines = classifyScreenplayLines(text);
  const requestedPages = studioScreenplayRequestedPages({ body, transcript });
  const featureContext = studioScreenplayFeatureContext(body);
  const result = evaluateScreenplayPageQuality({
    text,
    lines,
    targetPages: requestedPages,
    hasSceneAnchor: hasStudioScreenplaySceneAnchor(body),
    featureContext,
  });
  const canonContinuity = evaluateScreenplayCanonContinuity({
    text,
    acceptedCausalFacts: featureContext.acceptedCausalFacts,
    writerRequest: transcript,
  });
  const storyObligationCorrectionAdherence = evaluateStoryObligationCorrectionAdherence({
    text,
    corrections: featureContext.storyObligationCorrections,
  });
  if (result.ok && !canonContinuity.ok) {
    return {
      ...result,
      ok: false,
      reason: canonContinuity.reason,
      repairDirectives: canonContinuity.repairDirectives,
      canonContinuity,
      storyObligationCorrectionAdherence,
      text,
      lines,
      requestedPages,
    };
  }
  if (result.ok && !storyObligationCorrectionAdherence.ok) {
    return {
      ...result,
      ok: false,
      reason: storyObligationCorrectionAdherence.reason,
      repairDirectives: storyObligationCorrectionAdherence.repairDirectives,
      canonContinuity,
      storyObligationCorrectionAdherence,
      text,
      lines,
      requestedPages,
    };
  }
  return {
    ...result,
    canonContinuity,
    storyObligationCorrectionAdherence,
    text,
    lines,
    requestedPages,
  };
}

function repairDirectivesForQuality(quality = {}) {
  const reason = cleanInline(quality?.reason, 96);
  const directives = [
    "Return only clean playable Fountain screenplay text, with no preamble, diagnosis, outline, markdown, labels, recap, or afterword.",
    "Preserve the writer's canon, supplied corrections, active act/sequence, emotional handoff, and concrete nouns from the live draft.",
  ];
  const correctionDirectives = Array.isArray(
    quality?.storyObligationCorrectionAdherence?.repairDirectives
  )
    ? quality.storyObligationCorrectionAdherence.repairDirectives
    : [];
  directives.push(...correctionDirectives);
  if (reason === "accepted_canon_contradiction") {
    directives.push(...(Array.isArray(quality?.canonContinuity?.repairDirectives)
      ? quality.canonContinuity.repairDirectives
      : []));
    directives.push("Continue from the accepted changed condition. Never replay a known revelation, reset a changed relationship, erase a decision, or restore an irreversible loss.");
  } else if (["empty_page_text", "empty_page_lines", "missing_screenplay_shape", "missing_batch_scene_anchor", "outline_or_craft_artifact"].includes(reason)) {
    directives.push("Use screenplay shape now: scene heading or anchored continuation, visible action, character cues, tactical dialogue, and a consequential exit turn.");
  } else if (["underfilled_page_text", "thin_long_page_batch", "thin_scene_turn_batch", "summary_like_page_batch"].includes(reason)) {
    directives.push("Complete the requested page run as scenes, changing leverage, information, relationship, tactic, or cost every 1-2 pages.");
  } else if (["on_the_nose_dialogue", "static_dialogue_batch", "dialogue_tactic_lock", "expository_dialogue_dump", "interchangeable_dialogue_voice", "flat_dialogue_no_tactics"].includes(reason)) {
    directives.push("Rewrite dialogue as character-specific tactics and subtext; break repetition with interruption, behavior, reversal, discovery, and cost.");
  } else if (reason.startsWith("missing_act_") || reason === "missing_character_arc_pressure" || reason === "missing_character_arc_memory") {
    directives.push("Spend the supplied act and character-arc obligation through visible changed behavior, pressure, consequence, and image payoff.");
  } else if (reason === "missing_next_turn_continuation" || reason === "missing_next_scene_assignment" || reason === "missing_next_scene_execution_brief") {
    directives.push("Use the supplied next turn or next-scene assignment as the immediate page engine before inventing a new plot lane.");
  } else {
    directives.push("Repair the failed quality condition with specific playable behavior, a clear scene objective, obstacle, tactic shift, cost, and exit image.");
  }
  return [...new Set(directives.map((item) => cleanInline(item, 320)).filter(Boolean))];
}

function repairContextLines(body = {}, quality = {}) {
  const feature = studioScreenplayFeatureContext(body);
  const entries = [
    ["ACT", feature.act],
    ["ACTIVE_SEQUENCE", feature.featureSequence],
    ["STRUCTURAL_OBLIGATION", feature.featureObligation],
    ["SCENE_OBJECTIVE", feature.sceneObjective],
    ["CURRENT_BEAT", feature.currentBeat],
    ["EMOTIONAL_CONTINUITY", feature.emotionalContinuity],
    ["LAST_SCENE_OUTCOME", feature.lastSceneOutcome],
    ["ENDING_IMAGE", feature.endingImage],
    ["NEXT_SCENE_PLAN", feature.nextScenePlan],
    ["ACCEPTED_CONSEQUENCE_DUE", feature.nextSceneExecutionBrief?.consequence],
  ];
  const lines = entries
    .map(([label, value]) => {
      const clean = cleanInline(value, 240);
      return clean ? `${label}: ${clean}` : "";
    })
    .filter(Boolean);
  const appendList = (label, value, maxItems = 3) => {
    const source = Array.isArray(value) ? value : cleanInline(value, 600) ? [value] : [];
    for (const item of source.slice(0, maxItems)) {
      const clean = cleanInline(item, 200);
      if (clean) lines.push(`${label}: ${clean}`);
    }
  };
  for (const item of feature.acceptedCausalFacts.slice(0, 6)) {
    lines.push(`BINDING_CAUSAL_FACT [${item.kind}]: ${item.fact}`);
  }
  const violations = Array.isArray(quality?.canonContinuity?.violations)
    ? quality.canonContinuity.violations
    : [];
  for (const violation of violations.slice(0, 3)) {
    lines.push(`CANON_VIOLATION [${cleanInline(violation.type, 48)}]: ${cleanInline(violation.excerpt, 260)}`);
  }
  for (const correction of feature.storyObligationCorrections.slice(0, 6)) {
    lines.push(
      `WRITER_OBLIGATION_CORRECTION: ${correction.action === "retire" ? "RETIRE" : "KEEP_OPEN"} | ${correction.obligation}`
    );
  }
  appendList("NEXT_TURN", feature.nextThreeTurns, 3);
  appendList("NEXT_SCENE_MOVE", feature.nextSceneMoves, 3);
  appendList("ACT_THREE_PAYOFF", feature.actThreePayoffPath, 3);
  appendList("UNRESOLVED_SETUP", feature.unresolvedSetups, 3);
  appendList("STORY_THREAD", feature.unresolvedStoryThreads, 3);
  appendList("IMAGE_MOTIF", feature.imageMotifs, 3);
  return lines.slice(0, 28);
}

function buildStudioScreenplayRepairRequest({
  systemPrompt = "",
  transcript = "",
  body = {},
  failedReply = "",
  quality = {},
} = {}) {
  const requestedPages = Math.max(0, Number(quality?.requestedPages || 0));
  const directives = repairDirectivesForQuality(quality);
  const repairSystemPrompt = [
    "You are Clementine's single bounded screenplay repair pass.",
    "The prior generation failed the live page-quality gate.",
    `QUALITY_FAILURE: ${cleanInline(quality?.reason || "low_page_quality", 96)}`,
    requestedPages > 0 ? `REQUESTED_PAGE_BATCH: ${requestedPages}` : "",
    ...directives.map((line) => `- ${line}`),
    "- Output only the repaired screenplay pages. Never discuss this repair pass.",
    "ORIGINAL_SYSTEM_CONTEXT:",
    cleanMultiline(systemPrompt, MAX_REPAIR_SYSTEM_CONTEXT_CHARS),
  ].filter(Boolean).join("\n");
  const repairTranscript = [
    "WRITER_REQUEST:",
    cleanMultiline(transcript, MAX_REPAIR_USER_REQUEST_CHARS),
    ...repairContextLines(body, quality),
    "FAILED_DRAFT_TO_REPAIR:",
    cleanMultiline(failedReply, MAX_REPAIR_FAILED_DRAFT_CHARS),
  ].filter(Boolean).join("\n");
  return { systemPrompt: repairSystemPrompt, transcript: repairTranscript };
}

function qualityEnvelope({
  result,
  source,
  attemptedRepair = false,
  repairOutcome = "not_needed",
  initialReason = "",
  elapsedMs = 0,
} = {}) {
  const canonContinuity = result?.canonContinuity && typeof result.canonContinuity === "object"
    ? result.canonContinuity
    : null;
  const canonViolations = Array.isArray(canonContinuity?.violations)
    ? canonContinuity.violations
    : [];
  const correctionAdherence = result?.storyObligationCorrectionAdherence &&
    typeof result.storyObligationCorrectionAdherence === "object"
    ? result.storyObligationCorrectionAdherence
    : null;
  const correctionViolations = Array.isArray(correctionAdherence?.violations)
    ? correctionAdherence.violations
    : [];
  return {
    ok: Boolean(result?.ok),
    reason: cleanInline(result?.reason || (result?.ok ? "ok" : "low_page_quality"), 96),
    source: cleanInline(source || "initial", 32),
    requested_pages: Math.max(0, Number(result?.requestedPages || 0)),
    attempted_repair: Boolean(attemptedRepair),
    repair_outcome: cleanInline(repairOutcome, 48),
    initial_reason: cleanInline(initialReason, 96) || null,
    repair_ms: Math.max(0, Math.round(Number(elapsedMs || 0))),
    counts: compactQualityCounts(result?.counts),
    canon_facts_checked: Math.max(0, Math.round(Number(canonContinuity?.factsChecked || 0))),
    canon_violation_count: canonViolations.length,
    canon_violation_types: [...new Set(canonViolations.map((item) => cleanInline(item?.type, 48)).filter(Boolean))],
    canon_correction_override: Boolean(canonContinuity?.correctionOverride),
    story_obligation_corrections_checked: Math.max(
      0,
      Math.round(Number(correctionAdherence?.correctionsChecked || 0))
    ),
    story_obligation_violation_count: correctionViolations.length,
    story_obligation_violation_types: [...new Set(
      correctionViolations.map((item) => cleanInline(item?.type, 48)).filter(Boolean)
    )],
  };
}

async function enforceStudioScreenplayQuality({
  reply = "",
  transcript = "",
  body = {},
  systemPrompt = "",
  renderRepair,
} = {}) {
  const initial = evaluateStudioScreenplayReply({ reply, transcript, body });
  if (initial.ok) {
    return {
      ok: true,
      reply: initial.text,
      repaired: false,
      quality: qualityEnvelope({ result: initial, source: "initial" }),
    };
  }

  const startedAt = Date.now();
  if (typeof renderRepair !== "function") {
    return {
      ok: false,
      reply: "",
      repaired: false,
      quality: qualityEnvelope({
        result: initial,
        source: "initial",
        attemptedRepair: false,
        repairOutcome: "unavailable",
        initialReason: initial.reason,
      }),
    };
  }

  try {
    const repairRequest = buildStudioScreenplayRepairRequest({
      systemPrompt,
      transcript,
      body,
      failedReply: initial.text || reply,
      quality: initial,
    });
    const repairedRawReply = await renderRepair({
      ...repairRequest,
      maxTokens: studioScreenplayMaxTokens(initial.requestedPages),
      modelTier: "structural_repair",
      repairAttempt: true,
    });
    const repaired = evaluateStudioScreenplayReply({
      reply: repairedRawReply,
      transcript,
      body,
    });
    const elapsedMs = Date.now() - startedAt;
    if (!repaired.ok) {
      return {
        ok: false,
        reply: "",
        repaired: false,
        quality: qualityEnvelope({
          result: repaired,
          source: "repair",
          attemptedRepair: true,
          repairOutcome: "rejected",
          initialReason: initial.reason,
          elapsedMs,
        }),
      };
    }
    return {
      ok: true,
      reply: repaired.text,
      repaired: true,
      quality: qualityEnvelope({
        result: repaired,
        source: "repair",
        attemptedRepair: true,
        repairOutcome: "repaired",
        initialReason: initial.reason,
        elapsedMs,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      reply: "",
      repaired: false,
      quality: qualityEnvelope({
        result: initial,
        source: "repair",
        attemptedRepair: true,
        repairOutcome: "supplier_failed",
        initialReason: initial.reason,
        elapsedMs: Date.now() - startedAt,
      }),
      error: cleanInline(error?.message || error || "Studio screenplay repair failed.", 180),
    };
  }
}

function compactStructuralDimensions(dimensions = {}) {
  return Object.fromEntries(
    Object.entries(dimensions || {}).map(([key, value]) => [key, Boolean(value)])
  );
}

function structuralQualityEnvelope({
  modelReason = "",
  taskIntent = "",
  initialQuality,
  finalQuality = null,
  attemptedRepair = false,
  repaired = false,
  outcome = "initial_pass",
  repairMs = 0,
} = {}) {
  const resolved = finalQuality || initialQuality || {};
  const correctionAdherence = resolved?.storyObligationCorrectionAdherence &&
    typeof resolved.storyObligationCorrectionAdherence === "object"
    ? resolved.storyObligationCorrectionAdherence
    : null;
  const correctionViolations = Array.isArray(correctionAdherence?.violations)
    ? correctionAdherence.violations
    : [];
  return {
    applicable: true,
    passed: Boolean(resolved.ok),
    repaired: Boolean(repaired),
    attempted_repair: Boolean(attemptedRepair),
    outcome: cleanInline(outcome, 48) || "not_improved",
    reason: cleanInline(resolved.reason, 96) || "structural_quality_failed",
    initial_reason: cleanInline(initialQuality?.reason, 96) || null,
    initial_score: Math.max(0, Math.min(1, Number(initialQuality?.score || 0))),
    final_score: Math.max(0, Math.min(1, Number(resolved.score || 0))),
    passed_dimensions: Math.max(0, Number(resolved.passedDimensions || 0)),
    total_dimensions: Math.max(0, Number(resolved.totalDimensions || 0)),
    dimensions: compactStructuralDimensions(resolved.dimensions),
    repair_ms: Math.max(0, Math.round(Number(repairMs || 0))),
    model_reason: cleanInline(modelReason, 64),
    task_intent: cleanInline(taskIntent, 64),
    story_obligation_corrections_checked: Math.max(
      0,
      Math.round(Number(correctionAdherence?.correctionsChecked || 0))
    ),
    story_obligation_violation_count: correctionViolations.length,
    story_obligation_violation_types: [...new Set(
      correctionViolations.map((item) => cleanInline(item?.type, 48)).filter(Boolean)
    )],
  };
}

async function enforceStudioStructuralAnalysisQuality({
  reply = "",
  transcript = "",
  studioMeta = {},
  modelReason = "",
  taskIntent = "",
  maxTokens = 1_000,
  renderRepair,
} = {}) {
  const initialQuality = evaluateStructuralScreenplayReply({
    reply,
    modelReason,
    storyContext: studioMeta,
  });
  const envelope = (options = {}) => structuralQualityEnvelope({
    modelReason,
    taskIntent,
    initialQuality,
    ...options,
  });
  if (!initialQuality.applicable || initialQuality.ok) {
    return { reply, repaired: false, structuralQuality: envelope() };
  }
  if (typeof renderRepair !== "function") {
    return {
      reply,
      repaired: false,
      structuralQuality: envelope({ outcome: "unavailable" }),
    };
  }

  const repairMessages = buildStructuralScreenplayRepairMessages({
    modelReason,
    userRequest: transcript,
    weakDraft: reply,
    quality: initialQuality,
    studioMeta,
  });
  if (repairMessages.length < 2) {
    return {
      reply,
      repaired: false,
      structuralQuality: envelope({ outcome: "unavailable" }),
    };
  }

  const startedAt = Date.now();
  try {
    const repairTokenCap = modelReason === "screenplay_feature_architecture" ? 2_600 : 1_400;
    const candidateReply = String(await renderRepair({
      systemPrompt: repairMessages[0].content,
      transcript: repairMessages[1].content,
      modelTier: "structural_repair",
      maxTokens: Math.max(700, Math.min(repairTokenCap, Number(maxTokens || 1_000))),
      repairAttempt: true,
    }) || "").trim();
    const candidateQuality = evaluateStructuralScreenplayReply({
      reply: candidateReply,
      modelReason,
      storyContext: studioMeta,
    });
    if (!candidateReply || !shouldAcceptStructuralRepair(initialQuality, candidateQuality)) {
      return {
        reply,
        repaired: false,
        structuralQuality: envelope({
          attemptedRepair: true,
          outcome: "not_improved",
          repairMs: Date.now() - startedAt,
        }),
      };
    }
    return {
      reply: candidateReply,
      repaired: true,
      structuralQuality: envelope({
        finalQuality: candidateQuality,
        attemptedRepair: true,
        repaired: true,
        outcome: candidateQuality.ok ? "repaired_pass" : "improved",
        repairMs: Date.now() - startedAt,
      }),
    };
  } catch (_error) {
    return {
      reply,
      repaired: false,
      structuralQuality: envelope({
        attemptedRepair: true,
        outcome: "supplier_failed",
        repairMs: Date.now() - startedAt,
      }),
    };
  }
}

export {
  buildStudioScreenplayRepairRequest,
  enforceStudioScreenplayQuality,
  enforceStudioStructuralAnalysisQuality,
  evaluateStudioScreenplayReply,
  studioScreenplayFeatureContext,
  studioScreenplayMaxTokens,
  studioScreenplayRequestedPages,
};
