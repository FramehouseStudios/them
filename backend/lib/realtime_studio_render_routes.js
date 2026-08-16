// T-decompose-phase5b2-studio-render — extract
// `POST /realtime/studio_render` + `POST /realtime/studio_render_stream`
// from backend/index.js.
//
// Phase 5b.2 of the decomposition (spec:
// docs/specs/T-decompose-backend-index.md, design note
// #227). Phase 5b.1 (#238) extracted the supplier mint
// route; this PR extracts the two Studio-render routes.
//
// V1 pillar: realtime
// V1 effect: closes prerequisite for "Realtime route
// decomposition lands before talk-pipeline Phase 7"
// (docs/v1-definition.md line 68) by continuing the
// realtime extraction chain.
//
// Behavior preserves the previous inline handlers:
//   - same 503 envelope when OPENAI_API_KEY is missing, except
//     explicit test-render mode can bypass the provider gate for
//     deterministic local/CI Studio smokes,
//   - same 400 envelope on empty transcript,
//   - same 200 success envelope for sync (`/studio_render`),
//   - same SSE event stream for streaming
//     (`/studio_render_stream`) — meta + trace + delta +
//     done + error events with the same payload shapes,
//     while explicitly keeping the connection alive for
//     SSE clients,
//   - same diagnostic lines (chars_u / chars_a /
//     first_delta_ms / delta_chunks / total_ms). Note:
//     console.log in the inline source → console.warn here.
//     Matches the #238 precedent: pre-flight's
//     console-log-in-lib rule treats console.warn as the
//     correct lib-level diagnostic surface. ops log capture
//     receives both stdout + stderr so output is unchanged
//     for operators.
//   - same body limit (512kb) per route.
//
// Access-control posture: AUTHENTICATED-PAID-PROVIDER.
// `createUserAuthSubsystem().protectPaidProviderRoutes` gates
// `/realtime/studio_render*` before these handlers are mounted in
// backend/index.js. Keep this module focused on render behavior; the
// app/client must send bearer auth plus the active client token.

import express from "express";
import {
  buildModelPrompt,
  FEATURE_MAP_BLOCK_OPEN,
  inferScreenplayTask,
  MEMORY_BLOCK_OPEN,
} from "./prompt_assembly.js";
import { normalizeScreenplayOutputContractText } from "./screenplay_output_contract.js";
import {
  enforceStudioScreenplayQuality,
  enforceStudioStructuralAnalysisQuality,
  studioScreenplayFeatureContext,
  studioScreenplayMaxTokens,
  studioScreenplayRequestedPages,
} from "./studio_screenplay_quality_gate.js";
import { buildMomentumRescueFallbackReply } from "./momentum_rescue_fallback.js";
import { evaluateMomentumRescueQuality } from "./screenplay_page_quality.js";
import { resolveScreenplayTargetFromRequest } from "./screenplay_turn_target.js";
import { structuralScreenplayModelReasonForTask } from "./structural_screenplay_quality.js";
import {
  buildDeliveredStoryRescueInteraction,
  inferStoryMoveActKind,
} from "./story_rescue_move_library.js";

const STUDIO_RENDER_BODY_LIMIT = "512kb";
const STUDIO_RENDER_MEMORY_QUERY_MAX_CHARS = 3_000;
const STUDIO_RENDER_MEMORY_PROJECT_MAX_CHARS = 160;
const STUDIO_RENDER_MEMORY_META_MAX_ITEMS = 6;

function cleanStudioRenderMemoryText(value = "", maxChars = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 240)))
    .trim();
}

