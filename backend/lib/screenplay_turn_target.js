import { inferScreenplayTask } from "./prompt_assembly.js";

function trimToString(value = "", maxLength = 8_000) {
  return String(value ?? "").trim().slice(0, Math.max(1, Number(maxLength || 8_000)));
}

function positiveIntegerOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function hasContextValue(value) {
  if (Array.isArray(value)) return value.some((item) => trimToString(item, 240));
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(trimToString(value, 240));
}

function normalizeScreenplayTarget(value = "") {
  const normalized = trimToString(value, 80).toLowerCase();
  if (normalized === "page") return "page";
  if (normalized === "voicepin" || normalized === "voice_pin") return "voice_pin";
  return "";
}

function textFromRequest(input = {}) {
  if (!input || typeof input !== "object") return "";
  return [
    input.screenplay_generation_transcript,
    input.screenplayGenerationTranscript,
    input.client_transcript,
    input.clientTranscript,
    input.debug_transcript,
    input.debugTranscript,
    input.transcript,
    input.user_message,
    input.userMessage,
    input.user_input,
    input.userInput,
    input.screenplay_task_hint,
    input.screenplayTaskHint,
    input.prompt,
    input.input,
    input.text,
  ]
    .map((value) => trimToString(value, 2_000))
    .filter(Boolean)
    .join("\n")
    .slice(0, 8_000);
}

function requestedPageCountFromRequest(input = {}, task = null) {
  const explicit = positiveIntegerOrZero(
    input?.screenplayTargetPages ??
    input?.screenplay_target_pages ??
    input?.targetPages ??
    input?.target_pages ??
    input?.pageBatch ??
    input?.page_batch
  );
  if (explicit > 0) return explicit;
  const taskPages = positiveIntegerOrZero(
    task?.requestedPages ??
    task?.requested_pages ??
    task?.pageBatch ??
    task?.page_batch
  );
  return taskPages > 0 ? taskPages : 0;
}

function hasLiveScreenplayContext(input = {}) {
  if (!input || typeof input !== "object") return false;
  return [
    input.screenplayDraftExcerpt,
    input.screenplay_draft_excerpt,
    input.draftExcerpt,
    input.draft_excerpt,
    input.screenplayAnchorSceneLabel,
    input.screenplay_anchor_scene_label,
    input.anchorSceneLabel,
    input.screenplayAnchorScriptNodeId,
    input.screenplay_anchor_script_node_id,
    input.anchorScriptNodeId,
    input.screenplayAct,
    input.screenplay_act,
    input.act,
    input.screenplayCurrentBeat,
    input.screenplay_current_beat,
    input.currentBeat,
    input.screenplaySceneObjective,
    input.screenplay_scene_objective,
    input.sceneObjective,
    input.screenplaySceneSummary,
    input.screenplay_scene_summary,
    input.sceneSummary,
    input.screenplayFeatureSequence,
    input.screenplay_feature_sequence,
    input.featureSequence,
    input.screenplayFeatureObligation,
    input.screenplay_feature_obligation,
    input.featureObligation,
    input.screenplayActPressureState,
    input.screenplay_act_pressure_state,
    input.actPressureState,
    input.act_pressure_state,
    input.screenplayCharacterArcState,
    input.screenplay_character_arc_state,
    input.characterArcState,
    input.character_arc_state,
    input.screenplayLastSceneOutcome,
    input.screenplay_last_scene_outcome,
    input.lastSceneOutcome,
    input.last_scene_outcome,
    input.screenplayNextScenePlan,
    input.screenplay_next_scene_plan,
    input.nextScenePlan,
    input.next_scene_plan,
    input.screenplayNextThreeTurns,
    input.screenplay_next_three_turns,
    input.nextThreeTurns,
    input.next_three_turns,
    input.screenplayActThreePayoffPath,
    input.screenplay_act_three_payoff_path,
    input.actThreePayoffPath,
    input.act_three_payoff_path,
    input.screenplayUnresolvedStoryThreads,
    input.screenplay_unresolved_story_threads,
    input.unresolvedStoryThreads,
    input.unresolved_story_threads,
    input.screenplayCharacterArcTurns,
    input.screenplay_character_arc_turns,
    input.characterArcTurns,
    input.character_arc_turns,
    input.screenplayImageMotifs,
    input.screenplay_image_motifs,
    input.imageMotifs,
    input.image_motifs,
    input.visualMotifs,
    input.visual_motifs,
    positiveIntegerOrZero(input.screenplayPageCount ?? input.screenplay_page_count ?? input.pageCount ?? input.page_count) > 0
      ? "page-count"
      : "",
  ].some(hasContextValue);
}

function hasProjectScreenplayContext(input = {}) {
  if (!input || typeof input !== "object") return false;
  return [
    input.screenplayProjectId,
    input.screenplay_project_id,
    input.projectId,
    input.project_id,
    input.screenplayDocumentRevisionId,
    input.screenplay_document_revision_id,
    input.versionId,
    input.version_id,
  ].some(hasContextValue);
}

