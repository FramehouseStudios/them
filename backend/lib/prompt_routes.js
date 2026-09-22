import express from "express";

import { DEFAULT_FEATURE_TARGET_PAGES, findSequenceForPage } from "./feature_screenplay_map.js";
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

function normalizeActKey(value = "") {
  const text = trimToString(value, 120).toLowerCase();
  if (!text) return "";
  if (/\b(?:act\s*)?(?:iii|3|three)\b/.test(text) || /\bact3\b/.test(text)) return "act3";
  if (/\b(?:act\s*)?(?:ii|2|two)\b/.test(text) || /\bact2\b/.test(text)) return "act2";
  if (/\b(?:act\s*)?(?:i|1|one)\b/.test(text) || /\bact1\b/.test(text)) return "act1";
  return "";
}

function normalizeActStatus(value = "") {
  const text = trimToString(value, 32).toLowerCase();
  if (["complete", "completed", "done", "closed"].includes(text)) return "complete";
  if (["active", "current", "in_progress", "in progress", "working"].includes(text)) return "active";
  if (["pending", "upcoming", "not_started", "not started"].includes(text)) return "pending";
  return "";
}

function inferActPosition(pageCount = 0, targetPages = 0) {
  const currentPage = positiveIntegerOrZero(pageCount);
  if (currentPage <= 0) {
    return { act: "", featureSequence: "", featureObligation: "" };
  }
  const target = positiveIntegerOrZero(targetPages) || DEFAULT_FEATURE_TARGET_PAGES;
  const sequence = findSequenceForPage(currentPage, target);
  return {
    act: trimToString(sequence?.act, 120),
    featureSequence: sequence ? trimToString(`${sequence.act} - ${sequence.label}`, 240) : "",
    featureObligation: trimToString(sequence?.obligation, 360),
  };
}

function actStatusFor(currentActKey, actKey, pageCount = 0, targetPages = 0) {
  if (!currentActKey || !actKey) return "";
  if (actKey === "act1") {
    if (currentActKey === "act1") return "active";
    return ["act2", "act3"].includes(currentActKey) ? "complete" : "pending";
  }
  if (actKey === "act2") {
    if (currentActKey === "act2") return "active";
    if (currentActKey === "act3") return "complete";
    return "pending";
  }
  if (actKey === "act3") {
    if (currentActKey !== "act3") return "pending";
    return targetPages > 0 && pageCount >= targetPages ? "complete" : "active";
  }
  return "";
}

function actBridgeFor(currentActKey = "") {
  switch (currentActKey) {
    case "act1":
      return "Bridge Act I into Act II by forcing a choice that makes the old life impossible.";
    case "act2":
      return "Turn the active Act II tactic into a cost that points directly toward Act III.";
    case "act3":
      return "Pay off earlier setup through changed behavior and protect the final image.";
    default:
      return "";
  }
}

function actCompletionFocusFor(currentActKey = "", fallback = {}) {
  const firstRunway = trimToString(
    Array.isArray(fallback.nextThreeTurns) ? fallback.nextThreeTurns[0] : "",
    180
  ) || trimToString(
    Array.isArray(fallback.nextSceneMoves) ? fallback.nextSceneMoves[0] : "",
    180
  ) || trimToString(fallback.nextScenePlan, 180);
  if (firstRunway) return `Spend next remembered turn first: ${firstRunway}`;
  switch (currentActKey) {
    case "act1":
      return "Clarify wound, want, catalyst pressure, and the choice that launches Act II.";
    case "act2":
      return "Escalate tactic failure, midpoint consequence, relationship cost, and all-is-lost pressure.";
    case "act3":
      return "Resolve the need through visible changed behavior, setup payoff, and final image.";
    default:
      return "";
  }
}

