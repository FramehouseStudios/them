import express from "express";

import { buildModelPrompt, inferScreenplayTask } from "./prompt_assembly.js";

const PROMPT_SCHEMA_VERSION = 1;

function trimToString(value, maxLength = 16_000) {
  return String(value ?? "").trim().slice(0, Math.max(1, Number(maxLength || 16_000)));
}

function listItemToString(value) {
  if (value && typeof value === "object") {
    return (
      value.name ??
      value.label ??
      value.title ??
      value.heading ??
      value.slugline ??
      value.id ??
      ""
    );
  }
  return value;
}

function sanitizeStringList(value, maxItems = 8, maxLength = 180) {
  const source = Array.isArray(value)
    ? value
    : trimToString(value)
      ? String(value).split(/\r?\n|;/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const clean = trimToString(listItemToString(item), maxLength).replace(/\s+/g, " ");
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function positiveIntegerOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const clean = trimToString(value);
    if (clean) return clean;
  }
  return "";
}

function firstNonEmptyText(maxLength, ...values) {
  for (const value of values) {
    const clean = trimToString(value, maxLength);
    if (clean) return clean;
  }
  return "";
}

function firstNonEmptyList(...values) {
  for (const value of values) {
    const clean = sanitizeStringList(value);
    if (clean.length) return clean;
  }
  return [];
}

function estimatePageCount(draft) {
  const text = trimToString(draft, 200_000);
  if (!text) return 0;
  const lineCount = text.replace(/\r\n/g, "\n").split("\n").length;
  return Math.max(1, Math.ceil(lineCount / 55));
}

function findActiveProjectVersion(project, versionId, getLatestScreenplayVersion) {
  const versions = Array.isArray(project?.versions) ? project.versions : [];
  const requestedVersionId = trimToString(versionId, 160);
  if (requestedVersionId) {
    const requested = versions.find((version) => trimToString(version?.id, 160) === requestedVersionId);
    if (requested) return requested;
  }
  const activeVersionId = trimToString(project?.activeVersionId ?? project?.active_version_id, 160);
  if (activeVersionId) {
    const active = versions.find((version) => trimToString(version?.id, 160) === activeVersionId);
    if (active) return active;
  }
  if (typeof getLatestScreenplayVersion === "function") {
    const latest = getLatestScreenplayVersion(project);
    if (latest) return latest;
  }
  return versions[0] || null;
}

function outlineActs(project) {
  return Array.isArray(project?.outline?.acts) ? project.outline.acts : [];
}

function outlineBeats(project) {
  return Array.isArray(project?.outline?.beats) ? project.outline.beats : [];
}

function outlineScenes(project) {
  return Array.isArray(project?.outline?.scenes) ? project.outline.scenes : [];
}

function activeOutlineScene(project) {
  const scenes = outlineScenes(project);
  return scenes.length ? scenes[scenes.length - 1] : null;
}

function labelFromRecord(record) {
  return firstNonEmpty(
    record?.label,
    record?.slugline,
    record?.heading,
    record?.title,
    record?.name,
    record?.objective,
    record?.summary
  );
}

function actTitleForScene(project, scene) {
  const direct = firstNonEmpty(
    scene?.actTitle,
    scene?.act_title,
    scene?.act,
    scene?.actLabel,
    scene?.act_label
  );
  if (direct) return direct;
  const actId = trimToString(scene?.actId ?? scene?.act_id, 160);
  if (!actId) return "";
  const act = outlineActs(project).find((candidate) => {
    return trimToString(candidate?.id, 160) === actId;
  });
  return labelFromRecord(act);
}

