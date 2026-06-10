import { inferScreenplayTask } from "./prompt_assembly.js";

function trimToString(value = "", maxLength = 8_000) {
  return String(value ?? "").trim().slice(0, Math.max(1, Number(maxLength || 8_000)));
}

function positiveIntegerOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
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
  ].some((value) => trimToString(value, 240));
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

function shouldAutoRouteTaskToPage({ task, lowerText, hasLiveContext, requestedPages }) {
  const intent = trimToString(task?.intent, 80);
  if (!intent) return false;
  if (requestedPages > 0) return true;
  const hasPageCue = hasPageWritingCue(lowerText);
  if (["write_scene", "rewrite_scene", "continue_script"].includes(intent)) {
    return hasPageCue || hasLiveContext;
  }
  if (intent === "dialogue_punchup") {
    return hasLiveContext || hasPageCue;
  }
  if (intent === "finish_feature") {
    return hasLiveContext && (hasPageCue || hasFeaturePageWritingCue(lowerText));
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