function sanitizeActProgressRecord(value = null, fallback = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const pageCount = positiveIntegerOrZero(source.pageCount ?? source.page_count ?? fallback.pageCount);
  const targetPages = positiveIntegerOrZero(source.targetPages ?? source.target_pages ?? fallback.targetPages);
  const inferred = inferActPosition(pageCount, targetPages);
  const currentAct = trimToString(
    source.currentAct ??
      source.current_act ??
      fallback.act ??
      inferred.act,
    120
  );
  const currentSequence = trimToString(
    source.currentSequence ??
      source.current_sequence ??
      fallback.featureSequence ??
      inferred.featureSequence,
    240
  );
  const currentObligation = trimToString(
    source.currentObligation ??
      source.current_obligation ??
      fallback.featureObligation ??
      inferred.featureObligation,
    360
  );
  const currentActKey = normalizeActKey(
    source.currentActKey ??
      source.current_act_key ??
      currentAct ??
      currentSequence
  );
  const pageProgress = trimToString(
    source.pageProgress ??
      source.page_progress ??
      ((pageCount > 0 || targetPages > 0) ? `${pageCount || "?"}/${targetPages || "?"}` : ""),
    40
  );
  const actOneStatus = normalizeActStatus(source.actOneStatus ?? source.act_one_status ?? source.act_i) ||
    actStatusFor(currentActKey, "act1", pageCount, targetPages);
  const actTwoStatus = normalizeActStatus(source.actTwoStatus ?? source.act_two_status ?? source.act_ii) ||
    actStatusFor(currentActKey, "act2", pageCount, targetPages);
  const actThreeStatus = normalizeActStatus(source.actThreeStatus ?? source.act_three_status ?? source.act_iii) ||
    actStatusFor(currentActKey, "act3", pageCount, targetPages);
  const nextActBridge = trimToString(
    source.nextActBridge ??
      source.next_act_bridge ??
      actBridgeFor(currentActKey),
    240
  );
  const completionFocus = trimToString(
    source.completionFocus ??
      source.completion_focus ??
      actCompletionFocusFor(currentActKey, fallback),
    260
  );
  const hasProgress = Boolean(
    currentAct ||
      currentActKey ||
      currentSequence ||
      currentObligation ||
      pageProgress ||
      pageCount > 0 ||
      targetPages > 0
  );
  if (!hasProgress) return null;
  const progress = {
    currentAct,
    currentActKey,
    currentSequence,
    currentObligation,
    pageProgress,
    actOneStatus,
    actTwoStatus,
    actThreeStatus,
    nextActBridge,
    completionFocus,
  };
  if (pageCount > 0) progress.pageCount = pageCount;
  if (targetPages > 0) progress.targetPages = targetPages;
  return Object.fromEntries(
    Object.entries(progress).filter(([, item]) => item !== "" && item !== null && item !== undefined)
  );
}

