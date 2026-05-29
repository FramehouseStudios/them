import express from "express";

import { buildModelPrompt, inferScreenplayTask } from "./prompt_assembly.js";

const PROMPT_SCHEMA_VERSION = 1;

function trimToString(value, maxLength = 16_000) {
  return String(value ?? "").trim().slice(0, Math.max(1, Number(maxLength || 16_000)));
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
    const clean = trimToString(item, maxLength).replace(/\s+/g, " ");
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
    const sessionContext = sanitizeSessionContext(
      req.body?.session_context ?? req.body?.sessionContext
    );
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
      craft_context_applied: craftContextApplied,
      craft_framework_id: includeCraftContext ? craftFrameworkId : "",
      screenplay_task_intent: screenplayTask?.intent || "",
      screenplay_task_label: screenplayTask?.label || "",
    });
  });
}

export {
  mountPromptRoutes,
  PROMPT_SCHEMA_VERSION,
};
