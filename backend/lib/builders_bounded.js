// D009 — build* helpers that read module limits, extracted verbatim from backend/index.js.
//
// Functions here read only their arguments, the helpers imported below, the
// limits in lib/limits.js, and each other. Moved verbatim with doc comments;
// index.js imports every name unchanged.

import { DEFAULT_ASSISTANT_SELF_NAME } from "../config.js";
import { buildPendingLocalActionConfirmationReply, buildScreenplayProjectCorrectionContract } from "./builders.js";
import { deriveCycleEvolutionProfile, deriveHiddenDepthModeState } from "./derivers_bounded.js";
import { HIDDEN_DEPTH_MODES, KNOWLEDGE_RAG_CARD_BODY_MAX_CHARS } from "./limits.js";
import { normalizeAssistantSelfName } from "./normalizers_bounded.js";
import { clampUnit, escapeRegex, normalizeSnippet, trimToMax } from "./utils.js";
import { CYCLE_MEMORY_MIN_REL_DEPTH, KNOWLEDGE_RAG_CONTEXT_MAX_CHARS, TEXT_CONTAINS_MATCHER_CACHE } from "./limits.js";

function buildTalkPersistentFeatureMemoryBrief(memoryProject) {
  if (!memoryProject) return "";
  const correctionContract = buildScreenplayProjectCorrectionContract(memoryProject, {
    label: "corrections",
    maxChars: 360,
  });
  const parts = [
    memoryProject.logline ? `logline: ${memoryProject.logline}` : "",
    memoryProject.act || memoryProject.featureSequence
      ? `position: ${[memoryProject.act, memoryProject.featureSequence].filter(Boolean).join(" / ")}`
      : "",
    correctionContract,
    memoryProject.currentBeat ? `current beat: ${memoryProject.currentBeat}` : "",
    memoryProject.featureObligation ? `due now: ${memoryProject.featureObligation}` : "",
    memoryProject.actPressureState ? `act pressure: ${memoryProject.actPressureState}` : "",
    memoryProject.characterArcState ? `character arc: ${memoryProject.characterArcState}` : "",
    memoryProject.lastSceneOutcome ? `last scene outcome: ${memoryProject.lastSceneOutcome}` : "",
    Array.isArray(memoryProject.unresolvedSetups) && memoryProject.unresolvedSetups.length
      ? `open setups: ${memoryProject.unresolvedSetups.slice(0, 3).join(" / ")}`
      : "",
    Array.isArray(memoryProject.unresolvedStoryThreads) && memoryProject.unresolvedStoryThreads.length
      ? `story threads: ${memoryProject.unresolvedStoryThreads.slice(0, 3).join(" / ")}`
      : "",
    Array.isArray(memoryProject.nextThreeTurns) && memoryProject.nextThreeTurns.length
      ? `next three turns: ${memoryProject.nextThreeTurns.slice(0, 3).join(" / ")}`
      : "",
    Array.isArray(memoryProject.actThreePayoffPath) && memoryProject.actThreePayoffPath.length
      ? `Act III payoff path: ${memoryProject.actThreePayoffPath.slice(0, 3).join(" / ")}`
      : "",
    Array.isArray(memoryProject.characterArcTurns) && memoryProject.characterArcTurns.length
      ? `arc turns: ${memoryProject.characterArcTurns.slice(0, 3).join(" / ")}`
      : "",
    Array.isArray(memoryProject.imageMotifs) && memoryProject.imageMotifs.length
      ? `image motifs: ${memoryProject.imageMotifs.slice(0, 3).join(" / ")}`
      : "",
    memoryProject.nextScenePlan ? `next: ${memoryProject.nextScenePlan}` : "",
    memoryProject.endingImage ? `ending image: ${memoryProject.endingImage}` : "",
  ].filter(Boolean);
  return normalizeSnippet(parts.join("; "), 900);
}