function formatActProgressBrief(progress = null) {
  if (!progress || typeof progress !== "object") return "";
  const parts = [
    progress.currentAct ? `${progress.currentAct} ${progress.actTwoStatus === "active" ? "active" : ""}`.trim() : "",
    progress.actOneStatus ? `Act I ${progress.actOneStatus}` : "",
    progress.actTwoStatus ? `Act II ${progress.actTwoStatus}` : "",
    progress.actThreeStatus ? `Act III ${progress.actThreeStatus}` : "",
    progress.pageProgress ? `pages ${progress.pageProgress}` : "",
  ].filter(Boolean);
  return parts.length ? `act progress: ${parts.join("; ")}` : "";
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

const SCREENPLAY_MEMORY_ROUTE_INTENTS = new Set([
  "write_scene",
  "rewrite_scene",
  "continue_script",
  "scene_doctor",
  "outline_structure",
  "character_development",
  "dialogue_punchup",
  "emotional_continuity",
  "pacing_pass",
  "finish_feature",
  "momentum_rescue",
]);

function snakeCaseKey(key) {
  return String(key || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function screenplayPrefixedKey(key) {
  const clean = String(key || "");
  return clean ? `screenplay${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : "";
}

function memoryRecordValue(item, key) {
  if (!item || typeof item !== "object") return undefined;
  const snakeKey = snakeCaseKey(key);
  const screenplayKey = screenplayPrefixedKey(key);
  const screenplaySnakeKey = screenplayKey ? snakeCaseKey(screenplayKey) : "";
  return item[key] ??
    item[snakeKey] ??
    (screenplayKey ? item[screenplayKey] : undefined) ??
    (screenplaySnakeKey ? item[screenplaySnakeKey] : undefined);
}

function sanitizeScreenplayMemoryRecords(memory, maxItems = 8) {
  const source = Array.isArray(memory?.screenplayProjectMemory)
    ? memory.screenplayProjectMemory
    : [];
  const records = [];

  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = {
      projectId: trimToString(memoryRecordValue(item, "projectId"), 160),
      documentRevisionId: trimToString(memoryRecordValue(item, "documentRevisionId"), 160),
      act: trimToString(memoryRecordValue(item, "act"), 120),
      sceneLabel: trimToString(memoryRecordValue(item, "sceneLabel"), 240),
      sceneObjective: trimToString(memoryRecordValue(item, "sceneObjective"), 360),
      sceneSummary: trimToString(memoryRecordValue(item, "sceneSummary"), 360),
      currentBeat: trimToString(memoryRecordValue(item, "currentBeat"), 240),
      logline: trimToString(memoryRecordValue(item, "logline"), 360),
      themeArgument: trimToString(memoryRecordValue(item, "themeArgument"), 360),
      centralQuestion: trimToString(memoryRecordValue(item, "centralQuestion"), 360),
      protagonistWant: trimToString(memoryRecordValue(item, "protagonistWant"), 240),
      protagonistNeed: trimToString(memoryRecordValue(item, "protagonistNeed"), 240),
      antagonisticForce: trimToString(memoryRecordValue(item, "antagonisticForce"), 240),
      endingImage: trimToString(memoryRecordValue(item, "endingImage"), 240),
      featureSequence: trimToString(memoryRecordValue(item, "featureSequence"), 240),
      featureObligation: trimToString(memoryRecordValue(item, "featureObligation"), 360),
      actPressureState: trimToString(memoryRecordValue(item, "actPressureState"), 280),
      characterArcState: trimToString(memoryRecordValue(item, "characterArcState"), 280),
      lastSceneOutcome: trimToString(memoryRecordValue(item, "lastSceneOutcome"), 240),
      nextScenePlan: trimToString(memoryRecordValue(item, "nextScenePlan"), 420),
      nextSceneMoves: sanitizeStringList(memoryRecordValue(item, "nextSceneMoves"), 5, 180),
      nextThreeTurns: sanitizeStringList(memoryRecordValue(item, "nextThreeTurns"), 3, 180),
      actThreePayoffPath: sanitizeStringList(memoryRecordValue(item, "actThreePayoffPath"), 5, 200),
      beatSequence: sanitizeStringList(memoryRecordValue(item, "beatSequence"), 8, 180),
      characterFocus: sanitizeStringList(memoryRecordValue(item, "characterFocus"), 8, 120),
      unresolvedSetups: sanitizeStringList(memoryRecordValue(item, "unresolvedSetups"), 8, 220),
      unresolvedStoryThreads: sanitizeStringList(memoryRecordValue(item, "unresolvedStoryThreads"), 8, 220),
      characterArcTurns: sanitizeStringList(memoryRecordValue(item, "characterArcTurns"), 6, 180),
      imageMotifs: sanitizeStringList(memoryRecordValue(item, "imageMotifs"), 6, 140),
      continuityNotes: sanitizeStringList(memoryRecordValue(item, "continuityNotes"), 8, 220),
      emotionalContinuity: trimToString(memoryRecordValue(item, "emotionalContinuity"), 360),
      lastWritePreview: trimToString(memoryRecordValue(item, "lastWritePreview"), 6_000),
      pageCount: positiveIntegerOrZero(memoryRecordValue(item, "pageCount")),
      targetPages: positiveIntegerOrZero(memoryRecordValue(item, "targetPages")),
      updatedAt: Math.max(
        0,
        Number(item.updatedAt ?? item.updated_at ?? item.lastUpdatedAt ?? item.last_updated_at ?? 0)
      ),
    };
    record.actProgress = sanitizeActProgressRecord(memoryRecordValue(item, "actProgress"), record);
    const hasContext = Object.entries(record).some(([key, value]) => {
      if (key === "updatedAt") return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "number") return value > 0;
      if (value && typeof value === "object") return Object.keys(value).length > 0;
      return trimToString(value).length > 0;
    });
    if (hasContext) records.push(record);
  }

  return records
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, Math.max(1, Number(maxItems || 8)));
}

function screenplayTaskCanUsePersistentMemory(task, hint = "") {
  const intent = trimToString(task?.intent, 80);
  if (!SCREENPLAY_MEMORY_ROUTE_INTENTS.has(intent)) return false;
  const lowerHint = String(hint || "").toLowerCase();
  if (!lowerHint.trim()) return false;
  if (["continue_script", "finish_feature", "write_scene", "rewrite_scene", "scene_doctor", "dialogue_punchup"].includes(intent)) {
    return true;
  }
  return /\b(screenplay|script|scene|pages?|act|feature|movie|film|draft|dialogue|beat|sequence|fountain|character|ending|outline|story|emotional continuity|pacing)\b/.test(lowerHint);
}

function selectScreenplayMemoryRecord(memory, context = null, body = {}, allowFallback = false) {
  const records = sanitizeScreenplayMemoryRecords(memory);
  if (!records.length) return null;
  const projectId = trimToString(
    context?.projectId ??
      body.project_id ??
      body.projectId ??
      body.screenplay_project_id ??
      body.screenplayProjectId,
    160
  );
  const versionId = trimToString(
    context?.versionId ??
      body.version_id ??
      body.versionId ??
      body.screenplay_document_revision_id ??
      body.screenplayDocumentRevisionId,
    160
  );
  if (projectId) {
    const byProject = records.find((item) => item.projectId === projectId);
    if (byProject) return byProject;
  }
  if (versionId) {
    const byVersion = records.find((item) => item.documentRevisionId === versionId);
    if (byVersion) return byVersion;
  }
  return allowFallback ? records[0] : null;
}

function buildPersistentFeatureMemoryBrief(record) {
  if (!record) return "";
  const parts = [
    record.logline ? `logline: ${record.logline}` : "",
    record.act || record.featureSequence ? `position: ${[record.act, record.featureSequence].filter(Boolean).join(" / ")}` : "",
    formatActProgressBrief(record.actProgress),
    record.currentBeat ? `current beat: ${record.currentBeat}` : "",
    record.featureObligation ? `due now: ${record.featureObligation}` : "",
    record.actPressureState ? `act pressure: ${record.actPressureState}` : "",
    record.characterArcState ? `character arc: ${record.characterArcState}` : "",
    record.lastSceneOutcome ? `last scene outcome: ${record.lastSceneOutcome}` : "",
    record.unresolvedSetups.length ? `open setups: ${record.unresolvedSetups.slice(0, 3).join(" / ")}` : "",
    record.unresolvedStoryThreads.length ? `story threads: ${record.unresolvedStoryThreads.slice(0, 3).join(" / ")}` : "",
    record.nextThreeTurns.length ? `next three turns: ${record.nextThreeTurns.slice(0, 3).join(" / ")}` : "",
    record.actThreePayoffPath.length ? `Act III payoff path: ${record.actThreePayoffPath.slice(0, 3).join(" / ")}` : "",
    record.nextScenePlan ? `next: ${record.nextScenePlan}` : "",
    record.endingImage ? `ending image: ${record.endingImage}` : "",
  ].filter(Boolean);
  return trimToString(parts.join("; "), 900);
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

function hydrateSessionContextFromScreenplayMemory(sessionContext, memory, {
  body = {},
  screenplayTask = null,
  taskHint = "",
} = {}) {
  const allowFallback = Boolean(
    sessionContext?.projectId ||
      sessionContext?.versionId ||
      screenplayTaskCanUsePersistentMemory(screenplayTask, taskHint)
  );
  const record = selectScreenplayMemoryRecord(memory, sessionContext, body, allowFallback);
  if (!record) {
    return { context: sessionContext, hydrated: false };
  }

  const context = sessionContext ? { ...sessionContext } : {};
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
  function mergeList(key, value, maxItems = 8, maxLength = 180) {
    const existing = sanitizeStringList(context[key], maxItems, maxLength);
    const merged = sanitizeStringList([...existing, ...sanitizeStringList(value, maxItems, maxLength)], maxItems, maxLength);
    if (!merged.length) return;
    if (existing.length === merged.length && existing.every((item, index) => item === merged[index])) return;
    context[key] = merged;
    hydrated = true;
  }
  function fillActProgress(value) {
    const existingSource = context.actProgress ?? context.act_progress;
    const existing = existingSource && typeof existingSource === "object" && !Array.isArray(existingSource)
      ? sanitizeActProgressRecord(existingSource, {})
      : null;
    if (existing && Object.keys(existing).length) return;
    const clean = sanitizeActProgressRecord(value, record);
    if (!clean || !Object.keys(clean).length) return;
    context.actProgress = clean;
    hydrated = true;
  }

  fillString("projectId", record.projectId, 160);
  fillString("versionId", record.documentRevisionId, 160);
  fillString("scene", record.sceneLabel, 240);
  fillString("act", record.act, 120);
  fillString("sceneObjective", record.sceneObjective, 360);
  fillString("sceneSummary", record.sceneSummary, 360);
  fillString("currentBeat", record.currentBeat, 240);
  fillString("logline", record.logline, 360);
  fillString("themeArgument", record.themeArgument, 360);
  fillString("centralQuestion", record.centralQuestion, 360);
  fillString("protagonistWant", record.protagonistWant, 240);
  fillString("protagonistNeed", record.protagonistNeed, 240);
  fillString("antagonisticForce", record.antagonisticForce, 240);
  fillString("endingImage", record.endingImage, 240);
  fillString("featureSequence", record.featureSequence, 240);
  fillString("featureObligation", record.featureObligation, 360);
  fillString("actPressureState", record.actPressureState, 280);
  fillString("characterArcState", record.characterArcState, 280);
  fillString("lastSceneOutcome", record.lastSceneOutcome, 240);
  fillString("featureMemoryBrief", buildPersistentFeatureMemoryBrief(record), 900);
  fillActProgress(record.actProgress);
  fillString("nextScenePlan", record.nextScenePlan, 420);
  fillString("emotionalContinuity", record.emotionalContinuity, 360);
  fillString("draftExcerpt", record.lastWritePreview, 6_000);
  mergeList("nextSceneMoves", record.nextSceneMoves, 5, 180);
  mergeList("nextThreeTurns", record.nextThreeTurns, 3, 180);
  mergeList("actThreePayoffPath", record.actThreePayoffPath, 5, 200);
  mergeList("beatSequence", record.beatSequence, 8, 180);
  mergeList("characterFocus", record.characterFocus, 8, 120);
  mergeList("unresolvedSetups", record.unresolvedSetups, 8, 220);
  mergeList("unresolvedStoryThreads", record.unresolvedStoryThreads, 8, 220);
  mergeList("characterArcTurns", record.characterArcTurns, 6, 180);
  mergeList("imageMotifs", record.imageMotifs, 6, 140);
  mergeList("continuityNotes", [
    ...record.continuityNotes,
    record.featureSequence ? `Persistent feature sequence: ${record.featureSequence}` : "",
    record.nextScenePlan ? `Persistent next scene: ${record.nextScenePlan}` : "",
    record.endingImage ? `Protect ending image: ${record.endingImage}` : "",
  ], 8, 220);
  fillNumber("pageCount", record.pageCount);
  fillNumber("targetPages", record.targetPages);

  return {
    context: Object.keys(context).length ? context : null,
    hydrated,
  };
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

function resolvePromptMemoryLookupContext(req, sessionContext = null) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  return {
    projectId: trimToString(
      sessionContext?.projectId ??
        body.project_id ??
        body.projectId ??
        body.screenplay_project_id ??
        body.screenplayProjectId,
      160
    ),
    projectTitle: trimToString(
      sessionContext?.pack ??
        body.project_title ??
        body.projectTitle ??
        body.screenplay_project_title ??
        body.screenplayProjectTitle ??
        body.pack ??
        body.screenplay_pack ??
        body.screenplayPack,
      160
    ),
  };
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
  const actPressureState = trimToString(
    value.act_pressure_state ?? value.actPressureState,
    280
  );
  const characterArcState = trimToString(
    value.character_arc_state ?? value.characterArcState,
    280
  );
  const lastSceneOutcome = trimToString(
    value.last_scene_outcome ?? value.lastSceneOutcome,
    240
  );
  const featureMemoryBrief = trimToString(
    value.feature_memory_brief ?? value.featureMemoryBrief ?? value.persistent_memory_brief ?? value.persistentMemoryBrief,
    900
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
  const nextThreeTurns = sanitizeStringList(
    value.next_three_turns ?? value.nextThreeTurns,
    3,
    180
  );
  const actThreePayoffPath = sanitizeStringList(
    value.act_three_payoff_path ?? value.actThreePayoffPath ?? value.payoff_path ?? value.payoffPath,
    5,
    200
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
  const unresolvedStoryThreads = sanitizeStringList(
    value.unresolved_story_threads ?? value.unresolvedStoryThreads,
    8,
    220
  );
  const characterArcTurns = sanitizeStringList(
    value.character_arc_turns ?? value.characterArcTurns,
    6,
    180
  );
  const imageMotifs = sanitizeStringList(
    value.image_motifs ?? value.imageMotifs ?? value.visual_motifs ?? value.visualMotifs,
    6,
    140
  );
  const continuityNotes = sanitizeStringList(
    value.continuity_notes ?? value.continuityNotes ?? value.notes,
    8,
    220
  );
  const pageCount = positiveIntegerOrZero(value.page_count ?? value.pageCount);
  const targetPages = positiveIntegerOrZero(value.target_pages ?? value.targetPages);
  const actProgress = sanitizeActProgressRecord(
    value.act_progress ?? value.actProgress,
    {
      act,
      featureSequence,
      featureObligation,
      nextScenePlan,
      nextSceneMoves,
      nextThreeTurns,
      pageCount,
      targetPages,
    }
  );
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
  if (actPressureState) context.actPressureState = actPressureState;
  if (characterArcState) context.characterArcState = characterArcState;
  if (lastSceneOutcome) context.lastSceneOutcome = lastSceneOutcome;
  if (featureMemoryBrief) context.featureMemoryBrief = featureMemoryBrief;
  if (nextScenePlan) context.nextScenePlan = nextScenePlan;
  if (nextSceneMoves.length) context.nextSceneMoves = nextSceneMoves;
  if (nextThreeTurns.length) context.nextThreeTurns = nextThreeTurns;
  if (actThreePayoffPath.length) context.actThreePayoffPath = actThreePayoffPath;
  if (beatSequence.length) context.beatSequence = beatSequence;
  if (characterFocus.length) context.characterFocus = characterFocus;
  if (unresolvedSetups.length) context.unresolvedSetups = unresolvedSetups;
  if (unresolvedStoryThreads.length) context.unresolvedStoryThreads = unresolvedStoryThreads;
  if (characterArcTurns.length) context.characterArcTurns = characterArcTurns;
  if (imageMotifs.length) context.imageMotifs = imageMotifs;
  if (continuityNotes.length) context.continuityNotes = continuityNotes;
  if (pageCount > 0) context.pageCount = pageCount;
  if (targetPages > 0) context.targetPages = targetPages;
  if (actProgress) context.actProgress = actProgress;
  if (draftExcerpt) context.draftExcerpt = draftExcerpt;
  return Object.keys(context).length ? context : null;
}

function mountPromptRoutes(app, {
  creativeMemoryStore = null,
  buildCraftContextBlock = null,
  getOrCreateScreenplayOwnerRecord = null,
  getScreenplayProjectRecord = null,
  getLatestScreenplayVersion = null,
  refreshScreenplayOwnerRecord = null,
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
    const sanitizedSessionContext = sanitizeSessionContext(
      req.body?.session_context ?? req.body?.sessionContext
    );
    const memoryLookupContext = resolvePromptMemoryLookupContext(req, sanitizedSessionContext);
    const creativeMemory = userId && creativeMemoryStore?.getCreativeMemoryForPrompt
      ? await creativeMemoryStore.getCreativeMemoryForPrompt({
        userId,
        query: userInput || screenplayTaskHint,
        projectId: memoryLookupContext.projectId,
        projectTitle: memoryLookupContext.projectTitle,
        recordEpisodicRecall: true,
      })
      : null;
    const screenplayTask = inferScreenplayTask(userInput || screenplayTaskHint);
    if (
      sanitizedSessionContext?.projectId
      && typeof getOrCreateScreenplayOwnerRecord === "function"
      && typeof refreshScreenplayOwnerRecord === "function"
    ) {
      let cachedOwner = null;
      try {
        cachedOwner = getOrCreateScreenplayOwnerRecord(req, { create: true });
      } catch {
        cachedOwner = null;
      }
      if (cachedOwner?.ownerKey) {
        let refreshed;
        try {
          refreshed = await refreshScreenplayOwnerRecord(cachedOwner.ownerKey);
        } catch (error) {
          refreshed = { ok: false, error };
        }
        if (!refreshed?.ok) {
          res.setHeader("Cache-Control", "no-store");
          return res.status(503).json({
            stage: "screenplay_prompt_build",
            error: "screenplay_persistence_failed",
            persistence: refreshed?.persistenceKind || "unknown",
          });
        }
      }
    }
    const projectHydration = hydrateSessionContextFromProject(req, sanitizedSessionContext, {
      getOrCreateScreenplayOwnerRecord,
      getScreenplayProjectRecord,
      getLatestScreenplayVersion,
    });
    const memoryHydration = hydrateSessionContextFromScreenplayMemory(
      projectHydration.context,
      creativeMemory,
      {
        body: req.body || {},
        screenplayTask,
        taskHint: userInput || screenplayTaskHint,
      }
    );
    const sessionContext = memoryHydration.context;
    const sessionContextHydrated = Boolean(projectHydration.hydrated || memoryHydration.hydrated);

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
    ) || "three-act";
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