function cleanStudioRenderMemoryList(items = [], maxItems = 6, maxChars = 160) {
  const source = Array.isArray(items)
    ? items
    : cleanStudioRenderMemoryText(items, maxItems * maxChars)
      ? String(items).split(/\r?\n|;|,/)
      : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const clean = cleanStudioRenderMemoryText(item, maxChars);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

function bodyStringCandidates(body = {}) {
  if (!body || typeof body !== "object") return [];
  return [
    body.screenplay_task_hint,
    body.screenplayTaskHint,
    body.screenplay_draft_excerpt,
    body.screenplayDraftExcerpt,
    body.draft_excerpt,
    body.draftExcerpt,
    body.screenplay_scene_summary,
    body.screenplaySceneSummary,
    body.screenplay_current_beat,
    body.screenplayCurrentBeat,
    body.current_beat,
    body.currentBeat,
    body.screenplay_emotional_continuity,
    body.screenplayEmotionalContinuity,
    body.emotional_continuity,
    body.emotionalContinuity,
    body.screenplay_character_focus,
    body.screenplayCharacterFocus,
    body.character_focus,
    body.characterFocus,
    body.screenplay_character_arc_memory,
    body.screenplayCharacterArcMemory,
    body.character_arc_memory,
    body.characterArcMemory,
    body.screenplay_project_title,
    body.screenplayProjectTitle,
    body.project_title,
    body.projectTitle,
    body.pack,
    body.screenplay_pack,
    body.screenplayPack,
  ];
}

function flattenStudioRenderMemoryValue(value, depth = 0) {
  if (depth > 2 || value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const clean = cleanStudioRenderMemoryText(value, 600);
    return clean ? [clean] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenStudioRenderMemoryValue(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap((item) => flattenStudioRenderMemoryValue(item, depth + 1));
  }
  return [];
}

function buildStudioRenderMemoryQuery({ body = {}, transcript = "", systemPrompt = "" } = {}) {
  const parts = [
    transcript,
    ...bodyStringCandidates(body).flatMap((value) => flattenStudioRenderMemoryValue(value)),
    systemPrompt,
  ]
    .map((value) => cleanStudioRenderMemoryText(value, 800))
    .filter(Boolean);
  return cleanStudioRenderMemoryText(parts.join(" "), STUDIO_RENDER_MEMORY_QUERY_MAX_CHARS);
}

function readStudioRenderProjectId(body = {}) {
  return cleanStudioRenderMemoryText(
    body?.projectId ??
      body?.project_id ??
      body?.screenplayProjectId ??
      body?.screenplay_project_id ??
      "",
    96
  );
}

function readStudioRenderProjectTitle(body = {}) {
  return cleanStudioRenderMemoryText(
    body?.projectTitle ??
      body?.project_title ??
      body?.screenplayProjectTitle ??
      body?.screenplay_project_title ??
      body?.pack ??
      body?.screenplayPack ??
      body?.screenplay_pack ??
      "",
    STUDIO_RENDER_MEMORY_PROJECT_MAX_CHARS
  );
}

function characterBibleHasSignal(character = {}) {
  const bible = character?.bible && typeof character.bible === "object" ? character.bible : null;
  if (!bible) return false;
  if (cleanStudioRenderMemoryList(bible.canon ?? bible.facts, 1, 160).length) return true;
  if (cleanStudioRenderMemoryList(bible.corrections, 1, 180).length) return true;
  if (cleanStudioRenderMemoryList(bible.correctedTerms, 1, 120).length) return true;
  if (cleanStudioRenderMemoryList(bible.correctionReplacements, 1, 160).length) return true;
  return Boolean(bible.arc && typeof bible.arc === "object" && Object.keys(bible.arc).length);
}

function characterBibleHasCorrection(character = {}) {
  const bible = character?.bible && typeof character.bible === "object" ? character.bible : null;
  if (!bible) return false;
  return Boolean(
    cleanStudioRenderMemoryList(bible.corrections, 1, 180).length ||
      cleanStudioRenderMemoryList(bible.correctedTerms, 1, 120).length ||
      cleanStudioRenderMemoryList(bible.correctionReplacements, 1, 160).length
  );
}

function studioRenderQueryMentionsCharacter(query = "", character = {}) {
  const cleanQuery = String(query || "").toLowerCase();
  const name = cleanStudioRenderMemoryText(character?.name, 80);
  if (name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(query)) {
    return true;
  }
  const bible = character?.bible && typeof character.bible === "object" ? character.bible : {};
  const probes = [
    ...cleanStudioRenderMemoryList(bible.correctedTerms, 6, 120),
    ...cleanStudioRenderMemoryList(bible.correctionReplacements, 6, 160),
  ];
  return probes.some((item) => {
    const lower = item.toLowerCase();
    if (!lower) return false;
    if (lower.includes("->")) {
      return lower.split("->").some((part) => part.trim() && cleanQuery.includes(part.trim()));
    }
    return cleanQuery.includes(lower);
  });
}

function prioritizeStudioRenderCreativeMemory(creativeMemory = null, query = "") {
  if (!creativeMemory || typeof creativeMemory !== "object") return null;
  const characters = Array.isArray(creativeMemory.characters)
    ? creativeMemory.characters
    : [];
  if (!characters.length) return creativeMemory;
  const scoredCharacters = characters
    .map((character, index) => {
      let score = Number(character?.last_referenced || character?.lastReferencedAt || 0) / 1_000_000_000;
      if (studioRenderQueryMentionsCharacter(query, character)) score += 10_000;
      if (characterBibleHasCorrection(character)) score += 1_000;
      if (characterBibleHasSignal(character)) score += 100;
      return { character, index, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map(({ character }) => character);
  return {
    ...creativeMemory,
    characters: scoredCharacters,
  };
}

function buildStudioRenderMemoryAppliedMeta(creativeMemory = null, query = "") {
  const characters = Array.isArray(creativeMemory?.characters)
    ? creativeMemory.characters
    : [];
  const acceptedCausalFactCount = Array.isArray(creativeMemory?.acceptedCausalFacts)
    ? creativeMemory.acceptedCausalFacts.length
    : 0;
  const withBible = characters.filter(characterBibleHasSignal);
  if (!withBible.length) {
    return creativeMemory
      ? {
          creative_memory: true,
          character_bible: false,
          ...(acceptedCausalFactCount > 0 ? { accepted_causal_facts: acceptedCausalFactCount } : {}),
        }
      : null;
  }
  const correctedCharacters = withBible.filter(characterBibleHasCorrection);
  const mentionedCorrected = correctedCharacters.filter((character) => (
    studioRenderQueryMentionsCharacter(query, character)
  ));
  const selected = (mentionedCorrected.length ? mentionedCorrected : correctedCharacters.length ? correctedCharacters : withBible)
    .slice(0, STUDIO_RENDER_MEMORY_META_MAX_ITEMS);
  const correctedTerms = [];
  const correctionReplacements = [];
  for (const character of selected) {
    const bible = character?.bible && typeof character.bible === "object" ? character.bible : {};
    correctedTerms.push(...cleanStudioRenderMemoryList(bible.correctedTerms, 4, 120));
    correctionReplacements.push(...cleanStudioRenderMemoryList(bible.correctionReplacements, 4, 160));
  }
  const unique = (items) => cleanStudioRenderMemoryList(items, STUDIO_RENDER_MEMORY_META_MAX_ITEMS, 160);
  const meta = {
    creative_memory: true,
    character_bible: true,
    character_corrections: selected.some(characterBibleHasCorrection),
    correction_applied_to_prompt: selected.some(characterBibleHasCorrection),
    characters: unique(selected.map((character) => character?.name).filter(Boolean)),
    ...(acceptedCausalFactCount > 0 ? { accepted_causal_facts: acceptedCausalFactCount } : {}),
  };
  const uniqueTerms = unique(correctedTerms);
  const uniqueReplacements = unique(correctionReplacements);
  if (uniqueTerms.length) meta.corrected_terms = uniqueTerms;
  if (uniqueReplacements.length) meta.correction_replacements = uniqueReplacements;
  return meta;
}

async function buildStudioRenderPromptMemoryContext({
  req,
  systemPrompt = "",
  transcript = "",
  shouldApplyScreenplayContract = false,
  creativeMemoryStore = null,
  resolveUserId = null,
} = {}) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const promptText = String(systemPrompt || "");
  const hasMemoryBlock = promptText.includes(MEMORY_BLOCK_OPEN);
  const hasFeatureMapBlock = promptText.includes(FEATURE_MAP_BLOCK_OPEN);
  const query = buildStudioRenderMemoryQuery({ body, transcript, systemPrompt });
  const explicitTaskHint = cleanStudioRenderMemoryText(
    body?.screenplay_task_hint ?? body?.screenplayTaskHint,
    3_000
  );
  const inferredScreenplayTask = inferScreenplayTask(explicitTaskHint || transcript || query);
  const screenplayTask = hasFeatureMapBlock ? null : inferredScreenplayTask;
  const isMomentumRescue = inferredScreenplayTask?.writerBlocked === true ||
    inferredScreenplayTask?.writer_blocked === true;
  const isStructuralAnalysis = Boolean(
    structuralScreenplayModelReasonForTask(inferredScreenplayTask)
  );
  if (!shouldApplyScreenplayContract && !isMomentumRescue && !isStructuralAnalysis) {
    return {
      systemPrompt,
      memoryApplied: null,
      acceptedCausalFacts: [],
      creativeMemory: null,
      screenplayTask: null,
    };
  }
  let userId = "";
  let creativeMemory = null;
  if (creativeMemoryStore?.getCreativeMemoryForPrompt) {
    try {
      userId = typeof resolveUserId === "function"
        ? cleanStudioRenderMemoryText(resolveUserId(req), 120)
        : "";
    } catch (_error) {
      userId = "";
    }
    if (userId) {
      try {
        creativeMemory = await creativeMemoryStore.getCreativeMemoryForPrompt({
          userId,
          projectId: readStudioRenderProjectId(body),
          projectTitle: readStudioRenderProjectTitle(body),
          query,
          maxEpisodicMemories: 3,
          recordEpisodicRecall: true,
        });
      } catch (_error) {
        creativeMemory = null;
      }
    }
  }

  const promptMemory = creativeMemory
    ? prioritizeStudioRenderCreativeMemory(creativeMemory, query)
    : null;
  const sessionContext = hasFeatureMapBlock
    ? null
    : studioScreenplayFeatureContext(studioMomentumMeta({
        body,
        creativeMemory: promptMemory,
      }));
  const memoryForPrompt = hasMemoryBlock ? null : promptMemory;
  const memoryApplied = memoryForPrompt
    ? buildStudioRenderMemoryAppliedMeta(promptMemory, query)
    : null;
  const acceptedCausalFacts = Array.isArray(promptMemory?.acceptedCausalFacts)
    ? promptMemory.acceptedCausalFacts.slice(0, 8)
    : [];
  if (!memoryForPrompt && !sessionContext && !screenplayTask) {
    return {
      systemPrompt,
      memoryApplied: null,
      acceptedCausalFacts,
      creativeMemory: promptMemory,
      screenplayTask,
    };
  }
  try {
    return {
      systemPrompt: buildModelPrompt({
        persona: systemPrompt,
        creativeMemory: memoryForPrompt,
        sessionContext,
        screenplayTask,
      }),
      memoryApplied,
      acceptedCausalFacts,
      creativeMemory: promptMemory,
      screenplayTask,
    };
  } catch (_error) {
    return {
      systemPrompt,
      memoryApplied: null,
      acceptedCausalFacts,
      creativeMemory: promptMemory,
      screenplayTask,
    };
  }
}

function mergeStudioMomentumList(primary, secondary, maxItems = 6, maxChars = 180) {
  return cleanStudioRenderMemoryList(
    [
      ...cleanStudioRenderMemoryList(primary, maxItems, maxChars),
      ...cleanStudioRenderMemoryList(secondary, maxItems, maxChars),
    ],
    maxItems,
    maxChars
  );
}

function studioMomentumMeta({ body = {}, creativeMemory = null } = {}) {
  const featureGraph = creativeMemory?.featureStoryGraph &&
    typeof creativeMemory.featureStoryGraph === "object"
    ? creativeMemory.featureStoryGraph
    : {};
  const graphState = featureGraph.currentState && typeof featureGraph.currentState === "object"
    ? featureGraph.currentState
    : {};
  const dueGraphConsequence = featureGraph.currentDueConsequence &&
    typeof featureGraph.currentDueConsequence === "object"
    ? featureGraph.currentDueConsequence
    : {};
  const graphObligationChange = featureGraph.currentStoryObligationChange &&
    typeof featureGraph.currentStoryObligationChange === "object"
    ? featureGraph.currentStoryObligationChange
    : {};
  const graphThreads = Array.isArray(featureGraph.openThreads)
    ? featureGraph.openThreads
    : [];
  const paidObligations = new Set(
    (Array.isArray(featureGraph.storyObligationLedger) ? featureGraph.storyObligationLedger : [])
      .filter((item) => item?.status === "paid_off")
      .map((item) => cleanStudioRenderMemoryText(item?.obligation, 220).toLowerCase())
      .filter(Boolean)
  );
  const dueGraphThread = graphThreads.find((thread) => thread?.due) || graphThreads[0] || {};
  const graphSetups = graphThreads.map((thread) => thread?.setup).filter(Boolean);
  const graphPayoffs = graphThreads.map((thread) => (
    thread?.promisedPayoff ?? thread?.promised_payoff
  )).filter(Boolean);
  const project = creativeMemory?.projectContinuity &&
    typeof creativeMemory.projectContinuity === "object"
    ? creativeMemory.projectContinuity
    : {};
  const projectNextTurns = cleanStudioRenderMemoryList(project.nextThreeTurns, 3, 180);
  const projectThreads = cleanStudioRenderMemoryList(project.unresolvedStoryThreads, 4, 220);
  const projectSetups = cleanStudioRenderMemoryList(project.unresolvedSetups, 4, 200)
    .filter((item) => !paidObligations.has(item.toLowerCase()));
  const projectPayoffs = cleanStudioRenderMemoryList(project.actThreePayoffPath, 4, 200)
    .filter((item) => !paidObligations.has(item.toLowerCase()));
  const projectImages = cleanStudioRenderMemoryList(project.imageMotifs, 4, 140);
  const directExecutionBrief = body.screenplayNextSceneExecutionBrief ??
    body.screenplay_next_scene_execution_brief;
  const inferredExecutionBrief = {
    assignment: graphState.nextScenePlan || graphState.causalHandoff || project.nextScenePlan || projectNextTurns[0] || dueGraphConsequence.fact || graphObligationChange.result || "",
    consequence: dueGraphConsequence.fact || "",
    obstacle: dueGraphThread.setup || projectThreads[0] || projectSetups[0] || "",
    arc: graphState.characterArcState || project.characterArcState || "",
    payoff: dueGraphThread.promisedPayoff || dueGraphThread.promised_payoff || projectPayoffs[0] || "",
    image: graphState.endingImage || project.endingImage || projectImages[0] || "",
    exit: projectNextTurns[1] || "",
  };
  const executionBrief = directExecutionBrief && typeof directExecutionBrief === "object"
    ? { ...inferredExecutionBrief, ...directExecutionBrief }
    : inferredExecutionBrief.assignment || Object.values(inferredExecutionBrief).filter(Boolean).length >= 3
      ? inferredExecutionBrief
      : null;
  const pick = (bodyKeys, projectValue, maxChars = 220) => {
    for (const key of bodyKeys) {
      const clean = cleanStudioRenderMemoryText(body?.[key], maxChars);
      if (clean) return clean;
    }
    return cleanStudioRenderMemoryText(projectValue, maxChars);
  };
  const acceptedPages = Array.isArray(creativeMemory?.acceptedScenes)
    ? creativeMemory.acceptedScenes.map((scene) => [
      cleanStudioRenderMemoryText(scene?.sceneHeading, 120),
      cleanStudioRenderMemoryText(scene?.outcome || scene?.summary || scene?.excerpt, 220),
    ].filter(Boolean).join(" - "))
    : [];
  const storyMoments = Array.isArray(creativeMemory?.episodicMemories)
    ? creativeMemory.episodicMemories
      .filter((memory) => ["accepted_page", "user_note", "user_correction"].includes(
        String(memory?.authority || "").trim().toLowerCase()
      ))
      .map((memory) => memory?.excerpt || memory?.summary)
    : [];

  return {
    ...(body && typeof body === "object" ? body : {}),
    screenplayTarget: "voice_pin",
    screenplayProjectId: pick(
      ["screenplayProjectId", "screenplay_project_id", "projectId", "project_id"],
      project.projectId,
      96
    ),
    screenplayAnchorSceneLabel: pick(
      ["screenplayAnchorSceneLabel", "screenplay_anchor_scene_label"],
      project.sceneLabel,
      120
    ),
    screenplayAct: pick(["screenplayAct", "screenplay_act"], project.act || graphState.act, 120),
    screenplaySceneObjective: pick(
      ["screenplaySceneObjective", "screenplay_scene_objective"],
      project.sceneObjective,
      280
    ),
    screenplaySceneSummary: pick(
      ["screenplaySceneSummary", "screenplay_scene_summary"],
      project.sceneSummary,
      280
    ),
    screenplayCurrentBeat: pick(
      ["screenplayCurrentBeat", "screenplay_current_beat"],
      project.currentBeat || graphState.currentBeat,
      220
    ),
    screenplayProtagonistWant: pick(
      ["screenplayProtagonistWant", "screenplay_protagonist_want"],
      project.protagonistWant || graphState.protagonistWant,
      240
    ),
    screenplayProtagonistNeed: pick(
      ["screenplayProtagonistNeed", "screenplay_protagonist_need"],
      project.protagonistNeed || graphState.protagonistNeed,
      240
    ),
    screenplayAntagonisticForce: pick(
      ["screenplayAntagonisticForce", "screenplay_antagonistic_force"],
      project.antagonisticForce,
      260
    ),
    screenplayEndingImage: pick(
      ["screenplayEndingImage", "screenplay_ending_image"],
      project.endingImage || graphState.endingImage,
      240
    ),
    screenplayFeatureSequence: pick(
      ["screenplayFeatureSequence", "screenplay_feature_sequence"],
      project.featureSequence || graphState.sequence,
      220
    ),
    screenplayFeatureObligation: pick(
      ["screenplayFeatureObligation", "screenplay_feature_obligation"],
      project.featureObligation,
      280
    ),
    screenplayActPressureState: pick(
      ["screenplayActPressureState", "screenplay_act_pressure_state"],
      project.actPressureState,
      280
    ),
    screenplayCharacterArcState: pick(
      ["screenplayCharacterArcState", "screenplay_character_arc_state"],
      project.characterArcState || graphState.characterArcState,
      280
    ),
    screenplayLastSceneOutcome: pick(
      ["screenplayLastSceneOutcome", "screenplay_last_scene_outcome"],
      project.lastSceneOutcome || graphState.lastAcceptedOutcome,
      240
    ),
    screenplayNextScenePlan: pick(
      ["screenplayNextScenePlan", "screenplay_next_scene_plan"],
      project.nextScenePlan || graphState.nextScenePlan || graphState.causalHandoff,
      340
    ),
    screenplayNextSceneMoves: mergeStudioMomentumList(
      body.screenplayNextSceneMoves ?? body.screenplay_next_scene_moves,
      project.nextSceneMoves,
      5,
      180
    ),
    screenplayNextThreeTurns: mergeStudioMomentumList(
      body.screenplayNextThreeTurns ?? body.screenplay_next_three_turns,
      project.nextThreeTurns,
      3,
      180
    ),
    screenplayNextSceneExecutionBrief: executionBrief,
    screenplayAcceptedConsequenceDue: cleanStudioRenderMemoryText(dueGraphConsequence.fact, 220),
    screenplayDueConsequence: Object.keys(dueGraphConsequence).length
      ? dueGraphConsequence
      : null,
    screenplayStoryObligationChange: Object.keys(graphObligationChange).length
      ? graphObligationChange
      : null,
    screenplayActThreePayoffPath: mergeStudioMomentumList(
      body.screenplayActThreePayoffPath ?? body.screenplay_act_three_payoff_path,
      mergeStudioMomentumList(project.actThreePayoffPath, graphPayoffs, 5, 200),
      5,
      200
    ),
    screenplayCharacterFocus: mergeStudioMomentumList(
      body.screenplayCharacterFocus ?? body.screenplay_character_focus,
      project.characterFocus,
      8,
      120
    ),
    screenplayUnresolvedSetups: mergeStudioMomentumList(
      body.screenplayUnresolvedSetups ?? body.screenplay_unresolved_setups,
      mergeStudioMomentumList(project.unresolvedSetups, graphSetups, 8, 220),
      8,
      220
    ),
    screenplayUnresolvedStoryThreads: mergeStudioMomentumList(
      body.screenplayUnresolvedStoryThreads ?? body.screenplay_unresolved_story_threads,
      mergeStudioMomentumList(project.unresolvedStoryThreads, graphSetups, 8, 220),
      8,
      220
    ),
    screenplayCharacterArcTurns: mergeStudioMomentumList(
      body.screenplayCharacterArcTurns ?? body.screenplay_character_arc_turns,
      project.characterArcTurns,
      6,
      180
    ),
    screenplayImageMotifs: mergeStudioMomentumList(
      body.screenplayImageMotifs ?? body.screenplay_image_motifs,
      project.imageMotifs,
      6,
      140
    ),
    screenplayAcceptedPageContinuity: mergeStudioMomentumList(
      body.screenplayAcceptedPageContinuity ?? body.screenplay_accepted_page_continuity,
      acceptedPages,
      3,
      240
    ),
    screenplayRetrievedStoryMoments: mergeStudioMomentumList(
      body.screenplayRetrievedStoryMoments ?? body.screenplay_retrieved_story_moments,
      storyMoments,
      4,
      220
    ),
    screenplayAcceptedCausalFacts: Array.isArray(creativeMemory?.acceptedCausalFacts)
      ? creativeMemory.acceptedCausalFacts.slice(0, 8)
      : [],
    screenplayFeatureStoryGraph: creativeMemory?.featureStoryGraph &&
      typeof creativeMemory.featureStoryGraph === "object"
      ? creativeMemory.featureStoryGraph
      : null,
    screenplayDueStoryThread: creativeMemory?.dueStoryThread &&
      typeof creativeMemory.dueStoryThread === "object"
      ? creativeMemory.dueStoryThread
      : null,
    screenplayQuestionEffectiveness: Array.isArray(project.questionEffectiveness)
      ? project.questionEffectiveness.slice(0, 24)
      : [],
    screenplayStoryMovePreferenceOverrides: Array.isArray(project.storyMovePreferenceOverrides)
      ? project.storyMovePreferenceOverrides.slice(0, 9)
      : [],
    screenplayCorrectedTerms: mergeStudioMomentumList(
      body.screenplayCorrectedTerms ?? body.screenplay_corrected_terms,
      project.correctedTerms,
      8,
      120
    ),
    screenplayCorrectionReplacements: mergeStudioMomentumList(
      body.screenplayCorrectionReplacements ?? body.screenplay_correction_replacements,
      project.correctionReplacements,
      8,
      160
    ),
  };
}

function studioStructuralAnalysisPlan({ body = {}, transcript = "", shouldApplyScreenplayContract = false } = {}) {
  if (shouldApplyScreenplayContract) return null;
  const taskHint = cleanStudioRenderMemoryText(
    body?.screenplay_task_hint ?? body?.screenplayTaskHint ?? transcript,
    3_000
  );
  const task = inferScreenplayTask(taskHint);
  const modelReason = structuralScreenplayModelReasonForTask(task);
  if (!modelReason) return null;
  return {
    task,
    modelReason,
    maxTokens: modelReason === "screenplay_feature_architecture" ? 1_000 : 700,
  };
}

function compactMomentumQualityCounts(counts = {}) {
  return Object.fromEntries(
    Object.entries(counts || {})
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([key, value]) => [key, Math.max(0, Math.round(Number(value)))])
  );
}

function enforceStudioMomentumRescue({
  reply = "",
  transcript = "",
  body = {},
  memoryContext = null,
} = {}) {
  const momentumMeta = studioMomentumMeta({
    body,
    creativeMemory: memoryContext?.creativeMemory,
  });
  const initial = evaluateMomentumRescueQuality({
    reply,
    transcript,
    studioMeta: momentumMeta,
  });
  if (!initial?.applicable || initial.ok) {
    return { reply, screenplayQuality: null, repaired: false };
  }

  const fallback = buildMomentumRescueFallbackReply({
    transcript,
    studioMeta: momentumMeta,
  });
  const repaired = evaluateMomentumRescueQuality({
    reply: fallback,
    transcript,
    studioMeta: momentumMeta,
  });
  if (!repaired.ok) {
    return { reply, screenplayQuality: null, repaired: false };
  }
  return {
    reply: fallback,
    repaired: true,
    screenplayQuality: {
      ok: true,
      reason: "ok",
      source: "guard_momentum_rescue_fallback",
      requested_pages: 0,
      attempted_repair: true,
      repair_outcome: "fallback",
      initial_reason: initial.reason || "low_momentum_rescue_quality",
      repair_ms: 0,
      counts: compactMomentumQualityCounts(repaired.counts),
      canon_facts_checked: Array.isArray(memoryContext?.creativeMemory?.acceptedCausalFacts)
        ? memoryContext.creativeMemory.acceptedCausalFacts.length
        : 0,
      canon_violation_count: 0,
      canon_violation_types: [],
      canon_correction_override: false,
    },
  };
}

async function recordDeliveredStudioStoryRescue({
  req,
  requestId = "",
  systemPrompt = "",
  reply = "",
  creativeMemory = null,
  creativeMemoryStore = null,
  resolveUserId,
} = {}) {
  if (typeof creativeMemoryStore?.recordProjectContinuity !== "function") return false;
  const userId = String(resolveUserId?.(req) || "").trim();
  const projectId = cleanStudioRenderMemoryText(
    req?.body?.screenplay_project_id ?? req?.body?.screenplayProjectId,
    96,
  );
  const projectTitle = cleanStudioRenderMemoryText(
    req?.body?.screenplay_project_title ?? req?.body?.screenplayProjectTitle,
    160,
  );
  if (!userId || (!projectId && !projectTitle)) return false;
  const momentumMeta = studioMomentumMeta({
    body: req?.body,
    creativeMemory,
  });
  const interaction = buildDeliveredStoryRescueInteraction({
    systemPrompt,
    reply,
    requestId,
    projectId,
    projectTitle,
    actKey: inferStoryMoveActKind([
      momentumMeta.screenplayAct,
      momentumMeta.screenplayFeatureSequence,
    ].filter(Boolean).join(" ")),
    sequenceKey: momentumMeta.screenplayFeatureSequence,
  });
  if (!interaction) return false;
  try {
    const receipt = await creativeMemoryStore.recordProjectContinuity({
      userId,
      continuity: {
        projectId,
        projectTitle,
        questionEffectiveness: [interaction],
      },
    });
    return Boolean(receipt?.ok);
  } catch (_error) {
    return false;
  }
}

function studioRenderQualityBody(body = {}, memoryContext = null) {
  const acceptedCausalFacts = Array.isArray(memoryContext?.acceptedCausalFacts)
    ? memoryContext.acceptedCausalFacts
    : [];
  return {
    ...studioMomentumMeta({
      body,
      creativeMemory: memoryContext?.creativeMemory,
    }),
    ...(acceptedCausalFacts.length
      ? { screenplay_accepted_causal_facts: acceptedCausalFacts }
      : {}),
  };
}

function normalizeStudioRenderScreenplayTarget(body = {}) {
  return resolveScreenplayTargetFromRequest({
    ...body,
    screenplayTarget:
      body?.screenplay_target
      ?? body?.screenplayTarget
      ?? body?.output_target
      ?? body?.outputTarget
      ?? "",
  });
}

function shouldApplyStudioRenderScreenplayContract(body = {}) {
  return normalizeStudioRenderScreenplayTarget(body) === "page";
}

function contractStudioRenderReply(reply = "", shouldApplyScreenplayContract = false) {
  const normalizedReply = String(reply || "").trim();
  if (!shouldApplyScreenplayContract) return normalizedReply;
  return normalizeScreenplayOutputContractText(normalizedReply);
}

function studioRenderDeltaFromContractedReply(previousReply = "", nextReply = "") {
  const previous = String(previousReply || "");
  const next = String(nextReply || "");
  if (!next || next === previous) return "";
  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }
  return next;
}

function mountRealtimeStudioRenderRoutes(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountRealtimeStudioRenderRoutes requires an Express app");
  }
  const {
    // Renderer entry points
    renderStudioRealtimeText,
    streamStudioRealtimeText,
    // Helpers
    createRequestId,
    normalizeSnippet,
    // Constants — accessor pattern so a value of "" / falsy
    // is treated as "missing" at request time, matching the
    // inline `if (!OPENAI_API_KEY)` guard.
    getOpenAIApiKey,
    shouldAllowStudioRenderWithoutOpenAIKey = () => false,
    // Optional identity-bound creative memory. Studio render stays usable
    // without these deps in local tests and cold-user sessions.
    creativeMemoryStore = null,
    resolveUserId = (req) => String(req?.authUser?.id || req?.user?.id || req?.userId || "").trim(),
  } = deps;

  const required = {
    renderStudioRealtimeText,
    streamStudioRealtimeText,
    createRequestId,
    normalizeSnippet,
    getOpenAIApiKey,
  };
  for (const [key, fn] of Object.entries(required)) {
    if (typeof fn !== "function") {
      throw new Error(`mountRealtimeStudioRenderRoutes: ${key} is required`);
    }
  }

  function hasStudioRenderProvider() {
    if (getOpenAIApiKey()) return true;
    return Boolean(shouldAllowStudioRenderWithoutOpenAIKey());
  }

  // ---------- POST /realtime/studio_render (sync) ----------
  app.post("/realtime/studio_render", express.json({ limit: STUDIO_RENDER_BODY_LIMIT }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    if (!hasStudioRenderProvider()) {
      return res.status(503).json({
        stage: "studio_render",
        error: "OpenAI API key is missing for Studio render.",
      });
    }

    const transcript = normalizeSnippet(
      req.body?.transcript ?? req.body?.user_message ?? "",
      8_000,
    );
    if (!transcript) {
      return res.status(400).json({
        stage: "studio_render",
        error: "Studio render transcript was empty.",
      });
    }

    const systemPrompt = normalizeSnippet(
      req.body?.system_prompt ?? req.body?.instructions ?? "",
      16_000,
    );
    const shouldApplyScreenplayContract = shouldApplyStudioRenderScreenplayContract(req.body);
    const requestedPages = shouldApplyScreenplayContract
      ? studioScreenplayRequestedPages({ body: req.body, transcript })
      : 0;
    const structuralPlan = studioStructuralAnalysisPlan({
      body: req.body,
      transcript,
      shouldApplyScreenplayContract,
    });

    try {
      const memoryContext = await buildStudioRenderPromptMemoryContext({
        req,
        systemPrompt,
        transcript,
        shouldApplyScreenplayContract,
        creativeMemoryStore,
        resolveUserId,
      });
      const rawReply = await renderStudioRealtimeText({
        systemPrompt: memoryContext.systemPrompt,
        transcript,
        ...(shouldApplyScreenplayContract
          ? {
              modelTier: "structural",
              maxTokens: studioScreenplayMaxTokens(requestedPages),
            }
          : structuralPlan
            ? {
                modelTier: "structural",
                maxTokens: structuralPlan.maxTokens,
              }
            : {}),
      });
      let reply = contractStudioRenderReply(rawReply, shouldApplyScreenplayContract);
      let screenplayQuality = null;
      let structuralQuality = null;
      if (shouldApplyScreenplayContract) {
        const qualityResult = await enforceStudioScreenplayQuality({
          reply,
          transcript,
          body: studioRenderQualityBody(req.body, memoryContext),
          systemPrompt: memoryContext.systemPrompt,
          renderRepair: renderStudioRealtimeText,
        });
        screenplayQuality = qualityResult.quality;
        if (!qualityResult.ok) {
          console.error(
            `[${rid}] studio_render quality_rejected reason=${screenplayQuality?.reason || "low_page_quality"} repair=${screenplayQuality?.repair_outcome || "unknown"}`,
          );
          return res.status(502).json({
            stage: "studio_render_quality",
            error: `Studio screenplay output did not pass the live quality gate (${screenplayQuality?.reason || "low_page_quality"}).`,
            screenplay_quality: screenplayQuality,
          });
        }
        reply = qualityResult.reply;
      } else if (structuralPlan) {
        const qualityResult = await enforceStudioStructuralAnalysisQuality({
          reply,
          transcript,
          studioMeta: studioMomentumMeta({
            body: req.body,
            creativeMemory: memoryContext.creativeMemory,
          }),
          modelReason: structuralPlan.modelReason,
          taskIntent: structuralPlan.task?.intent,
          maxTokens: structuralPlan.maxTokens,
          renderRepair: renderStudioRealtimeText,
        });
        reply = qualityResult.reply;
        structuralQuality = qualityResult.structuralQuality;
      } else {
        const momentumResult = enforceStudioMomentumRescue({
          reply,
          transcript,
          body: req.body,
          memoryContext,
        });
        reply = momentumResult.reply;
        screenplayQuality = momentumResult.screenplayQuality;
        await recordDeliveredStudioStoryRescue({
          req,
          requestId: rid,
          systemPrompt: memoryContext.systemPrompt,
          reply,
          creativeMemory: memoryContext.creativeMemory,
          creativeMemoryStore,
          resolveUserId,
        });
      }
      console.warn(
        `[${rid}] studio_render chars_u=${transcript.length} chars_a=${reply.length} quality=${structuralQuality?.outcome || screenplayQuality?.repair_outcome || "not_applicable"}`,
      );
      return res.status(200).json({
        ok: true,
        action: "studio_render",
        reply,
        ...(screenplayQuality ? { screenplay_quality: screenplayQuality } : {}),
        ...(structuralQuality ? { structural_quality: structuralQuality } : {}),
        ...(memoryContext.memoryApplied ? { memory_applied: memoryContext.memoryApplied } : {}),
      });
    } catch (error) {
      return res.status(Number(error?.status || 502)).json({
        stage: String(error?.stage || "studio_render"),
        error: String(error?.message || error || "Studio render failed."),
      });
    }
  });

  // ---------- POST /realtime/studio_render_stream (SSE) ----------
  app.post("/realtime/studio_render_stream", express.json({ limit: STUDIO_RENDER_BODY_LIMIT }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    const requestStartedAt = Date.now();
    const requestStartedAtISO8601 = new Date(requestStartedAt).toISOString();
    let firstDeltaMs = null;
    let deltaChunks = 0;
    if (!hasStudioRenderProvider()) {
      return res.status(503).json({
        stage: "studio_render",
        error: "OpenAI API key is missing for Studio render.",
      });
    }

    const transcript = normalizeSnippet(
      req.body?.transcript ?? req.body?.user_message ?? "",
      8_000,
    );
    if (!transcript) {
      return res.status(400).json({
        stage: "studio_render",
        error: "Studio render transcript was empty.",
      });
    }

    const systemPrompt = normalizeSnippet(
      req.body?.system_prompt ?? req.body?.instructions ?? "",
      16_000,
    );
    const shouldApplyScreenplayContract = shouldApplyStudioRenderScreenplayContract(req.body);
    const requestedPages = shouldApplyScreenplayContract
      ? studioScreenplayRequestedPages({ body: req.body, transcript })
      : 0;
    const structuralPlan = studioStructuralAnalysisPlan({
      body: req.body,
      transcript,
      shouldApplyScreenplayContract,
    });
    const memoryContext = await buildStudioRenderPromptMemoryContext({
      req,
      systemPrompt,
      transcript,
      shouldApplyScreenplayContract,
      creativeMemoryStore,
      resolveUserId,
    });

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Studio-Render-Request-Id", rid);
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    let closed = false;
    req.on("aborted", () => {
      closed = true;
    });
    res.on("close", () => {
      closed = true;
    });

    const pushEvent = (event, payload) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
      if (typeof res.flush === "function") {
        res.flush();
      }
    };

    try {
      let lastEmittedReply = "";
      pushEvent("meta", {
        ok: true,
        action: "studio_render_stream",
        request_id: rid,
        started_at: requestStartedAtISO8601,
        ...(memoryContext.memoryApplied ? { memory_applied: memoryContext.memoryApplied } : {}),
      });
      const rawReply = await streamStudioRealtimeText({
        systemPrompt: memoryContext.systemPrompt,
        transcript,
        ...(shouldApplyScreenplayContract
          ? {
              modelTier: "structural",
              maxTokens: studioScreenplayMaxTokens(requestedPages),
            }
          : structuralPlan
            ? {
                modelTier: "structural",
                maxTokens: structuralPlan.maxTokens,
              }
            : {}),
        onDelta: async (delta, fullReply) => {
          const contractedFullReply = contractStudioRenderReply(fullReply, shouldApplyScreenplayContract);
          if (structuralPlan) {
            if (firstDeltaMs === null) {
              firstDeltaMs = Math.max(0, Date.now() - requestStartedAt);
              pushEvent("trace", {
                ok: true,
                action: "studio_render_stream",
                kind: "first_delta_buffered",
                request_id: rid,
                started_at: requestStartedAtISO8601,
                first_delta_ms: firstDeltaMs,
                delta_chunks: 0,
                delta_chars: String(delta || "").length,
                full_chars: contractedFullReply.length,
              });
            }
            return;
          }
          const outboundDelta = shouldApplyScreenplayContract
            ? studioRenderDeltaFromContractedReply(lastEmittedReply, contractedFullReply)
            : delta;
          if (!outboundDelta) return;
          deltaChunks += 1;
          if (shouldApplyScreenplayContract) {
            lastEmittedReply = contractedFullReply;
          }
          if (firstDeltaMs === null) {
            firstDeltaMs = Math.max(0, Date.now() - requestStartedAt);
            console.warn(
              `[${rid}] studio_render_stream first_delta_ms=${firstDeltaMs} delta_chars=${outboundDelta.length} full_chars=${contractedFullReply.length}`,
            );
            pushEvent("trace", {
              ok: true,
              action: "studio_render_stream",
              kind: "first_delta",
              request_id: rid,
              started_at: requestStartedAtISO8601,
              first_delta_ms: firstDeltaMs,
              delta_chunks: deltaChunks,
              delta_chars: outboundDelta.length,
              full_chars: contractedFullReply.length,
            });
          }
          pushEvent("delta", { delta: outboundDelta });
        },
      });
      let reply = contractStudioRenderReply(rawReply, shouldApplyScreenplayContract);
      let screenplayQuality = null;
      let structuralQuality = null;
      if (shouldApplyScreenplayContract) {
        const qualityResult = await enforceStudioScreenplayQuality({
          reply,
          transcript,
          body: studioRenderQualityBody(req.body, memoryContext),
          systemPrompt: memoryContext.systemPrompt,
          renderRepair: renderStudioRealtimeText,
        });
        screenplayQuality = qualityResult.quality;
        if (!qualityResult.ok) {
          console.error(
            `[${rid}] studio_render_stream quality_rejected reason=${screenplayQuality?.reason || "low_page_quality"} repair=${screenplayQuality?.repair_outcome || "unknown"}`,
          );
          pushEvent("error", {
            request_id: rid,
            stage: "studio_render_quality",
            error: `Studio screenplay output did not pass the live quality gate (${screenplayQuality?.reason || "low_page_quality"}).`,
            screenplay_quality: screenplayQuality,
          });
          return;
        }
        reply = qualityResult.reply;
        if (qualityResult.repaired) {
          pushEvent("trace", {
            ok: true,
            action: "studio_render_stream",
            kind: "quality_repair",
            request_id: rid,
            screenplay_quality: screenplayQuality,
          });
        }
        const finalDelta = reply.startsWith(lastEmittedReply)
          ? studioRenderDeltaFromContractedReply(lastEmittedReply, reply)
          : "";
        if (finalDelta) {
          deltaChunks += 1;
          pushEvent("delta", { delta: finalDelta });
          lastEmittedReply = reply;
        }
      } else if (structuralPlan) {
        const qualityResult = await enforceStudioStructuralAnalysisQuality({
          reply,
          transcript,
          studioMeta: studioMomentumMeta({
            body: req.body,
            creativeMemory: memoryContext.creativeMemory,
          }),
          modelReason: structuralPlan.modelReason,
          taskIntent: structuralPlan.task?.intent,
          maxTokens: structuralPlan.maxTokens,
          renderRepair: renderStudioRealtimeText,
        });
        reply = qualityResult.reply;
        structuralQuality = qualityResult.structuralQuality;
        if (qualityResult.repaired) {
          pushEvent("trace", {
            ok: true,
            action: "studio_render_stream",
            kind: "structural_quality_repair",
            request_id: rid,
            structural_quality: structuralQuality,
          });
        }
        if (reply) {
          deltaChunks += 1;
          pushEvent("delta", { delta: reply });
          lastEmittedReply = reply;
        }
      } else {
        const momentumResult = enforceStudioMomentumRescue({
          reply,
          transcript,
          body: req.body,
          memoryContext,
        });
        reply = momentumResult.reply;
        screenplayQuality = momentumResult.screenplayQuality;
        await recordDeliveredStudioStoryRescue({
          req,
          requestId: rid,
          systemPrompt: memoryContext.systemPrompt,
          reply,
          creativeMemory: memoryContext.creativeMemory,
          creativeMemoryStore,
          resolveUserId,
        });
        if (momentumResult.repaired) {
          pushEvent("trace", {
            ok: true,
            action: "studio_render_stream",
            kind: "momentum_rescue_fallback",
            request_id: rid,
            screenplay_quality: screenplayQuality,
          });
        }
      }
      const totalMs = Math.max(0, Date.now() - requestStartedAt);
      console.warn(
        `[${rid}] studio_render_stream chars_u=${transcript.length} chars_a=${reply.length} delta_chunks=${deltaChunks} first_delta_ms=${firstDeltaMs ?? -1} total_ms=${totalMs} quality=${structuralQuality?.outcome || screenplayQuality?.repair_outcome || "not_applicable"}`,
      );
      pushEvent("done", {
        ok: true,
        action: "studio_render_stream",
        kind: "done",
        request_id: rid,
        started_at: requestStartedAtISO8601,
        first_delta_ms: firstDeltaMs,
        total_ms: totalMs,
        delta_chunks: deltaChunks,
        reply,
        ...(screenplayQuality ? { screenplay_quality: screenplayQuality } : {}),
        ...(structuralQuality ? { structural_quality: structuralQuality } : {}),
        ...(memoryContext.memoryApplied ? { memory_applied: memoryContext.memoryApplied } : {}),
      });
    } catch (error) {
      console.error(
        `[${rid}] studio_render_stream error stage=${String(error?.stage || "studio_render")} message=${String(error?.message || error || "Studio render stream failed.")}`,
      );
      pushEvent("error", {
        request_id: rid,
        stage: String(error?.stage || "studio_render"),
        error: String(error?.message || error || "Studio render stream failed."),
      });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });
}

export { mountRealtimeStudioRenderRoutes, STUDIO_RENDER_BODY_LIMIT };