function hydrateSessionContextFromProject(req, sessionContext, {
  getOrCreateScreenplayOwnerRecord = null,
  getScreenplayProjectRecord = null,
  getLatestScreenplayVersion = null,
} = {}) {
  const context = sessionContext ? { ...sessionContext } : null;
  if (!context?.projectId) {
    return { context, hydrated: false };
  }
  if (
    typeof getOrCreateScreenplayOwnerRecord !== "function" ||
    typeof getScreenplayProjectRecord !== "function"
  ) {
    return { context, hydrated: false };
  }

  let project = null;
  try {
    const owner = getOrCreateScreenplayOwnerRecord(req, { create: false });
    project = owner ? getScreenplayProjectRecord(owner, context.projectId) : null;
  } catch {
    project = null;
  }
  if (!project) {
    return { context, hydrated: false };
  }

  const version = findActiveProjectVersion(project, context.versionId, getLatestScreenplayVersion);
  const draft = firstNonEmptyText(
    200_000,
    version?.draft,
    version?.draftText,
    version?.draft_excerpt,
    version?.draftExcerpt
  );
  const scene = activeOutlineScene(project);
  const beats = outlineBeats(project);
  const recentBeatLabels = beats.map(labelFromRecord).filter(Boolean).slice(-8);
  const latestBeat = beats.length ? beats[beats.length - 1] : null;
  const characters = firstNonEmptyList(
    project?.characters,
    project?.characterNames,
    project?.character_names,
    scene?.characters,
    scene?.characterFocus,
    scene?.character_focus
  );
  const continuityNotes = sanitizeStringList([
    ...sanitizeStringList(context.continuityNotes),
    firstNonEmpty(project?.title) ? `Saved project: ${project.title}` : "",
  ], 8, 220);

  let hydrated = false;
  function fillString(key, value, maxLength = 16_000) {
    if (trimToString(context[key], maxLength)) return;
    const clean = trimToString(value, maxLength);
    if (!clean) return;
    context[key] = clean;
    hydrated = true;
  }
  function fillNumber(key, value) {
    if (positiveIntegerOrZero(context[key]) > 0) return;
    const clean = positiveIntegerOrZero(value);
    if (clean <= 0) return;
    context[key] = clean;
    hydrated = true;
  }
  function fillList(key, value, maxItems = 8, maxLength = 180) {
    if (sanitizeStringList(context[key], maxItems, maxLength).length) return;
    const clean = sanitizeStringList(value, maxItems, maxLength);
    if (!clean.length) return;
    context[key] = clean;
    hydrated = true;
  }

  fillString("versionId", version?.id, 160);
  fillString("phase", firstNonEmpty(version?.phase, project?.lastPhase), 80);
  fillString("pack", project?.title, 120);
  fillString("scene", labelFromRecord(scene), 240);
  fillString("act", actTitleForScene(project, scene), 120);
  fillString("sceneObjective", firstNonEmpty(scene?.objective, scene?.sceneObjective, scene?.scene_objective), 360);
  fillString("sceneSummary", firstNonEmpty(scene?.summary, scene?.sceneSummary, scene?.scene_summary), 360);
  fillString("currentBeat", labelFromRecord(latestBeat), 240);
  fillString("emotionalContinuity", firstNonEmpty(scene?.emotionalContinuity, scene?.emotional_continuity, project?.emotionalContinuity), 360);
  fillList("beatSequence", recentBeatLabels, 8, 180);
  fillList("characterFocus", characters, 8, 120);
  fillList("continuityNotes", continuityNotes, 8, 220);
  fillNumber("pageCount", estimatePageCount(draft));
  fillNumber("targetPages", project?.targetPages ?? project?.target_pages);
  if (draft) fillString("draftExcerpt", draft.slice(-6_000), 6_000);

  return { context, hydrated };
}

function resolvePromptUserId(req) {
  return trimToString(
    req?.authUser?.id ||
      req?.user?.id ||
      req?.userId ||
      req?.get?.("X-User-Id") ||
      "",
    128
  );
}

function sanitizeSessionContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const projectId = trimToString(value.projectId ?? value.project_id, 160);
  const versionId = trimToString(value.versionId ?? value.version_id, 160);
  const scene = trimToString(value.scene, 240);
  const phase = trimToString(value.phase, 80);
  const pack = trimToString(value.pack, 120);
  const act = trimToString(value.act ?? value.current_act ?? value.currentAct, 120);
  const sceneObjective = trimToString(
    value.scene_objective ?? value.sceneObjective ?? value.current_scene_objective ?? value.currentSceneObjective,
    360
  );
  const sceneSummary = trimToString(
    value.scene_summary ?? value.sceneSummary ?? value.current_scene_summary ?? value.currentSceneSummary,
    360
  );
  const currentBeat = trimToString(value.current_beat ?? value.currentBeat ?? value.beat, 240);
  const emotionalContinuity = trimToString(
    value.emotional_continuity ?? value.emotionalContinuity ?? value.emotional_handoff ?? value.emotionalHandoff,
    360
  );
  const logline = trimToString(value.logline, 360);
  const themeArgument = trimToString(
    value.theme_argument ?? value.themeArgument ?? value.theme,
    360
  );
  const centralQuestion = trimToString(
    value.central_question ?? value.centralQuestion ?? value.dramatic_question ?? value.dramaticQuestion,
    360
  );
  const protagonistWant = trimToString(value.protagonist_want ?? value.protagonistWant, 240);
  const protagonistNeed = trimToString(value.protagonist_need ?? value.protagonistNeed, 240);
  const antagonisticForce = trimToString(value.antagonistic_force ?? value.antagonisticForce, 240);
  const endingImage = trimToString(
    value.ending_image ?? value.endingImage ?? value.final_image ?? value.finalImage,
    240
  );
  const featureSequence = trimToString(
    value.feature_sequence ?? value.featureSequence ?? value.current_sequence ?? value.currentSequence,
    240
  );
  const featureObligation = trimToString(
    value.feature_obligation ?? value.featureObligation ?? value.structural_obligation ?? value.structuralObligation,
    360
  );
  const nextScenePlan = trimToString(
    value.next_scene_plan ?? value.nextScenePlan ?? value.next_page_plan ?? value.nextPagePlan,
    420
  );
  const nextSceneMoves = sanitizeStringList(
    value.next_scene_moves ?? value.nextSceneMoves ?? value.next_page_moves ?? value.nextPageMoves,
    5,
    180
  );
  const beatSequence = sanitizeStringList(
    value.beat_sequence ?? value.beatSequence ?? value.selected_beats ?? value.selectedBeats,
    8,
    180
  );
  const characterFocus = sanitizeStringList(
    value.character_focus ?? value.characterFocus ?? value.characters ?? value.current_characters ?? value.currentCharacters,
    8,
    120
  );
  const unresolvedSetups = sanitizeStringList(
    value.unresolved_setups ?? value.unresolvedSetups ?? value.open_loops ?? value.openLoops,
    8,
    220
  );
  const continuityNotes = sanitizeStringList(
    value.continuity_notes ?? value.continuityNotes ?? value.notes,
    8,
    220
  );
  const pageCount = positiveIntegerOrZero(value.page_count ?? value.pageCount);
  const targetPages = positiveIntegerOrZero(value.target_pages ?? value.targetPages);
  const draftExcerpt = trimToString(
    value.draftExcerpt ?? value.draft_excerpt ?? value.screenplayDraftExcerpt ?? value.screenplay_draft_excerpt,
    6_000
  );
  const context = {};
  if (projectId) context.projectId = projectId;
  if (versionId) context.versionId = versionId;
  if (phase) context.phase = phase;
  if (pack) context.pack = pack;
  if (scene) context.scene = scene;
  if (act) context.act = act;
  if (sceneObjective) context.sceneObjective = sceneObjective;
  if (sceneSummary) context.sceneSummary = sceneSummary;
  if (currentBeat) context.currentBeat = currentBeat;
  if (emotionalContinuity) context.emotionalContinuity = emotionalContinuity;
  if (logline) context.logline = logline;
  if (themeArgument) context.themeArgument = themeArgument;
  if (centralQuestion) context.centralQuestion = centralQuestion;
  if (protagonistWant) context.protagonistWant = protagonistWant;
  if (protagonistNeed) context.protagonistNeed = protagonistNeed;
  if (antagonisticForce) context.antagonisticForce = antagonisticForce;
  if (endingImage) context.endingImage = endingImage;
  if (featureSequence) context.featureSequence = featureSequence;
  if (featureObligation) context.featureObligation = featureObligation;
  if (nextScenePlan) context.nextScenePlan = nextScenePlan;
  if (nextSceneMoves.length) context.nextSceneMoves = nextSceneMoves;
  if (beatSequence.length) context.beatSequence = beatSequence;
  if (characterFocus.length) context.characterFocus = characterFocus;
  if (unresolvedSetups.length) context.unresolvedSetups = unresolvedSetups;
  if (continuityNotes.length) context.continuityNotes = continuityNotes;
  if (pageCount > 0) context.pageCount = pageCount;
  if (targetPages > 0) context.targetPages = targetPages;
  if (draftExcerpt) context.draftExcerpt = draftExcerpt;
  return Object.keys(context).length ? context : null;
}