function hasPageWritingCue(lowerText = "") {
  if (!lowerText) return false;
  const pageNumberToken = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)";
  return [
    /\bfeature[- ]film screenplay pages\b/,
    /\bscreenplay\s+(?:pages?|format|text)\b/,
    /\bfountain\s+(?:pages?|format|text)\b/,
    new RegExp(`\\b(?:next|another|first|final|last)\\s+${pageNumberToken}\\s+pages?\\b`),
    new RegExp(`\\b${pageNumberToken}\\s*(?:-|to|\\u2013|\\u2014)\\s*${pageNumberToken}\\s+pages?\\b`),
    /\b(?:write|draft|continue|generate|give me|do|finish|complete)\b[\s\S]{0,90}\b(?:pages?|scene|sequence|screenplay|script|fountain)\b/,
    /\b(?:rewrite|revise|polish|punch up|punch-up|tighten|replace)\b[\s\S]{0,90}\b(?:scene|passage|pages?|dialogue|exchange|screenplay|script)\b/,
    /\b(?:next page|next scene|keep writing|keep going|take it from here|continue from here)\b/,
  ].some((pattern) => pattern.test(lowerText));
}

function hasFeaturePageWritingCue(lowerText = "") {
  if (!lowerText) return false;
  return /\b(?:write|draft|continue|finish|complete)\b[\s\S]{0,120}\b(?:act|feature|film|movie|screenplay|script|final sequence|finale)\b/.test(lowerText);
}

function hasActAwareWritingCue(lowerText = "") {
  if (!lowerText) return false;
  const actOrSequence = "(?:act\\s*(?:i|ii|iii|1|2|3|one|two|three)|first act|second act|third act|final act|act two|act three|midpoint|all[- ]is[- ]lost|break into three|final sequence|finale|climax|sequence)";
  return [
    new RegExp(`\\b(?:write|draft|continue|finish|complete|rewrite|revise|polish|tighten|punch up|punch-up|make|start|open)\\b[\\s\\S]{0,120}\\b${actOrSequence}\\b`),
    new RegExp(`\\b${actOrSequence}\\b[\\s\\S]{0,120}\\b(?:write|draft|continue|finish|complete|rewrite|revise|polish|tighten|punch up|punch-up|make|start|open|pages?)\\b`),
    new RegExp(`\\b(?:take|move|push|carry|drive)\\b[\\s\\S]{0,100}\\b(?:into|through|toward|towards)\\b[\\s\\S]{0,100}\\b${actOrSequence}\\b`),
  ].some((pattern) => pattern.test(lowerText));
}

function shouldAutoRouteTaskToPage({
  task,
  lowerText,
  hasLiveContext,
  hasProjectContext,
  requestedPages,
}) {
  const intent = trimToString(task?.intent, 80);
  if (!intent) return false;
  if (requestedPages > 0) return true;
  const hasPageCue = hasPageWritingCue(lowerText);
  const hasActCue = hasActAwareWritingCue(lowerText);
  if (["write_scene", "rewrite_scene", "continue_script"].includes(intent)) {
    return hasPageCue || hasLiveContext || (hasProjectContext && hasActCue);
  }
  if (intent === "dialogue_punchup") {
    return hasLiveContext || hasPageCue || (hasProjectContext && hasActCue);
  }
  if (intent === "finish_feature") {
    return (
      hasLiveContext && (hasPageCue || hasFeaturePageWritingCue(lowerText) || hasActCue)
    ) || (
      hasProjectContext && (hasPageCue || hasActCue)
    );
  }
  return false;
}

function inferScreenplayTargetFromRequest(input = {}) {
  if (!input || typeof input !== "object") return "";
  const text = textFromRequest(input);
  if (!text) {
    return positiveIntegerOrZero(
      input.screenplayTargetPages ??
      input.screenplay_target_pages ??
      input.targetPages ??
      input.target_pages
    ) > 0 ? "page" : "";
  }
  const task = inferScreenplayTask(text);
  const requestedPages = requestedPageCountFromRequest(input, task);
  const lowerText = text.toLowerCase();
  if (
    shouldAutoRouteTaskToPage({
      task,
      lowerText,
      hasLiveContext: hasLiveScreenplayContext(input),
      hasProjectContext: hasProjectScreenplayContext(input),
      requestedPages,
    })
  ) {
    return "page";
  }
  return "";
}

function resolveScreenplayTargetFromRequest(input = {}) {
  if (!input || typeof input !== "object") return "";
  const explicit = normalizeScreenplayTarget(
    input.screenplayTarget ??
    input.screenplay_target ??
    input.target ??
    ""
  );
  return explicit || inferScreenplayTargetFromRequest(input);
}

export {
  inferScreenplayTargetFromRequest,
  normalizeScreenplayTarget,
  resolveScreenplayTargetFromRequest,
};