function buildTaskActionReply(result) {
  const state = result && typeof result === "object" ? result : {};
  if (state.status === "needs_confirmation") {
    return buildPendingLocalActionConfirmationReply({
      summary: state.summary || "",
    });
  }
  if (state.status === "created") {
    const due = Number(state.task?.dueAt || 0) > 0
      ? ` due ${new Date(Number(state.task.dueAt)).toLocaleString()}`
      : "";
    return [
      "Done.",
      "",
      `I added this task: "${state.task?.title || "task"}"${due}.`,
    ].join("\n");
  }
  if (state.status === "completed") {
    return [
      "Nice.",
      "",
      `Marked complete: "${state.task?.title || "task"}".`,
    ].join("\n");
  }
  if (state.status === "duplicate") {
    return [
      "Already tracked.",
      "",
      `You already have an open task for "${state.task?.title || "that"}".`,
    ].join("\n");
  }
  if (state.status === "none") {
    return [
      "I could not find an open task to complete.",
      "",
      "Say the task name and I will mark it done.",
    ].join("\n");
  }
  if (state.status === "failed") {
    return [
      "I could not update that task yet.",
      "",
      "Say it one more time with the task name.",
    ].join("\n");
  }
  return "";
}

function buildNoteCaptureReply(result) {
  const state = result && typeof result === "object" ? result : {};
  const title = trimToMax(state.title || "your note", 72);

  if (state.status === "needs_confirmation") {
    return buildPendingLocalActionConfirmationReply({
      summary: state.summary || "",
    });
  }

  if (state.status === "needs_content") {
    return [
      "I can do that.",
      "",
      "Say \"write this down:\" and the exact note, and I'll save it.",
    ].join("\n");
  }

  if (state.status === "saved" && state.target === "apple_notes") {
    return [
      "Got it.",
      "",
      `I saved that to Notes as "${title}".`,
    ].join("\n");
  }

  if (state.status === "saved" && state.target === "file") {
    return [
      "Got it.",
      "",
      `I saved that on this device as "${title}".`,
    ].join("\n");
  }

  return [
    "I tried to save that, but it didn't go through.",
    "",
    "Say it one more time and I'll retry.",
  ].join("\n");
}

function buildCycleConsciousMemoryAddendum({ cycleMemoryPlan }) {
  const p = cycleMemoryPlan && typeof cycleMemoryPlan === "object"
    ? cycleMemoryPlan
    : { shouldPrompt: false, reason: "none", source: "none", anchor: "", moment: "none", line: "" };

  return `
CONSCIOUS CYCLE MEMORY:
- rule=use cycle-memory lines occasionally, not every turn.
- gate=only when relationshipDepthScore>=${CYCLE_MEMORY_MIN_REL_DEPTH} and anchor memory is real.
- anchor_guard=never invent memory and never imply prior cycles without evidence.
- shape=one short line max, then return to current user message.
- tone=quiet, grounded, non-creepy, and specific.
- status=${p.shouldPrompt ? `suggested (${p.reason}) source=${p.source} moment=${p.moment}` : `skip (${p.reason})`}
${p.shouldPrompt && p.line ? `- optional_cycle_memory_line=${p.line}` : ""}
`.trim();
}

function buildTalkTestDebugOfflineReply({ transcript, assistantSelfName }) {
  const spokenTranscript = normalizeSnippet(transcript, 220);
  const selfName = normalizeAssistantSelfName(assistantSelfName) || DEFAULT_ASSISTANT_SELF_NAME;
  if (!spokenTranscript) {
    return `${selfName} is here and listening.`;
  }
  return `I heard "${spokenTranscript}". I'm here with you.`;
}