function mountPromptRoutes(app, {
  creativeMemoryStore = null,
  buildCraftContextBlock = null,
  getOrCreateScreenplayOwnerRecord = null,
  getScreenplayProjectRecord = null,
  getLatestScreenplayVersion = null,
} = {}) {
  app.post("/screenplay/prompt/build", express.json({ limit: "256kb" }), async (req, res) => {
    const persona = trimToString(
      req.body?.persona ?? req.body?.system_prompt ?? req.body?.systemPrompt,
      16_000
    );
    const userInput = trimToString(
      req.body?.user_input ?? req.body?.userInput ?? req.body?.transcript,
      8_000
    );
    const screenplayTaskHint = trimToString(
      req.body?.screenplay_task_hint ?? req.body?.screenplayTaskHint,
      8_000
    );
    if (!persona && !userInput) {
      return res.status(400).json({
        stage: "screenplay_prompt_build",
        error: "Provide persona or user_input.",
      });
    }

    const userId = resolvePromptUserId(req);
    const creativeMemory = userId && creativeMemoryStore?.getCreativeMemoryForPrompt
      ? await creativeMemoryStore.getCreativeMemoryForPrompt({ userId })
      : null;
    const sanitizedSessionContext = sanitizeSessionContext(
      req.body?.session_context ?? req.body?.sessionContext
    );
    const {
      context: sessionContext,
      hydrated: sessionContextHydrated,
    } = hydrateSessionContextFromProject(req, sanitizedSessionContext, {
      getOrCreateScreenplayOwnerRecord,
      getScreenplayProjectRecord,
      getLatestScreenplayVersion,
    });
    const screenplayTask = inferScreenplayTask(userInput || screenplayTaskHint);

    let prompt = buildModelPrompt({
      persona,
      creativeMemory,
      userInput,
      sessionContext,
      screenplayTask,
    });

    const includeCraftContext = Boolean(
      req.body?.include_craft_context ?? req.body?.includeCraftContext
    );
    const craftFrameworkId = trimToString(
      req.body?.craft_framework_id ?? req.body?.craftFrameworkId,
      96
    ) || "save-the-cat";
    let craftContextApplied = false;
    if (includeCraftContext && typeof buildCraftContextBlock === "function") {
      const craftBlock = buildCraftContextBlock({ framework: craftFrameworkId });
      if (craftBlock) {
        prompt = `${prompt}\n\n${craftBlock}`.trim();
        craftContextApplied = true;
      }
    }

    return res.status(200).json({
      ok: true,
      action: "screenplay_prompt_build",
      schema_version: PROMPT_SCHEMA_VERSION,
      source: "buildModelPrompt",
      prompt,
      memory_applied: Boolean(creativeMemory),
      session_context_applied: Boolean(sessionContext),
      session_context_hydrated: sessionContextHydrated,
      craft_context_applied: craftContextApplied,
      craft_framework_id: includeCraftContext ? craftFrameworkId : "",
      screenplay_task_intent: screenplayTask?.intent || "",
      screenplay_task_label: screenplayTask?.label || "",
      screenplay_task_feature_scope: screenplayTask?.featureScope || "",
      screenplay_task_requested_act: screenplayTask?.requestedAct || "",
      screenplay_task_requested_pages: screenplayTask?.requestedPages || 0,
    });
  });
}

export {
  mountPromptRoutes,
  PROMPT_SCHEMA_VERSION,
};