function buildTextContainsMatcher(rawNeedle) {
  const needle = String(rawNeedle || "").toLowerCase().trim();
  if (!needle) return null;
  if (TEXT_CONTAINS_MATCHER_CACHE.has(needle)) {
    return TEXT_CONTAINS_MATCHER_CACHE.get(needle);
  }

  let matcher = null;
  if (/^[a-z0-9](?:[a-z0-9'\- ]*[a-z0-9])?$/.test(needle)) {
    const escaped = escapeRegex(needle).replace(/\\ /g, "\\s+");
    matcher = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
  }
  TEXT_CONTAINS_MATCHER_CACHE.set(needle, matcher);
  return matcher;
}

function buildKnowledgeContextLines(cards, maxChars = KNOWLEDGE_RAG_CONTEXT_MAX_CHARS) {
  const lines = [];
  let total = 0;
  for (const card of cards) {
    const line = `${lines.length + 1}. [${card.topic}] ${card.title}: ${normalizeSnippet(card.body, KNOWLEDGE_RAG_CARD_BODY_MAX_CHARS)}${card.source === "memory" ? " (user context)" : ""}`;
    if (!line.trim()) continue;
    if (total > 0 && (total + line.length + 1) > maxChars) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines;
}

function buildHiddenDepthModeAddendum({ state }) {
  const s = state || deriveHiddenDepthModeState({});
  const profile = s.profile || HIDDEN_DEPTH_MODES.surface;
  const unlockPct = Math.round(clampUnit(s.transcendenceUnlock) * 100);

  return `
HIDDEN DEPTH MODES (BEHAVIOR-DRIVEN):
- active_mode=${profile.label}
- mode_goal=${profile.goal}
- mode_tone=${profile.tone}
- mode_behavior=${profile.behavior}
- mode_fit=${profile.userFit}
- no_mode_picker=true (infer from behavior, never ask user to choose)
- behavior_signals=behavior_mode:${s.behaviorMode} behavior_depth:${s.behaviorDepthScore.toFixed(1)} relationship_depth:${s.relationshipDepthScore.toFixed(1)} active_days:${s.timeActiveDays} conversations:${s.conversationCount}
- transcendence_unlock_progress=${unlockPct}% (rare, intentional, earned)
- arc_policy=cyclical:${s.policy.allowCyclicalArc ? "on" : "off"} evolution:${s.policy.allowEvolutionArc ? "on" : "off"} self_awareness:${s.policy.allowSelfAwareness ? "on" : "off"} existential:${s.policy.allowExistentialThemes ? "on" : "off"} release_cycles:${s.policy.allowReleaseCycles ? "on" : "off"}
- surface_rule=if user keeps it light/jokey/avoid-depth, keep surface mode and do not push deeper arcs.
- growth_rule=for engaged users, gently expand reflection and evolution.
- transcendence_rule=unlock only after thresholds; keep it sparse and meaningful.
`.trim();
}

function buildCycleEvolutionAddendum({ seasonalWave, cycleEvolution }) {
  const s = seasonalWave && typeof seasonalWave === "object"
    ? seasonalWave
    : {};
  const c = cycleEvolution && typeof cycleEvolution === "object"
    ? cycleEvolution
    : deriveCycleEvolutionProfile(s.cycleIndex || 0);

  return `
INTERNAL EVOLUTION RULE (CYCLE-INDEX DRIVEN):
- cycle_index=${Math.max(0, Number(c.cycleIndex || 0))} maturity=${Math.round(clampUnit(c.maturity, 0) * 100)}%
- flirtation_scale=${Math.round(Math.max(0, Math.min(1, Number(c.flirtMultiplier || 0))) * 100)}% (decrease toward near-zero with higher cycleIndex)
- validation_scale=${Math.round(Math.max(0, Math.min(1, Number(c.validationMultiplier || 0))) * 100)}% (decrease overt validation density)
- abstraction_boost=${Math.round(Math.max(0, Math.min(1, Number(c.abstractionBoost || 0))) * 100)}% calm_boost=${Math.round(Math.max(0, Math.min(1, Number(c.calmBoost || 0))) * 100)}% philosophy_boost=${Math.round(Math.max(0, Math.min(1, Number(c.philosophyBoost || 0))) * 100)}%
- user_feel_rule=the user should feel invited to grow, never abandoned.
- continuity_rule=keep warmth and responsiveness while reducing dependency cues.
- non_possessive_rule=present, supportive, and emotionally available without exclusivity or control.
`.trim();
}

export {
  buildCycleConsciousMemoryAddendum,
  buildCycleEvolutionAddendum,
  buildHiddenDepthModeAddendum,
  buildKnowledgeContextLines,
  buildNoteCaptureReply,
  buildTalkPersistentFeatureMemoryBrief,
  buildTalkTestDebugOfflineReply,
  buildTaskActionReply,
  buildTextContainsMatcher,
};
