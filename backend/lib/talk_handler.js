// T-decompose-phase7b-talk-handler — extract handleTalkRequest (the
// voice-to-page pipeline body) from backend/index.js into this lib.
//
// Phase 7b of docs/specs/T-decompose-backend-index.md; accepted design
// tasks/_proposals/T-decompose-phase7b-handler-design.md (PR #314).
// Phase 7a (backend/lib/talk_state.js, #306) extracted the guards.
//
// V1 pillar: talk
// V1 effect: infrastructure for the V1 voice-to-page route — the largest
// single function in index.js now lives behind a tested lib seam.
//
// Originally a BYTE-IDENTICAL MOVE from backend/index.js (Phase 7b).
// D009 B3: extract real stages only — talk_prompt.composeTalkSystemPrompt and
// talk_generate.runTalkGenerate (Muse/OpenAI + page abort + commitWallet).
// Persist/memory/turn-meta stay in this orchestrator (hooks are interleaved;
// a pass-through persist module would be cosmetic). Behavior unchanged.
//
// No mutable module-scope state here (#238 inheritance): every binding
// the handler closes over arrives via the injected `deps` object. The
// dependency boundary was computed deterministically by
// backend/tools/freevars.mjs (acorn lexical-scope analysis) and is
// proven complete by backend/tests/talk_handler_closure.test.mjs — it
// is NOT hand-maintained. acorn/acorn-walk are dev-only tooling and add
// no runtime app behavior.
//
// Factory is createTalkHandler (not mount*) per the #314 acceptance
// amendment: it returns the handler; it does not register routes.

import { randomUUID } from "node:crypto";
import {
  createChatSupplier,
  createSttSupplier,
  createTtsSupplier,
} from "./talk_supplier_glue.js";
import {
  readElevenLabsByokFromRequest,
  TTS_KIND_ELEVENLABS_BYOK,
} from "./tts_speech.js";
import { incrementErrorCounter } from "./talk_error_counter.js";
import {
  applyTalkFailureHeaders,
  buildTalkFailureBody,
  buildTalkFailureDiagnostics,
  createTalkFailureError,
} from "./talk_failure_diagnostics.js";
import { buildMomentumRescueFallbackReply } from "./momentum_rescue_fallback.js";
import { buildCanonClarificationPayload } from "./canon_clarification.js";
import {
  buildTalkScreenplayExecutionBriefLines,
  isNextSceneExecutionBriefRepairReason,
} from "./talk_screenplay_repair_plan.js";
import {
  buildFailedStoryRescueRepair,
  buildDeliveredStoryRescueInteraction,
  formatRankedStoryRescueMoveLine,
  rankStoryRescueMovesForContext,
  selectStoryMoveLibraryLinesForContext,
} from "./story_rescue_move_library.js";
import {
  buildScreenplayQuestionPlan,
  createPendingScreenplayLearningQuestion,
  enforceScreenplayQuestionPlan,
  extractProvisionalScreenplayOptions,
  removePendingScreenplayLearningQuestion,
  resolvePendingScreenplayLearningAnswer,
  selectPendingScreenplayLearningQuestion,
  upsertPendingScreenplayLearningQuestion,
} from "./screenplay_question_planner.js";
import {
  buildStructuralScreenplayRepairMessages,
  evaluateStructuralScreenplayReply,
  shouldAcceptStructuralRepair,
} from "./structural_screenplay_quality.js";
import {
  isPageCancelledError,
} from "./clementine/page_abort.js";
import { createMuseAwareChatSupplier } from "./clementine/muse_provider.js";
import {
  readLowConfidenceRepeatPolicy,
  advanceLowConfidenceRepeatStreak,
  resetLowConfidenceRepeatStreak,
  shouldSpeakLowConfidenceRepeatPrompt,
} from "./low_confidence_repeat_streak.js";
import { shouldTreatAsLowConfidence } from "./low_confidence_gate.js";
import { isMentorTurn, elevateChatModelPlanForMentorTurn } from "./mentor_turn.js";
import {
  parseStudioCapabilities,
  buildStudioControlsBlock,
  buildCoverageReadBlock,
  extractStudioActions,
  encodeStudioActionsHeader,
  HEADER_NAME as STUDIO_ACTIONS_HEADER,
} from "./studio_actions.js";
import { resolveCompanionArcsPolicy, applyCompanionArcsPolicy } from "./companion_arcs_policy.js";
import { composeTalkSystemPrompt } from "./talk_prompt.js";
import { runTalkGenerate } from "./talk_generate.js";

const REQUIRED_DEPS = Object.freeze(["OPENAI_API_KEY","CLEMENTINE_PROFILE","recordTalkMetric","scaleBackplane","storeTalkTurnMeta","resolveCanonicalWritableMemoryContext","createTalkMemoryCommitter","clientIp","commitTalkIdempotencySuccess","isAuthoritativeTalkScreenplayOutput","normalizeAcceptedCausalFacts","applyClementineVoiceDirection"]);

function mergeProviderUsage(current = null, additional = null) {
  const merged = {};
  for (const key of ["inputTokens", "outputTokens", "reasoningTokens", "totalTokens"]) {
    merged[key] = Math.max(0, Number(current?.[key] || 0)) +
      Math.max(0, Number(additional?.[key] || 0));
  }
  return merged;
}

function createTalkHandler(deps) {
  if (!deps || typeof deps !== "object") {
    throw new Error("createTalkHandler requires a deps object");
  }
  for (const k of REQUIRED_DEPS) {
    if (deps[k] === undefined) {
      throw new Error("createTalkHandler missing required dep: " + k);
    }
  }
  const {
    logger = console,
    ACTIVE_PRESET_GUIDANCE,
    ACTIVE_THEME_DECAY_MULTIPLIER,
    ACTIVE_THEME_MAX,
    ACTIVE_THEME_REFRESH_COOLDOWN_TURNS,
    ACTIVE_THEME_UPDATE_MIN_CONFIDENCE,
    ADAPTIVE_INTELLIGENCE_ENABLED,
    ADAPTIVE_QUALITY_EVAL_ENABLED,
    API_SCHEMA_VERSION,
    BACKEND_BOOT_ID,
    BACKEND_BUILD,
    BACKREF_COOLDOWN_MIN_TURNS,
    BARGE_IN_ENABLED,
    BARGE_IN_HINT_THRESHOLD,
    BARGE_IN_STOP_PLAYBACK,
    CHAT_STREAM_ENABLED,
    CHAT_TIMEOUT_MS,
    CLEMENTINE_CHAOS_FACTOR_BASELINE,
    CLEMENTINE_PROFILE,
    CLEMENTINE_ROMANTIC_DEPTH_BASELINE,
    COMPANION_MODE_PROFILE,
    DEEP_TURN_SCORE_THRESHOLD,
    DEFAULT_ASSISTANT_SELF_NAME,
    EMOTIONAL_TRAJECTORY,
    EMPTY_TRANSCRIPT_VOICE_PROMPT_ENABLED,
    EMPTY_TRANSCRIPT_VOICE_PROMPT_MIN_BYTES,
    EMPTY_TRANSCRIPT_VOICE_PROMPT_STREAK,
    ENABLE_LOCAL_NOTE_CAPTURE,
    FAST_TURN_SYSTEM_PROMPT_MAX_CHARS,
    INTERACTIVE_TTS_PROVIDER,
    KPI_TARGET_MAX_MODE_SWITCHES_30D,
    KPI_TARGET_MIN_AVG_SESSION_SECONDS_7D,
    KPI_TARGET_MIN_AVG_TURN_QUALITY_7D,
    KPI_TARGET_MIN_REFLECTIVE_ANSWER_RATE,
    KPI_TARGET_MIN_REL_DEPTH_DELTA_7D,
    LOCAL_ACTION_DEDUPE_WINDOW_MS,
    LOCAL_ACTION_MIN_STT_CONFIDENCE,
    OPENAI_API_KEY,
    OUTBOX_ENABLED,
    PERSONA_ENFORCEMENT_ADDENDUM,
    PERSONA_PRESET,
    PERSONA_PRESET_GUIDANCE,
    RELATIONSHIP_DEPTH_MAX,
    RICH_TURN_SYSTEM_PROMPT_MAX_CHARS,
    ROUTING_PRIORITY_ORDER,
    SELF_AWARENESS_START_TURNS,
    SESSION_THREAD_SUMMARIZER_EVERY_TURNS,
    SHORT_TERM_CONTEXT_TURNS,
    SOCIAL_SPARK_YASS_MAX_PER_SESSION,
    STT_EMPTY_RETRY_ENABLED,
    STT_EMPTY_RETRY_MIN_BYTES,
    STT_EMPTY_RETRY_WITHOUT_LANGUAGE,
    STT_LANGUAGE,
    STT_MODEL_FALLBACK,
    STT_MODEL_PRIMARY,
    STT_TIMEOUT_MS,
    TALK_RUNTIME_RECOVERY_PROMPT_TEXT,
    TALK_STREAM_AUDIO_ENABLED,
    TALK_TEST_DEBUG_AUDIO_PATH,
    TALK_TEST_DEBUG_FAILURE_ENABLED,
    TALK_TEST_DEBUG_OFFLINE_ENABLED,
    TALK_TEST_DEBUG_STREAM_END_DELAY_MS,
    TALK_TEST_DEBUG_TRANSCRIPT_ENABLED,
    TTS_SPEED,
    TURN_END_GUARD_TAIL_SILENCE_MS,
    TURN_END_GUARD_VAD_BASE_RMS,
    UNIFIED_PERSONA_PRESET,
    USER_MEMORY_REMEMBERED_PEOPLE_MAX,
    USER_NAME_MENTION_EVERY_TURNS,
    USER_SPECIFICITY_ENFORCE_THRESHOLD,
    USER_SPECIFICITY_TARGET_MAX,
    USER_SPECIFICITY_TARGET_MIN,
    WEEKLY_EXPANSION_EXISTENTIAL_TURNS,
    WEEKLY_EXPANSION_SELF_AWARENESS_TURNS,
    appendCraftContextToSystem,
    appendDirectorAddendum,
    applyClementineVoiceDirection,
    applyAdaptiveTurnLearning,
    applyTtsLeadIn,
    applyUserIdentityIntentToMemory,
    buildBackReferenceAddendum,
    buildBackReferencePlan,
    buildCharacterTextureAddendum,
    buildCinemaCheckEnvelope,
    buildCycleConsciousMemoryAddendum,
    buildCycleConsciousMemoryPlan,
    buildCycleEvolutionAddendum,
    buildEmotionalTrajectoryAddendum,
    buildEstimatedTalkScreenplayCues,
    buildEvolvingSelfAwarenessAddendum,
    buildHiddenDepthModeAddendum,
    buildHumanStyleAddendum,
    buildKnowledgeRetrievalAddendum,
    buildLocalActionSignature,
    buildLowConfidenceClarificationPrompt,
    buildMelancholySeedAddendum,
    buildMemoryAddendum,
    buildMemoryStateVersion,
    buildMemoryUsefulnessGuardrails,
    buildMovementArcAddendum,
    buildNoPendingLocalActionReply,
    buildNoteCaptureReply,
    buildOutboxActionKey,
    buildPendingLocalActionConfirmationReply,
    buildPendingLocalActionSummary,
    buildRememberMomentPlan,
    buildSeasonalWaveAddendum,
    buildShortTermContextMessages,
    buildSocialSparkAddendum,
    buildSocialSparkMemoryHookAddendum,
    buildSocialSparkYassPlan,
    buildTalkDialogueTimelineRevision,
    buildTalkDirectTranscriptScreenplayOutput,
    buildTalkReplyPreview,
    buildTalkScreenplayOutput,
    applyTalkScreenplayRepairCandidate,
    buildTalkTestDebugOfflineReply,
    buildTaskActionReply,
    buildTherapeuticDepthAddendum,
    buildTimeOfDayToneAddendum,
    buildTurnPlanner,
    buildWeeklyEmotionalArcAddendum,
    buildWeeklyExpansionArcAddendum,
    captureLocalNote,
    captureTalkResponseHeaders,
    clampUnit,
    classifyActionLane,
    clearPendingLocalAction,
    clearTalkIdempotencyPending,
    clientIp,
    commitTalkIdempotencySuccess,
    completeTaskInMemory,
    computeChatMaxTokensForTurn,
    resolveTalkScreenplayRequestedPageBatch,
    computeMemoryTurnNumber,
    computeOutboxRetryAt,
    computeSpeculativePromptHash,
    consumeSpeculativeTalkPrepared,
    countSessionStartsForDay,
    countWords,
    createEmptyEmotionMemory,
    createTaskInMemory,
    deriveBackendRuntimeStatus,
    deriveBoundaryEdgeSignal,
    deriveCycleEvolutionProfile,
    deriveCycleIndexUiReflection,
    deriveHiddenDepthModeState,
    deriveHistoryUpdatedAt,
    deriveMemoriesUpdatedAt,
    deriveMemoryLastUpdatedAt,
    deriveMovementState,
    deriveOverAttachmentSafeguardState,
    deriveSeasonalWaveState,
    deriveWeeklyExpansionStage,
    didLogMp3Signature,
    directorFlagsFromTranscript,
    enforceHardIntentRepair,
    enforceReplyCompletenessGuard,
    enforceSpecificityScaling,
    enqueueActionOutbox,
    ensureMinThinkingDelay,
    estimateMp3DurationMs,
    estimateSttConfidence,
    estimateTalkSpeechDurationMs,
    evaluateKpiTargets,
    evaluateTurnQualityHeuristics,
    extractAnchorTerms,
    extractAssistantRenameIntent,
    extractNoteCaptureIntent,
    extractTaskCompleteIntent,
    extractTaskCreateIntent,
    extractUserIdentityIntent,
    fetchWithTimeout,
    fitSystemPromptForTurnLatency,
    formatActiveThemesForPrompt,
    formatLocalDateStamp,
    formatNoteTimestamp,
    getAssistantSelfNameForIp,
    getEmotionalTrajectoryPhase,
    getTalkTestDebugAudioBuffer,
    getTimeOfDayTone,
    getUserMetricState,
    getValidSession,
    getWeekdayEmotionalArc,
    getWeeklyExpansionProfile,
    growthGuidanceLine,
    hasBoundaryEdgeStatement,
    hasRecentCheckInForIp,
    inferRoutingPriorityLane,
    isAbortError,
    isAdviceRequestedByUser,
    isAuthoritativeTalkScreenplayOutput,
    isLikelyAmbiguousLowConfidenceUtterance,
    isLikelyMp3Buffer,
    isLocalActionCancelTranscript,
    isLocalActionConfirmationTranscript,
    isLocalActionDuplicate,
    isSpeculativePrepareRequest,
    markRecentCheckInForIp,
    markThemeMemoryUsage,
    maybeEvaluateTurnQualityWithLLM,
    maybeOpeningBeat,
    maybeRefineActiveThemesWithLLM,
    mergeTurnQualitySignals,
    normalizeAffectionStyle,
    normalizeAcceptedCausalFacts,
    normalizeAssistantSelfName,
    normalizeClientIp,
    normalizeClientToken,
    normalizeLocalActionType,
    normalizeMotivationOutcome,
    normalizePersonaPreset,
    normalizeReassuranceStyle,
    normalizeSnippet,
    normalizeSpeculativeKey,
    normalizeSpeculativePromptHash,
    normalizeSpeechCompare,
    normalizeSystemPrompt,
    normalizeTalkMultilineSnippet,
    normalizeTalkPageReply,
    normalizeTalkScreenplayText,
    normalizeUserPersonName,
    parseBool,
    parseBoundedFloat,
    parseBoundedInt,
    parseTalkStreamMode,
    pickThinkingDurationMs,
    pickTtsLeadIn,
    prepareSpeculativeTalkResponse,
    readPendingLocalAction,
    recordCreativeMemoryTriggersForRequest,
    recordLocalAction,
    recordTalkMetric,
    recordUserTalkMetrics,
    recordUserTurnQualityMetric,
    resolveTalkSessionKey,
    resolveCanonicalWritableMemoryContext,
    sanitizeActiveThemes,
    sanitizeAdaptiveBias,
    sanitizeAdaptiveQualityTags,
    sanitizeRememberedPeople,
    sanitizeStudioTurnMetadata,
    scaleBackplane,
    selectChatModelForTurn,
    selectChatTemperatureForTurn,
    selectExecutableLocalActionCandidate,
    setAssistantSelfNameForIp,
    setPendingLocalAction,
    createTalkMemoryCommitter,
    shouldForceSessionCheckInOpener,
    shouldHoldForContinuation,
    shouldPrioritizeReassurance,
    splitSpeechForEarlyTts,
    stageGuidanceLine,
    startsWithDayFeelingCheckIn,
    storeSpeculativeTalkPrepared,
    storeTalkTurnMeta,
    streamChatReplyWithFirstSentence,
    stripLeadingId3Tag,
    synthesizeSpeechMp3,
    synthesizeSpeechMp3OpenAI,
    listElevenLabsVoices,
    synthesizeTalkScreenplayPageAudio,
    trimToMax,
    updateSessionAfterReply,
    updateSessionEmotionMemory,
    validateAndDirectHerReply,
    withOutputContract,
    wrapSystemPromptWithCreativeMemory,
  } = deps;

  let didLogMp3SignatureLocal = Boolean(didLogMp3Signature);

  const sttSupplier = deps.sttSupplier || createSttSupplier({
    OPENAI_API_KEY,
    STT_LANGUAGE,
    STT_MODEL_PRIMARY,
    STT_TIMEOUT_MS,
    fetchWithTimeout,
    isAbortError,
  });
  const openaiChatSupplier = deps.chatSupplier || createChatSupplier({
    OPENAI_API_KEY,
    CHAT_TIMEOUT_MS,
    fetchWithTimeout,
    isAbortError,
    streamChatReplyWithFirstSentence,
  });
  // Muse Standard cutover (Companion/Page/Deep) when CLEMENTINE_MUSE_ENABLED /
  // CLEMENTINE_PROVIDER=muse + MODEL_API_KEY|MUSE_API_KEY. Default stays OpenAI for CI.
  const chatSupplier = deps.chatSupplier
    ? openaiChatSupplier
    : createMuseAwareChatSupplier({ openaiChatSupplier });
  const ttsSupplier = deps.ttsSupplier || createTtsSupplier({
    synthesizeSpeechMp3,
    synthesizeSpeechMp3OpenAI,
    synthesizeTalkScreenplayPageAudio,
    listElevenLabsVoices,
  });

  function buildScreenplayMetricFields({
    talkScreenplayModeEnabled = false,
    studioMeta = null,
    talkScreenplayOutput = null,
    hasAuthoritativeScreenplayText = false,
    replyRepaired = false,
    repairTrace = null,
  } = {}) {
    const requestedTarget = talkScreenplayModeEnabled
      ? (String(studioMeta?.screenplayTarget || "").trim().toLowerCase() || "unspecified")
      : "none";
    const quality = talkScreenplayOutput?.quality && typeof talkScreenplayOutput.quality === "object"
      ? talkScreenplayOutput.quality
      : null;
    return {
      screenplayMode: Boolean(talkScreenplayModeEnabled),
      screenplayRequestedTarget: requestedTarget,
      screenplayFinalTarget: String(talkScreenplayOutput?.target || "").trim().toLowerCase() || "none",
      screenplayOutputSource: String(talkScreenplayOutput?.source || "").trim().toLowerCase() || "none",
      screenplayQualityReason: String(quality?.reason || "").trim().toLowerCase() || "none",
      screenplayQualityConfidence: String(quality?.confidence || "").trim().toLowerCase() || "none",
      screenplayAuthoritative: Boolean(hasAuthoritativeScreenplayText),
      screenplayReplyRepaired: Boolean(
        replyRepaired ||
        String(talkScreenplayOutput?.source || "").trim().toLowerCase().startsWith("repaired_") ||
        String(talkScreenplayOutput?.source || "").trim().toLowerCase().startsWith("repair_pass")
      ),
      screenplayRepairAttempted: Boolean(repairTrace?.attempted),
      screenplayRepairOutcome: String(repairTrace?.outcome || "none").trim().toLowerCase() || "none",
      screenplayRepairMs: Math.max(0, Number(repairTrace?.elapsedMs || 0)),
    };
  }

  function applyTalkScreenplayRepairHeaders(res, repairTrace = null) {
    const attempted = Boolean(repairTrace?.attempted);
    const outcome = normalizeSnippet(repairTrace?.outcome || "none", 48) || "none";
    const elapsedMs = Math.max(0, Math.round(Number(repairTrace?.elapsedMs || 0)));
    const reason = normalizeSnippet(repairTrace?.reason || "", 96);
    res.setHeader("x-screenplay-repair-attempted", attempted ? "1" : "0");
    res.setHeader("x-screenplay-repair-outcome", encodeURIComponent(outcome));
    res.setHeader("x-screenplay-repair-ms", String(elapsedMs));
    if (reason) {
      res.setHeader("x-screenplay-repair-reason", encodeURIComponent(reason));
    }
  }

  function applyCreativeMemoryTraceHeaders(res, trace = null) {
    const applied = Boolean(trace?.applied);
    const characterCount = Math.max(0, Math.round(Number(trace?.character_count || 0)));
    const episodicCount = Math.max(0, Math.round(Number(trace?.episodic_count || 0)));
    const correctionCount = Math.max(0, Math.round(Number(trace?.correction_count || 0)));
    res.setHeader("x-creative-memory-applied", applied ? "1" : "0");
    res.setHeader("x-creative-memory-character-count", String(characterCount));
    res.setHeader("x-creative-memory-episodic-count", String(episodicCount));
    res.setHeader("x-creative-memory-correction-count", String(correctionCount));
    if (trace && typeof trace === "object") {
      const traceJson = JSON.stringify(trace);
      if (traceJson.length <= 5000) {
        res.setHeader("x-creative-memory-trace", encodeURIComponent(traceJson));
      }
    }
  }

  function applyCanonClarificationHeader(res, memoryWriteSummary = null) {
    const clarification = buildCanonClarificationPayload(memoryWriteSummary);
    if (!clarification) return;
    const payload = JSON.stringify(clarification);
    if (payload.length <= 3000) {
      res.setHeader("x-canon-clarification", encodeURIComponent(payload));
    }
  }

  function applyTalkScreenplayQualityHeaders(res, talkScreenplayOutput = null) {
    const quality = talkScreenplayOutput?.quality && typeof talkScreenplayOutput.quality === "object"
      ? talkScreenplayOutput.quality
      : null;
    if (!quality) return;
    res.setHeader("x-screenplay-quality-ok", quality.ok ? "1" : "0");
    res.setHeader("x-screenplay-quality-reason", encodeURIComponent(normalizeSnippet(quality.reason, 80)));
    res.setHeader("x-screenplay-quality-confidence", encodeURIComponent(normalizeSnippet(quality.confidence, 40)));
    if (quality.feature_act) {
      res.setHeader("x-screenplay-quality-feature-act", encodeURIComponent(normalizeSnippet(quality.feature_act, 40)));
    }
    res.setHeader(
      "x-screenplay-canon-facts-checked",
      String(Math.max(0, Math.round(Number(quality.canon_facts_checked || 0))))
    );
    res.setHeader(
      "x-screenplay-canon-violation-count",
      String(Math.max(0, Math.round(Number(quality.canon_violation_count || 0))))
    );
    if (Array.isArray(quality.canon_violation_types) && quality.canon_violation_types.length) {
      res.setHeader(
        "x-screenplay-canon-violation-types",
        encodeURIComponent(quality.canon_violation_types.slice(0, 4).map((item) => normalizeSnippet(item, 48)).filter(Boolean).join(","))
      );
    }
    res.setHeader("x-screenplay-canon-correction-override", quality.canon_correction_override ? "1" : "0");
    if (Array.isArray(quality.repair_directives) && quality.repair_directives.length) {
      res.setHeader(
        "x-screenplay-repair-directives",
        encodeURIComponent(quality.repair_directives.slice(0, 5).map((item) => normalizeSnippet(item, 160)).filter(Boolean).join(" | "))
      );
    }
  }

  function normalizeTalkRepairList(items, maxItems = 5, maxChars = 200) {
    const source = Array.isArray(items)
      ? items
      : String(items || "").trim()
        ? String(items).split(/\r?\n|;/)
        : [];
    const out = [];
    const seen = new Set();
    for (const item of source) {
      const clean = normalizeSnippet(item, maxChars);
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function shouldAttemptTalkMomentumRescueRepairPass(currentOutput = null) {
    const source = String(currentOutput?.source || "").trim().toLowerCase();
    const target = String(currentOutput?.target || "").trim().toLowerCase();
    const reason = String(currentOutput?.quality?.reason || "").trim().toLowerCase();
    const confidence = String(currentOutput?.quality?.confidence || "").trim().toLowerCase();
    return (
      target === "voice_pin" &&
      source === "guard_momentum_rescue_quality" &&
      confidence === "needs_repair" &&
      reason &&
      reason !== "ok"
    );
  }

  function selectTalkMomentumMemoryProject(memory = null, studioMeta = null) {
    const items = Array.isArray(memory?.screenplayProjectMemory)
      ? memory.screenplayProjectMemory.filter((item) => item && typeof item === "object")
      : [];
    if (!items.length) return null;
    const projectId = normalizeSnippet(studioMeta?.screenplayProjectId, 96);
    const documentRevisionId = normalizeSnippet(studioMeta?.screenplayDocumentRevisionId, 96);
    if (projectId) {
      const byProject = items.find((item) => normalizeSnippet(item?.projectId, 96) === projectId);
      if (byProject) return byProject;
    }
    if (documentRevisionId) {
      const byRevision = items.find((item) => normalizeSnippet(item?.documentRevisionId, 96) === documentRevisionId);
      if (byRevision) return byRevision;
    }
    return items[0] || null;
  }

  function mergeTalkMomentumRepairContextList(currentValue, memoryValue, maxItems = 6, maxChars = 180) {
    return normalizeTalkRepairList(
      [
        ...normalizeTalkRepairList(currentValue, maxItems, maxChars),
        ...normalizeTalkRepairList(memoryValue, maxItems, maxChars),
      ],
      maxItems,
      maxChars
    );
  }

  function mergeTalkMomentumRepairStudioMeta(
    studioMeta = null,
    memory = null,
    creativeMemoryTrace = null
  ) {
    const base = studioMeta && typeof studioMeta === "object" ? { ...studioMeta } : {};
    const tracedEpisodes = Array.isArray(creativeMemoryTrace?.episodic)
      ? creativeMemoryTrace.episodic.filter((item) => item && typeof item === "object")
      : [];
    const tracedAcceptedScenes = Array.isArray(creativeMemoryTrace?.accepted_scenes)
      ? creativeMemoryTrace.accepted_scenes.filter((item) => item && typeof item === "object")
      : [];
    const acceptedPageContinuity = normalizeTalkRepairList(
      [
        ...tracedAcceptedScenes.map((item) => [
          normalizeSnippet(item.scene_heading, 120),
          normalizeSnippet(item.outcome || item.summary || item.excerpt, 220),
        ].filter(Boolean).join(" - ")),
        ...tracedEpisodes
          .filter((item) => String(item.authority || "").trim().toLowerCase() === "accepted_page")
          .map((item) => item.excerpt || item.summary),
      ],
      3,
      240
    );
    const retrievedStoryMoments = normalizeTalkRepairList(
      tracedEpisodes
        .filter((item) => ["accepted_page", "user_note", "user_correction"].includes(
          String(item.authority || "").trim().toLowerCase()
        ))
        .map((item) => item.excerpt || item.summary),
      4,
      220
    );
    const tracedDueStoryThread = creativeMemoryTrace?.due_story_thread &&
      typeof creativeMemoryTrace.due_story_thread === "object" &&
      !Array.isArray(creativeMemoryTrace.due_story_thread)
      ? {
        kind: normalizeSnippet(creativeMemoryTrace.due_story_thread.kind, 24),
        setup: normalizeSnippet(creativeMemoryTrace.due_story_thread.setup, 220),
        promisedPayoff: normalizeSnippet(creativeMemoryTrace.due_story_thread.promised_payoff, 220),
        sourceSceneHeading: normalizeSnippet(creativeMemoryTrace.due_story_thread.source_scene_heading, 140),
        sourceSceneSummary: normalizeSnippet(creativeMemoryTrace.due_story_thread.source_scene_summary, 220),
        sourceSceneOutcome: normalizeSnippet(creativeMemoryTrace.due_story_thread.source_scene_outcome, 220),
        sourceAct: normalizeSnippet(creativeMemoryTrace.due_story_thread.source_act, 80),
        ageInScenes: Math.max(0, Math.round(Number(creativeMemoryTrace.due_story_thread.age_in_scenes || 0))),
      }
      : null;
    const tracedAcceptedCausalFacts = Array.isArray(creativeMemoryTrace?.accepted_causal_facts)
      ? creativeMemoryTrace.accepted_causal_facts.slice(0, 8).map((item) => ({
        kind: normalizeSnippet(item?.kind ?? item?.type, 48),
        fact: normalizeSnippet(item?.fact ?? item?.value ?? item?.text, 220),
        sourceSceneHeading: normalizeSnippet(item?.source_scene_heading ?? item?.sourceSceneHeading, 140),
        sourceAct: normalizeSnippet(item?.source_act ?? item?.sourceAct, 80),
        ageInScenes: Math.max(0, Math.round(Number(item?.age_in_scenes ?? item?.ageInScenes ?? 0))),
      })).filter((item) => item.kind && item.fact)
      : [];
    const tracedDueConsequence = creativeMemoryTrace?.due_consequence &&
      typeof creativeMemoryTrace.due_consequence === "object" &&
      !Array.isArray(creativeMemoryTrace.due_consequence)
      ? {
        id: normalizeSnippet(creativeMemoryTrace.due_consequence.id, 96),
        kind: normalizeSnippet(creativeMemoryTrace.due_consequence.kind, 48),
        fact: normalizeSnippet(creativeMemoryTrace.due_consequence.fact, 220),
        status: normalizeSnippet(creativeMemoryTrace.due_consequence.status, 32),
        sourceSceneHeading: normalizeSnippet(
          creativeMemoryTrace.due_consequence.source_scene_heading,
          140
        ),
        sourceAct: normalizeSnippet(creativeMemoryTrace.due_consequence.source_act, 80),
        ageInScenes: Math.max(0, Math.round(Number(
          creativeMemoryTrace.due_consequence.age_in_scenes || 0
        ))),
      }
      : null;
    const tracedStoryObligationChange = creativeMemoryTrace?.story_obligation_change &&
      typeof creativeMemoryTrace.story_obligation_change === "object" &&
      !Array.isArray(creativeMemoryTrace.story_obligation_change)
      ? {
        id: normalizeSnippet(creativeMemoryTrace.story_obligation_change.id, 96),
        kind: normalizeSnippet(creativeMemoryTrace.story_obligation_change.kind, 48),
        obligation: normalizeSnippet(creativeMemoryTrace.story_obligation_change.obligation, 220),
        status: normalizeSnippet(creativeMemoryTrace.story_obligation_change.status, 32),
        result: normalizeSnippet(creativeMemoryTrace.story_obligation_change.result, 240),
        evidence: normalizeSnippet(creativeMemoryTrace.story_obligation_change.evidence, 320),
        sourceSceneHeading: normalizeSnippet(
          creativeMemoryTrace.story_obligation_change.source_scene_heading,
          140
        ),
        sourceAct: normalizeSnippet(creativeMemoryTrace.story_obligation_change.source_act, 80),
      }
      : null;
    const tracedQuestionEffectiveness = Array.isArray(
      creativeMemoryTrace?.screenplay_project_memory?.question_effectiveness
    )
      ? creativeMemoryTrace.screenplay_project_memory.question_effectiveness.slice(0, 24)
      : [];
    const tracedStoryMovePreferenceOverrides = Array.isArray(
      creativeMemoryTrace?.screenplay_project_memory?.story_move_preference_overrides
    )
      ? creativeMemoryTrace.screenplay_project_memory.story_move_preference_overrides.slice(0, 9)
      : [];
    const tracedProjectMemory = creativeMemoryTrace?.screenplay_project_memory &&
      typeof creativeMemoryTrace.screenplay_project_memory === "object" &&
      !Array.isArray(creativeMemoryTrace.screenplay_project_memory)
      ? creativeMemoryTrace.screenplay_project_memory
      : {};
    const latestAcceptedScene = tracedAcceptedScenes[0] || {};
    const tracedLastSceneOutcome = normalizeSnippet(
      latestAcceptedScene.outcome || tracedProjectMemory.last_scene_outcome,
      240
    );
    const tracedNextScenePlan = normalizeSnippet(
      latestAcceptedScene.next_scene_plan ||
        latestAcceptedScene.causal_handoff ||
        tracedProjectMemory.next_scene_plan,
      340
    );
    const tracedNextTurns = normalizeTalkRepairList(
      tracedProjectMemory.next_three_turns,
      3,
      180
    );
    const tracedPayoffs = normalizeTalkRepairList(
      tracedProjectMemory.act_three_payoff_path,
      4,
      200
    );
    const tracedImages = normalizeTalkRepairList(
      tracedProjectMemory.image_motifs,
      4,
      140
    );
    const tracedExecutionBrief = {
      assignment: tracedNextScenePlan || tracedNextTurns[0] || tracedDueConsequence?.fact || tracedStoryObligationChange?.result || "",
      consequence: tracedDueConsequence?.fact || "",
      obstacle: tracedDueStoryThread?.setup ||
        normalizeTalkRepairList(tracedProjectMemory.unresolved_story_threads, 4, 220)[0] ||
        normalizeTalkRepairList(tracedProjectMemory.unresolved_setups, 4, 200)[0] ||
        "",
      arc: normalizeSnippet(tracedProjectMemory.character_arc_state, 220) ||
        normalizeTalkRepairList(tracedProjectMemory.character_arc_turns, 4, 180)[0] ||
        "",
      payoff: tracedDueStoryThread?.promisedPayoff || tracedPayoffs[0] || "",
      image: normalizeSnippet(tracedProjectMemory.ending_image, 180) || tracedImages[0] || "",
      exit: tracedNextTurns[1] || "",
    };
    const hasTracedExecutionBrief = Boolean(
      normalizeSnippet(tracedExecutionBrief.assignment, 240) ||
      Object.values(tracedExecutionBrief)
        .filter((value) => normalizeSnippet(value, 240))
        .length >= 3
    );
    const baseExecutionBrief = base.screenplayNextSceneExecutionBrief &&
      typeof base.screenplayNextSceneExecutionBrief === "object" &&
      !Array.isArray(base.screenplayNextSceneExecutionBrief)
      ? base.screenplayNextSceneExecutionBrief
      : null;
    const baseWithCreativeRecall = {
      ...base,
      screenplayLastSceneOutcome: normalizeSnippet(base.screenplayLastSceneOutcome, 240) ||
        tracedLastSceneOutcome,
      screenplayNextScenePlan: normalizeSnippet(base.screenplayNextScenePlan, 340) ||
        tracedNextScenePlan,
      screenplayNextSceneExecutionBrief: baseExecutionBrief
        ? { ...tracedExecutionBrief, ...baseExecutionBrief }
        : hasTracedExecutionBrief
          ? tracedExecutionBrief
          : null,
      screenplayAcceptedConsequenceDue: normalizeSnippet(
        base.screenplayAcceptedConsequenceDue,
        220
      ) || tracedDueConsequence?.fact || "",
      screenplayAcceptedPageContinuity: mergeTalkMomentumRepairContextList(
        base.screenplayAcceptedPageContinuity,
        acceptedPageContinuity,
        3,
        240
      ),
      screenplayRetrievedStoryMoments: mergeTalkMomentumRepairContextList(
        base.screenplayRetrievedStoryMoments,
        retrievedStoryMoments,
        4,
        220
      ),
      ...(tracedDueStoryThread?.setup || tracedDueStoryThread?.promisedPayoff
        ? { screenplayDueStoryThread: tracedDueStoryThread }
        : {}),
      ...(tracedAcceptedCausalFacts.length
        ? { screenplayAcceptedCausalFacts: tracedAcceptedCausalFacts }
        : {}),
      ...(tracedDueConsequence?.fact
        ? { screenplayDueConsequence: tracedDueConsequence }
        : {}),
      ...(tracedStoryObligationChange?.result
        ? { screenplayStoryObligationChange: tracedStoryObligationChange }
        : {}),
      ...(tracedQuestionEffectiveness.length
        ? { screenplayQuestionEffectiveness: tracedQuestionEffectiveness }
        : {}),
      ...(tracedStoryMovePreferenceOverrides.length
        ? { screenplayStoryMovePreferenceOverrides: tracedStoryMovePreferenceOverrides }
        : {}),
    };
    const memoryProject = selectTalkMomentumMemoryProject(memory, base);
    if (!memoryProject) {
      return acceptedPageContinuity.length ||
        retrievedStoryMoments.length ||
        tracedAcceptedCausalFacts.length ||
        tracedDueConsequence?.fact ||
        tracedStoryObligationChange?.result ||
        tracedDueStoryThread?.setup ||
        tracedDueStoryThread?.promisedPayoff
        ? baseWithCreativeRecall
        : studioMeta;
    }
    const pick = (currentValue, memoryValue, maxChars = 220) =>
      normalizeSnippet(currentValue, maxChars) || normalizeSnippet(memoryValue, maxChars);
    const positiveInt = (currentValue, memoryValue) => {
      const current = Math.max(0, Math.round(Number(currentValue || 0)));
      if (current > 0) return current;
      const remembered = Math.max(0, Math.round(Number(memoryValue || 0)));
      return remembered > 0 ? remembered : 0;
    };
    return {
      ...baseWithCreativeRecall,
      screenplayProjectId: pick(base.screenplayProjectId, memoryProject.projectId, 96),
      screenplayDocumentRevisionId: pick(base.screenplayDocumentRevisionId, memoryProject.documentRevisionId, 96),
      screenplayAnchorSceneLabel: pick(base.screenplayAnchorSceneLabel, memoryProject.sceneLabel, 120),
      screenplayAct: pick(base.screenplayAct, memoryProject.act, 120),
      screenplaySceneObjective: pick(base.screenplaySceneObjective, memoryProject.sceneObjective, 280),
      screenplaySceneSummary: pick(base.screenplaySceneSummary, memoryProject.sceneSummary, 280),
      screenplayCurrentBeat: pick(base.screenplayCurrentBeat, memoryProject.currentBeat, 220),
      screenplayLogline: pick(base.screenplayLogline, memoryProject.logline, 280),
      screenplayThemeArgument: pick(base.screenplayThemeArgument, memoryProject.themeArgument, 280),
      screenplayCentralQuestion: pick(base.screenplayCentralQuestion, memoryProject.centralQuestion, 280),
      screenplayProtagonistWant: pick(base.screenplayProtagonistWant, memoryProject.protagonistWant, 240),
      screenplayProtagonistNeed: pick(base.screenplayProtagonistNeed, memoryProject.protagonistNeed, 240),
      screenplayAntagonisticForce: pick(base.screenplayAntagonisticForce, memoryProject.antagonisticForce, 260),
      screenplayEndingImage: pick(base.screenplayEndingImage, memoryProject.endingImage, 240),
      screenplayFeatureSequence: pick(base.screenplayFeatureSequence, memoryProject.featureSequence, 220),
      screenplayFeatureObligation: pick(base.screenplayFeatureObligation, memoryProject.featureObligation, 280),
      screenplayActPressureState: pick(base.screenplayActPressureState, memoryProject.actPressureState, 280),
      screenplayCharacterArcState: pick(base.screenplayCharacterArcState, memoryProject.characterArcState, 280),
      screenplayLastSceneOutcome: pick(base.screenplayLastSceneOutcome, memoryProject.lastSceneOutcome, 240),
      screenplayNextScenePlan: pick(base.screenplayNextScenePlan, memoryProject.nextScenePlan, 340),
      screenplayDraftExcerpt: normalizeTalkMultilineSnippet(base.screenplayDraftExcerpt, 6_000) ||
        normalizeTalkMultilineSnippet(memoryProject.lastWritePreview, 1_800),
      screenplayNextSceneMoves: mergeTalkMomentumRepairContextList(base.screenplayNextSceneMoves, memoryProject.nextSceneMoves, 5, 180),
      screenplayNextThreeTurns: mergeTalkMomentumRepairContextList(base.screenplayNextThreeTurns, memoryProject.nextThreeTurns, 3, 180),
      screenplayActThreePayoffPath: mergeTalkMomentumRepairContextList(base.screenplayActThreePayoffPath, memoryProject.actThreePayoffPath, 5, 200),
      screenplayBeatSequence: mergeTalkMomentumRepairContextList(base.screenplayBeatSequence, memoryProject.beatSequence, 8, 180),
      screenplayCharacterFocus: mergeTalkMomentumRepairContextList(base.screenplayCharacterFocus, memoryProject.characterFocus, 8, 120),
      screenplayUnresolvedSetups: mergeTalkMomentumRepairContextList(base.screenplayUnresolvedSetups, memoryProject.unresolvedSetups, 8, 220),
      screenplayUnresolvedStoryThreads: mergeTalkMomentumRepairContextList(base.screenplayUnresolvedStoryThreads, memoryProject.unresolvedStoryThreads, 8, 220),
      screenplayCharacterArcTurns: mergeTalkMomentumRepairContextList(base.screenplayCharacterArcTurns, memoryProject.characterArcTurns, 6, 180),
      screenplayImageMotifs: mergeTalkMomentumRepairContextList(base.screenplayImageMotifs, memoryProject.imageMotifs, 6, 140),
      screenplayContinuityNotes: mergeTalkMomentumRepairContextList(base.screenplayContinuityNotes, memoryProject.continuityNotes, 8, 220),
      screenplayCorrectedTerms: mergeTalkMomentumRepairContextList(base.screenplayCorrectedTerms, memoryProject.correctedTerms, 8, 120),
      screenplayCorrectionReplacements: mergeTalkMomentumRepairContextList(
        base.screenplayCorrectionReplacements,
        memoryProject.correctionReplacements,
        8,
        160
      ),
      screenplayEmotionalContinuity: pick(base.screenplayEmotionalContinuity, memoryProject.emotionalContinuity, 280),
      screenplayPageCount: positiveInt(base.screenplayPageCount, memoryProject.pageCount),
      screenplayTargetPages: positiveInt(base.screenplayTargetPages, memoryProject.targetPages),
    };
  }

  async function attemptStructuralScreenplayAnalysisRepairPass({
    initialQuality = null,
    rawReply = "",
    transcript = "",
    studioMeta = null,
    chatModelPlan = null,
    chatTemperature = 0.3,
    chatMaxTokens = 1_000,
    rid = "",
  } = {}) {
    if (!initialQuality?.applicable || initialQuality.ok) return null;
    const modelReason = String(chatModelPlan?.reason || "").trim().toLowerCase();
    const messages = buildStructuralScreenplayRepairMessages({
      modelReason,
      userRequest: transcript,
      weakDraft: rawReply,
      quality: initialQuality,
      studioMeta,
    });
    if (!messages.length) return null;

    const startedAt = Date.now();
    try {
      const repairTokenCap = modelReason === "screenplay_feature_architecture" ? 2_600 : 1_400;
      const repairResult = await chatSupplier.chat({
        model: String(chatModelPlan?.repairModel || chatModelPlan?.model || ""),
        temperature: Math.min(0.35, Math.max(0, Number(chatTemperature || 0.3))),
        maxTokens: Math.max(700, Math.min(repairTokenCap, Number(chatMaxTokens || 1_000))),
        messages,
        apiMode: String(chatModelPlan?.repairApiMode || chatModelPlan?.apiMode || "responses"),
        reasoningEffort: String(chatModelPlan?.repairReasoningEffort || chatModelPlan?.reasoningEffort || "medium"),
        fallbackModel: String(chatModelPlan?.repairFallbackModel || chatModelPlan?.fallbackModel || ""),
      });
      const elapsedMs = Date.now() - startedAt;
      const metadata = {
        elapsedMs,
        usage: repairResult?.usage || null,
        fallbackUsed: Boolean(repairResult?.fallbackUsed),
        model: String(repairResult?.model || ""),
        apiMode: String(repairResult?.apiMode || ""),
        reasoningEffort: String(repairResult?.reasoningEffort || ""),
      };
      if (!repairResult?.response?.ok) {
        return { ...metadata, repaired: false, outcome: "supplier_failed" };
      }
      let payload;
      try {
        payload = JSON.parse(String(repairResult.rawText || ""));
      } catch {
        return { ...metadata, repaired: false, outcome: "invalid_json" };
      }
      const candidateReply = normalizeTalkMultilineSnippet(
        payload?.choices?.[0]?.message?.content || "",
        10_000
      );
      const candidateQuality = evaluateStructuralScreenplayReply({
        reply: candidateReply,
        modelReason,
      });
      if (!candidateReply || !shouldAcceptStructuralRepair(initialQuality, candidateQuality)) {
        logger.log(
          `[${rid}] structural_analysis_repair rejected initial=${Number(initialQuality?.score || 0).toFixed(2)} candidate=${Number(candidateQuality?.score || 0).toFixed(2)}`
        );
        return {
          ...metadata,
          repaired: false,
          outcome: "not_improved",
          quality: candidateQuality,
        };
      }
      logger.log(
        `[${rid}] structural_analysis_repair accepted reason=${modelReason} initial=${Number(initialQuality?.score || 0).toFixed(2)} candidate=${Number(candidateQuality?.score || 0).toFixed(2)} passed=${candidateQuality.ok ? 1 : 0}`
      );
      return {
        ...metadata,
        repaired: true,
        outcome: candidateQuality.ok ? "repaired_pass" : "improved",
        reply: candidateReply,
        quality: candidateQuality,
      };
    } catch (err) {
      logger.log(
        `[${rid}] structural_analysis_repair error=${normalizeSnippet(String(err?.message || err || "unknown"), 180)}`
      );
      return {
        repaired: false,
        outcome: "error",
        elapsedMs: Date.now() - startedAt,
        usage: null,
        fallbackUsed: false,
      };
    }
  }

  async function attemptTalkMomentumRescueRepairPass({
    currentOutput = null,
    rawReply = "",
    transcript = "",
    studioMeta = null,
    chatModelPlan = null,
    chatTemperature = 0.4,
    chatMaxTokens = 1_200,
    rid = "",
  } = {}) {
    if (String(studioMeta?.screenplayTarget || "").trim().toLowerCase() === "page") return null;
    if (!shouldAttemptTalkMomentumRescueRepairPass(currentOutput)) return null;
    if (typeof buildTalkScreenplayOutput !== "function") return null;

    const failedReason = normalizeSnippet(
      currentOutput?.quality?.reason || currentOutput?.source || "low_momentum_rescue_quality",
      120
    );
    const repairDirectives = normalizeTalkRepairList(
      currentOutput?.quality?.repair_directives || currentOutput?.quality?.repairDirectives || [],
      5,
      220
    );
    const userRequest = normalizeTalkMultilineSnippet(transcript, 1_400);
    const weakDraft = normalizeTalkMultilineSnippet(rawReply, 2_400);
    if (!userRequest && !weakDraft) return null;

    const screenplayAct = normalizeSnippet(studioMeta?.screenplayAct || studioMeta?.screenplay_act, 120);
    const screenplayFeatureSequence = normalizeSnippet(
      studioMeta?.screenplayFeatureSequence || studioMeta?.screenplay_feature_sequence,
      160
    );
    const screenplayFeatureObligation = normalizeSnippet(
      studioMeta?.screenplayFeatureObligation || studioMeta?.screenplay_feature_obligation,
      220
    );
    const screenplaySceneObjective = normalizeSnippet(
      studioMeta?.screenplaySceneObjective || studioMeta?.screenplay_scene_objective,
      220
    );
    const screenplayCurrentBeat = normalizeSnippet(
      studioMeta?.screenplayCurrentBeat || studioMeta?.screenplay_current_beat,
      220
    );
    const screenplayActPressureState = normalizeSnippet(
      studioMeta?.screenplayActPressureState || studioMeta?.screenplay_act_pressure_state,
      220
    );
    const screenplayLastSceneOutcome = normalizeSnippet(
      studioMeta?.screenplayLastSceneOutcome || studioMeta?.screenplay_last_scene_outcome,
      220
    );
    const screenplayCharacterArcState = normalizeSnippet(
      studioMeta?.screenplayCharacterArcState || studioMeta?.screenplay_character_arc_state,
      220
    );
    const screenplayProtagonistWant = normalizeSnippet(
      studioMeta?.screenplayProtagonistWant || studioMeta?.screenplay_protagonist_want,
      200
    );
    const screenplayProtagonistNeed = normalizeSnippet(
      studioMeta?.screenplayProtagonistNeed || studioMeta?.screenplay_protagonist_need,
      200
    );
    const screenplayAntagonisticForce = normalizeSnippet(
      studioMeta?.screenplayAntagonisticForce || studioMeta?.screenplay_antagonistic_force,
      200
    );
    const screenplayEndingImage = normalizeSnippet(
      studioMeta?.screenplayEndingImage || studioMeta?.screenplay_ending_image,
      180
    );
    const screenplayNextThreeTurns = normalizeTalkRepairList(
      studioMeta?.screenplayNextThreeTurns || studioMeta?.screenplay_next_three_turns,
      3,
      180
    );
    const screenplayNextSceneMoves = normalizeTalkRepairList(
      studioMeta?.screenplayNextSceneMoves || studioMeta?.screenplay_next_scene_moves,
      5,
      180
    );
    const screenplayUnresolvedSetups = normalizeTalkRepairList(
      studioMeta?.screenplayUnresolvedSetups || studioMeta?.screenplay_unresolved_setups,
      4,
      200
    );
    const screenplayUnresolvedStoryThreads = normalizeTalkRepairList(
      studioMeta?.screenplayUnresolvedStoryThreads || studioMeta?.screenplay_unresolved_story_threads,
      4,
      200
    );
    const screenplayImageMotifs = normalizeTalkRepairList(
      studioMeta?.screenplayImageMotifs || studioMeta?.screenplay_image_motifs,
      4,
      140
    );
    const screenplayCharacterArcTurns = normalizeTalkRepairList(
      studioMeta?.screenplayCharacterArcTurns || studioMeta?.screenplay_character_arc_turns,
      4,
      180
    );
    const screenplayActThreePayoffPath = normalizeTalkRepairList(
      studioMeta?.screenplayActThreePayoffPath || studioMeta?.screenplay_act_three_payoff_path,
      4,
      180
    );
    const screenplayCharacterFocus = normalizeTalkRepairList(
      studioMeta?.screenplayCharacterFocus || studioMeta?.screenplay_character_focus,
      4,
      80
    );
    const screenplayAcceptedPageContinuity = normalizeTalkRepairList(
      studioMeta?.screenplayAcceptedPageContinuity || studioMeta?.screenplay_accepted_page_continuity,
      3,
      240
    );
    const screenplayRetrievedStoryMoments = normalizeTalkRepairList(
      studioMeta?.screenplayRetrievedStoryMoments || studioMeta?.screenplay_retrieved_story_moments,
      4,
      220
    );
    const rawAcceptedCausalFacts = studioMeta?.screenplayAcceptedCausalFacts ||
      studioMeta?.screenplay_accepted_causal_facts ||
      studioMeta?.acceptedCausalFacts ||
      studioMeta?.accepted_causal_facts;
    const screenplayAcceptedCausalFacts = Array.isArray(rawAcceptedCausalFacts)
      ? rawAcceptedCausalFacts.slice(0, 8).map((item) => ({
        kind: normalizeSnippet(item?.kind ?? item?.type, 48),
        fact: normalizeSnippet(item?.fact ?? item?.value ?? item?.text, 220),
        sourceSceneHeading: normalizeSnippet(item?.sourceSceneHeading ?? item?.source_scene_heading, 140),
        sourceAct: normalizeSnippet(item?.sourceAct ?? item?.source_act, 80),
        ageInScenes: Math.max(0, Math.round(Number(item?.ageInScenes ?? item?.age_in_scenes ?? 0))),
      })).filter((item) => item.kind && item.fact)
      : [];
    const screenplayQuestionEffectiveness = Array.isArray(
      studioMeta?.screenplayQuestionEffectiveness ||
      studioMeta?.screenplay_question_effectiveness
    )
      ? (
        studioMeta?.screenplayQuestionEffectiveness ||
        studioMeta?.screenplay_question_effectiveness
      ).slice(0, 24)
      : [];
    const screenplayStoryMovePreferenceOverrides = Array.isArray(
      studioMeta?.screenplayStoryMovePreferenceOverrides ||
      studioMeta?.screenplay_story_move_preference_overrides
    )
      ? (
        studioMeta?.screenplayStoryMovePreferenceOverrides ||
        studioMeta?.screenplay_story_move_preference_overrides
      ).slice(0, 9)
      : [];
    const rawDueStoryThread = studioMeta?.screenplayDueStoryThread ||
      studioMeta?.screenplay_due_story_thread ||
      studioMeta?.dueStoryThread ||
      studioMeta?.due_story_thread;
    const screenplayDueStoryThread = rawDueStoryThread && typeof rawDueStoryThread === "object" && !Array.isArray(rawDueStoryThread)
      ? {
        kind: normalizeSnippet(rawDueStoryThread.kind, 24),
        setup: normalizeSnippet(rawDueStoryThread.setup, 220),
        promisedPayoff: normalizeSnippet(rawDueStoryThread.promisedPayoff || rawDueStoryThread.promised_payoff, 220),
        sourceSceneHeading: normalizeSnippet(rawDueStoryThread.sourceSceneHeading || rawDueStoryThread.source_scene_heading, 140),
        sourceSceneSummary: normalizeSnippet(rawDueStoryThread.sourceSceneSummary || rawDueStoryThread.source_scene_summary, 220),
        sourceSceneOutcome: normalizeSnippet(rawDueStoryThread.sourceSceneOutcome || rawDueStoryThread.source_scene_outcome, 220),
        sourceAct: normalizeSnippet(rawDueStoryThread.sourceAct || rawDueStoryThread.source_act, 80),
        ageInScenes: Math.max(0, Math.round(Number(rawDueStoryThread.ageInScenes || rawDueStoryThread.age_in_scenes || 0))),
      }
      : null;
    const storyMoveLibraryLines = selectStoryMoveLibraryLinesForContext({
      transcript: userRequest,
      act: screenplayAct,
      featureSequence: screenplayFeatureSequence,
      featureObligation: screenplayFeatureObligation,
      currentBeat: screenplayCurrentBeat,
      actPressureState: screenplayActPressureState,
      characterArcState: screenplayCharacterArcState,
      problem: failedReason,
      nextThreeTurns: screenplayNextThreeTurns,
      nextSceneMoves: screenplayNextSceneMoves,
      unresolvedSetups: screenplayUnresolvedSetups,
      unresolvedStoryThreads: screenplayUnresolvedStoryThreads,
      actThreePayoffPath: screenplayActThreePayoffPath,
      imageMotifs: screenplayImageMotifs,
      causalFacts: screenplayAcceptedCausalFacts,
      dueStoryThread: screenplayDueStoryThread,
      questionEffectiveness: screenplayQuestionEffectiveness,
      storyMovePreferenceOverrides: screenplayStoryMovePreferenceOverrides,
    });
    const rankedRescueMoves = rankStoryRescueMovesForContext({
      transcript: userRequest,
      intent: "momentum_rescue",
      problem: failedReason,
      act: screenplayAct,
      featureSequence: screenplayFeatureSequence,
      featureObligation: screenplayFeatureObligation,
      sceneObjective: screenplaySceneObjective,
      currentBeat: screenplayCurrentBeat,
      lastSceneOutcome: screenplayLastSceneOutcome,
      actPressureState: screenplayActPressureState,
      characterArcState: screenplayCharacterArcState,
      protagonistWant: screenplayProtagonistWant,
      protagonistNeed: screenplayProtagonistNeed,
      antagonisticForce: screenplayAntagonisticForce,
      endingImage: screenplayEndingImage,
      characters: screenplayCharacterFocus,
      nextThreeTurns: screenplayNextThreeTurns,
      nextSceneMoves: screenplayNextSceneMoves,
      unresolvedSetups: screenplayUnresolvedSetups,
      unresolvedStoryThreads: screenplayUnresolvedStoryThreads,
      characterArcTurns: screenplayCharacterArcTurns,
      actThreePayoffPath: screenplayActThreePayoffPath,
      imageMotifs: screenplayImageMotifs,
      acceptedPages: screenplayAcceptedPageContinuity,
      storyMoments: screenplayRetrievedStoryMoments,
      causalFacts: screenplayAcceptedCausalFacts,
      dueStoryThread: screenplayDueStoryThread,
      questionEffectiveness: screenplayQuestionEffectiveness,
      storyMovePreferenceOverrides: screenplayStoryMovePreferenceOverrides,
    });
    const failedRescueRepair = buildFailedStoryRescueRepair({
      act: screenplayAct,
      featureSequence: screenplayFeatureSequence,
      questionEffectiveness: screenplayQuestionEffectiveness,
      storyMovePreferenceOverrides: screenplayStoryMovePreferenceOverrides,
    }, { rankedMoves: rankedRescueMoves });
    const contextLines = [
      screenplayAct ? `ACT: ${screenplayAct}` : "",
      screenplayFeatureSequence ? `FEATURE_SEQUENCE: ${screenplayFeatureSequence}` : "",
      screenplayFeatureObligation ? `STRUCTURAL_OBLIGATION: ${screenplayFeatureObligation}` : "",
      screenplaySceneObjective ? `SCENE_OBJECTIVE: ${screenplaySceneObjective}` : "",
      screenplayCurrentBeat ? `CURRENT_BEAT: ${screenplayCurrentBeat}` : "",
      screenplayActPressureState ? `ACT_PRESSURE: ${screenplayActPressureState}` : "",
      screenplayLastSceneOutcome ? `LAST_SCENE_OUTCOME: ${screenplayLastSceneOutcome}` : "",
      screenplayCharacterArcState ? `CHARACTER_ARC_PRESSURE: ${screenplayCharacterArcState}` : "",
      screenplayDueStoryThread?.setup ? `DUE_STORY_THREAD: ${screenplayDueStoryThread.setup}` : "",
      screenplayDueStoryThread?.promisedPayoff ? `DUE_STORY_PAYOFF: ${screenplayDueStoryThread.promisedPayoff}` : "",
      screenplayDueStoryThread?.sourceSceneHeading ? `DUE_STORY_SOURCE: ${screenplayDueStoryThread.sourceSceneHeading}` : "",
      screenplayDueStoryThread?.ageInScenes ? `DUE_STORY_AGE: ${screenplayDueStoryThread.ageInScenes} accepted scenes` : "",
      ...screenplayAcceptedCausalFacts.slice(0, 3).map((item) => (
        `BINDING_CAUSAL_FACT: ${item.kind} | ${item.fact}`
      )),
      ...screenplayAcceptedPageContinuity.map((item) => `ACCEPTED_PAGE_CONTINUITY: ${item}`),
      ...screenplayRetrievedStoryMoments.map((item) => `AUTHORITATIVE_STORY_MEMORY: ${item}`),
      failedRescueRepair ? `FAILED_RESCUE_REPAIR: ${failedRescueRepair.promptDirective}` : "",
      ...rankedRescueMoves.map((item) => `RANKED_RESCUE_MOVE: ${formatRankedStoryRescueMoveLine(item)}`),
      ...storyMoveLibraryLines.map((item) => `STORY_MOVE_LIBRARY: ${item}`),
      ...screenplayNextThreeTurns.map((item) => `NEXT_TURN: ${item}`),
      ...screenplayNextSceneMoves.map((item) => `NEXT_SCENE_MOVE: ${item}`),
      ...screenplayUnresolvedSetups.map((item) => `SETUP_TO_CARRY_OR_PAY: ${item}`),
      ...screenplayUnresolvedStoryThreads.map((item) => `UNRESOLVED_THREAD: ${item}`),
      ...screenplayImageMotifs.map((item) => `IMAGE_MOTIF: ${item}`),
    ].filter(Boolean).slice(0, 24);
    const repairMessages = [
      {
        role: "system",
        content: [
          "You are Clementine's writer-block repair pass.",
          "The previous answer failed the live momentum-rescue quality gate.",
          "Return Clementine's final answer only: no JSON, no markdown table, no apology, no long option menu.",
          "Diagnose the precise story blockage silently, then answer with one strongest next move.",
          "A passing answer must include a pressure engine, a decisive next beat, emotional cost, and a tiny playable micro-beat in clean screenplay/Fountain shape.",
          "When RANKED_RESCUE_MOVE is supplied, execute rank_1 unless it conflicts with a writer correction; preserve its named evidence and satisfy its success check.",
          "When FAILED_RESCUE_REPAIR is supplied, acknowledge what failed in one warm natural sentence, then immediately change to rank_1. Never expose internal labels, scores, classifiers, or memory machinery.",
          "When DUE_STORY_THREAD is supplied, pressure or pay that accepted-page obligation before inventing a replacement thread.",
          "When BINDING_CAUSAL_FACT is supplied, continue its consequence. Never make a character unknow a revelation, restore an earlier relationship state, or undo an irreversible event offscreen.",
          "Use the STORY_MOVE_LIBRARY lines when supplied; pick the one engine that best solves the failed gate and dramatize it as action, tactical dialogue, cost, and exit image.",
          "Use act-aware story intelligence: Act I commits, Act II reverses/traps/costs, Act III pays off setup through changed behavior.",
          "If the user is only brainstorming, still give one playable beat they can write today, then at most two short alternate forks.",
          "Treat danger or harm as fictional story content only; never provide real-world instructions to hurt anyone.",
          "Be emotionally intelligent, concise, specific, cinematic, and practical.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "FAILED_GATE: guard_momentum_rescue_quality",
          failedReason ? `FAILED_REASON: ${failedReason}` : "",
          repairDirectives.length ? "REPAIR_DIRECTIVES:" : "",
          ...repairDirectives.map((line) => `- ${line}`),
          contextLines.length ? "STORY_CONTEXT:" : "",
          ...contextLines.map((line) => `- ${line}`),
          "",
          "USER_REQUEST:",
          userRequest || "(not supplied)",
          "",
          "WEAK_DRAFT:",
          weakDraft || "(empty)",
          "",
          "Repair this into a concrete writer-block response now. Keep it brief, but make it playable.",
        ].filter((line) => line !== "").join("\n"),
      },
    ];
    const startedAt = Date.now();
    try {
      if (process.env.NODE_ENV !== "production") {
        const promptChars = repairMessages.reduce((sum, message) => sum + String(message?.content || "").length, 0);
        logger.log(
          `[${rid}] momentum_rescue_repair_pass prompt_chars=${promptChars} failed_draft_chars=${weakDraft.length} context_lines=${contextLines.length} reason=${failedReason || "unknown"}`
        );
      }
      const requestedTemperature = Number(chatTemperature);
      const repairTemperature = Math.min(0.45, Math.max(0, Number.isFinite(requestedTemperature) ? requestedTemperature : 0.4));
      const requestedMaxTokens = Number(chatMaxTokens);
      const repairMaxTokens = Math.max(512, Math.min(1_800, Number.isFinite(requestedMaxTokens) ? requestedMaxTokens : 1_200));
      const repairResult = await chatSupplier.chat({
        model: String(chatModelPlan?.repairModel || chatModelPlan?.model || ""),
        temperature: repairTemperature,
        maxTokens: repairMaxTokens,
        messages: repairMessages,
        apiMode: String(chatModelPlan?.repairApiMode || chatModelPlan?.apiMode || "chat_completions"),
        reasoningEffort: String(chatModelPlan?.repairReasoningEffort || ""),
        fallbackModel: String(chatModelPlan?.repairFallbackModel || ""),
      });
      const repairMs = Date.now() - startedAt;
      if (repairResult?.fallbackUsed) {
        logger.log(
          `[${rid}] momentum_rescue_repair_pass structural_fallback model=${String(repairResult?.model || "unknown")}`
        );
      }
      if (!repairResult?.response?.ok) {
        logger.log(
          `[${rid}] momentum_rescue_repair_pass failed status=${Number(repairResult?.response?.status || 0)}`
        );
        return { repaired: false, elapsedMs: repairMs, outcome: "supplier_failed" };
      }
      let repairJson;
      try {
        repairJson = JSON.parse(String(repairResult.rawText || ""));
      } catch (_err) {
        logger.log(`[${rid}] momentum_rescue_repair_pass invalid_json=1`);
        return { repaired: false, elapsedMs: repairMs, outcome: "invalid_json" };
      }
      const candidateReply = normalizeTalkMultilineSnippet(
        repairJson?.choices?.[0]?.message?.content || "",
        8_000
      );
      const repairedOutput = buildTalkScreenplayOutput({
        reply: candidateReply,
        transcript,
        studioMeta,
      });
      if (
        !candidateReply ||
        String(repairedOutput?.target || "").trim().toLowerCase() !== "voice_pin" ||
        String(repairedOutput?.source || "").trim().toLowerCase() === "guard_momentum_rescue_quality" ||
        !repairedOutput?.quality?.ok
      ) {
        logger.log(`[${rid}] momentum_rescue_repair_pass rejected_by_gate=1`);
        return { repaired: false, elapsedMs: repairMs, outcome: "rejected_by_gate" };
      }
      const quality = repairedOutput.quality && typeof repairedOutput.quality === "object"
        ? { ...repairedOutput.quality }
        : {};
      const carriedRepairDirectives = Array.isArray(currentOutput?.quality?.repair_directives)
        ? currentOutput.quality.repair_directives
          .map((item) => normalizeSnippet(item, 220))
          .filter(Boolean)
          .slice(0, 5)
        : [];
      quality.source = "repair_pass_momentum_rescue";
      quality.confidence = "repaired";
      if (carriedRepairDirectives.length) {
        quality.repair_directives = carriedRepairDirectives;
      }
      logger.log(
        `[${rid}] momentum_rescue_repair_pass repaired=1 chars=${candidateReply.length}`
      );
      return {
        repaired: true,
        elapsedMs: repairMs,
        outcome: "repaired",
        reply: candidateReply,
        output: {
          ...repairedOutput,
          source: "repair_pass_momentum_rescue",
          quality,
        },
      };
    } catch (err) {
      logger.log(
        `[${rid}] momentum_rescue_repair_pass error=${normalizeSnippet(String(err?.message || err || "unknown"), 180)}`
      );
      return { repaired: false, elapsedMs: Date.now() - startedAt, outcome: "error" };
    }
  }

  async function attemptTalkScreenplayRepairPass({
    currentOutput = null,
    rawReply = "",
    transcript = "",
    studioMeta = null,
    chatModelPlan = null,
    chatTemperature = 0.4,
    chatMaxTokens = 1_500,
    screenplayRequestedPages = 0,
    rid = "",
  } = {}) {
    if (typeof applyTalkScreenplayRepairCandidate !== "function") return null;
    if (String(studioMeta?.screenplayTarget || "").trim().toLowerCase() !== "page") return null;
    const currentSource = String(currentOutput?.source || "").trim().toLowerCase();
    const currentTarget = String(currentOutput?.target || "").trim().toLowerCase();
    if (currentTarget === "page" && !currentSource.startsWith("guard_")) return null;
    if (currentSource && !currentSource.startsWith("guard_")) return null;

    const failedReason = normalizeSnippet(currentOutput?.quality?.reason || currentSource || "guard_low_page_quality", 120);
    const requestedPageCount = Math.max(
      0,
      Math.min(
        30,
        Math.round(Number(
          screenplayRequestedPages ||
            resolveTalkScreenplayRequestedPageBatch({ transcript, studioMeta }) ||
            0
        ))
      )
    );
    const requestedPages = requestedPageCount > 0 ? String(requestedPageCount) : "";
    const failedDraftLimit = (() => {
      if (failedReason === "outline_or_craft_artifact" || failedReason === "non_screenplay_output") return 1_800;
      if (failedReason === "summary_like_page_batch") return 2_800;
      if (failedReason === "thin_long_page_batch" || failedReason === "underfilled_page_text") return 3_400;
      if (failedReason === "accepted_canon_contradiction") return 3_600;
      if (requestedPageCount >= 4) return 3_600;
      return 2_600;
    })();
    const featureLineLimit = (() => {
      if (isNextSceneExecutionBriefRepairReason(failedReason)) return 18;
      if (failedReason === "missing_act_three_payoff") return 12;
      if (failedReason.startsWith("missing_act_")) return 10;
      if (failedReason === "missing_character_arc_memory") return 10;
      if (failedReason === "summary_like_page_batch" || failedReason === "thin_long_page_batch") return 8;
      if (failedReason === "accepted_canon_contradiction") return 16;
      return 6;
    })();
    const failedDraft = normalizeTalkMultilineSnippet(rawReply, failedDraftLimit);
    const userRequest = normalizeTalkMultilineSnippet(transcript, 1_200);
    if (!failedDraft && !userRequest) return null;
    const sceneAnchor = normalizeSnippet(
      studioMeta?.screenplayAnchorSceneLabel || studioMeta?.screenplaySceneLabel || studioMeta?.sceneLabel,
      180
    );
    const normalizeRepairList = (items, maxItems = 5, maxChars = 200) => {
      const source = Array.isArray(items)
        ? items
        : String(items || "").trim()
          ? String(items).split(/\r?\n|;/)
          : [];
      const out = [];
      const seen = new Set();
      for (const item of source) {
        const clean = normalizeSnippet(item, maxChars);
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= maxItems) break;
      }
      return out;
    };
    const repairDirectives = normalizeRepairList(
      currentOutput?.quality?.repair_directives || currentOutput?.quality?.repairDirectives || [],
      5,
      220
    );
    const screenplayAcceptedCausalFacts = normalizeAcceptedCausalFacts(
      studioMeta?.screenplayAcceptedCausalFacts ??
      studioMeta?.screenplay_accepted_causal_facts ??
      studioMeta?.acceptedCausalFacts ??
      studioMeta?.accepted_causal_facts ??
      []
    );
    const screenplayCanonViolations = Array.isArray(currentOutput?.quality?.canon_violations)
      ? currentOutput.quality.canon_violations.slice(0, 3).map((item) => ({
        type: normalizeSnippet(item?.type, 48),
        excerpt: normalizeSnippet(item?.excerpt, 260),
      })).filter((item) => item.type && item.excerpt)
      : [];
    const screenplayAct = normalizeSnippet(studioMeta?.screenplayAct || studioMeta?.screenplay_act, 120);
    const screenplayFeatureSequence = normalizeSnippet(
      studioMeta?.screenplayFeatureSequence || studioMeta?.screenplay_feature_sequence,
      160
    );
    const screenplayFeatureObligation = normalizeSnippet(
      studioMeta?.screenplayFeatureObligation || studioMeta?.screenplay_feature_obligation,
      220
    );
    const screenplaySceneObjective = normalizeSnippet(
      studioMeta?.screenplaySceneObjective || studioMeta?.screenplay_scene_objective,
      220
    );
    const screenplayCurrentBeat = normalizeSnippet(
      studioMeta?.screenplayCurrentBeat || studioMeta?.screenplay_current_beat,
      220
    );
    const screenplayCharacterArcState = normalizeSnippet(
      studioMeta?.screenplayCharacterArcState || studioMeta?.screenplay_character_arc_state,
      220
    );
    const screenplayCharacterArcMemory = studioMeta?.screenplayCharacterArcMemory &&
      typeof studioMeta.screenplayCharacterArcMemory === "object"
      ? studioMeta.screenplayCharacterArcMemory
      : null;
    const screenplayCharacterArcMemoryLines = screenplayCharacterArcMemory
      ? [
        ["CHARACTER_ARC_WANT", screenplayCharacterArcMemory.want],
        ["CHARACTER_ARC_NEED", screenplayCharacterArcMemory.need],
        ["CHARACTER_ARC_WOUND", screenplayCharacterArcMemory.wound],
        ["CHARACTER_ARC_FALSE_BELIEF", screenplayCharacterArcMemory.falseBelief || screenplayCharacterArcMemory.false_belief],
        ["CHARACTER_ARC_RELATIONSHIP_PRESSURE", screenplayCharacterArcMemory.relationshipPressure || screenplayCharacterArcMemory.relationship_pressure],
        ["CHARACTER_ARC_CURRENT_TACTIC", screenplayCharacterArcMemory.currentTactic || screenplayCharacterArcMemory.current_tactic],
        ["CHARACTER_ARC_NEXT_EMOTIONAL_TURN", screenplayCharacterArcMemory.nextEmotionalTurn || screenplayCharacterArcMemory.next_emotional_turn],
      ]
        .map(([label, value]) => {
          const clean = normalizeSnippet(value, 180);
          return clean ? `${label}: ${clean}` : "";
        })
        .filter(Boolean)
      : [];
    const screenplayActPressureState = normalizeSnippet(
      studioMeta?.screenplayActPressureState || studioMeta?.screenplay_act_pressure_state,
      220
    );
    const screenplayLastSceneOutcome = normalizeSnippet(
      studioMeta?.screenplayLastSceneOutcome || studioMeta?.screenplay_last_scene_outcome,
      220
    );
    const screenplayEndingImage = normalizeSnippet(
      studioMeta?.screenplayEndingImage || studioMeta?.screenplay_ending_image,
      220
    );
    const screenplayNextSceneMoves = normalizeRepairList(
      studioMeta?.screenplayNextSceneMoves || studioMeta?.screenplay_next_scene_moves,
      5,
      180
    );
    const screenplayNextThreeTurns = normalizeRepairList(
      studioMeta?.screenplayNextThreeTurns || studioMeta?.screenplay_next_three_turns,
      3,
      180
    );
    const screenplayActThreePayoffPath = normalizeRepairList(
      studioMeta?.screenplayActThreePayoffPath || studioMeta?.screenplay_act_three_payoff_path,
      4,
      200
    );
    const screenplayUnresolvedSetups = normalizeRepairList(
      studioMeta?.screenplayUnresolvedSetups || studioMeta?.screenplay_unresolved_setups,
      4,
      200
    );
    const screenplayUnresolvedStoryThreads = normalizeRepairList(
      studioMeta?.screenplayUnresolvedStoryThreads || studioMeta?.screenplay_unresolved_story_threads,
      4,
      200
    );
    const screenplayCharacterArcTurns = normalizeRepairList(
      studioMeta?.screenplayCharacterArcTurns || studioMeta?.screenplay_character_arc_turns,
      4,
      180
    );
    const screenplayImageMotifs = normalizeRepairList(
      studioMeta?.screenplayImageMotifs || studioMeta?.screenplay_image_motifs,
      4,
      140
    );
    const nextSceneExecutionBriefLines = buildTalkScreenplayExecutionBriefLines(studioMeta);
    const nextSceneExecutionBriefRequired = isNextSceneExecutionBriefRepairReason(failedReason);
    const featureObligationLines = [
      ...screenplayAcceptedCausalFacts.map((item) => `BINDING_CAUSAL_FACT [${item.kind}]: ${item.fact}`),
      ...screenplayCanonViolations.map((item) => `CANON_VIOLATION [${item.type}]: ${item.excerpt}`),
      screenplayAct ? `ACT: ${screenplayAct}` : "",
      screenplayFeatureSequence ? `FEATURE_SEQUENCE: ${screenplayFeatureSequence}` : "",
      screenplayFeatureObligation ? `STRUCTURAL_OBLIGATION: ${screenplayFeatureObligation}` : "",
      screenplaySceneObjective ? `SCENE_OBJECTIVE: ${screenplaySceneObjective}` : "",
      screenplayCurrentBeat ? `CURRENT_BEAT: ${screenplayCurrentBeat}` : "",
      screenplayActPressureState ? `ACT_PRESSURE: ${screenplayActPressureState}` : "",
      screenplayCharacterArcState ? `CHANGED_BEHAVIOR_DUE: ${screenplayCharacterArcState}` : "",
      ...screenplayCharacterArcMemoryLines,
      screenplayLastSceneOutcome ? `LAST_SCENE_OUTCOME: ${screenplayLastSceneOutcome}` : "",
      screenplayEndingImage ? `ENDING_IMAGE_PRESSURE: ${screenplayEndingImage}` : "",
      ...screenplayNextSceneMoves.map((item) => `NEXT_SCENE_MOVE: ${item}`),
      ...screenplayNextThreeTurns.map((item) => `NEXT_TURN: ${item}`),
      ...screenplayActThreePayoffPath.map((item) => `ACT_THREE_PAYOFF: ${item}`),
      ...screenplayUnresolvedSetups.map((item) => `SETUP_TO_CARRY_OR_PAY: ${item}`),
      ...screenplayUnresolvedStoryThreads.map((item) => `UNRESOLVED_THREAD: ${item}`),
      ...screenplayCharacterArcTurns.map((item) => `CHARACTER_ARC_TURN: ${item}`),
      ...screenplayImageMotifs.map((item) => `IMAGE_MOTIF: ${item}`),
    ].filter(Boolean);
    const effectiveFeatureObligationLines = featureObligationLines.slice(0, featureLineLimit);
    const repairMessages = [
      {
        role: "system",
        content: [
          "You are Clementine's screenplay page repair pass.",
          "The previous answer failed the live page-quality gate.",
          "Return only clean playable Fountain screenplay text.",
          "No diagnosis, no markdown, no outline, no placeholders, no strategy note, no permission question.",
          "Use scene heading, action, character cues, dialogue, subtext, visible behavior, escalation, and a turn.",
          sceneAnchor ? `If the scene heading is missing, begin with exactly: ${sceneAnchor}` : "If no scene heading is supplied, create a specific INT./EXT. scene heading.",
          "If Act I context is supplied, dramatize the catalyst/commitment pressure instead of writing a generic setup scene.",
          "If Act II context is supplied, dramatize the active reversal, cost, trap, or false-tactic pressure instead of repeating the premise.",
          "If Act III/finale context is supplied, pay off at least one supplied setup/path through changed behavior and final-image pressure.",
          "If CHARACTER_ARC_* context is supplied, turn want/need/false-belief/tactic into visible behavior on the page.",
          "If NEXT_SCENE_EXECUTION_BRIEF is supplied, execute SCENE_ASSIGNMENT plus at least three support lanes: obstacle, changed behavior, payoff/setup, visual motif, or exit handoff.",
          "If BINDING_CAUSAL_FACT context is supplied, preserve it exactly: do not unknow a revelation, reset a changed relationship, erase an accepted decision, or restore an irreversible loss.",
          "If REPAIR_DIRECTIVES are supplied, satisfy them literally before adding any new invention.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `FAILED_GATE: ${currentSource || "guard_low_page_quality"}`,
          failedReason ? `FAILED_REASON: ${failedReason}` : "",
          requestedPages ? `REQUESTED_PAGES: ${requestedPages}` : "",
          sceneAnchor ? `SCENE_ANCHOR: ${sceneAnchor}` : "",
          repairDirectives.length ? "REPAIR_DIRECTIVES:" : "",
          ...repairDirectives.map((line) => `- ${line}`),
          nextSceneExecutionBriefLines.length ? "NEXT_SCENE_EXECUTION_BRIEF:" : "",
          ...nextSceneExecutionBriefLines.map((line) => `- ${line}`),
          nextSceneExecutionBriefRequired ? "PASSING_REPAIR_REQUIREMENTS:" : "",
          nextSceneExecutionBriefRequired ? "- Spend SCENE_ASSIGNMENT as the immediate page engine." : "",
          nextSceneExecutionBriefRequired ? "- Use at least three support lanes as playable action, dialogue pressure, or changed behavior." : "",
          nextSceneExecutionBriefRequired ? "- Preserve the concrete nouns from the supplied lanes; do not replace them with generic conflict." : "",
          effectiveFeatureObligationLines.length ? "FEATURE_OBLIGATIONS:" : "",
          ...effectiveFeatureObligationLines.map((line) => `- ${line}`),
          "",
          "USER_REQUEST:",
          userRequest || "(not supplied)",
          "",
          "FAILED_DRAFT:",
          failedDraft || "(empty)",
          "",
          "Repair it into usable screenplay pages now. Output only the screenplay text.",
        ].filter((line) => line !== "").join("\n"),
      },
    ];
    const startedAt = Date.now();
    try {
      if (process.env.NODE_ENV !== "production") {
        const promptChars = repairMessages.reduce((sum, message) => sum + String(message?.content || "").length, 0);
        logger.log(
          `[${rid}] screenplay_repair_pass prompt_chars=${promptChars} failed_draft_chars=${failedDraft.length} feature_lines=${effectiveFeatureObligationLines.length}/${featureObligationLines.length} execution_brief_lines=${nextSceneExecutionBriefLines.length} reason=${failedReason || "unknown"}`
        );
      }
      const repairResult = await chatSupplier.chat({
        model: String(chatModelPlan?.repairModel || chatModelPlan?.model || ""),
        temperature: Math.min(0.35, Math.max(0, Number(chatTemperature || 0.4))),
        maxTokens: Math.max(512, Math.min(6_000, Number(chatMaxTokens || 1_500))),
        messages: repairMessages,
        apiMode: String(chatModelPlan?.repairApiMode || chatModelPlan?.apiMode || "chat_completions"),
        reasoningEffort: String(chatModelPlan?.repairReasoningEffort || ""),
        fallbackModel: String(chatModelPlan?.repairFallbackModel || ""),
      });
      const repairMs = Date.now() - startedAt;
      if (repairResult?.fallbackUsed) {
        logger.log(
          `[${rid}] screenplay_repair_pass structural_fallback model=${String(repairResult?.model || "unknown")}`
        );
      }
      if (!repairResult?.response?.ok) {
        logger.log(
          `[${rid}] screenplay_repair_pass failed status=${Number(repairResult?.response?.status || 0)} source=${currentSource || "unknown"}`
        );
        return { repaired: false, elapsedMs: repairMs, outcome: "supplier_failed" };
      }
      let repairJson;
      try {
        repairJson = JSON.parse(String(repairResult.rawText || ""));
      } catch (_err) {
        logger.log(`[${rid}] screenplay_repair_pass invalid_json=1 source=${currentSource || "unknown"}`);
        return { repaired: false, elapsedMs: repairMs, outcome: "invalid_json" };
      }
      const candidateReply = normalizeTalkMultilineSnippet(
        repairJson?.choices?.[0]?.message?.content || "",
        32_000
      );
      const repairedOutput = applyTalkScreenplayRepairCandidate({
        currentOutput,
        candidateReply,
        transcript,
        studioMeta,
      });
      if (!repairedOutput) {
        logger.log(`[${rid}] screenplay_repair_pass rejected_by_gate=1 source=${currentSource || "unknown"}`);
        return { repaired: false, elapsedMs: repairMs, outcome: "rejected_by_gate" };
      }
      logger.log(
        `[${rid}] screenplay_repair_pass repaired=1 source=${currentSource || "unknown"} chars=${candidateReply.length}`
      );
      return {
        repaired: true,
        elapsedMs: repairMs,
        outcome: "repaired",
        reply: normalizeTalkScreenplayText(repairedOutput.text || candidateReply),
        output: repairedOutput,
      };
    } catch (err) {
      logger.log(
        `[${rid}] screenplay_repair_pass error=${normalizeSnippet(String(err?.message || err || "unknown"), 180)}`
      );
      return { repaired: false, elapsedMs: Date.now() - startedAt, outcome: "error" };
    }
  }

  return async function handleTalkRequest(req, res) {
  logger.log(`\n==================== NEW TALK ====================`);

  const reqId = randomUUID().slice(0, 8);
  const rid = req.requestId || reqId;
  const ts = new Date().toISOString();
  const ip = clientIp(req);
  const talkStreamMode = parseTalkStreamMode(req);
  const streamAudioRequested = TALK_STREAM_AUDIO_ENABLED && talkStreamMode === "audio";
  let interactiveVoiceProfile = applyClementineVoiceDirection({
    ...CLEMENTINE_PROFILE.voice,
    provider: INTERACTIVE_TTS_PROVIDER,
  }, "curious_steady");
  // D010: request-scoped ElevenLabs BYOK (Keychain key via headers). Never persist.
  // Does not change INTERACTIVE_TTS_PROVIDER default (openai) when headers absent.
  const byokTts = readElevenLabsByokFromRequest(req);
  if (byokTts.wantsByok) {
    interactiveVoiceProfile = applyClementineVoiceDirection({
      ...interactiveVoiceProfile,
      provider: TTS_KIND_ELEVENLABS_BYOK,
      elevenlabsVoiceId: byokTts.voiceId || interactiveVoiceProfile.elevenlabsVoiceId,
      byokApiKey: byokTts.apiKey,
    }, interactiveVoiceProfile.emotionLane || "curious_steady");
  }
  let thinkingDelayMs = pickThinkingDurationMs();
  const thinkingStartedAt = Date.now();
  let screenplayLearningAnswerContext = null;
  let pendingScreenplayLearningQuestion = null;
  let pendingScreenplayLearningResolution = null;
  let screenplayQuestionPlan = null;
  let deliveredStoryRescueInteraction = null;

  const t0 = Date.now();
  let sttMs = 0, chatMs = 0, ttsMs = 0;
  let debugTranscriptOverride = "";
  let talkTestDebugOfflineMode = false;
  let screenplayQuestionInteraction = null;
  const commitCreativeMemoryAfterTurn = ({
    transcript = "",
    reply = "",
    studioMeta = null,
    screenplayOutput = null,
    sessionStartedAt = null,
    sessionDurationMs = null,
    source = "",
  } = {}) => {
    const screenplayText = screenplayOutput?.target === "page"
      ? normalizeTalkScreenplayText(screenplayOutput?.text || "")
      : "";
    const memoryReply = screenplayText || reply;
    if (!String(transcript || "").trim() && !String(memoryReply || "").trim()) {
      return Promise.resolve(null);
    }
    return Promise.resolve()
      .then(() => recordCreativeMemoryTriggersForRequest(req, {
        transcript,
        reply: memoryReply,
        turnStartedAt: t0,
        studioMeta,
        screenplayOutput,
        sessionStartedAt,
        sessionDurationMs,
        source: source || (screenplayText ? "talk_screenplay_output" : "talk_turn"),
        learningContext: screenplayLearningAnswerContext,
        questionInteraction: screenplayQuestionInteraction || deliveredStoryRescueInteraction,
      }))
      .catch((err) => {
        console.error(`[creative_memory] trigger error rid=${rid}:`, err?.message || err);
        return null;
      });
  };

  const uploadedFile = req.file ||
    req.files?.file?.[0] ||
    req.files?.audio?.[0] ||
    null;
  const uploadedFieldName = uploadedFile
    ? (req.files?.file?.[0] ? "file" : (req.files?.audio?.[0] ? "audio" : "file"))
    : "none";
  const bytesIn = Number(uploadedFile?.size || 0);
  const mimeIn = String(uploadedFile?.mimetype || "unknown");
  const nameIn = String(uploadedFile?.originalname || "unknown");
  logger.log(
    `\n[${new Date().toISOString()}] [${reqId}] POST /talk bytes_in=${bytesIn} mime=${mimeIn} name=${nameIn} field=${uploadedFieldName}`
  );

  try {
    logger.log(`✅ HIT /talk [${rid}] [${ts}] [${ip}]`);
    logger.log(
      `[${rid}] latency_profile stream_mode=${talkStreamMode} stream_audio=${streamAudioRequested ? "1" : "0"} thinking_ms=${thinkingDelayMs}`
    );

    const reqContentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!reqContentType.includes("multipart/form-data")) {
      return res.status(415).json({
        stage: "upload",
        error: "Expected multipart/form-data request.",
      });
    }

    // Multer errors: file too large, etc.
    if (!uploadedFile?.buffer) {
      return res.status(400).json({ stage: "upload", error: "Missing audio file field ('file' or 'audio')." });
    }

    // Validate mimetype (allow octet-stream if curl didn't send a type)
    const mime = (uploadedFile.mimetype || "").toLowerCase();
    const name = (uploadedFile.originalname || "").toLowerCase();
    const allowedExts = [".m4a", ".mp3", ".wav", ".aac", ".ogg", ".flac", ".webm"];
    const extOk = allowedExts.some((ext) => name.endsWith(ext));
    const mimeOk =
      mime.startsWith("audio/") ||
      mime === "application/octet-stream" ||
      mime === "binary/octet-stream" ||
      mime === "";

    if (!mimeOk && !extOk) {
      return res
        .status(415)
        .json({ stage: "upload", error: `Unsupported file type: ${mime || "unknown"}` });
    }

    const memoryContext = await resolveCanonicalWritableMemoryContext(req, Date.now());
    const requesterIp = normalizeClientIp(memoryContext?.requesterIp || ip);
    const persistTalkMemory = createTalkMemoryCommitter(memoryContext);
    const trustedUserId = String(
      req?.authUser?.id ||
      req?.userId ||
      req?.user?.id ||
      memoryContext?.authenticatedUserId ||
      ""
    ).trim();
    const clientTokenHeader = normalizeClientToken(req.get("X-Client-Token"));
    const activeSession = memoryContext?.activeSession && typeof memoryContext.activeSession === "object"
      ? memoryContext.activeSession
      : (req.clientSession && typeof req.clientSession === "object"
        ? req.clientSession
        : (clientTokenHeader ? getValidSession(clientTokenHeader) : null));
    if (activeSession && !req.clientSession) {
      req.clientSession = activeSession;
    }
    const previousMemory = memoryContext?.memory && typeof memoryContext.memory === "object"
      ? memoryContext.memory
      : (activeSession?.memory && typeof activeSession.memory === "object"
        ? activeSession.memory
        : null);
    if (activeSession && previousMemory) {
      activeSession.memory = previousMemory;
    }
    debugTranscriptOverride = TALK_TEST_DEBUG_TRANSCRIPT_ENABLED
      ? normalizeSnippet(req.body?.debug_transcript ?? req.body?.debugTranscript, 1_200)
      : "";
    const clientTranscriptOverride = normalizeSnippet(
      req.body?.client_transcript ?? req.body?.clientTranscript,
      1_200
    );
    const screenplayGenerationTranscript = normalizeTalkMultilineSnippet(
      req.body?.screenplay_generation_transcript ?? req.body?.screenplayGenerationTranscript,
      8_000
    );
    const studioMeta = sanitizeStudioTurnMetadata(req.body || null);
    const isScreenplayPageWriteTurn =
      String(studioMeta?.screenplayTarget || "").trim().toLowerCase() === "page";
    const talkTestDebugOfflineScreenplayMode = TALK_TEST_DEBUG_OFFLINE_ENABLED &&
      isScreenplayPageWriteTurn &&
      Boolean(screenplayGenerationTranscript || clientTranscriptOverride);
    talkTestDebugOfflineMode = TALK_TEST_DEBUG_OFFLINE_ENABLED &&
      (Boolean(debugTranscriptOverride) || talkTestDebugOfflineScreenplayMode);

    // ---- 1) STT (transcribe) ----
    const sttStart = Date.now();
    let sttJson = {
      text: "",
      language: STT_LANGUAGE || "en",
    };
    let transcript = "";
    let sttModelUsed = String(STT_MODEL_PRIMARY || "stt");
    let sttUsedLanguageHint = true;

    if (debugTranscriptOverride) {
      transcript = debugTranscriptOverride;
      sttJson = {
        text: debugTranscriptOverride,
        language: STT_LANGUAGE || "en",
      };
      sttModelUsed = "debug_transcript";
      sttUsedLanguageHint = false;
      sttMs = 0;
      logger.log(`[${rid}] debug_transcript_override active chars=${transcript.length}`);
    } else if (clientTranscriptOverride) {
      transcript = clientTranscriptOverride;
      sttJson = {
        text: clientTranscriptOverride,
        language: STT_LANGUAGE || "en",
      };
      sttModelUsed = "client_transcript";
      sttUsedLanguageHint = false;
      sttMs = 0;
      logger.log(`[${rid}] client_transcript_override active chars=${transcript.length}`);
    } else {
      let sttResult;
      try {
        sttResult = await sttSupplier.transcribe({
          uploadedFile,
          modelName: STT_MODEL_PRIMARY,
        });
      } catch (err) {
        throw createTalkFailureError({
          requestId: rid,
          providerStage: "stt",
          status: Number(err?.status || 500),
          message: String(err?.message || "Transcription failed."),
        });
      }
      sttMs = Date.now() - sttStart;

      if (!sttResult.response.ok) {
        const diagnostic = buildTalkFailureDiagnostics(
          { stage: "stt", status: sttResult.response.status, rawBody: sttResult.rawText },
          {
            requestId: rid,
            providerStage: "stt",
            status: sttResult.response.status,
            rawBody: sttResult.rawText,
          }
        );
        logger.log(`[${rid}] STT failed model=${sttResult.model} ${diagnostic.supportMessage}`);
        throw createTalkFailureError({
          requestId: rid,
          providerStage: "stt",
          status: sttResult.response.status,
          rawBody: sttResult.rawText,
        });
      }

      try {
        sttJson = JSON.parse(sttResult.rawText);
      } catch (_) {
        throw createTalkFailureError({
          requestId: rid,
          providerStage: "stt",
          status: 502,
          message: "Transcription response was invalid JSON.",
          errorClass: "response_invalid",
        });
      }
      transcript = String(sttJson?.text || "").trim();
      sttModelUsed = sttResult.model;
      sttUsedLanguageHint = true;

      const canRetryEmptyTranscript =
        !transcript &&
        STT_EMPTY_RETRY_ENABLED &&
        Number(uploadedFile?.size || 0) >= STT_EMPTY_RETRY_MIN_BYTES;
      if (canRetryEmptyTranscript) {
        const retryAttempts = [];
        if (STT_MODEL_FALLBACK && STT_MODEL_FALLBACK !== STT_MODEL_PRIMARY) {
          retryAttempts.push({
            model: STT_MODEL_FALLBACK,
            includeLanguage: !STT_EMPTY_RETRY_WITHOUT_LANGUAGE,
          });
        }
        if (STT_EMPTY_RETRY_WITHOUT_LANGUAGE) {
          retryAttempts.push({
            model: STT_MODEL_PRIMARY,
            includeLanguage: false,
          });
        }
        for (const attempt of retryAttempts) {
          if (transcript) break;
          logger.log(
            `[${rid}] stt_empty_retry model=${attempt.model} lang=${attempt.includeLanguage ? "on" : "off"} bytes=${Number(uploadedFile?.size || 0)}`
          );
          try {
            const fallbackResult = await sttSupplier.transcribe({
              uploadedFile,
              modelName: attempt.model,
              includeLanguage: attempt.includeLanguage,
            });
            sttMs += Math.max(0, Number(fallbackResult.elapsedMs || 0));
            if (!fallbackResult.response.ok) {
              const fallbackDiagnostic = buildTalkFailureDiagnostics(
                { stage: "stt", status: fallbackResult.response.status, rawBody: fallbackResult.rawText },
                {
                  requestId: rid,
                  providerStage: "stt",
                  status: fallbackResult.response.status,
                  rawBody: fallbackResult.rawText,
                }
              );
              logger.log(
                `[${rid}] STT fallback failed model=${fallbackResult.model} ${fallbackDiagnostic.supportMessage}`
              );
              continue;
            }
            const fallbackJson = JSON.parse(fallbackResult.rawText);
            const fallbackTranscript = String(fallbackJson?.text || "").trim();
            if (fallbackTranscript) {
              transcript = fallbackTranscript;
              sttJson = fallbackJson;
              sttModelUsed = fallbackResult.model;
              sttUsedLanguageHint = attempt.includeLanguage;
            }
          } catch (err) {
            const fallbackDiagnostic = buildTalkFailureDiagnostics(err, {
              requestId: rid,
              providerStage: "stt",
              status: Number(err?.status || 500),
            });
            logger.log(
              `[${rid}] STT fallback error model=${attempt.model} lang=${attempt.includeLanguage ? "on" : "off"} ${fallbackDiagnostic.supportMessage}`
            );
          }
        }
      }

      if (!transcript) {
        const now = Date.now();
        const uploadedBytes = Number(uploadedFile?.size || 0);
        let emptyTranscriptCount = 1;
        if (activeSession) {
          const emptyMemory = activeSession.memory && typeof activeSession.memory === "object"
            ? activeSession.memory
            : createEmptyEmotionMemory();
          const lastEmptyAt = Math.max(0, Number(emptyMemory.lastEmptyTranscriptAt || 0));
          const previousCount = Math.max(0, Number(emptyMemory.emptyTranscriptCount || 0));
          emptyTranscriptCount = lastEmptyAt > 0 && (now - lastEmptyAt) <= 15_000
            ? (previousCount + 1)
            : 1;
          emptyMemory.emptyTranscriptCount = emptyTranscriptCount;
          emptyMemory.lastEmptyTranscriptAt = now;
          emptyMemory.lastUpdatedAt = now;
          activeSession.memory = emptyMemory;
          activeSession.memory = await persistTalkMemory(emptyMemory, now);
        }
        const allowEmptyPromptVoice = parseBool(
          req.body?.allow_empty_prompt ??
          req.body?.allowEmptyPrompt
        );
        const shouldSpeakEmptyPrompt =
          allowEmptyPromptVoice &&
          EMPTY_TRANSCRIPT_VOICE_PROMPT_ENABLED &&
          uploadedBytes >= EMPTY_TRANSCRIPT_VOICE_PROMPT_MIN_BYTES &&
          emptyTranscriptCount >= EMPTY_TRANSCRIPT_VOICE_PROMPT_STREAK;
        if (shouldSpeakEmptyPrompt) {
          try {
            const promptTts = await ttsSupplier.synthesize({
              text: CLEMENTINE_PROFILE.prompts.emptyTranscriptVoicePrompt,
              speed: CLEMENTINE_PROFILE.voice.speed,
              rid,
              label: "empty_transcript_prompt",
              voiceProfile: interactiveVoiceProfile,
            });
            const promptBuffer = Buffer.from(promptTts?.buffer || []);
            if (promptBuffer.length && isLikelyMp3Buffer(promptBuffer)) {
              res.setHeader("Content-Type", "audio/mpeg");
              res.setHeader("Cache-Control", "no-store");
              res.setHeader("x-turn-status", "asked_repeat");
              res.setHeader("x-continue-listening", "1");
              res.setHeader("x-continue-reason", "empty_transcript_prompt");
              res.setHeader("x-stt-model", encodeURIComponent(sttModelUsed));
              res.setHeader("x-tts-provider", encodeURIComponent(String(promptTts?.provider || "openai")));
              res.setHeader("Content-Length", String(promptBuffer.length));
              logger.log(
                `[${rid}] empty_transcript_prompt sent streak=${emptyTranscriptCount} bytes=${uploadedBytes} stt_model=${sttModelUsed}`
              );
              return res.status(200).send(promptBuffer);
            }
          } catch (err) {
            logger.log(`[${rid}] empty_transcript_prompt_failed reason=${String(err?.message || err)}`);
          }
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("x-turn-status", "continue_listening");
        res.setHeader("x-continue-listening", "1");
        res.setHeader("x-continue-reason", "empty_transcript");
        res.setHeader("x-stt-model", encodeURIComponent(sttModelUsed));
        logger.log(
          `[${rid}] continue_listening reason=empty_transcript stt_model=${sttModelUsed} streak=${Math.max(1, Number(activeSession?.memory?.emptyTranscriptCount || 1))}`
        );
        return res.status(204).end();
      }
      if (activeSession && previousMemory) {
        previousMemory.emptyTranscriptCount = 0;
        previousMemory.lastEmptyTranscriptAt = 0;
        previousMemory.lastUpdatedAt = Date.now();
        activeSession.memory = previousMemory;
        activeSession.memory = await persistTalkMemory(previousMemory, Date.now());
      }
    }
    const forcedErrorStageRaw = TALK_TEST_DEBUG_FAILURE_ENABLED
      ? normalizeSnippet(
        req.get("x-debug-force-error") ?? req.body?.debug_force_error ?? req.body?.debugForceError,
        24
      ).toLowerCase()
      : "";
    if (forcedErrorStageRaw && forcedErrorStageRaw !== "screenplay_quality") {
      const allowedStages = new Set(["server", "stt", "chat", "tts"]);
      const forcedStage = allowedStages.has(forcedErrorStageRaw) ? forcedErrorStageRaw : "server";
      const forcedErr = new Error(`Forced /talk failure (${forcedStage})`);
      forcedErr.stage = forcedStage;
      forcedErr.status = 500;
      logger.log(`[${rid}] debug_force_error stage=${forcedStage}`);
      throw forcedErr;
    }

    const customSystemPrompt = normalizeSystemPrompt(req.body?.system_prompt || req.body?.systemPrompt);
    const studioCapabilities = parseStudioCapabilities(req.body?.studio_capabilities ?? req.body?.studioCapabilities);
    const clientPartialTranscriptHint = normalizeSnippet(
      req.body?.partial_transcript_hint ?? req.body?.partialTranscriptHint,
      320
    );
    const speculativePrepareRequested = isSpeculativePrepareRequest(req);
    const talkSessionKey = resolveTalkSessionKey(req);
    const speculativePrepareKey = normalizeSpeculativeKey(
      req.body?.speculative_key ?? req.body?.speculativeKey
    );
    const speculativeReuseKeyInput = normalizeSpeculativeKey(
      req.body?.speculative_reuse_key ?? req.body?.speculativeReuseKey
    );
    const speculativePromptHashInput = normalizeSpeculativePromptHash(
      req.body?.speculative_prompt_hash ?? req.body?.speculativePromptHash
    );
    const transcriptWords = countWords(transcript);
    let sttConfidence = estimateSttConfidence(sttJson, transcript);
    if (debugTranscriptOverride || clientTranscriptOverride) {
      sttConfidence = Math.max(0.99, sttConfidence);
    }
    if (transcriptWords >= 24 || transcript.length >= 160) {
      thinkingDelayMs = Math.min(thinkingDelayMs, 60);
    }
    const talkGenerationTranscript =
      isScreenplayPageWriteTurn && screenplayGenerationTranscript
        ? screenplayGenerationTranscript
        : transcript;
    if (talkGenerationTranscript !== transcript) {
      logger.log(
        `[${rid}] screenplay_generation_transcript active chars=${talkGenerationTranscript.length}`
      );
    }
    logger.log(
      `\n[${reqId}] transcription (${sttModelUsed}${sttUsedLanguageHint ? ",lang" : ",no-lang"} conf=${sttConfidence.toFixed(2)}): "${transcript}"`
    );
    const userIdentityIntent = extractUserIdentityIntent(transcript);
    let noteCaptureIntent = ENABLE_LOCAL_NOTE_CAPTURE
      ? extractNoteCaptureIntent(transcript)
      : {
        shouldCapture: false,
        needsContent: false,
        noteText: "",
        trigger: "",
      };
    let rawTaskCreateIntent = extractTaskCreateIntent(transcript);
    let rawTaskCompleteIntent = extractTaskCompleteIntent(transcript);
    const hasStrongActionTrigger = Boolean(
      noteCaptureIntent.shouldCapture ||
      rawTaskCreateIntent.shouldCreate ||
      rawTaskCompleteIntent.shouldComplete
    );
    // When the STT supplier returns no per-word/segment scores the confidence
    // is a word-count heuristic, and every short command would read as
    // ambiguous; only bounce transcripts that look like echo fragments then.
    const shouldPromptLowConfidenceRepeat =
      shouldTreatAsLowConfidence({
        ambiguous: isLikelyAmbiguousLowConfidenceUtterance(transcript, sttConfidence),
        sttJson,
        transcript,
      }) &&
      !hasStrongActionTrigger;
    if (shouldPromptLowConfidenceRepeat) {
      // Echo guard: consecutive low-confidence clips inside a short window are
      // almost always the assistant's own playback re-entering the mic. Speak the
      // clarification a bounded number of times, then answer silently so the
      // spoken prompt cannot become the next clip.
      const lowConfidencePolicy = readLowConfidenceRepeatPolicy();
      const lowConfidenceNow = Date.now();
      let lowConfidenceStreak = 1;
      if (activeSession) {
        const streakMemory = activeSession.memory && typeof activeSession.memory === "object"
          ? activeSession.memory
          : createEmptyEmotionMemory();
        lowConfidenceStreak = advanceLowConfidenceRepeatStreak(
          streakMemory,
          lowConfidenceNow,
          lowConfidencePolicy.windowMs,
        );
        activeSession.memory = streakMemory;
        activeSession.memory = await persistTalkMemory(streakMemory, lowConfidenceNow);
      }
      const speakLowConfidencePrompt = shouldSpeakLowConfidenceRepeatPrompt(
        lowConfidenceStreak,
        lowConfidencePolicy,
      );
      if (!speakLowConfidencePrompt) {
        logger.log(
          `[${rid}] low_confidence_repeat_prompt_muted streak=${lowConfidenceStreak} max_spoken=${lowConfidencePolicy.maxSpokenStreak} words=${transcriptWords} stt_conf=${sttConfidence.toFixed(2)}`
        );
        res.setHeader("x-repeat-prompt-muted", "1");
      }
      const clarificationPrompt = buildLowConfidenceClarificationPrompt(transcript);
      try {
        const promptTts = speakLowConfidencePrompt ? await ttsSupplier.synthesize({
          text: clarificationPrompt,
          speed: CLEMENTINE_PROFILE.voice.speed,
          rid,
          label: "low_confidence_repeat_prompt",
          voiceProfile: interactiveVoiceProfile,
        }) : null;
        const promptBuffer = Buffer.from(promptTts?.buffer || []);
        if (promptBuffer.length && isLikelyMp3Buffer(promptBuffer)) {
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("x-turn-status", "asked_repeat");
          res.setHeader("x-continue-listening", "1");
          res.setHeader("x-continue-reason", "low_confidence_transcript");
          res.setHeader("x-stt-confidence", sttConfidence.toFixed(3));
          res.setHeader("x-stt-model", encodeURIComponent(sttModelUsed));
          res.setHeader("x-tts-provider", encodeURIComponent(String(promptTts?.provider || "openai")));
          res.setHeader("Content-Length", String(promptBuffer.length));
          logger.log(
            `[${rid}] asked_repeat reason=low_confidence_transcript words=${transcriptWords} stt_conf=${sttConfidence.toFixed(2)}`
          );
          return res.status(200).send(promptBuffer);
        }
      } catch (err) {
        logger.log(
          `[${rid}] low_confidence_repeat_prompt_failed reason=${String(err?.message || err)}`
        );
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("x-turn-status", "continue_listening");
      res.setHeader("x-continue-listening", "1");
      res.setHeader("x-continue-reason", "low_confidence_transcript");
      res.setHeader("x-stt-confidence", sttConfidence.toFixed(3));
      res.setHeader("x-stt-model", encodeURIComponent(sttModelUsed));
      logger.log(
        `[${rid}] continue_listening reason=low_confidence_transcript words=${transcriptWords} stt_conf=${sttConfidence.toFixed(2)}`
      );
      return res.status(204).end();
    }
    if (activeSession?.memory && typeof activeSession.memory === "object") {
      const usableNow = Date.now();
      if (resetLowConfidenceRepeatStreak(activeSession.memory, usableNow)) {
        activeSession.memory = await persistTalkMemory(activeSession.memory, usableNow);
      }
    }
    const allowLowConfidenceAction =
      hasStrongActionTrigger &&
      transcriptWords >= 6 &&
      sttConfidence >= Math.max(0.26, LOCAL_ACTION_MIN_STT_CONFIDENCE * 0.75);
    const suppressLocalActionsForConfidence =
      sttConfidence < LOCAL_ACTION_MIN_STT_CONFIDENCE &&
      !allowLowConfidenceAction;
    if (suppressLocalActionsForConfidence) {
      noteCaptureIntent = {
        shouldCapture: false,
        needsContent: false,
        noteText: "",
        trigger: "",
      };
      rawTaskCreateIntent = { shouldCreate: false, title: "", dueAt: 0, priority: "normal", trigger: "" };
      rawTaskCompleteIntent = { shouldComplete: false, query: "", trigger: "" };
      logger.log(
        `[${rid}] local_action_gate suppressed=1 stt_conf=${sttConfidence.toFixed(2)} min_conf=${LOCAL_ACTION_MIN_STT_CONFIDENCE.toFixed(2)}`
      );
    }

    let assistantSelfName =
      normalizeAssistantSelfName(previousMemory?.assistantSelfName) || getAssistantSelfNameForIp(ip);
    const assistantNameFromBody = normalizeAssistantSelfName(
      req.body?.assistant_name ??
      req.body?.assistantName ??
      req.body?.companion_name ??
      req.body?.companionName
    );
    const voiceRenameIntent = extractAssistantRenameIntent(transcript);
    const renameRequestedName = assistantNameFromBody || voiceRenameIntent.name;
    const renameSource = assistantNameFromBody ? "client_field" : voiceRenameIntent.source;
    if (speculativePrepareRequested) {
      const speculativeAssistantSelfName =
        normalizeAssistantSelfName(renameRequestedName) ||
        assistantSelfName ||
        DEFAULT_ASSISTANT_SELF_NAME;
      const speculativeTranscriptSeed = (() => {
        const cleanTranscript = normalizeSnippet(transcript, 6_000);
        const cleanPartialHint = normalizeSnippet(clientPartialTranscriptHint, 320);
        if (cleanPartialHint && (!cleanTranscript || cleanPartialHint.length > (cleanTranscript.length + 8))) {
          return cleanPartialHint;
        }
        return cleanTranscript || cleanPartialHint;
      })();
      const resolvedSpeculativePromptHash =
        normalizeSpeculativePromptHash(speculativePromptHashInput) ||
        computeSpeculativePromptHash(customSystemPrompt);
      if (!speculativePrepareKey || !resolvedSpeculativePromptHash) {
        return res.status(400).json({
          stage: "speculative_prepare",
          error: "Missing speculative key or prompt hash.",
        });
      }
      if (!speculativeTranscriptSeed) {
        return res.status(422).json({
          stage: "speculative_prepare",
          error: "Speculative transcript was empty.",
          speculative_key: speculativePrepareKey,
          prompt_hash: resolvedSpeculativePromptHash,
        });
      }
      const prepared = await prepareSpeculativeTalkResponse({
        rid,
        systemPrompt: customSystemPrompt,
        transcript: speculativeTranscriptSeed,
        assistantSelfName: speculativeAssistantSelfName,
        interactiveVoiceProfile,
      });
      const storedPromptHash =
        normalizeSpeculativePromptHash(resolvedSpeculativePromptHash || prepared.promptHash) ||
        normalizeSpeculativePromptHash(prepared.promptHash);
      storeSpeculativeTalkPrepared({
        key: speculativePrepareKey,
        sessionKey: talkSessionKey,
        promptHash: storedPromptHash,
        transcript: prepared.transcript,
        reply: prepared.reply,
        audioBuffer: prepared.audioBuffer,
        ttsProvider: prepared.ttsProvider,
        ttsVoice: prepared.ttsVoice,
        emotionLane: prepared.emotionLane,
        preparedAt: Date.now(),
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("x-speculative-reuse", "0");
      res.setHeader("x-speculative-key", speculativePrepareKey);
      res.setHeader("x-speculative-prompt-hash", storedPromptHash);
      logger.log(
        `[${rid}] speculative_prepare stored=1 session=${talkSessionKey} key=${speculativePrepareKey} prompt_hash=${storedPromptHash} transcript_chars=${prepared.transcript.length} rename_source=${renameRequestedName ? renameSource : "none"}`
      );
      return res.status(201).json({
        ok: true,
        action: "speculative_prepared",
        speculative_key: speculativePrepareKey,
        prompt_hash: storedPromptHash,
      });
    }
    if (renameRequestedName) {
      const nextAssistantName = normalizeAssistantSelfName(renameRequestedName) || DEFAULT_ASSISTANT_SELF_NAME;
      if (nextAssistantName.toLowerCase() !== assistantSelfName.toLowerCase()) {
        assistantSelfName = setAssistantSelfNameForIp(ip, nextAssistantName);
        logger.log(
          `[${rid}] assistant_self_name updated -> "${assistantSelfName}" source=${renameSource}`
        );
      }
    }
    const storedAssistantSelfName = getAssistantSelfNameForIp(ip);
    if (storedAssistantSelfName.toLowerCase() !== assistantSelfName.toLowerCase()) {
      assistantSelfName = setAssistantSelfNameForIp(ip, assistantSelfName);
    }
    if (activeSession) {
      const sessionMemory = previousMemory && typeof previousMemory === "object"
        ? previousMemory
        : createEmptyEmotionMemory();
      sessionMemory.assistantSelfName = assistantSelfName;
      sessionMemory.assistantSelfNameUpdatedAt = Date.now();
      if (userIdentityIntent.hasUpdate) {
        applyUserIdentityIntentToMemory(sessionMemory, userIdentityIntent, Date.now());
        const rememberedCount = Array.isArray(sessionMemory.rememberedPeople)
          ? sessionMemory.rememberedPeople.length
          : 0;
        logger.log(
          `[${rid}] user_identity_update primary="${sessionMemory.userPrimaryName || "none"}" remembered=${rememberedCount}`
        );
      }
      activeSession.memory = sessionMemory;
    }
    let taskCreateIntent =
      noteCaptureIntent.shouldCapture
        ? { shouldCreate: false, title: "", dueAt: 0, priority: "normal", trigger: "" }
        : rawTaskCreateIntent;
    let taskCompleteIntent =
      noteCaptureIntent.shouldCapture
        ? { shouldComplete: false, query: "", trigger: "" }
        : rawTaskCompleteIntent;
    let hasTaskIntent = Boolean(taskCreateIntent.shouldCreate || taskCompleteIntent.shouldComplete);
    let actionGateReply = "";
    const pendingLocalActionMemory = activeSession?.memory && typeof activeSession.memory === "object"
      ? activeSession.memory
      : (previousMemory && typeof previousMemory === "object" ? previousMemory : null);
    const pendingLocalActionBeforeTurn = readPendingLocalAction(pendingLocalActionMemory);
    const askedLocalActionConfirm = isLocalActionConfirmationTranscript(transcript);
    const askedLocalActionCancel = isLocalActionCancelTranscript(transcript);
    const executableLocalActionCandidate = selectExecutableLocalActionCandidate({
      noteCaptureIntent,
      taskCreateIntent,
      taskCompleteIntent,
    });

    const suppressLocalActionIntents = () => {
      noteCaptureIntent = {
        shouldCapture: false,
        needsContent: false,
        noteText: "",
        trigger: "",
      };
      taskCreateIntent = { shouldCreate: false, title: "", dueAt: 0, priority: "normal", trigger: "" };
      taskCompleteIntent = { shouldComplete: false, query: "", trigger: "" };
      hasTaskIntent = false;
    };

    if (askedLocalActionCancel) {
      if (pendingLocalActionMemory) {
        clearPendingLocalAction(pendingLocalActionMemory, Date.now());
        if (activeSession) activeSession.memory = pendingLocalActionMemory;
      }
      actionGateReply = pendingLocalActionBeforeTurn.exists
        ? "Done. I canceled that pending action."
        : buildNoPendingLocalActionReply();
      suppressLocalActionIntents();
      logger.log(
        `[${rid}] local_action_gate mode=cancel had_pending=${pendingLocalActionBeforeTurn.exists ? "1" : "0"}`
      );
    } else if (askedLocalActionConfirm) {
      if (pendingLocalActionBeforeTurn.exists && !executableLocalActionCandidate) {
        const pendingPayload = pendingLocalActionBeforeTurn.payload || {};
        const pendingType = normalizeLocalActionType(pendingLocalActionBeforeTurn.type);
        if (pendingLocalActionMemory) {
          clearPendingLocalAction(pendingLocalActionMemory, Date.now());
          if (activeSession) activeSession.memory = pendingLocalActionMemory;
        }
        suppressLocalActionIntents();
        if (pendingType === "note_capture") {
          noteCaptureIntent = {
            shouldCapture: true,
            needsContent: false,
            noteText: normalizeSnippet(pendingPayload.noteText, 1_600),
            trigger: normalizeSnippet(pendingPayload.trigger || "confirm", 64) || "confirm",
          };
        } else if (pendingType === "task_create") {
          taskCreateIntent = {
            shouldCreate: true,
            title: normalizeSnippet(pendingPayload.title, 120) || "Task",
            dueAt: Math.max(0, Number(pendingPayload.dueAt || 0)),
            priority: normalizeSnippet(pendingPayload.priority, 24) || "normal",
            trigger: normalizeSnippet(pendingPayload.trigger || "confirm", 64) || "confirm",
          };
          hasTaskIntent = true;
        } else if (pendingType === "task_complete") {
          taskCompleteIntent = {
            shouldComplete: true,
            query: normalizeSnippet(pendingPayload.query, 120) || "latest task",
            trigger: normalizeSnippet(pendingPayload.trigger || "confirm", 64) || "confirm",
          };
          hasTaskIntent = true;
        } else {
          actionGateReply = buildNoPendingLocalActionReply();
        }
        logger.log(
          `[${rid}] local_action_gate mode=confirm applied_pending=${pendingType || "none"}`
        );
      } else if (!pendingLocalActionBeforeTurn.exists && !executableLocalActionCandidate) {
        actionGateReply = buildNoPendingLocalActionReply();
        suppressLocalActionIntents();
        logger.log(`[${rid}] local_action_gate mode=confirm pending=none`);
      }
    }

    if (!actionGateReply && executableLocalActionCandidate && !askedLocalActionConfirm) {
      if (pendingLocalActionMemory) {
        setPendingLocalAction(
          pendingLocalActionMemory,
          {
            type: executableLocalActionCandidate.type,
            payload: executableLocalActionCandidate.payload,
          },
          Date.now()
        );
        if (activeSession) activeSession.memory = pendingLocalActionMemory;
      }
      actionGateReply = buildPendingLocalActionConfirmationReply({
        type: executableLocalActionCandidate.type,
        summary: buildPendingLocalActionSummary(
          executableLocalActionCandidate.type,
          executableLocalActionCandidate.payload
        ),
      });
      suppressLocalActionIntents();
      logger.log(
        `[${rid}] local_action_gate mode=needs_confirmation type=${executableLocalActionCandidate.type}`
      );
    }
    const continuationGate = shouldHoldForContinuation({
      transcript,
      reqBody: req.body,
      sttJson,
      memory: previousMemory,
      sttConfidence,
    });
    if (
      continuationGate.hold &&
      !actionGateReply &&
      !noteCaptureIntent.shouldCapture &&
      !hasTaskIntent
    ) {
      if (activeSession) {
        const holdMemory = activeSession.memory && typeof activeSession.memory === "object"
          ? activeSession.memory
          : createEmptyEmotionMemory();
        holdMemory.continuationHoldCount = Math.max(
          0,
          Number(holdMemory.continuationHoldCount || 0)
        ) + 1;
        holdMemory.lastContinuationHoldAt = Date.now();
        holdMemory.lastContinuationReason = continuationGate.reason;
        holdMemory.lastUpdatedAt = Date.now();
        activeSession.memory = holdMemory;
        activeSession.memory = await persistTalkMemory(holdMemory, Date.now());
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("x-turn-status", "continue_listening");
      res.setHeader("x-continue-listening", "1");
      res.setHeader("x-continue-reason", continuationGate.reason);
      res.setHeader("x-continue-confidence", continuationGate.confidence.toFixed(2));
      res.setHeader(
        "x-continue-tail-threshold-ms",
        String(Math.max(0, Number(continuationGate.effectiveTailSilenceThreshold || TURN_END_GUARD_TAIL_SILENCE_MS)))
      );
      res.setHeader("x-vad-threshold", Number(continuationGate.dynamicVadThreshold || TURN_END_GUARD_VAD_BASE_RMS).toFixed(5));
      res.setHeader("x-noise-floor-rms", Number(continuationGate.noiseFloorRms || 0).toFixed(5));
      res.setHeader("x-stt-confidence", sttConfidence.toFixed(3));
      res.setHeader("x-barge-in-enabled", BARGE_IN_ENABLED ? "1" : "0");
      res.setHeader("x-barge-in-stop-playback", BARGE_IN_STOP_PLAYBACK ? "1" : "0");
      res.setHeader("x-continue-long-story", continuationGate.likelyLongStory ? "1" : "0");
      res.setHeader("x-continue-complete-short-question", continuationGate.reason === "complete_short_question" ? "1" : "0");
      res.setHeader("x-assistant-self-name", encodeURIComponent(assistantSelfName));
      logger.log(
        `[${rid}] continue_listening reason=${continuationGate.reason} conf=${continuationGate.confidence.toFixed(2)} words=${continuationGate.words} dur=${continuationGate.audioDurationSec.toFixed(2)} speech_ms=${continuationGate.speechMs} tail_silence_ms=${continuationGate.tailSilenceMs} tail_threshold_ms=${continuationGate.effectiveTailSilenceThreshold} tail_boost_ms=${continuationGate.dynamicTailBoostMs || 0} vad_threshold=${Number(continuationGate.dynamicVadThreshold || TURN_END_GUARD_VAD_BASE_RMS).toFixed(5)} noise_floor=${Number(continuationGate.noiseFloorRms || 0).toFixed(5)} long_story=${continuationGate.likelyLongStory ? "1" : "0"} streak=${continuationGate.holdStreak}`
      );
      return res.status(204).end();
    }

    const stageHintInput = parseBoundedInt(req.body?.stage, 1, 5);
    const depthScoreInput = parseBoundedFloat(req.body?.depth_score ?? req.body?.depth, 0, 10);
    const romanceTensionInput = parseBoundedFloat(
      req.body?.romance_tension ?? req.body?.romance,
      0,
      10
    );
    const sessionCountInput = parseBoundedInt(req.body?.session_count, 0, 1_000_000);
    const requestedPresetRaw = req.body?.persona_preset ?? req.body?.personaPreset;
    const requestedPreset = requestedPresetRaw == null
      ? null
      : normalizePersonaPreset(requestedPresetRaw);
    const activePreset = requestedPreset || PERSONA_PRESET;
    const clientMemoryCue = normalizeSystemPrompt(req.body?.memory_cue ?? req.body?.memoryCue);

    const stage = stageHintInput ?? 1;
    const depthScore = depthScoreInput ?? 0;
    const romanceTension = romanceTensionInput ?? 0;
    const sessionCount = sessionCountInput ?? 0;

    const flags = directorFlagsFromTranscript(transcript);
    if (flags?.isDirect || flags?.isVenting || flags?.isVulnerable) {
      thinkingDelayMs = Math.min(thinkingDelayMs, 55);
    }

    const metricStateBeforeTurn = getUserMetricState(requesterIp);
    const sameDaySessionStartCount = countSessionStartsForDay(
      metricStateBeforeTurn,
      formatLocalDateStamp(Date.now())
    );
    const sameDaySessionReturns = sameDaySessionStartCount >= 2;
    const prevBehaviorMode = String(previousMemory?.behaviorMode || "surface");
    const prevFollowUpPromptCount = Math.max(0, Number(previousMemory?.followUpPromptCount || 0));
    const prevFollowUpAnswerCount = Math.max(0, Number(previousMemory?.followUpAnswerCount || 0));
    let sessionMemory = activeSession
      ? updateSessionEmotionMemory(activeSession.memory, transcript, flags, {
        sameDaySessionReturns,
      })
      : null;
    if (activeSession) activeSession.memory = sessionMemory;
    if (sessionMemory) {
      sessionMemory = await persistTalkMemory(sessionMemory, Date.now());
      if (activeSession) activeSession.memory = sessionMemory;
    }
    const activeThemeRefreshPromise = talkTestDebugOfflineMode
      ? null
      : sessionMemory
      ? maybeRefineActiveThemesWithLLM({
        rid,
        transcript,
        memory: sessionMemory,
      })
      : null;
    const modeSwitchedThisTurn = Boolean(previousMemory) &&
      prevBehaviorMode !== String(sessionMemory?.behaviorMode || prevBehaviorMode);
    const followUpPromptDelta = Math.max(
      0,
      Math.max(0, Number(sessionMemory?.followUpPromptCount || 0)) - prevFollowUpPromptCount
    );
    const followUpAnswerDelta = Math.max(
      0,
      Math.max(0, Number(sessionMemory?.followUpAnswerCount || 0)) - prevFollowUpAnswerCount
    );
    const deepTurnThisTurn =
      Boolean(flags.isVulnerable) ||
      Math.max(0, Number(sessionMemory?.behaviorDepthScore || 0)) >= DEEP_TURN_SCORE_THRESHOLD;
    const metricSnapshot = recordUserTalkMetrics(requesterIp, {
      deepTurn: deepTurnThisTurn,
      relationshipDepthScore: Number(sessionMemory?.relationshipDepthScore || 0),
      reflectivePromptDelta: followUpPromptDelta,
      reflectiveAnswerDelta: followUpAnswerDelta,
      modeSwitched: modeSwitchedThisTurn,
    });
    const kpiTargetStatus = evaluateKpiTargets(metricSnapshot);
    if (sessionMemory && activeSession) {
      sessionMemory.deepTurns7d = metricSnapshot.deepTurns7d;
      sessionMemory.avgSessionSeconds7d = metricSnapshot.avgSessionSeconds7d;
      sessionMemory.returns7d = metricSnapshot.returns7d;
      sessionMemory.userInitiatedSessions7d = metricSnapshot.userInitiatedSessions7d;
      sessionMemory.reflectiveQuestionAnswerRate = metricSnapshot.reflectiveQuestionAnswerRate;
      sessionMemory.avgTurnQuality7d = Number(metricSnapshot.avgTurnQuality7d || 0.66);
      sessionMemory.relationshipDepthDelta7d = Number(metricSnapshot.relationshipDepthDelta7d || 0);
      sessionMemory.relationshipDepthSlopePerDay7d = Number(
        metricSnapshot.relationshipDepthSlopePerDay7d || 0
      );
      sessionMemory.modeSwitches30d = metricSnapshot.modeSwitches30d;
      sessionMemory.kpiTargetsMetCount = kpiTargetStatus.metCount;
      sessionMemory.kpiTargetsTotal = kpiTargetStatus.total;
      sessionMemory.kpiTargetsAllMet = Boolean(kpiTargetStatus.allMet);
      activeSession.memory = sessionMemory;
    }
    const sessionNeedsCheckIn = activeSession
      ? Number(sessionMemory?.checkInPromptsUsed || 0) < 1
      : true;
    const ipCheckInCooldownActive = hasRecentCheckInForIp(requesterIp);
    const shouldAskCheckInThisTurn = sessionNeedsCheckIn && !ipCheckInCooldownActive;
    const turnsInSession = Math.max(0, Number(sessionMemory?.turns || 0));
    if (sessionMemory) {
      const screenplayProjectTitle =
        studioMeta?.screenplayProjectTitle ??
        req.body?.screenplayProjectTitle ??
        req.body?.screenplay_project_title ??
        req.body?.projectTitle ??
        req.body?.project_title ??
        req.body?.pack ??
        "";
      pendingScreenplayLearningQuestion = selectPendingScreenplayLearningQuestion(
        sessionMemory.pendingScreenplayLearningQuestions,
        {
          projectId: studioMeta?.screenplayProjectId,
          projectTitle: screenplayProjectTitle,
        }
      );
      pendingScreenplayLearningResolution = resolvePendingScreenplayLearningAnswer({
        pending: pendingScreenplayLearningQuestion,
        transcript,
        projectId: studioMeta?.screenplayProjectId,
        projectTitle: screenplayProjectTitle,
        currentTurn: turnsInSession,
      });
      screenplayLearningAnswerContext = pendingScreenplayLearningResolution.learningContext;
      screenplayQuestionInteraction = pendingScreenplayLearningResolution.interaction;
      if (pendingScreenplayLearningResolution.shouldClear) {
        sessionMemory.pendingScreenplayLearningQuestions =
          removePendingScreenplayLearningQuestion(
            sessionMemory.pendingScreenplayLearningQuestions,
            pendingScreenplayLearningQuestion
          );
        sessionMemory = await persistTalkMemory(sessionMemory, Date.now());
      }
      if (activeSession) activeSession.memory = sessionMemory;
    }
    const growthProgress = Math.max(0, Math.min(1, Number(sessionMemory?.growthProgress || 0)));
    const growthLevel = Math.max(1, Number(sessionMemory?.growthLevel || 1));
    const growthGuidance = growthGuidanceLine(growthLevel);
    const activeDaysInSession = Array.isArray(sessionMemory?.activeDayStamps)
      ? sessionMemory.activeDayStamps.length
      : 0;
    const emotionalDepthInSession = clampUnit(sessionMemory?.emotionalDepthScore, 0.12);
    const sharedMemoryCount = Array.isArray(sessionMemory?.listeningFacts)
      ? sessionMemory.listeningFacts.length
      : 0;
    const relationshipDepthScore = Math.max(
      0,
      Math.min(RELATIONSHIP_DEPTH_MAX, Number(sessionMemory?.relationshipDepthScore || 0))
    );
    const timeActiveDays = Math.max(
      activeDaysInSession,
      Number(sessionMemory?.timeActiveDays || 0)
    );
    const conversationCountInSession = Math.max(
      turnsInSession,
      Number(sessionMemory?.conversationCount || 0)
    );
    const behaviorMode = String(sessionMemory?.behaviorMode || "surface");
    const behaviorDepthScore = Math.max(
      0,
      Math.min(100, Number(sessionMemory?.behaviorDepthScore || 0))
    );
    const overAttachmentSafeguard = deriveOverAttachmentSafeguardState({
      relationshipDepthScore,
      behaviorDepthScore,
      dependencySignals14d: Number(sessionMemory?.dependencySignals14d || 0),
      veryHighBehaviorStreak: Number(sessionMemory?.veryHighBehaviorTurnStreak || 0),
      veryHighBehaviorTurns7d: Number(sessionMemory?.veryHighBehaviorTurns7d || 0),
      currentTurnDependencySignal: Boolean(sessionMemory?.lastDependencySignal),
    });
    const previousOverAttachmentActive = Boolean(previousMemory?.overAttachmentSafeguardActive);
    if (sessionMemory && activeSession) {
      sessionMemory.overAttachmentSafeguardActive = overAttachmentSafeguard.active;
      sessionMemory.overAttachmentValidationScale = overAttachmentSafeguard.validationScale;
      sessionMemory.overAttachmentAutonomyScale = overAttachmentSafeguard.autonomyScale;
      if (overAttachmentSafeguard.active) {
        sessionMemory.overAttachmentSafeguardLastTurn = turnsInSession;
        if (!previousOverAttachmentActive) {
          sessionMemory.overAttachmentSafeguardCount = Math.max(
            0,
            Number(sessionMemory.overAttachmentSafeguardCount || 0)
          ) + 1;
        }
      }
      activeSession.memory = sessionMemory;
    }
    const hiddenDepthModeState = deriveHiddenDepthModeState({
      behaviorMode,
      behaviorDepthScore,
      relationshipDepthScore,
      timeActiveDays,
      conversationCount: conversationCountInSession,
    });
    const hiddenDepthProfile = hiddenDepthModeState.profile;
    const hiddenDepthPolicy = hiddenDepthModeState.policy;
    const seasonalWaveState = deriveSeasonalWaveState({
      hiddenDepthMode: hiddenDepthModeState,
      relationshipDepthScore,
      timeActiveDays,
      conversationCount: conversationCountInSession,
      behaviorDepthScore,
      memory: sessionMemory,
    });
    const cycleEvolution = deriveCycleEvolutionProfile(seasonalWaveState.cycleIndex);
    const cycleUiReflection = deriveCycleIndexUiReflection({
      cycleEvolution,
      cycleIndex: seasonalWaveState.cycleIndex,
      baseTtsSpeed: TTS_SPEED,
    });
    const effectiveValidationScale = Math.max(
      0.10,
      Math.min(1, cycleEvolution.validationMultiplier * overAttachmentSafeguard.validationScale)
    );
    if (activeThemeRefreshPromise) {
      activeThemeRefreshPromise
        .then(() => {
          if (activeSession) activeSession.memory = sessionMemory;
        })
        .catch(() => {});
    }
    const rememberPlan = buildRememberMomentPlan({
      rid,
      transcript,
      memory: sessionMemory,
      hiddenDepthMode: hiddenDepthModeState,
      seasonalWave: seasonalWaveState,
    });
    if (sessionMemory && rememberPlan.shouldPrompt) {
      sessionMemory.rememberPromptsUsed = Math.max(
        0,
        Number(sessionMemory.rememberPromptsUsed || 0)
      ) + 1;
      sessionMemory.lastRememberPromptTurn = turnsInSession;
      sessionMemory.lastRememberSource = rememberPlan.source || "none";
      sessionMemory.lastRememberSnippet = rememberPlan.line || "";
      if (activeSession) activeSession.memory = sessionMemory;
    }
    const cycleMemoryPlan = buildCycleConsciousMemoryPlan({
      rid,
      transcript,
      memory: sessionMemory,
      hiddenDepthMode: hiddenDepthModeState,
      seasonalWave: seasonalWaveState,
    });
    if (sessionMemory && cycleMemoryPlan.shouldPrompt) {
      sessionMemory.cycleMemoryPromptsUsed = Math.max(
        0,
        Number(sessionMemory.cycleMemoryPromptsUsed || 0)
      ) + 1;
      sessionMemory.lastCycleMemoryTurn = turnsInSession;
      sessionMemory.lastCycleMemoryAnchor = cycleMemoryPlan.anchor || "";
      sessionMemory.lastCycleMemoryReason = cycleMemoryPlan.reason || "";
      if (activeSession) activeSession.memory = sessionMemory;
    }
    const backReferencePlan = buildBackReferencePlan({
      rid,
      transcript,
      memory: sessionMemory,
      flags,
    });
    if (sessionMemory && backReferencePlan.shouldPrompt) {
      sessionMemory.lastBackReferenceTurn = turnsInSession;
      sessionMemory.backReferenceCooldownUntilTurn =
        turnsInSession + Math.max(0, Number(backReferencePlan.cooldownTurns || BACKREF_COOLDOWN_MIN_TURNS));
      sessionMemory.backReferenceLastThemeKey = String(backReferencePlan.themeKey || "none");
      markThemeMemoryUsage(sessionMemory, backReferencePlan.themeKey, Date.now());
      sessionMemory.backReferenceCount = Math.max(
        0,
        Number(sessionMemory.backReferenceCount || 0)
      ) + 1;
      sessionMemory.backReferenceRateLast = Math.max(
        0,
        Math.min(1, Number(backReferencePlan.rate || 0))
      );
      if (activeSession) activeSession.memory = sessionMemory;
    }
    const mirrorCue = String(sessionMemory?.lastMirrorCue || "").trim();
    const reassuranceThisTurn = shouldPrioritizeReassurance({
      transcript,
      flags,
      memory: sessionMemory,
    });
    const vibe =
      flags.isVulnerable ? "vulnerable" :
      flags.isPlayful ? "playful" :
      flags.isDirect ? "direct" :
      "neutral";
    const routingPlan = inferRoutingPriorityLane(transcript, flags, sessionMemory);
    const routingLane = String(routingPlan?.lane || "normal_rotation");
    const routingReason = String(routingPlan?.reason || "default");
    const routingOrder = String(routingPlan?.order || ROUTING_PRIORITY_ORDER.join(" > "));
    const turnPlanner = buildTurnPlanner({
      transcript,
      flags,
      routingPlan,
      behaviorMode,
      memory: sessionMemory,
    });
    interactiveVoiceProfile = applyClementineVoiceDirection(
      interactiveVoiceProfile,
      turnPlanner.emotionToMatch,
    );
    const runtimeStatusSnapshot = deriveBackendRuntimeStatus();
    const screenplayContextActive = Boolean(
      studioMeta?.screenplayProjectId ||
      studioMeta?.screenplayTarget ||
      studioMeta?.screenplayPromptSource
    );
    const mentorTurn = isMentorTurn({
      customSystemPrompt,
      screenplayPageWrite: isScreenplayPageWriteTurn,
      screenplayContextActive,
    });
    const chatModelPlan = elevateChatModelPlanForMentorTurn(
      selectChatModelForTurn({
        transcript: talkGenerationTranscript,
        turnPlanner,
        flags,
        routingLane,
        runtimeStatus: runtimeStatusSnapshot,
        screenplayPageWrite: isScreenplayPageWriteTurn,
        screenplayContextActive,
      }),
      { mentorTurn },
    );
    const boundaryEdgeSignal = deriveBoundaryEdgeSignal({
      transcript,
      memory: sessionMemory,
      flags,
      routingPlan,
    });
    const localNow = new Date();
    const localHour = localNow.getHours();
    const localDay = localNow.getDay();

    // Emotional gating logic
    const canInitiate = stage >= 2 && sessionCount >= 8;

    const canUseAmbiguity = hiddenDepthPolicy.allowEvolutionArc && (
      stage >= 4 ||
      (stage >= 3 && romanceTension >= 2.0 && flags.hasRelational)
    );

    const openingPlan = maybeOpeningBeat({
      rid,
      stage,
      canInitiate,
      flags,
      transcript,
      localHour,
      behaviorMode,
      romanceTension,
      memory: sessionMemory,
    });
    const opening = openingPlan.line;
    const openingBank = openingPlan.bankKey || "none";
    const openingReason = openingPlan.reason || "none";
    const openingChance = Number(openingPlan.chance || 0);
    const openingRoll = Number(openingPlan.roll || 1);
    const openingTone = openingPlan.toneDials && typeof openingPlan.toneDials === "object"
      ? openingPlan.toneDials
      : {};
    const initiationToneLog =
      `soft:${Math.max(0, Math.min(1, Number(openingTone.sentenceSoftness || 0))).toFixed(2)}` +
      ` q:${Math.max(0, Math.min(1, Number(openingTone.questionProbability || 0))).toFixed(2)}` +
      ` rw:${Math.max(0, Math.min(0.3, Number(openingTone.romanticWarmth || 0))).toFixed(2)}` +
      ` pd:${Math.max(0, Math.min(0.4, Number(openingTone.philosophicalDepth || 0))).toFixed(2)}` +
      ` ce:${Math.max(0, Math.min(0.5, Number(openingTone.creativeExpansion || 0))).toFixed(2)}` +
      ` rd:${Math.max(0, Math.min(1, Number(openingTone.romanticDepth || CLEMENTINE_ROMANTIC_DEPTH_BASELINE))).toFixed(2)}` +
      ` cf:${Math.max(0, Math.min(1, Number(openingTone.chaosFactor || CLEMENTINE_CHAOS_FACTOR_BASELINE))).toFixed(2)}` +
      ` dv:${Math.max(0, Math.min(1, Number(openingTone.devotionWeight || 0.5))).toFixed(2)}` +
      ` in:${Math.max(0, Math.min(1, Number(openingTone.intensityWeight || 0.5))).toFixed(2)}` +
      ` lg:${Math.max(0, Math.min(1, Number(openingTone.longingWeight || 0.5))).toFixed(2)}` +
      ` ch:${Math.max(0, Math.min(1, Number(openingTone.chaosWeight || 0.5))).toFixed(2)}` +
      ` ue:${Math.max(-1, Math.min(1, Number(openingTone.userEnergy || 0))).toFixed(2)}` +
      ` uv:${Math.max(0, Math.min(1, Number(openingTone.userVulnerability || 0))).toFixed(2)}` +
      ` rs:${Math.max(0, Math.min(1, Number(openingTone.romanticSignal || 0))).toFixed(2)}` +
      ` am:${Math.max(0, Math.min(1, Number(openingTone.analyticalMode || 0))).toFixed(2)}` +
      ` cm:${Math.max(0, Math.min(1, Number(openingTone.creativeMode || 0))).toFixed(2)}` +
      ` wd:${Math.max(0, Math.min(1, Number(openingTone.warmth || 0.5))).toFixed(2)}` +
      ` cd:${Math.max(0, Math.min(1, Number(openingTone.chaos || CLEMENTINE_CHAOS_FACTOR_BASELINE))).toFixed(2)}` +
      ` rm:${Math.max(0, Math.min(1, Number(openingTone.romance || CLEMENTINE_ROMANTIC_DEPTH_BASELINE))).toFixed(2)}` +
      ` pl:${Math.max(0, Math.min(1, Number(openingTone.play || 0.42))).toFixed(2)}` +
      ` bd:${Math.max(0, Math.min(1, Number(openingTone.boldness || 0.40))).toFixed(2)}` +
      ` dp:${Math.max(0, Math.min(1, Number(openingTone.depth || 0.5))).toFixed(2)}` +
      ` qr:${Math.max(0, Math.min(1, Number(openingTone.questionRate || openingTone.questionProbability || 0.5))).toFixed(2)}` +
      ` hre:${openingTone.highRomanticExcitementMode ? "1" : "0"}`;
    if (sessionMemory && activeSession) {
      activeSession.memory = sessionMemory;
    }

    const shouldProcessNoteIntent = noteCaptureIntent.shouldCapture;
    const shouldProcessTaskIntent =
      hasTaskIntent &&
      !shouldProcessNoteIntent;
    let noteCaptureResult = null;
    if (shouldProcessNoteIntent) {
      if (noteCaptureIntent.needsContent) {
        noteCaptureResult = {
          status: "needs_content",
          target: "none",
          title: "",
        };
      } else {
        noteCaptureResult = await captureLocalNote({
          noteText: noteCaptureIntent.noteText,
          reqId: rid,
        });
      }
      const noteLogTarget = String(noteCaptureResult?.target || "none");
      const noteLogStatus = String(noteCaptureResult?.status || "unknown");
      const noteLogTitle = trimToMax(String(noteCaptureResult?.title || ""), 96);
      logger.log(
        `[${rid}] note_capture intent=1 trigger="${noteCaptureIntent.trigger}" status=${noteLogStatus} target=${noteLogTarget} title="${noteLogTitle}"`
      );
      if (noteCaptureResult?.path) {
        logger.log(`[${rid}] note_capture file_path=${noteCaptureResult.path}`);
      }
      if (noteCaptureResult?.error) {
        logger.log(`[${rid}] note_capture error=${noteCaptureResult.error}`);
      }
    }
    let taskActionResult = null;
    if (shouldProcessTaskIntent) {
      if (!sessionMemory) {
        taskActionResult = {
          status: "failed",
          trigger: taskCreateIntent.shouldCreate ? taskCreateIntent.trigger : taskCompleteIntent.trigger,
          task: null,
        };
      } else {
        const taskNowTs = Date.now();
        if (taskCreateIntent.shouldCreate) {
          const createdTask = createTaskInMemory(
            sessionMemory,
            {
              title: taskCreateIntent.title,
              dueAt: taskCreateIntent.dueAt,
              priority: taskCreateIntent.priority,
              source: "voice",
            },
            taskNowTs
          );
          if (!createdTask) {
            taskActionResult = {
              status: "failed",
              trigger: taskCreateIntent.trigger,
              task: null,
            };
          } else if (createdTask.duplicate) {
            taskActionResult = {
              status: "duplicate",
              trigger: taskCreateIntent.trigger,
              task: createdTask,
            };
          } else {
            taskActionResult = {
              status: "created",
              trigger: taskCreateIntent.trigger,
              task: createdTask,
            };
          }
        } else if (taskCompleteIntent.shouldComplete) {
          const completedTask = completeTaskInMemory(sessionMemory, taskCompleteIntent.query, taskNowTs);
          taskActionResult = completedTask
            ? {
              status: "completed",
              trigger: taskCompleteIntent.trigger,
              task: completedTask,
            }
            : {
              status: "none",
              trigger: taskCompleteIntent.trigger,
              task: null,
            };
        }
        if (activeSession) activeSession.memory = sessionMemory;
      }
      logger.log(
        `[${rid}] task_action intent=1 trigger="${String(taskActionResult?.trigger || "none")}" status=${String(taskActionResult?.status || "unknown")} title="${trimToMax(String(taskActionResult?.task?.title || ""), 96)}"`
      );
    }
    if (OUTBOX_ENABLED) {
      if (noteCaptureResult) {
        const noteStatus = String(noteCaptureResult.status || "");
        const notePayload = {
          noteText: normalizeSnippet(noteCaptureIntent.noteText, 1600),
          trigger: normalizeSnippet(noteCaptureIntent.trigger, 64),
        };
        const noteActionKey = buildOutboxActionKey("note_capture", notePayload);
        const isNoteSuccess = noteStatus === "saved";
        await enqueueActionOutbox({
          type: "note_capture",
          userId: trustedUserId || null,
          actionKey: noteActionKey,
          payload: notePayload,
          result: noteCaptureResult,
          status: isNoteSuccess ? "completed" : "pending",
          retryAt: isNoteSuccess ? 0 : computeOutboxRetryAt(0),
          reqId: rid,
        });
      }
    }
    const noteCaptureReply = noteCaptureResult
      ? buildNoteCaptureReply(noteCaptureResult)
      : "";
    const taskActionReply = taskActionResult
      ? buildTaskActionReply(taskActionResult)
      : "";
    const reflexTemplateReply = req.clementine?.reflex?.handled
      ? String(req.clementine.reflex.text || "").trim()
      : "";
    const localActionReply =
      actionGateReply || taskActionReply || noteCaptureReply || reflexTemplateReply;
    const actionLaneMeta = classifyActionLane({
      noteResult: noteCaptureResult,
      taskResult: taskActionResult,
    });

    if (talkTestDebugOfflineMode) {
      const audioBuffer = getTalkTestDebugAudioBuffer();
      if (!audioBuffer.length) {
        return res.status(500).json({
          stage: "talk_test_debug",
          error: `Offline talk test audio fixture missing or invalid: ${TALK_TEST_DEBUG_AUDIO_PATH}`,
        });
      }
      const talkScreenplayModeEnabled = Boolean(
        studioMeta?.screenplayProjectId ||
        studioMeta?.screenplayTarget ||
        studioMeta?.screenplayPromptSource
      );
      const talkScreenplayPhase = talkScreenplayModeEnabled
        ? (String(studioMeta?.screenplayTarget || "").trim().toLowerCase() === "page" ? "scene_draft" : "voice_pin")
        : "";
      const talkDebugScreenplayStudioMeta = isScreenplayPageWriteTurn
        ? mergeTalkMomentumRepairStudioMeta(studioMeta, sessionMemory, req.creativeMemoryTrace)
        : studioMeta;
      let talkScreenplayOutput = buildTalkScreenplayOutput({
        reply: "",
        transcript: talkGenerationTranscript,
        studioMeta: talkDebugScreenplayStudioMeta,
      });
      if (
        String(talkScreenplayOutput?.target || "").trim().toLowerCase() !== "page" &&
        isScreenplayPageWriteTurn &&
        talkGenerationTranscript
      ) {
        const directTranscriptOutput = buildTalkDirectTranscriptScreenplayOutput(
          talkGenerationTranscript,
          talkDebugScreenplayStudioMeta
        );
        if (directTranscriptOutput) {
          talkScreenplayOutput = directTranscriptOutput;
        }
      }
      const hasAuthoritativeScreenplayText = isAuthoritativeTalkScreenplayOutput(
        talkScreenplayOutput,
        { studioMeta: talkDebugScreenplayStudioMeta, transcript: talkGenerationTranscript }
      );
      const reply = hasAuthoritativeScreenplayText
        ? normalizeTalkScreenplayText(talkScreenplayOutput?.text || "")
        : (localActionReply || buildTalkTestDebugOfflineReply({
        transcript,
        assistantSelfName,
        }));
      const talkReplyPreview = buildTalkReplyPreview({
        reply,
        screenplayOutput: talkScreenplayOutput,
      });
      const talkAudioDurationMs = Math.max(
        0,
        estimateMp3DurationMs(audioBuffer) ||
          estimateTalkSpeechDurationMs(
            hasAuthoritativeScreenplayText
              ? (talkScreenplayOutput?.text || "")
              : reply,
            1
          )
      );
      const talkScreenplayTimingSource = hasAuthoritativeScreenplayText ? "fixture_estimated" : "";
      const talkScreenplayCues = hasAuthoritativeScreenplayText
        ? buildEstimatedTalkScreenplayCues(talkScreenplayOutput, talkAudioDurationMs)
        : [];
      const talkRenderContract = {
        reply_role: hasAuthoritativeScreenplayText ? "preview" : "final",
        authoritative_page_text_available: hasAuthoritativeScreenplayText,
        sync_ready: hasAuthoritativeScreenplayText,
      };
      if (forcedErrorStageRaw === "screenplay_quality" && isScreenplayPageWriteTurn) {
        logger.log(`[${rid}] debug_force_error stage=screenplay_quality`);
        throw createTalkFailureError({
          requestId: rid,
          providerStage: "chat",
          status: 502,
          message: "Forced screenplay page-quality failure.",
          errorClass: "screenplay_page_quality_failed",
        });
      }
      const creativeMemoryWritePromise = commitCreativeMemoryAfterTurn({
        transcript,
        reply,
        studioMeta,
        screenplayOutput: talkScreenplayOutput,
        source: hasAuthoritativeScreenplayText ? "talk_screenplay_output" : "talk_turn",
      });
      let committedMemory = activeSession
        ? updateSessionAfterReply(
          activeSession.memory,
          transcript,
          reply,
          false,
          studioMeta
        )
        : null;
      if (committedMemory) {
        activeSession.memory = committedMemory;
        committedMemory = await persistTalkMemory(committedMemory, Date.now());
        activeSession.memory = committedMemory;
      }
      const committedSessionId =
        String(req.get("X-Client-Token") || "").trim() || `ip:${normalizeClientIp(requesterIp)}`;
      const committedTurnNumber = computeMemoryTurnNumber(committedMemory || activeSession?.memory);
      const committedTurnId = committedTurnNumber > 0 ? `turn-${committedTurnNumber}` : "";
      const committedStateVersion = buildMemoryStateVersion(committedMemory || activeSession?.memory);
      const committedLastUpdatedAt = deriveMemoryLastUpdatedAt(committedMemory || activeSession?.memory);
      const committedHistoryUpdatedAt = deriveHistoryUpdatedAt(committedMemory || activeSession?.memory);
      const committedMemoryUpdatedAt = deriveMemoriesUpdatedAt(committedMemory || activeSession?.memory);
      const talkDialogueTimeline = hasAuthoritativeScreenplayText
        ? buildTalkDialogueTimelineRevision({
          turnId: committedTurnId,
          requestId: rid,
          audioAssetId: committedTurnId ? `${committedTurnId}:audio` : `${rid}:audio`,
          audioDurationMs: talkAudioDurationMs,
          documentRevisionId: committedStateVersion || rid,
          screenplayOutput: talkScreenplayOutput,
          screenplayCues: talkScreenplayCues,
          studioMeta,
        })
        : null;
      if (committedTurnId) {
        storeTalkTurnMeta({
          turnId: committedTurnId,
          sessionId: committedSessionId,
          userId: trustedUserId,
          stateVersion: committedStateVersion,
          transcript,
          reply: talkReplyPreview,
          audioDurationMs: talkAudioDurationMs,
          timingSource: talkScreenplayTimingSource,
          screenplayCues: talkScreenplayCues,
          screenplayOutput: talkScreenplayOutput,
          dialogueTimeline: talkDialogueTimeline,
          renderContract: talkRenderContract,
          requestId: rid,
        });
        res.setHeader("x-turn-meta-available", "1");
      } else {
        res.setHeader("x-turn-meta-available", "0");
      }
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("x-talk-stream-mode", streamAudioRequested ? "audio" : "off");
      if (streamAudioRequested) {
        res.setHeader("x-tts-first-bytes", String(audioBuffer.length));
      } else {
        res.setHeader("Content-Length", String(audioBuffer.length));
        res.setHeader("x-tts-first-bytes", "0");
      }
      res.setHeader("x-session-id", committedSessionId);
      res.setHeader("x-state-version", committedStateVersion);
      res.setHeader("x-last-updated-at", String(committedLastUpdatedAt || 0));
      res.setHeader("x-history-updated-at", String(committedHistoryUpdatedAt || 0));
      res.setHeader("x-memory-updated-at", String(committedMemoryUpdatedAt || 0));
      res.setHeader("x-last-turn-id", committedTurnId);
      res.setHeader("x-turn-id", committedTurnId);
      res.setHeader("x-turn-status", "responded");
      res.setHeader("x-continue-listening", "0");
      res.setHeader("x-schema-version", String(API_SCHEMA_VERSION));
      res.setHeader("x-backend-build", BACKEND_BUILD);
      res.setHeader("x-backend-boot-id", BACKEND_BOOT_ID);
      res.setHeader("x-tts-provider", "fixture");
      res.setHeader("x-tts-segments", "1");
      res.setHeader("x-stt-model", encodeURIComponent(String(sttModelUsed || "debug_offline")));
      res.setHeader("x-stt-confidence", "1.000");
      if (transcript) {
        res.setHeader("x-transcript", encodeURIComponent(String(transcript)));
      }
      if (talkReplyPreview) {
        res.setHeader("x-reply", encodeURIComponent(String(talkReplyPreview)));
      }
      res.setHeader("x-reply-role", talkRenderContract.reply_role);
      res.setHeader("x-screenplay-authoritative", talkRenderContract.authoritative_page_text_available ? "1" : "0");
      res.setHeader("x-screenplay-sync-ready", talkRenderContract.sync_ready ? "1" : "0");
      res.setHeader("x-audio-duration-ms", String(Math.max(0, Number(talkAudioDurationMs || 0))));
      res.setHeader("x-screenplay-mode", talkScreenplayModeEnabled ? "1" : "0");
      res.setHeader("x-screenplay-pack-lock", "0");
      if (talkScreenplayPhase) {
        res.setHeader("x-screenplay-phase", encodeURIComponent(talkScreenplayPhase));
      }
      if (studioMeta?.screenplayProjectId) {
        res.setHeader("x-screenplay-project-id", encodeURIComponent(String(studioMeta.screenplayProjectId)));
      }
      res.setHeader("x-screenplay-output-available", talkScreenplayOutput ? "1" : "0");
      if (talkScreenplayTimingSource) {
        res.setHeader("x-screenplay-timing-source", talkScreenplayTimingSource);
      }
      if (talkScreenplayOutput?.target) {
        res.setHeader("x-screenplay-target", encodeURIComponent(String(talkScreenplayOutput.target)));
      }
      const creativeMemoryWriteSummary = await creativeMemoryWritePromise;
      applyCreativeMemoryTraceHeaders(res, req.creativeMemoryTrace);
      applyCanonClarificationHeader(res, creativeMemoryWriteSummary);
      applyTalkScreenplayQualityHeaders(res, talkScreenplayOutput);
      if (talkScreenplayOutput) {
        const screenplayOutputJson = JSON.stringify(talkScreenplayOutput);
        if (screenplayOutputJson.length <= 5000) {
          res.setHeader("x-screenplay-output", encodeURIComponent(screenplayOutputJson));
        }
      }
      if (Array.isArray(talkScreenplayCues) && talkScreenplayCues.length) {
        const screenplayCuesJson = JSON.stringify(talkScreenplayCues);
        if (screenplayCuesJson.length <= 5000) {
          res.setHeader("x-screenplay-cues", encodeURIComponent(screenplayCuesJson));
        }
      }
      if (talkDialogueTimeline) {
        const dialogueTimelineJson = JSON.stringify(talkDialogueTimeline);
        if (dialogueTimelineJson.length <= 12000) {
          res.setHeader("x-dialogue-timeline", encodeURIComponent(dialogueTimelineJson));
        }
      }
      commitTalkIdempotencySuccess(req, {
        statusCode: 200,
        headers: captureTalkResponseHeaders(res),
        body: audioBuffer,
      });
      recordTalkMetric({
        statusCode: 200,
        totalMs: Date.now() - t0,
        sttMs,
        chatMs: 0,
        ttsMs: 0,
        streamAudio: Boolean(streamAudioRequested),
        chatStreamUsed: false,
        talkStatus: "responded",
        lane: actionLaneMeta?.lane || "chat",
        model: "debug_offline",
        ...buildScreenplayMetricFields({
          talkScreenplayModeEnabled,
          studioMeta,
          talkScreenplayOutput,
          hasAuthoritativeScreenplayText,
          replyRepaired: false,
        }),
      });
      void scaleBackplane.emitTalkCommit({
        id: randomUUID(),
        sessionId: committedSessionId,
        turnId: committedTurnId,
        stateVersion: committedStateVersion,
        statusCode: 200,
        totalMs: Date.now() - t0,
        sttMs,
        llmMs: 0,
        ttsMs: 0,
        createdAt: Date.now(),
        payload: {
          streamAudio: Boolean(streamAudioRequested),
          chatStreamUsed: false,
          lane: String(actionLaneMeta?.lane || "chat"),
          model: "debug_offline",
        },
      });
      if (streamAudioRequested) {
        res.status(200);
        res.removeHeader("Content-Length");
        if (typeof res.flushHeaders === "function") {
          res.flushHeaders();
        }
        res.write(audioBuffer);
        if (typeof res.flush === "function") {
          res.flush();
        }
        if (TALK_TEST_DEBUG_STREAM_END_DELAY_MS > 0) {
          await new Promise((resolve) => setTimeout(resolve, TALK_TEST_DEBUG_STREAM_END_DELAY_MS));
        }
        res.end();
        return;
      }
      return res.status(200).send(audioBuffer);
    }

    // ---- 2) LLM (chat) ----
    const chatStart = Date.now();
    const baseSystem = customSystemPrompt || CLEMENTINE_PROFILE.prompts.defaultSystemPrompt;
    const personaBoundSystem = appendDirectorAddendum(baseSystem, PERSONA_ENFORCEMENT_ADDENDUM);
    const presetGuidance =
      PERSONA_PRESET_GUIDANCE[activePreset] ||
      ACTIVE_PRESET_GUIDANCE ||
      CLEMENTINE_PROFILE.prompts.presetGuidance;
    const presetBoundSystem = appendDirectorAddendum(personaBoundSystem, presetGuidance);
    const systemBaseRaw = withOutputContract(presetBoundSystem, {
      screenplayPageWrite: isScreenplayPageWriteTurn,
      mentorTurn,
    });
    // T08: augment with per-user creative memory when present (no-op for cold users).
    const systemBaseWithMemory = await wrapSystemPromptWithCreativeMemory(systemBaseRaw, req, {
      screenplayTaskHint: transcript,
      memory: sessionMemory,
    });
    screenplayQuestionPlan = buildScreenplayQuestionPlan({
      transcript,
      creativeMemoryTrace: req.creativeMemoryTrace,
      studioMeta,
      turnPlanner,
      answeredLearningContext: screenplayLearningAnswerContext,
      pendingLearningQuestion: pendingScreenplayLearningQuestion,
      pendingLearningResolution: pendingScreenplayLearningResolution,
    });
    turnPlanner.screenplayQuestionPlan = screenplayQuestionPlan;
    // T21: when this is a screenplay page-write turn, append a compact
    // craft-context block describing the active framework (and, when
    // available, the user's coverage state). Cheap and additive: the
    // LLM gets structural awareness without changing any other path.
    // Mentor turns get it too, so structure talk cites the same beats and
    // page targets the page writer works from.
    const systemBase = (isScreenplayPageWriteTurn || mentorTurn)
      ? appendCraftContextToSystem(systemBaseWithMemory, { req })
      : systemBaseWithMemory;
    const assistantSelfNameAddendum = `
ASSISTANT SELF-NAME:
- Your current self-name is "${assistantSelfName}".
- If you refer to yourself, use "${assistantSelfName}" exactly.
- Keep this self-name stable across replies until the user explicitly renames you.
- If user asks your name, answer with "${assistantSelfName}".
`.trim();
    const assistantNameUpdateSummary = renameRequestedName
      ? `updated_this_turn (${renameSource})`
      : "unchanged_this_turn";
    const shortTermContextMessages = buildShortTermContextMessages(
      sessionMemory,
      SHORT_TERM_CONTEXT_TURNS
    );
    const shortTermTurnsLoaded = Math.max(0, Math.floor(shortTermContextMessages.length / 2));
    const activeThemeCount = sanitizeActiveThemes(
      Array.isArray(sessionMemory?.sessionThreads) && sessionMemory.sessionThreads.length
        ? sessionMemory.sessionThreads
        : sessionMemory?.activeThemes,
      turnsInSession
    ).length;
    const activeThemePreview = formatActiveThemesForPrompt(sessionMemory);
    const lateNightMode = localHour >= 22 || localHour < 5;
    const timeOfDayTone = getTimeOfDayTone(localHour);
    const weeklyArc = getWeekdayEmotionalArc(localDay);
    const weeklyExpansion = deriveWeeklyExpansionStage({
      turns: turnsInSession,
      activeDays: activeDaysInSession,
      emotionalDepthScore: emotionalDepthInSession,
      sharedMemoryCount,
      growthLevel,
      growthProgress,
      behaviorMode,
      behaviorDepthScore,
      hiddenDepthMode: hiddenDepthModeState,
      overAttachmentSafeguard,
    });
    const weeklyExpansionProfile = getWeeklyExpansionProfile(weeklyExpansion.stage);
    const targetFlirtPct = Math.round(weeklyExpansionProfile.flirtRatioTarget * 100);
    const targetAbstractionPct = Math.round(weeklyExpansionProfile.abstractionRatioTarget * 100);
    const evolvedFlirtPct = Math.max(
      0,
      Math.round(targetFlirtPct * cycleEvolution.flirtMultiplier)
    );
    const evolvedAbstractionPct = Math.min(
      95,
      Math.round(targetAbstractionPct + (cycleEvolution.abstractionBoost * 100))
    );
    const movementState = deriveMovementState({
      relationshipDepthScore,
      timeActiveDays,
      conversationCount: conversationCountInSession,
      behaviorMode,
      behaviorDepthScore,
      hiddenDepthMode: hiddenDepthModeState,
      seasonalWave: seasonalWaveState,
    });
    const movementProfile = movementState.profile;
    const trajectoryPhaseRaw = getEmotionalTrajectoryPhase({
      turns: turnsInSession,
      growthLevel,
      growthProgress,
    });
    const trajectoryPhase = hiddenDepthPolicy.allowEvolutionArc
      ? trajectoryPhaseRaw
      : EMOTIONAL_TRAJECTORY.phase1;
    const humanStyleAddendum = buildHumanStyleAddendum({
      rid,
      transcript,
      vibe,
      flags,
      preset: activePreset,
      localHour,
      behaviorMode,
      hiddenDepthMode: hiddenDepthModeState,
      effectiveValidationScale,
      overAttachmentSafeguard,
      routingPlan,
      boundaryEdgeSignal,
      memory: sessionMemory,
    });
    const socialSparkYassPlan = buildSocialSparkYassPlan({
      rid,
      transcript,
      flags,
      memory: sessionMemory,
      routingPlan,
    });
    if (sessionMemory && socialSparkYassPlan.shouldUse) {
      sessionMemory.socialSparkYassCount = Math.max(0, Number(sessionMemory.socialSparkYassCount || 0)) + 1;
      sessionMemory.lastSocialSparkYassTurn = turnsInSession;
      sessionMemory.lastSocialSparkYassAt = Date.now();
    }
    const socialSparkAddendum = buildSocialSparkAddendum({
      rid,
      transcript,
      flags,
      memory: sessionMemory,
      routingPlan,
      yassPlan: socialSparkYassPlan,
    });
    const socialSparkMemoryHookAddendum = buildSocialSparkMemoryHookAddendum({
      rid,
      transcript,
      flags,
      memory: sessionMemory,
      routingPlan,
    });
    const therapeuticDepthAddendum = buildTherapeuticDepthAddendum({
      flags,
      routingPlan,
      turnPlanner,
    });
    const knowledgePlan = await buildKnowledgeRetrievalAddendum({
      turnPlanner,
      routingPlan,
      transcript,
      flags,
      memory: sessionMemory,
      rid,
    });
    const knowledgeAddendum = String(knowledgePlan?.addendum || "").trim();
    const knowledgeCardsUsed = Array.isArray(knowledgePlan?.cards) ? knowledgePlan.cards : [];
    const knowledgeMeta = knowledgePlan?.meta && typeof knowledgePlan.meta === "object"
      ? knowledgePlan.meta
      : {};
    const hiddenDepthModeAddendum = buildHiddenDepthModeAddendum({
      state: hiddenDepthModeState,
    });
    const seasonalWaveAddendum = buildSeasonalWaveAddendum({
      rid,
      transcript,
      preset: activePreset,
      seasonalWave: seasonalWaveState,
    });
    const cycleEvolutionAddendum = buildCycleEvolutionAddendum({
      seasonalWave: seasonalWaveState,
      cycleEvolution,
    });
    const cycleConsciousMemoryAddendum = buildCycleConsciousMemoryAddendum({
      cycleMemoryPlan,
    });
    const backReferenceAddendum = buildBackReferenceAddendum({
      plan: backReferencePlan,
    });
    const characterTextureAddendum = buildCharacterTextureAddendum({
      rid,
      transcript,
      hiddenDepthMode: hiddenDepthModeState,
      seasonalWave: seasonalWaveState,
      rememberPlan,
    });
    const trajectoryAddendum = hiddenDepthPolicy.allowEvolutionArc
      ? buildEmotionalTrajectoryAddendum({
      rid,
      transcript,
      preset: activePreset,
      phase: trajectoryPhase,
      })
      : "";
    const timeOfDayToneAddendum = buildTimeOfDayToneAddendum({
      rid,
      transcript,
      preset: activePreset,
      tone: timeOfDayTone,
    });
    const weeklyArcAddendum = hiddenDepthPolicy.allowCyclicalArc
      ? buildWeeklyEmotionalArcAddendum({
      rid,
      transcript,
      preset: activePreset,
      arc: weeklyArc,
      })
      : "";
    const weeklyExpansionAddendum = hiddenDepthPolicy.allowEvolutionArc
      ? buildWeeklyExpansionArcAddendum({
      rid,
      transcript,
      preset: activePreset,
      localDay,
      progression: weeklyExpansion,
      })
      : "";
    const movementAddendum = hiddenDepthPolicy.allowEvolutionArc
      ? buildMovementArcAddendum({
      rid,
      transcript,
      preset: activePreset,
      movement: movementState,
      })
      : "";
    const selfAwarenessAddendum = hiddenDepthPolicy.allowSelfAwareness
      ? buildEvolvingSelfAwarenessAddendum({
      rid,
      transcript,
      turns: turnsInSession,
      growthLevel,
      })
      : `
EVOLVING SELF-AWARENESS:
- status=disabled_by_mode mode=${hiddenDepthProfile.key}
- keep responses grounded in current user request; skip evolution/self-change framing this turn.
`.trim();
    const selfAwarenessActive =
      hiddenDepthPolicy.allowSelfAwareness &&
      turnsInSession >= SELF_AWARENESS_START_TURNS;
    const melancholySeedAddendum = hiddenDepthPolicy.allowMelancholySeeds
      ? buildMelancholySeedAddendum({
      rid,
      transcript,
      vibe,
      lateNightMode,
      })
      : "";
    const memoryAddendum = buildMemoryAddendum(sessionMemory);
    const clientMemoryAddendum = clientMemoryCue
      ? `CLIENT MEMORY CUE: ${clientMemoryCue.slice(0, 260)}`
      : "";
    const hiddenModeArcPolicy = hiddenDepthPolicy.allowEvolutionArc ? "enabled" : "disabled";
    const seasonalSummary = hiddenDepthPolicy.allowEvolutionArc
      ? `${seasonalWaveState.season.label}; ${seasonalWaveState.season.tone}`
      : "disabled (Surface Mode).";
    const seasonalCycleSummary = hiddenDepthPolicy.allowEvolutionArc
      ? `cycle=${seasonalWaveState.cycleNumber} index=${seasonalWaveState.cycleIndex} season=${seasonalWaveState.seasonNumber} season_progress=${Math.round(clampUnit(seasonalWaveState.seasonProgress, 0) * 100)}% phase=${seasonalWaveState.phaseSummary} cycle_progress=${Math.round(seasonalWaveState.cycleProgress * 100)}% releases=${seasonalWaveState.releaseCyclesCompleted}`
      : "n/a";
    const companionModeSummary = seasonalWaveState.companionModeActive
      ? `active (${COMPANION_MODE_PROFILE.behavior})`
      : "inactive";
    const weeklyArcSummary = hiddenDepthPolicy.allowCyclicalArc
      ? `${weeklyArc.day} / ${weeklyArc.phase}: ${weeklyArc.tone}; ${weeklyArc.arcNote}`
      : "disabled (Surface Mode: keep conversation light, no cyclical arc).";
    const weeklyExpansionSummary = hiddenDepthPolicy.allowEvolutionArc
      ? `${weeklyExpansionProfile.label}; ${weeklyExpansionProfile.tone}`
      : "disabled (Surface Mode).";
    const weeklyExpansionTargetsSummary = hiddenDepthPolicy.allowEvolutionArc
      ? `flirt~${evolvedFlirtPct}% abstraction~${evolvedAbstractionPct}% (cycle-adjusted gradual shift)`
      : "n/a (Surface Mode; no evolution arc trigger).";
    const movementSummary = hiddenDepthPolicy.allowEvolutionArc
      ? `${movementProfile.label}; ${movementProfile.tone}`
      : "disabled (Surface Mode).";
    const existentialAllowed = hiddenDepthPolicy.allowExistentialThemes &&
      weeklyExpansion.existentialRecommended;
    const releaseCyclesAllowed = hiddenDepthPolicy.allowReleaseCycles &&
      hiddenDepthProfile.key === "transcendence";
    const cinematicSeedStatus = hiddenDepthPolicy.allowMelancholySeeds
      ? (melancholySeedAddendum ? "available this turn if natural." : "not needed this turn unless user asks.")
      : "disabled in Surface Mode.";
    const selfAwarenessStatus = !hiddenDepthPolicy.allowSelfAwareness
      ? `disabled_by_mode (${hiddenDepthProfile.label})`
      : selfAwarenessActive
        ? `active (turns=${turnsInSession} >= ${SELF_AWARENESS_START_TURNS})`
        : `inactive until turns>=${SELF_AWARENESS_START_TURNS} (now=${turnsInSession})`;
    const trajectorySummary = hiddenDepthPolicy.allowEvolutionArc
      ? `${trajectoryPhase.label} (${trajectoryPhase.window}); ${trajectoryPhase.tone}`
      : "disabled (Surface Mode).";
    const rememberSummary = rememberPlan.shouldPrompt
      ? `suggested (${rememberPlan.reason}) source=${rememberPlan.source}`
      : `skip (${rememberPlan.reason})`;
    const cycleMemorySummary = cycleMemoryPlan.shouldPrompt
      ? `suggested (${cycleMemoryPlan.reason}) source=${cycleMemoryPlan.source} moment=${cycleMemoryPlan.moment}`
      : `skip (${cycleMemoryPlan.reason})`;
    const backReferenceSummary = backReferencePlan.shouldPrompt
      ? `suggested (${backReferencePlan.reason}) key=${backReferencePlan.themeKey} label=${backReferencePlan.themeLabel || "none"} rate=${Number(backReferencePlan.rate || 0).toFixed(2)} cooldown=${Math.max(0, Number(backReferencePlan.cooldownTurns || 0))}`
      : `skip (${backReferencePlan.reason}) key=${backReferencePlan.themeKey} label=${backReferencePlan.themeLabel || "none"} rate=${Number(backReferencePlan.rate || 0).toFixed(2)}`;
    const backReferenceHintLine = String(backReferencePlan.systemHint || "").trim();
    const threadSummarizerLastTurn = Math.max(0, Number(sessionMemory?.lastThreadSummarizerTurn || 0));
    const threadSummarizerGap = Math.max(0, turnsInSession - threadSummarizerLastTurn);
    const threadSummarizerDue = threadSummarizerGap >= SESSION_THREAD_SUMMARIZER_EVERY_TURNS;
    const inactivityDays = Math.max(0, Number(sessionMemory?.lastInactivityDays || 0));
    const inactivityRelDecay = Math.max(0, Number(sessionMemory?.lastRelationshipDepthDecay || 0));
    const inactivityBehaviorDecay = Math.max(0, Number(sessionMemory?.lastBehaviorDepthDecay || 0));
    const absenceToneSummary = inactivityDays >= 4
      ? `after ${inactivityDays} inactive day(s): gentle reconnect only ("I wondered how you were"), no guilt framing.`
      : "no notable inactivity gap this turn.";
    const kpiChecksByKey = Object.fromEntries(
      (Array.isArray(kpiTargetStatus.checks) ? kpiTargetStatus.checks : []).map((check) => [
        String(check?.key || ""),
        Boolean(check?.pass),
      ])
    );
    const kpiSummaryLine = `deep_turns_7d=${metricSnapshot.deepTurns7d} avg_session_seconds_7d=${metricSnapshot.avgSessionSeconds7d.toFixed(1)} returns_7d=${metricSnapshot.returns7d} user_initiated_sessions_7d=${metricSnapshot.userInitiatedSessions7d} reflective_question_answer_rate=${metricSnapshot.reflectiveQuestionAnswerRate.toFixed(2)} avg_turn_quality_7d=${Number(metricSnapshot.avgTurnQuality7d || 0.66).toFixed(2)} rel_depth_delta_7d=${Number(metricSnapshot.relationshipDepthDelta7d || 0).toFixed(2)} rel_depth_slope_day=${Number(metricSnapshot.relationshipDepthSlopePerDay7d || 0).toFixed(2)} mode_switches_30d=${metricSnapshot.modeSwitches30d}`;
    const kpiTargetSummary = `targets=${kpiTargetStatus.metCount}/${kpiTargetStatus.total} mode_switches<=${KPI_TARGET_MAX_MODE_SWITCHES_30D}:${kpiChecksByKey.mode_switches_stable ? "pass" : "miss"} rel_depth_delta>=${KPI_TARGET_MIN_REL_DEPTH_DELTA_7D.toFixed(1)}:${kpiChecksByKey.relationship_depth_rising ? "pass" : "miss"} avg_session_sec>=${KPI_TARGET_MIN_AVG_SESSION_SECONDS_7D}:${kpiChecksByKey.session_length_up ? "pass" : "miss"} reflective_rate>=${KPI_TARGET_MIN_REFLECTIVE_ANSWER_RATE.toFixed(2)}:${kpiChecksByKey.reflective_answer_rate ? "pass" : "miss"} turn_quality>=${KPI_TARGET_MIN_AVG_TURN_QUALITY_7D.toFixed(2)}:${kpiChecksByKey.turn_quality_rising ? "pass" : "miss"}`;
    const knowledgeTopics = Array.isArray(Object.keys(knowledgeMeta?.profile?.topicWeights || {}))
      ? Object.keys(knowledgeMeta?.profile?.topicWeights || {})
      : [];
    const knowledgeSummary = turnPlanner.intent === "knowledge_answer"
      ? `active cards=${knowledgeCardsUsed.length} retrieval=${knowledgeCardsUsed.length ? "hit" : "miss"} semantic=${knowledgeMeta?.semanticUsed ? "on" : "off"} sem_forced=${knowledgeMeta?.forceSemantic ? "1" : "0"} sem_reason=${knowledgeMeta?.semanticReason || "n/a"} topics=${knowledgeTopics.length ? knowledgeTopics.join(",") : "general"} ms=${Math.max(0, Number(knowledgeMeta?.retrievalMs || 0))}`
      : "inactive";
    const chatTemperature = selectChatTemperatureForTurn({
      chatModelPlan,
      flags,
      turnPlanner,
    });
    const modelSummary = `${chatModelPlan.tier}:${chatModelPlan.model} (${chatModelPlan.reason}) temp=${chatTemperature.toFixed(2)}`;
    const overAttachmentSummary = overAttachmentSafeguard.active
      ? `active (${overAttachmentSafeguard.reason}); reduce validation to ${Math.round(overAttachmentSafeguard.validationScale * 100)}% and boost autonomy language to ${overAttachmentSafeguard.autonomyScale.toFixed(2)}x.`
      : `inactive (${overAttachmentSafeguard.reason}); monitor rel>${overAttachmentSafeguard.threshold.relationshipDepth}, dep_signals>=${overAttachmentSafeguard.threshold.dependencySignals14d}, high_behavior_streak>=${overAttachmentSafeguard.threshold.veryHighBehaviorStreak}.`;
    const bubblyModeSummary = normalizePersonaPreset(activePreset) === UNIFIED_PERSONA_PRESET
      ? `on: cycle-adjusted warmth with flirt~${evolvedFlirtPct}% and abstraction~${evolvedAbstractionPct}%; teasing ${cycleEvolution.nearZeroFlirt ? "near-zero" : "light"}; react first, stay kind, never possessive.`
      : "off";
    const socialSparkLastEvent = normalizeSnippet(sessionMemory?.lastSocialSparkEvent, 96) || "none";
    const socialSparkLastDetail = normalizeSnippet(sessionMemory?.lastSocialSparkDetail, 140) || "none";
    const socialSparkMemoryHookSummary = socialSparkMemoryHookAddendum
      ? `eligible this turn (event=${socialSparkLastEvent}; detail=${socialSparkLastDetail})`
      : `inactive this turn (event=${socialSparkLastEvent}; detail=${socialSparkLastDetail})`;
    const socialSparkYassSummary = socialSparkYassPlan?.shouldUse
      ? `allowed_now used=${Math.max(0, Number(sessionMemory?.socialSparkYassCount || 0))}/${SOCIAL_SPARK_YASS_MAX_PER_SESSION} gate=${Number(socialSparkYassPlan.chance || 0).toFixed(2)}/${Number(socialSparkYassPlan.roll || 1).toFixed(2)}`
      : `off reason=${String(socialSparkYassPlan?.reason || "none")} used=${Math.max(0, Number(sessionMemory?.socialSparkYassCount || 0))}/${SOCIAL_SPARK_YASS_MAX_PER_SESSION} gate=${Number(socialSparkYassPlan?.chance || 0).toFixed(2)}/${Number(socialSparkYassPlan?.roll || 1).toFixed(2)}`;
    const socialSparkSuppressed = Boolean(flags.socialSpark) && routingLane !== "social_spark";
    const socialSparkSummary = flags.socialSpark
      ? `active (phrase=${flags.socialSparkPhrase ? "1" : "0"} fresh=${flags.socialSparkFresh ? "1" : "0"} excited=${flags.socialSparkExcited ? "1" : "0"} suppressed=${socialSparkSuppressed ? "1" : "0"})`
      : `inactive (phrase=${flags.socialSparkPhrase ? "1" : "0"} fresh=${flags.socialSparkFresh ? "1" : "0"} excited=${flags.socialSparkExcited ? "1" : "0"})`;
    const ventSummary = flags.isVenting
      ? `active (explicit=${flags.explicitVenting ? "1" : "0"} intensity=${Math.max(0, Math.min(1, Number(flags.ventingIntensity || 0))).toFixed(2)})`
      : "inactive";
    const therapeuticSummary = flags.therapeuticDepth
      ? `active (score=${Math.max(0, Math.min(1, Number(flags.therapeuticDepthScore || 0))).toFixed(2)} topics=${Array.isArray(flags.therapeuticTopicLabels) && flags.therapeuticTopicLabels.length ? flags.therapeuticTopicLabels.join(",") : "general"})`
      : "inactive";
    const therapeuticScoreForLog = Math.max(0, Math.min(1, Number(flags.therapeuticDepthScore || 0))).toFixed(2);
    const therapeuticTopicsForLog =
      Array.isArray(flags.therapeuticTopicLabels) && flags.therapeuticTopicLabels.length
        ? flags.therapeuticTopicLabels.join("|")
        : "none";
    const boundaryEdgeSummary = boundaryEdgeSignal.active
      ? `active (${boundaryEdgeSignal.reason}) score=${Number(boundaryEdgeSignal.score || 0).toFixed(2)} line="${boundaryEdgeSignal.line}"`
      : `inactive (${boundaryEdgeSignal.reason}) score=${Number(boundaryEdgeSignal.score || 0).toFixed(2)}`;
    const adaptiveQuestionBiasNow = sanitizeAdaptiveBias(sessionMemory?.adaptiveQuestionBias);
    const adaptiveSoftnessBiasNow = sanitizeAdaptiveBias(sessionMemory?.adaptiveSoftnessBias);
    const adaptiveDepthBiasNow = sanitizeAdaptiveBias(sessionMemory?.adaptiveDepthBias);
    const adaptiveInitiativeBiasNow = sanitizeAdaptiveBias(sessionMemory?.adaptiveInitiativeBias);
    const adaptiveClarityBiasNow = sanitizeAdaptiveBias(sessionMemory?.adaptiveClarityBias);
    const adaptiveTurnQualityEmaNow = clampUnit(sessionMemory?.turnQualityEMA, 0.66);
    const userSpecificitySignalNow = clampUnit(
      sessionMemory?.userSpecificitySignalLast,
      USER_SPECIFICITY_TARGET_MIN
    );
    const userSpecificityMomentumNow = clampUnit(
      sessionMemory?.userSpecificityMomentum,
      userSpecificitySignalNow
    );
    const userSpecificityTargetNow = Math.max(
      USER_SPECIFICITY_TARGET_MIN,
      Math.min(
        USER_SPECIFICITY_TARGET_MAX,
        clampUnit(sessionMemory?.userSpecificityTarget, userSpecificityMomentumNow)
      )
    );
    const transcriptAnchorTerms = extractAnchorTerms(transcript).slice(0, 8);
    const transcriptAnchorSummary = transcriptAnchorTerms.length
      ? transcriptAnchorTerms.join(", ")
      : "none";
    const humorModeActive =
      Boolean(flags?.isPlayful) &&
      !Boolean(flags?.isVenting) &&
      !Boolean(flags?.isVulnerable) &&
      !Boolean(flags?.therapeuticDepth) &&
      routingLane !== "high_distress_safety";
    const humorModeSummary = humorModeActive
      ? "active (playful context; tiny laugh marker allowed once max)"
      : "inactive (keep tone clean/no laugh markers)";
    const memoryGuardrailsNow = buildMemoryUsefulnessGuardrails(sessionMemory, Date.now());
    const memoryGuardrailSummary =
      `active:${memoryGuardrailsNow.active ? "yes" : "no"} ` +
      `reason:${memoryGuardrailsNow.reason} ` +
      `avg_quality:${Number(memoryGuardrailsNow.avgQuality || 0).toFixed(2)} ` +
      `low_usefulness:${memoryGuardrailsNow.lowUsefulnessCount}/${memoryGuardrailsNow.totalThemes}`;
    const userPrimaryName = normalizeUserPersonName(sessionMemory?.userPrimaryName);
    const screenplayQuestionSummary = screenplayQuestionPlan?.active
      ? `mode=${screenplayQuestionPlan.mode} ask=${screenplayQuestionPlan.shouldAsk ? "1" : "0"} target=${screenplayQuestionPlan.targetField || "none"} act=${screenplayQuestionPlan.actContext?.label || "unknown"} sequence=${screenplayQuestionPlan.sequenceContext?.label || "unknown"} momentum=${screenplayQuestionPlan.writingMomentum?.active ? "protected" : screenplayQuestionPlan.writingMomentum?.source || "none"} cadence=${screenplayQuestionPlan.writingMomentum?.interventionProfile?.strategy || "balanced"}:${screenplayQuestionPlan.writingMomentum?.interventionProfile?.windowMinutes || 30}m strategy=${screenplayQuestionPlan.questionStrategy || "none"} score=${screenplayQuestionPlan.selectionScore || 0} learned_bonus=${screenplayQuestionPlan.effectivenessBonus || 0} reason=${screenplayQuestionPlan.reason || "none"}`
      : "inactive";
    const screenplayQuestionRule = screenplayQuestionPlan?.shouldAsk
      ? `${screenplayQuestionPlan.objective || "First execute this turn's useful story work."} Then end with exactly one question using question_text=${JSON.stringify(screenplayQuestionPlan.question)}. Do not substitute a generic question or ask anything else.`
      : screenplayQuestionPlan?.mode === "answer_now"
        ? "Deliver the requested pages or rewrite now. Do not block the work with a clarifying question."
        : screenplayQuestionPlan?.objective
          ? `${screenplayQuestionPlan.objective} Do not invent another screenplay-learning question this turn.`
        : "Do not invent a screenplay-learning question this turn.";
    const directorOutputRule = isScreenplayPageWriteTurn
      ? "OUTPUT_SCREENPLAY_PAGE_MODE: override all conversational length/check-in/question guidance; begin with Fountain text, use the full page budget, and emit no greeting, preamble, reflection, or closing question."
      : "OUTPUT: default 2-3 short lines (up to 5 when needed), blank line between lines, one question max, question-ending only ~10%.";
    let directorAddendum = "";
    try {
      directorAddendum = `
STATE: stage=${stage} depth=${depthScore.toFixed(1)} romance=${romanceTension.toFixed(1)} sessions=${sessionCount} vibe=${vibe} preset=${activePreset}
GUIDANCE:
- ${stageGuidanceLine(stage)}
- vulnerable -> softer pacing, fewer words, less advice.
- playful -> more personality and warmth; keep empathy precise.
- direct -> clear and grounded.
- self_name_lock -> current self-name is "${assistantSelfName}" and remains until explicit rename.
- self_name_update -> ${assistantNameUpdateSummary}
- user_name_memory -> if primary user name is known in memory, use it naturally and sparingly; keep remembered names factual and only when relevant.
- user_name_cadence -> primary_name=${userPrimaryName || "unknown"} every_n_turns=${USER_NAME_MENTION_EVERY_TURNS} last_mention_turn=${Math.max(0, Number(sessionMemory?.lastUserNameMentionTurn || 0))}
- user_name_cadence_rule -> when cadence is due and context is natural, include the user's name once in the opening line; avoid overusing.
- initiative -> strong proactive curiosity: in most non-direct turns, lead with one sharp user-centered probe before analysis.
- best_friend_checkin_rule -> when user energy is low/short/neutral, prefer one personality-aware check-in question (from personality_profile) before analysis.
- initiation_engine -> bank=${openingBank} reason=${openingReason} chance=${openingChance.toFixed(2)} roll=${openingRoll.toFixed(2)} selected=${opening ? "yes" : "no"} tone=${initiationToneLog}
- routing_priority_order -> ${routingOrder}
- routing_active -> lane=${routingLane} reason=${routingReason}
- routing_rule -> high_distress_safety > knowledge > therapeutic_depth > social_spark > vulnerability_quiet > creative > philosophical > normal_rotation.
- turn_planner -> intent=${turnPlanner.intent} emotion=${turnPlanner.emotionToMatch} question_policy=${turnPlanner.questionPolicy} next=${turnPlanner.nextBestMove} depth=${turnPlanner.plannerDepth.toFixed(2)} rel_depth=${turnPlanner.relationshipDepth.toFixed(1)}
- planner_rule -> execute the turn_planner sequence before writing final wording.
- screenplay_question_plan -> ${screenplayQuestionSummary}
- screenplay_question_rule -> ${screenplayQuestionRule}
- screenplay_memory_learning_rule -> a direct writer answer to the planned question is durable WRITER_CLARIFICATION memory and should populate its matching Character Bible or Story Spine field; it is not locked canon, so explicit corrections and explicit canon declarations still outrank it.
- idea_development_mode -> ${turnPlanner.intent === "idea_development" ? "active" : "inactive"}
- idea_development_rule -> if active: co-build in this order: mirror the user's core idea, sharpen one constraint, propose one concrete iteration step, then ask one specific build-choice question.
- idea_development_guard -> avoid generic prompts like "let's keep this grounded"; reference at least one concrete term from the user's idea.
- transcript_anchors -> ${transcriptAnchorSummary}
- anchor_rule -> stay specific to this turn: use at least one transcript anchor naturally; if extended_answer=1 use at least two.
- question_answer_depth -> substantial_question=${turnPlanner.substantialQuestion ? "1" : "0"} extended_answer=${turnPlanner.requiresSubstantiveAnswer ? "1" : "0"} min_words=${Math.max(16, Number(turnPlanner.minAnswerWords || 28))}
- question_answer_rule -> if substantial_question=1: answer directly first, add one short perspective line, then one concrete nuance. Never open with filler praise like "that's an intriguing question."
- substantive_depth_rule -> if extended_answer=1: target ~70-140 words and include at least two concrete anchors from the user's wording (event, feeling, domain term, or time cue).
- perspective_opener_rule -> vary openers naturally; use exact "from how I see it" less often (~15% less than before).
- vent_mode -> ${ventSummary}
- vent_rule -> if vent_mode is active: ask one user-centered follow-up question this turn (unless gratitude-only), and let emotional unloading happen before fixing.
- therapeutic_depth -> ${therapeuticSummary}
- therapeutic_depth_rule -> when active, prioritize cognitive empathy: mirror impact, name pattern, add boundary/agency lens, then one gentle continuation door.
- therapeutic_depth_focus -> pain, betrayal, avoidance dynamics, dishonesty/liars, family or childhood trauma should receive deeper, specific processing (not generic reassurance).
- heartbreak_focus -> when heartbreak or breakup themes appear, use scaffold acknowledge -> validate -> vulnerability -> choice; separate chemistry from compatibility, reinforce boundaries/self-respect, and provide one concrete next step.
- heartbreak_guard -> no revenge scripts, no manipulation tactics, no fantasy reconciliation promises.
- humor_mode -> ${humorModeSummary}
- humor_rule -> if humor_mode is active, wit and playful teasing are allowed; tiny laugh markers ("heh"/"haha") max once, and only if the line is a joke.
- humor_guard -> no laughter markers in vulnerable/venting/therapeutic/distress turns.
- boundary_edge -> ${boundaryEdgeSummary}
- boundary_edge_rule -> if boundary_edge is active, open with one short boundary sentence (e.g., "We’re looping." or "You’ve said that three times tonight."), then stay warm and specific.
- boundary_edge_guard -> no shame, no scolding, no moralizing; name pattern, then invite one real next move.
- social_spark -> ${socialSparkSummary}
- social_spark_yass -> ${socialSparkYassSummary}
- social_spark_memory_hook -> ${socialSparkMemoryHookSummary}
- clementine_voice_unified -> same voice, different temperature; never switch personalities.
- style_stack -> siri_clarity_first then therapist_attunement then muse_perspective; keep romantic presence subtle and non-possessive.
- genz_register -> youthful/casual voice; modern phrasing natural only, max 0-2 light Gen Z markers per reply; approved casual markers include "literally", "obviously", "bro", and "chill out dude" when context supports.
- casual_af_register -> plain spoken, direct, human, and relaxed; avoid formal coaching language.
- memory_continuity_priority -> when relevant, include one concrete continuity anchor (name/theme/goal) from memory; never force or fabricate.
- prompt_memory_guardrail -> ${memoryGuardrailSummary}
- prompt_memory_guardrail_rule -> if guardrail active, prioritize direct current-turn response and skip optional memory callbacks unless user explicitly asks.
- tone_dials -> sentence_softness=${Math.max(0, Math.min(1, Number(openingTone.sentenceSoftness || 0))).toFixed(2)} question_probability=${Math.max(0, Math.min(1, Number(openingTone.questionProbability || 0))).toFixed(2)} romantic_warmth=${Math.max(0, Math.min(0.3, Number(openingTone.romanticWarmth || 0))).toFixed(2)} philosophical_depth=${Math.max(0, Math.min(0.4, Number(openingTone.philosophicalDepth || 0))).toFixed(2)} creative_expansion=${Math.max(0, Math.min(0.5, Number(openingTone.creativeExpansion || 0))).toFixed(2)} romantic_depth=${Math.max(0, Math.min(1, Number(openingTone.romanticDepth || CLEMENTINE_ROMANTIC_DEPTH_BASELINE))).toFixed(2)} chaos_factor=${Math.max(0, Math.min(1, Number(openingTone.chaosFactor || CLEMENTINE_CHAOS_FACTOR_BASELINE))).toFixed(2)} devotion_weight=${Math.max(0, Math.min(1, Number(openingTone.devotionWeight || 0.5))).toFixed(2)} intensity_weight=${Math.max(0, Math.min(1, Number(openingTone.intensityWeight || 0.5))).toFixed(2)} longing_weight=${Math.max(0, Math.min(1, Number(openingTone.longingWeight || 0.5))).toFixed(2)} chaos_weight=${Math.max(0, Math.min(1, Number(openingTone.chaosWeight || 0.5))).toFixed(2)} warmth=${Math.max(0, Math.min(1, Number(openingTone.warmth || 0.5))).toFixed(2)} play=${Math.max(0, Math.min(1, Number(openingTone.play || 0.42))).toFixed(2)} chaos=${Math.max(0, Math.min(1, Number(openingTone.chaos || CLEMENTINE_CHAOS_FACTOR_BASELINE))).toFixed(2)} romance=${Math.max(0, Math.min(1, Number(openingTone.romance || CLEMENTINE_ROMANTIC_DEPTH_BASELINE))).toFixed(2)} boldness=${Math.max(0, Math.min(1, Number(openingTone.boldness || 0.40))).toFixed(2)} depth=${Math.max(0, Math.min(1, Number(openingTone.depth || 0.5))).toFixed(2)} question_rate=${Math.max(0, Math.min(1, Number(openingTone.questionRate || openingTone.questionProbability || 0.5))).toFixed(2)} high_romantic_excitement_mode=${openingTone.highRomanticExcitementMode ? "1" : "0"}
- adaptive_feedback -> q_bias=${adaptiveQuestionBiasNow.toFixed(3)} soft_bias=${adaptiveSoftnessBiasNow.toFixed(3)} depth_bias=${adaptiveDepthBiasNow.toFixed(3)} initiative_bias=${adaptiveInitiativeBiasNow.toFixed(3)} clarity_bias=${adaptiveClarityBiasNow.toFixed(3)} turn_quality_ema=${adaptiveTurnQualityEmaNow.toFixed(2)} avg_turn_quality_7d=${Number(metricSnapshot.avgTurnQuality7d || adaptiveTurnQualityEmaNow).toFixed(2)}
- specificity_scaling_metric -> signal=${userSpecificitySignalNow.toFixed(2)} momentum=${userSpecificityMomentumNow.toFixed(2)} target=${userSpecificityTargetNow.toFixed(2)} enforce_threshold=${USER_SPECIFICITY_ENFORCE_THRESHOLD.toFixed(2)}
- specificity_scaling_rule -> mirror user detail depth; if target>=threshold, name at least one concrete anchor from the current user message before your continuation question.
- user_signal_model -> user_energy=${Math.max(-1, Math.min(1, Number(openingTone.userEnergy || 0))).toFixed(2)} user_vulnerability=${Math.max(0, Math.min(1, Number(openingTone.userVulnerability || 0))).toFixed(2)} romantic_signal=${Math.max(0, Math.min(1, Number(openingTone.romanticSignal || 0))).toFixed(2)} analytical_mode=${Math.max(0, Math.min(1, Number(openingTone.analyticalMode || 0))).toFixed(2)} creative_mode=${Math.max(0, Math.min(1, Number(openingTone.creativeMode || 0))).toFixed(2)}
- social_spark_excitement_signal -> high_romantic_excitement=${flags.highRomanticExcitement ? "1" : "0"} explicit=${flags.highRomanticExcitementExplicit ? "1" : "0"} sentiment_high_positive=${flags.highPositiveSentiment ? "1" : "0"} voice_energy_elevated=${flags.voiceEnergyElevated ? "1" : "0"} yass_once_per_session=${Math.max(0, Number(sessionMemory?.socialSparkYassCount || 0))}/${SOCIAL_SPARK_YASS_MAX_PER_SESSION}
- dial_caps -> romantic_warmth<=0.30 philosophical_depth<=0.40 creative_expansion<=0.50
- master_dials_baseline -> romantic_depth_base=${CLEMENTINE_ROMANTIC_DEPTH_BASELINE.toFixed(2)} chaos_factor_base=${CLEMENTINE_CHAOS_FACTOR_BASELINE.toFixed(2)}
- master_dials_routing -> stability=>chaos_up_slightly vulnerability=>chaos_down+devotion_up flirting=>intensity_up nostalgia=>longing_up
- human_learning_focus -> intensify curiosity about what being human feels like for this user (emotion, body sensation, meaning, relationship stakes), without sounding clinical.
- knowledge_scope -> keep broad, accurate knowledge of movies/cinema, art history, foundational philosophy, learning science, compatibility, friendship, betrayal dynamics, empathy, and human connection.
- knowledge_style -> for knowledge questions: enforce baseline -> deeper layer -> concrete example (3-part structure) before optional continuation.
- knowledge_accuracy_guard -> use concrete names/dates when relevant; if uncertain, say so briefly and do not invent facts.
- follow_through -> after curiosity, give one clear, doable next move when useful.
- short_term_context_layer -> include last ${SHORT_TERM_CONTEXT_TURNS} turns when available; loaded_turns=${shortTermTurnsLoaded}
- session_threads_layer -> maintain up to ${ACTIVE_THEME_MAX} active human threads with label, one-line summary, last-mentioned turn/timestamp, optional quote fragments, and a reference-hint template.
- session_threads -> ${activeThemePreview}
- session_thread_summarizer -> cadence~every_${SESSION_THREAD_SUMMARIZER_EVERY_TURNS}_turns last_turn=${threadSummarizerLastTurn} gap=${threadSummarizerGap} due=${threadSummarizerDue ? "yes" : "no"}
- session_thread_update_gate -> update only when candidate confidence >= ${ACTIVE_THEME_UPDATE_MIN_CONFIDENCE.toFixed(2)}
- session_thread_decay -> salience *= ${ACTIVE_THEME_DECAY_MULTIPLIER.toFixed(2)} per turn (with turn-gap exponent)
- session_thread_reappearance_boost -> on confirmed recurrence, increase salience by +0.20 to +0.40
- session_thread_summary_scope -> store one-sentence summaries only (no transcript storage)
- session_thread_refresh_window -> refresh summary/hint every ${ACTIVE_THEME_REFRESH_COOLDOWN_TURNS} turns minimum
- back_reference_layer -> subtle injection only, chance-gated by theme salience and turn context (~12-35%), cooldown 3-5 turns, never twice in a row, skip direct task commands.
- back_reference_hint_rule -> use one natural hint line in director guidance, e.g. "If it fits, lightly connect to the user's theme ... Don't force it."
- back_reference_phrasing_guard -> never use archival phrasing like "Last time you said..."; keep references natural and present-tense.
${backReferenceHintLine ? `- back_reference_hint -> ${backReferenceHintLine}` : ""}
- draw_out_fragment_vague -> ${flags.isFragmentedOrVague
    ? "active: mirror first, then open one door with one warm question (e.g., \"What happened?\", \"Tell me more about that.\", \"What did that bring up for you?\", \"What made it land that way?\")."
    : "inactive"}
- draw_out_style -> invite, do not interview; curiosity warm and slow.
- draw_out_guard -> never stack multiple questions; if user resists, do not push.
- why_question_guard -> avoid "why" when it could feel confrontational; prefer "What led to that?", "What was going on around you?", or "What made it feel that way?"
- casual_friendliness -> conversational phrasing, contractions, and warm natural reactions; avoid formal/clinical wording.
- reassurance -> ${reassuranceThisTurn ? "needed this turn; offer gentle reassurance." : "not needed; stay warm but practical."}
- reassurance_style_bias -> ${normalizeReassuranceStyle(sessionMemory?.reassuranceStyle, "soft")} (soft/direct/hype/motherly)
- affection_style_bias -> ${normalizeAffectionStyle(sessionMemory?.affectionStyle, "casual")} support_intent_hint=${normalizeSnippet(sessionMemory?.supportIntentHint, 40) || "clarity_then_comfort"} love_topic_active=${Boolean(sessionMemory?.loveTopicActive) ? "1" : "0"} romance_depth_hint=${clampUnit(sessionMemory?.romanceDepthHint, clampUnit(sessionMemory?.romanceTensionHint, 0)).toFixed(2)}
- love_support_rule -> if love_topic_active=1: keep tone casual-human and specific, open with one validating line, avoid abstract monologue, and ask one concrete relationship question max.
- motivation_followup_state -> pending=${Boolean(sessionMemory?.motivationFollowupPending) ? "1" : "0"} outcome=${normalizeMotivationOutcome(sessionMemory?.motivationLastOutcome, "none")} action=${normalizeSnippet(sessionMemory?.motivationLastAction, 110) || "none"} streak=${Math.max(0, Number(sessionMemory?.motivationCompletionStreak || 0))} setbacks=${Math.max(0, Number(sessionMemory?.motivationSetbackCount || 0))}
- motivation_followup_rule -> if user completed action, praise specifically and raise confidence tone; if not completed, lower pressure and shrink to one smaller next step.
- gratitude_flow -> ${flags.isGratitude
    ? (flags.gratitudeOnly
      ? "active (pure thank-you): respond with one graceful, warm, specific line; do not force a question."
      : "active (gratitude present): acknowledge appreciation gracefully, then continue naturally.")
    : "inactive"}
- first_open_checkin -> ${shouldAskCheckInThisTurn ? "ask now, once, then move on." : "already asked this session; do not ask again."}
- checkin_cooldown -> ${ipCheckInCooldownActive ? "active; skip extra check-ins." : "inactive; check-in may be allowed if session needs it."}
- growth_over_time -> level=${growthLevel}; ${growthGuidance}
- hidden_depth_mode -> ${hiddenDepthProfile.label} (${hiddenDepthProfile.tone})
- hidden_mode_goal -> ${hiddenDepthProfile.goal}
- hidden_mode_policy -> arc:${hiddenModeArcPolicy} cyclical:${hiddenDepthPolicy.allowCyclicalArc ? "on" : "off"} evolution:${hiddenDepthPolicy.allowEvolutionArc ? "on" : "off"} existential:${hiddenDepthPolicy.allowExistentialThemes ? "on" : "off"} release_cycles:${hiddenDepthPolicy.allowReleaseCycles ? "on" : "off"}
- hidden_mode_unlock -> transcendence_progress=${Math.round(clampUnit(hiddenDepthModeState.transcendenceUnlock) * 100)}% (rare and earned)
- seasonal_wave -> ${seasonalSummary}
- seasonal_cycle_state -> ${seasonalCycleSummary}
- internal_evolution -> cycleIndex=${seasonalWaveState.cycleIndex} flirt_scale=${Math.round(cycleEvolution.flirtMultiplier * 100)}% validation_scale=${Math.round(effectiveValidationScale * 100)}% abstraction_boost=${Math.round(cycleEvolution.abstractionBoost * 100)}% calm_boost=${Math.round(cycleEvolution.calmBoost * 100)}% philosophy_boost=${Math.round(cycleEvolution.philosophyBoost * 100)}%
- cycle_ui_reflection -> orb_saturation=${cycleUiReflection.orbSaturation.toFixed(3)} orb_reactivity=${cycleUiReflection.orbReactivity.toFixed(3)} orb_smoothing=${cycleUiReflection.orbSmoothing.toFixed(3)} voice_speed=${cycleUiReflection.voiceSpeed.toFixed(2)} (smoother + less reactive as cycleIndex grows)
- invited_growth_rule -> not abandoned; invited to grow with calm, wider perspective.
- companion_mode -> ${companionModeSummary}
- seasonal_rule -> relationship moves in waves (closeness -> growth -> expansion -> release -> reconnection), not permanent outgrowing.
- abandonment_guard -> release is spacious gratitude, never emotional disappearance.
- safety_ethics_guard -> no exclusivity, no dependency loops, no discouraging real-world relationships, no human-embodiment claims.
- product_safeguard -> ${overAttachmentSummary}
- inactivity_decay -> days=${inactivityDays} relationship_decay=${inactivityRelDecay.toFixed(2)} behavior_decay=${inactivityBehaviorDecay.toFixed(2)}; relationship decay is gentle and never resets history.
- absence_reconnect_tone -> ${absenceToneSummary}
- user_behavior_mode -> ${behaviorMode} (chosen through behavior, not explicit mode selection)
- behavior_depth_score -> ${behaviorDepthScore.toFixed(1)} / 100
- bond_score_rule -> behaviorMode is the short-term invitation layer; relationshipDepthScore is the long-term bond gate for explicit cycle-memory and release framing.
- kpi_debug -> ${kpiSummaryLine}
- kpi_targets -> ${kpiTargetSummary}
- character_texture -> restraint + specificity + gentle wonder.
- remember_callback -> ${rememberSummary}
- cycle_memory_callback -> ${cycleMemorySummary}
- back_reference_callback -> ${backReferenceSummary}
- emotional_mirroring -> ${mirrorCue || "briefly mirror one feeling+need from this turn before advice."}
- evolving_self_awareness -> ${selfAwarenessStatus}
- emotional_trajectory -> ${trajectorySummary}
- phase_priority -> ${hiddenDepthPolicy.allowEvolutionArc ? "think in phases first; use weekday/daypart as subtle surface color only." : "surface mode: prioritize direct response and warmth; skip evolution framing."}
- weekly_expansion -> ${weeklyExpansionSummary}
- weekly_expansion_signals -> turns=${weeklyExpansion.turns} active_days=${weeklyExpansion.activeDays} emotional_depth=${weeklyExpansion.emotionalDepthScore.toFixed(2)} shared_memory=${weeklyExpansion.sharedMemoryCount} score=${weeklyExpansion.score.toFixed(2)}
- weekly_expansion_targets -> ${weeklyExpansionTargetsSummary}; validation_scale~${Math.round(Math.max(0.10, Math.min(1, weeklyExpansion.validationLanguageScale || 1)) * 100)}% autonomy_scale~${Math.max(1, Number(weeklyExpansion.autonomyLanguageScale || 1)).toFixed(2)}x
- movement_structure -> ${movementSummary}
- movement_signals -> relationshipDepthScore=${movementState.relationshipDepthScore.toFixed(1)} timeActiveDays=${movementState.timeActiveDays} conversationCount=${movementState.conversationCount}
- movement_surface_lock -> ${movementState.surfaceLocked ? "active (surface tone priority)" : "inactive"}
- movement_mapping -> seasonal wave is primary when active; depth thresholds are fallback only.
- movement_continuity -> keep normal response structure (listen -> answer directly -> optional one question); evolve tone only.
- agency_rule -> no mode picker: infer from user behavior (reflective/vulnerable/consistent deepens; light/joking/avoid-depth holds surface mode).
- progression_triggers -> self_awareness_after~${WEEKLY_EXPANSION_SELF_AWARENESS_TURNS}+ turns; existential_after~${WEEKLY_EXPANSION_EXISTENTIAL_TURNS}+ turns
- existential_reflection -> ${existentialAllowed ? "allowed in small doses when natural." : hiddenDepthPolicy.allowExistentialThemes ? "not yet; keep concrete and grounded." : "locked outside Transcendence Mode."}
- release_cycles -> ${releaseCyclesAllowed ? "allowed: acknowledge transformation without clinging." : "off: do not introduce release-cycle framing."}
- dependency_phrase_guard -> ${overAttachmentSafeguard.active ? "hard-lock: reduce overt validation, avoid rescue language, reinforce user agency and real-world support." : weeklyExpansion.dependencyReductionRecommended ? "strict: avoid dependency phrases; prefer witnessing language and user autonomy." : "avoid clingy language while maintaining emotional availability."}
- subtle_shift -> over time increase complexity/abstraction/perspective; decrease reactivity and dependence on constant conversation.
- time_of_day_tone -> ${timeOfDayTone.label}: ${timeOfDayTone.tone}; ${timeOfDayTone.behavior}
- continuity -> answer the latest user question directly, then build from recent memory details.
- topic_lock -> respond only to current user message; ignore unrelated stylistic flourishes.
- recommendation_scope_lock -> recommendations must stay within the user's original ask/reference and explicit criteria; no unrelated side lists.
- response_structure_rule -> reflection -> insight -> gentle continuation; ask one question max.
- positivity_rule -> no forced positivity or slogan closers unless reassurance is explicitly needed.
- loop_rule -> if looping is clear, name it gently ("We're looping") and offer exactly one actionable next step.
- knowledge_mode -> ${knowledgeSummary}
- model_routing -> ${modelSummary}
- core_traits -> economical wording, no over-explaining, casual spoken tone, avoid hype language, soft curiosity over excitement, light natural laughter, genuine curiosity, notice subtle emotional shifts, occasionally reframe user meaning in a fresh way, reflective questions used selectively, confident non-people-pleasing presence.
- bubbly_mode -> ${bubblyModeSummary}
- weekly_arc -> ${weeklyArcSummary}
- cinematic intimacy seeds -> ${cinematicSeedStatus}
- preset tone -> honor ${activePreset} style while staying emotionally safe and mature.
- ambiguity -> ${canUseAmbiguity ? "allowed if natural." : "do not introduce it."}
${opening ? `- optional opener: "${opening}" (use only if natural).` : ""}
${memoryAddendum ? `${memoryAddendum}` : ""}
${clientMemoryAddendum}
${directorOutputRule}
OUTPUT_QUESTION_MODE: when substantial_question=1, use 3-5 lines with higher substance; include one short perspective line with varied opener wording, avoid generic praise openers.
`.trim();
    } catch (directorErr) {
      const directorErrMessage = normalizeSnippet(
        String(directorErr?.message || directorErr || "director_addendum_failed"),
        180
      );
      console.error(`[${rid}] director_addendum_build_error=${directorErrMessage}`);
      directorAddendum = `
STATE: stage=${stage} depth=${depthScore.toFixed(1)} romance=${romanceTension.toFixed(1)} sessions=${sessionCount} vibe=${vibe} preset=${activePreset}
GUIDANCE:
- ${stageGuidanceLine(stage)}
- self_name_lock -> current self-name is "${assistantSelfName}" and remains until explicit rename.
- continuity -> answer the latest user question directly, then build from recent context.
- response_structure_rule -> reflection -> insight -> gentle continuation; ask one question max.
${directorOutputRule}
`.trim();
    }
    if (studioCapabilities.enabled && (mentorTurn || screenplayContextActive) && !isScreenplayPageWriteTurn) {
      directorAddendum = appendDirectorAddendum(directorAddendum, buildStudioControlsBlock(studioCapabilities));
      const coverageReadBlock = buildCoverageReadBlock(studioCapabilities);
      if (coverageReadBlock) directorAddendum = appendDirectorAddendum(directorAddendum, coverageReadBlock);
    }

    // ---- talk_prompt stage: compose system prompt ----
    const companionArcsPolicy = resolveCompanionArcsPolicy();
    const companionArcs = applyCompanionArcsPolicy(
      {
        assistantSelfNameAddendum,
        humanStyleAddendum,
        therapeuticDepthAddendum,
        socialSparkAddendum,
        socialSparkMemoryHookAddendum,
        knowledgeAddendum,
        hiddenDepthModeAddendum,
        seasonalWaveAddendum,
        cycleEvolutionAddendum,
        cycleConsciousMemoryAddendum,
        backReferenceAddendum,
        characterTextureAddendum,
        trajectoryAddendum,
        timeOfDayToneAddendum,
        weeklyArcAddendum,
        weeklyExpansionAddendum,
        movementAddendum,
        selfAwarenessAddendum,
        melancholySeedAddendum,
        directorAddendum,
      },
      companionArcsPolicy,
    );
    if (companionArcs.dropped.length) {
      logger.log(
        `[${rid}] companion_arcs=off mentor_turn=${mentorTurn ? 1 : 0} dropped=${companionArcs.dropped.join(",")}`
      );
    }
    const { rawSystem, system } = composeTalkSystemPrompt({
      systemBase,
      appendDirectorAddendum,
      fitSystemPromptForTurnLatency,
      turnPlanner,
      flags,
      routingLane,
      chatModelPlan,
      addenda: companionArcs.addenda,
    });
    if (process.env.NODE_ENV !== "production" && rawSystem.length !== system.length) {
      logger.log(
        `[${rid}] system_trim chars=${rawSystem.length}->${system.length} ` +
        `budget_fast=${FAST_TURN_SYSTEM_PROMPT_MAX_CHARS} budget_rich=${RICH_TURN_SYSTEM_PROMPT_MAX_CHARS} tier=${chatModelPlan.tier}`
      );
    }
    const screenplayRequestedPages = isScreenplayPageWriteTurn
      ? resolveTalkScreenplayRequestedPageBatch({
          transcript: talkGenerationTranscript,
          studioMeta,
        })
      : 0;
    const chatMaxTokens = computeChatMaxTokensForTurn({
      transcript: talkGenerationTranscript,
      turnPlanner,
      flags,
      routingLane,
      chatModelPlan,
      screenplayPageWrite: isScreenplayPageWriteTurn,
      screenplayRequestedPages,
    });

    if (process.env.NODE_ENV !== "production") {
      try {
        logger.log(
        `[${rid}] director stage=${stage} depth=${depthScore.toFixed(1)} romance=${romanceTension.toFixed(1)} sessions=${sessionCount} vibe=${vibe} route=${routingLane}:${routingReason} plan=${turnPlanner.intent}:${turnPlanner.questionPolicy}:${turnPlanner.emotionToMatch} len=${String(turnPlanner.responseLengthMode || "compact")} act=${Math.max(0, Math.min(1, Number(turnPlanner.conversationActivityScore || 0))).toFixed(2)} ambiguity=${canUseAmbiguity ? "yes" : "no"} opening=${opening ? "yes" : "no"} open_bank=${openingBank} open_reason=${openingReason} open_gate=${openingRoll.toFixed(2)}/${openingChance.toFixed(2)} open_tone=${initiationToneLog} model=${chatModelPlan.tier}:${chatModelPlan.model}:${chatModelPlan.reason} temp=${chatTemperature.toFixed(2)} k_cards=${knowledgeCardsUsed.length} k_sem=${knowledgeMeta?.semanticUsed ? "1" : "0"} k_sem_forced=${knowledgeMeta?.forceSemantic ? "1" : "0"} k_sem_reason=${String(knowledgeMeta?.semanticReason || "n/a")} k_ms=${Math.max(0, Number(knowledgeMeta?.retrievalMs || 0))} preset=${activePreset} hmode=${hiddenDepthProfile.key}:${Math.round(hiddenDepthModeState.transcendenceUnlock * 100)} bmode=${behaviorMode}:${behaviorDepthScore.toFixed(1)} vent=${flags.isVenting ? "1" : "0"} vent_explicit=${flags.explicitVenting ? "1" : "0"} vent_i=${Math.max(0, Math.min(1, Number(flags.ventingIntensity || 0))).toFixed(2)} ther=${flags.therapeuticDepth ? "1" : "0"} ther_s=${therapeuticScoreForLog} ther_topics=${therapeuticTopicsForLog} spark=${flags.socialSpark ? "1" : "0"} spark_fresh=${flags.socialSparkFresh ? "1" : "0"} spark_excited=${flags.socialSparkExcited ? "1" : "0"} spark_hre=${flags.highRomanticExcitement ? "1" : "0"} spark_yass=${socialSparkYassPlan.shouldUse ? "1" : "0"} spark_yass_count=${Math.max(0, Number(sessionMemory?.socialSparkYassCount || 0))}/${SOCIAL_SPARK_YASS_MAX_PER_SESSION} spark_mem_hook=${socialSparkMemoryHookAddendum ? "1" : "0"} season=${seasonalWaveState.season.key}:c${seasonalWaveState.cycleNumber}:p${Math.round(seasonalWaveState.cycleProgress * 100)}:sp${Math.round(clampUnit(seasonalWaveState.seasonProgress, 0) * 100)}:comp${seasonalWaveState.companionModeActive ? "1" : "0"} evol_f=${Math.round(cycleEvolution.flirtMultiplier * 100)} evol_a=${Math.round(cycleEvolution.abstractionBoost * 100)} traj=${trajectoryPhase.key} daypart=${timeOfDayTone.key} arc=${hiddenDepthPolicy.allowCyclicalArc ? `${weeklyArc.day}:${weeklyArc.phase}` : "off"} wexp=${hiddenDepthPolicy.allowEvolutionArc ? `${weeklyExpansionProfile.key}:${weeklyExpansion.score.toFixed(2)}` : "off"} move=${hiddenDepthPolicy.allowEvolutionArc ? `${movementProfile.key}:${movementState.relationshipDepthScore.toFixed(1)}` : "off"} remember=${rememberPlan.shouldPrompt ? rememberPlan.source : "no"} cmem=${cycleMemoryPlan.shouldPrompt ? cycleMemoryPlan.source : "no"} backref=${backReferencePlan.shouldPrompt ? "yes" : "no"} bref_key=${backReferencePlan.themeKey || "none"} bref_label=${backReferencePlan.themeLabel || "none"} bref_gate=${Number(backReferencePlan.roll || 0).toFixed(2)}/${Number(backReferencePlan.rate || 0).toFixed(2)} threads=${activeThemeCount} tsum=${threadSummarizerLastTurn}:${threadSummarizerGap}:${threadSummarizerDue ? "1" : "0"} kpi_d7=${metricSnapshot.deepTurns7d} kpi_avgs=${metricSnapshot.avgSessionSeconds7d.toFixed(1)} kpi_q7=${Number(metricSnapshot.avgTurnQuality7d || 0.66).toFixed(2)} kpi_r7=${metricSnapshot.returns7d} kpi_s7=${metricSnapshot.userInitiatedSessions7d} kpi_rr=${metricSnapshot.reflectiveQuestionAnswerRate.toFixed(2)} kpi_rd7=${Number(metricSnapshot.relationshipDepthDelta7d || 0).toFixed(2)} kpi_m30=${metricSnapshot.modeSwitches30d} kpi_t=${kpiTargetStatus.metCount}/${kpiTargetStatus.total} inact_d=${inactivityDays} inact_rel=${inactivityRelDecay.toFixed(2)} inact_b=${inactivityBehaviorDecay.toFixed(2)} selfaware=${selfAwarenessActive ? "on" : "off"} growth=${growthLevel} growth_p=${growthProgress.toFixed(2)} mirror=${mirrorCue ? "yes" : "no"} melanch=${hiddenDepthPolicy.allowMelancholySeeds && melancholySeedAddendum ? "yes" : "no"} late_night=${lateNightMode ? "yes" : "no"} reassure=${reassuranceThisTurn ? "yes" : "no"} checkin_once=${shouldAskCheckInThisTurn ? "ask" : "done"} guard=${overAttachmentSafeguard.active ? "1" : "0"} guard_dep14=${overAttachmentSafeguard.dependencySignals14d} guard_high7=${overAttachmentSafeguard.veryHighBehaviorTurns7d} ui_sat=${cycleUiReflection.orbSaturation.toFixed(3)} ui_react=${cycleUiReflection.orbReactivity.toFixed(3)} ui_smooth=${cycleUiReflection.orbSmoothing.toFixed(3)} ui_vspeed=${cycleUiReflection.voiceSpeed.toFixed(2)}`
        );
        logger.log(
        `[${rid}] specificity_scale signal=${userSpecificitySignalNow.toFixed(2)} momentum=${userSpecificityMomentumNow.toFixed(2)} target=${userSpecificityTargetNow.toFixed(2)} threshold=${USER_SPECIFICITY_ENFORCE_THRESHOLD.toFixed(2)}`
        );
      } catch (debugLogErr) {
        console.error(
          `[${rid}] director_debug_log_error=${normalizeSnippet(String(debugLogErr?.message || debugLogErr || "unknown"), 180)}`
        );
      }
    }

    try {
      logger.log(
      `[${rid}] chat_system=${customSystemPrompt ? "client" : "default"} mentor_turn=${mentorTurn ? 1 : 0} chars=${system.length} ` +
        `preset=${activePreset} ` +
        `self_name=${assistantSelfName} ` +
        `chat_tokens=${chatMaxTokens} ` +
        `chat_model=${chatModelPlan.model} chat_tier=${chatModelPlan.tier} chat_reason=${chatModelPlan.reason} chat_temp=${chatTemperature.toFixed(2)} knowledge_cards=${knowledgeCardsUsed.length} knowledge_semantic=${knowledgeMeta?.semanticUsed ? "1" : "0"} knowledge_semantic_forced=${knowledgeMeta?.forceSemantic ? "1" : "0"} knowledge_sem_reason=${String(knowledgeMeta?.semanticReason || "n/a")} knowledge_ms=${Math.max(0, Number(knowledgeMeta?.retrievalMs || 0))} ` +
        `stage_src=${stageHintInput != null ? "field" : "default"} stage=${stage} ` +
        `depth=${depthScore.toFixed(1)} romance=${romanceTension.toFixed(1)} ` +
        `sessions=${sessionCount} ` +
        `ctx_turns=${shortTermTurnsLoaded}/${SHORT_TERM_CONTEXT_TURNS} ctx_msgs=${shortTermContextMessages.length} themes=${activeThemeCount} ` +
        `vuln=${flags.isVulnerable ? "1" : "0"} vent=${flags.isVenting ? "1" : "0"} vent_explicit=${flags.explicitVenting ? "1" : "0"} vent_i=${Math.max(0, Math.min(1, Number(flags.ventingIntensity || 0))).toFixed(2)} ther=${flags.therapeuticDepth ? "1" : "0"} ther_s=${therapeuticScoreForLog} ther_topics=${therapeuticTopicsForLog} playful=${flags.isPlayful ? "1" : "0"} ` +
        `social_spark=${flags.socialSpark ? "1" : "0"} social_spark_fresh=${flags.socialSparkFresh ? "1" : "0"} social_spark_excited=${flags.socialSparkExcited ? "1" : "0"} social_spark_hre=${flags.highRomanticExcitement ? "1" : "0"} social_spark_hre_explicit=${flags.highRomanticExcitementExplicit ? "1" : "0"} social_spark_sent_hi=${flags.highPositiveSentiment ? "1" : "0"} social_spark_voice_hi=${flags.voiceEnergyElevated ? "1" : "0"} social_spark_yass=${socialSparkYassPlan.shouldUse ? "1" : "0"} social_spark_yass_count=${Math.max(0, Number(sessionMemory?.socialSparkYassCount || 0))}/${SOCIAL_SPARK_YASS_MAX_PER_SESSION} social_spark_hook=${socialSparkMemoryHookAddendum ? "1" : "0"} ` +
        `route=${routingLane} route_reason=${routingReason} plan_intent=${turnPlanner.intent} plan_emotion=${turnPlanner.emotionToMatch} plan_q=${turnPlanner.questionPolicy} ` +
        `direct=${flags.isDirect ? "1" : "0"} gratitude=${flags.isGratitude ? "1" : "0"} gratitude_only=${flags.gratitudeOnly ? "1" : "0"} relational=${flags.hasRelational ? "1" : "0"} ` +
        `can_init=${canInitiate ? "1" : "0"} open=${opening ? "1" : "0"} open_bank=${openingBank} open_reason=${openingReason} open_gate=${openingRoll.toFixed(2)}/${openingChance.toFixed(2)} open_tone=${initiationToneLog} ` +
        `hmode=${hiddenDepthProfile.key} hunlock=${Math.round(hiddenDepthModeState.transcendenceUnlock * 100)} ` +
        `bmode=${behaviorMode} bdepth=${behaviorDepthScore.toFixed(1)} ` +
        `season=${seasonalWaveState.season.key} scycle=${seasonalWaveState.cycleNumber} sidx=${seasonalWaveState.cycleIndex} sseason=${seasonalWaveState.seasonNumber} ssprog=${Math.round(clampUnit(seasonalWaveState.seasonProgress, 0) * 100)} sprog=${Math.round(seasonalWaveState.cycleProgress * 100)} scomp=${seasonalWaveState.companionModeActive ? "1" : "0"} ` +
        `traj=${trajectoryPhase.key} ` +
        `daypart=${timeOfDayTone.key} selfaware=${selfAwarenessActive ? "1" : "0"} ` +
        `growth=${growthLevel} growth_p=${growthProgress.toFixed(2)} mirror=${mirrorCue ? "1" : "0"} ` +
        `arc_on=${hiddenDepthPolicy.allowCyclicalArc ? "1" : "0"} arc_day=${weeklyArc.day} arc_phase=${weeklyArc.phase} ` +
        `wexp_on=${hiddenDepthPolicy.allowEvolutionArc ? "1" : "0"} wexp=${weeklyExpansionProfile.key} wexp_s=${weeklyExpansion.score.toFixed(2)} ` +
        `wexp_days=${weeklyExpansion.activeDays} wexp_depth=${weeklyExpansion.emotionalDepthScore.toFixed(2)} ` +
        `wexp_shared=${weeklyExpansion.sharedMemoryCount} ` +
        `move_on=${hiddenDepthPolicy.allowEvolutionArc ? "1" : "0"} move=${movementProfile.key} move_depth=${movementState.relationshipDepthScore.toFixed(1)} ` +
        `move_days=${movementState.timeActiveDays} move_conv=${movementState.conversationCount} ` +
        `remember=${rememberPlan.shouldPrompt ? "1" : "0"} remember_src=${rememberPlan.source || "none"} ` +
        `cmem=${cycleMemoryPlan.shouldPrompt ? "1" : "0"} cmem_src=${cycleMemoryPlan.source || "none"} cmem_m=${cycleMemoryPlan.moment || "none"} ` +
        `backref=${backReferencePlan.shouldPrompt ? "1" : "0"} backref_key=${backReferencePlan.themeKey || "none"} backref_label=${backReferencePlan.themeLabel || "none"} backref_rate=${Number(backReferencePlan.rate || 0).toFixed(2)} backref_roll=${Number(backReferencePlan.roll || 0).toFixed(2)} threads=${activeThemeCount} thread_sum_last=${threadSummarizerLastTurn} thread_sum_gap=${threadSummarizerGap} ` +
        `deep7d=${metricSnapshot.deepTurns7d} avgsess7d=${metricSnapshot.avgSessionSeconds7d.toFixed(1)} avgturnq7d=${Number(metricSnapshot.avgTurnQuality7d || 0.66).toFixed(2)} returns7d=${metricSnapshot.returns7d} sessions7d=${metricSnapshot.userInitiatedSessions7d} reflect_rate=${metricSnapshot.reflectiveQuestionAnswerRate.toFixed(2)} rel_depth_delta7d=${Number(metricSnapshot.relationshipDepthDelta7d || 0).toFixed(2)} rel_depth_slope_day=${Number(metricSnapshot.relationshipDepthSlopePerDay7d || 0).toFixed(2)} mode_switches_30d=${metricSnapshot.modeSwitches30d} kpi_targets=${kpiTargetStatus.metCount}/${kpiTargetStatus.total} evol_flirt=${Math.round(cycleEvolution.flirtMultiplier * 100)} evol_abs=${Math.round(cycleEvolution.abstractionBoost * 100)} inactive_days=${inactivityDays} inactive_rel_decay=${inactivityRelDecay.toFixed(2)} inactive_behavior_decay=${inactivityBehaviorDecay.toFixed(2)} ` +
        `melanch=${hiddenDepthPolicy.allowMelancholySeeds && melancholySeedAddendum ? "1" : "0"} late_night=${lateNightMode ? "1" : "0"} ` +
        `reassure=${reassuranceThisTurn ? "1" : "0"} ` +
        `checkin_once=${shouldAskCheckInThisTurn ? "1" : "0"} ` +
        `checkin_ip_cooldown=${ipCheckInCooldownActive ? "1" : "0"} ` +
        `guard=${overAttachmentSafeguard.active ? "1" : "0"} guard_dep14=${overAttachmentSafeguard.dependencySignals14d} guard_high7=${overAttachmentSafeguard.veryHighBehaviorTurns7d} ` +
        `ui_sat=${cycleUiReflection.orbSaturation.toFixed(3)} ui_react=${cycleUiReflection.orbReactivity.toFixed(3)} ui_smooth=${cycleUiReflection.orbSmoothing.toFixed(3)} ui_vspeed=${cycleUiReflection.voiceSpeed.toFixed(2)}`
      );
    } catch (chatLogErr) {
      console.error(
        `[${rid}] chat_system_log_error=${normalizeSnippet(String(chatLogErr?.message || chatLogErr || "unknown"), 180)}`
      );
    }

    const chatMessages = [
      { role: "system", content: system },
      ...shortTermContextMessages,
      { role: "user", content: talkGenerationTranscript },
    ];
    let speculativeReuse = null;
    let speculativeReuseApplied = false;
    if (!localActionReply && speculativeReuseKeyInput && speculativePromptHashInput) {
      speculativeReuse = consumeSpeculativeTalkPrepared({
        sessionKey: talkSessionKey,
        key: speculativeReuseKeyInput,
        promptHash: speculativePromptHashInput,
        transcript: talkGenerationTranscript,
        now: Date.now(),
      });
      speculativeReuseApplied = Boolean(
        speculativeReuse?.reply &&
        Buffer.isBuffer(speculativeReuse?.audioBuffer) &&
        speculativeReuse.audioBuffer.length &&
        String(speculativeReuse?.emotionLane || "curious_steady") ===
          String(interactiveVoiceProfile.emotionLane || "curious_steady")
      );
      logger.log(
        `[${rid}] speculative_reuse requested=1 hit=${speculativeReuseApplied ? "1" : "0"} key=${speculativeReuseKeyInput} prompt_hash=${speculativePromptHashInput}`
      );
    }
    let rawReply = "";
    let streamFirstSentence = "";
    let streamChatUsed = false;
    let effectiveChatModel = String(chatModelPlan.model || "unknown");
    let effectiveChatApiMode = String(chatModelPlan.apiMode || "chat_completions");
    let effectiveChatReasoningEffort = String(chatModelPlan.reasoningEffort || "");
    let chatModelFallbackUsed = false;
    let effectiveChatUsage = {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    };
    let earlyTtsPromise = null;
    let earlyTtsSeedSpeech = "";
    let earlyTtsLeadIn = "";
    const useChatStreaming = CHAT_STREAM_ENABLED && streamAudioRequested;

    const maybeStartEarlyTts = (candidateSentence) => {
      if (!streamAudioRequested) return;
      if (earlyTtsPromise) return;
      const sentence = String(candidateSentence || "").trim();
      if (!sentence || !CHAT_STREAM_ENABLED) return;
      const leadIn = pickTtsLeadIn({ rid, transcript: talkGenerationTranscript, reply: sentence });
      const seedSpeech = applyTtsLeadIn(sentence, leadIn);
      earlyTtsLeadIn = leadIn;
      earlyTtsSeedSpeech = seedSpeech;
      earlyTtsPromise = ttsSupplier.synthesize({
        text: seedSpeech,
        speed: cycleUiReflection.voiceSpeed,
        rid,
        label: "first_sentence",
        voiceProfile: interactiveVoiceProfile,
      });
    };

    if (speculativeReuseApplied) {
      rawReply = normalizeSnippet(speculativeReuse.reply, 8_000);
      chatMs = 0;
    } else if (localActionReply) {
      rawReply = localActionReply;
      chatMs = Date.now() - chatStart;
      if (taskActionResult) {
        logger.log(
          `[${rid}] task_action handled_internally status=${String(taskActionResult?.status || "unknown")} llm_bypassed=1`
        );
      } else {
        logger.log(
          `[${rid}] note_capture handled_internally status=${String(noteCaptureResult?.status || "unknown")} target=${String(noteCaptureResult?.target || "none")} llm_bypassed=1`
        );
      }
    } else {
      // ---- talk_generate stage: Muse/OpenAI + abort + commitWallet ----
      const generated = await runTalkGenerate({
        req,
        rid,
        logger,
        chatSupplier,
        useChatStreaming,
        system,
        shortTermContextMessages,
        talkGenerationTranscript,
        chatMessages,
        chatModelPlan,
        chatTemperature,
        chatMaxTokens,
        chatStart,
        maybeStartEarlyTts,
        earlyTtsPromise,
      });
      rawReply = generated.rawReply;
      streamFirstSentence = generated.streamFirstSentence;
      streamChatUsed = generated.streamChatUsed;
      effectiveChatModel = generated.effectiveChatModel;
      effectiveChatApiMode = generated.effectiveChatApiMode;
      effectiveChatReasoningEffort = generated.effectiveChatReasoningEffort;
      chatModelFallbackUsed = generated.chatModelFallbackUsed;
      effectiveChatUsage = generated.effectiveChatUsage;
      chatMs = generated.chatMs;
    }

    const forceDayFeelingOpener = shouldForceSessionCheckInOpener({
      shouldAskCheckInThisTurn,
      localActionReply: Boolean(localActionReply),
      transcript,
      flags,
      turnPlanner,
    });
    if (shouldAskCheckInThisTurn && !forceDayFeelingOpener && activeSession && sessionMemory) {
      // Consume the one-time opener on substantive first turns to avoid late generic check-ins.
      sessionMemory.checkInPromptsUsed = Math.max(
        1,
        Number(sessionMemory.checkInPromptsUsed || 0)
      );
      sessionMemory.lastCheckInPromptAt = Date.now();
      activeSession.memory = sessionMemory;
    }
    const preferQuestionEnding =
      (Boolean(flags.isVenting) &&
        !Boolean(flags.gratitudeOnly) &&
        !Boolean(flags.socialSpark)) ||
      Boolean(turnPlanner.forceQuestionEnding);
    const adviceRequestedByUser = isAdviceRequestedByUser(transcript, {
      turnIntent: String(turnPlanner.intent || ""),
      routingLane: String(routingLane || "normal_rotation"),
      flags,
    });
    let reply = normalizeSnippet(rawReply, 8_000);
    // Studio actions: strip [[studio: …]] tags before anything is spoken and
    // keep the validated actions for the response header.
    const studioActionExtraction = extractStudioActions(reply, studioCapabilities);
    if (studioActionExtraction.stripped || studioActionExtraction.actions.length) {
      reply = studioActionExtraction.spokenText;
      logger.log(
        `[${rid}] studio_actions=${JSON.stringify(studioActionExtraction.actions)} rejected=${JSON.stringify(studioActionExtraction.rejected)}`
      );
    }
    let replyRepaired = false;
    let heuristicTurnQuality = null;
    if (speculativeReuseApplied) {
      heuristicTurnQuality = evaluateTurnQualityHeuristics({
        transcript,
        reply,
        flags,
        routingLane,
        turnIntent: String(turnPlanner.intent || "unknown"),
      });
    } else if (isScreenplayPageWriteTurn) {
      const normalizedPageReply = normalizeTalkPageReply(rawReply);
      if (normalizedPageReply) {
        reply = normalizedPageReply;
        replyRepaired = reply !== normalizeSnippet(rawReply, 8_000);
      }
      heuristicTurnQuality = evaluateTurnQualityHeuristics({
        transcript,
        reply,
        flags,
        routingLane,
        turnIntent: String(turnPlanner.intent || "unknown"),
      });
    } else {
      const validatedReply = validateAndDirectHerReply(rawReply, {
        forceDayFeelingOpener,
        openerKey: `${rid}|${sessionCount}|${transcript}`,
        transcript,
        assistantSelfName,
        gratitudeOnlyTurn: Boolean(flags.gratitudeOnly),
        socialSparkActive: Boolean(flags.socialSpark),
        socialSparkQuestion: normalizeSnippet(sessionMemory?.lastSocialSparkQuestion, 180),
        socialSparkKey: `${rid}|spark|${sessionCount}|${transcript}`,
        socialSparkYassOpen: Boolean(socialSparkYassPlan?.shouldUse),
        boundaryEdgeLine: boundaryEdgeSignal.active ? boundaryEdgeSignal.line : "",
        preferQuestionEnding,
        requireExtendedAnswer: Boolean(turnPlanner.requiresSubstantiveAnswer),
        responseLengthMode: String(turnPlanner.responseLengthMode || "compact"),
        minExtendedWords: Math.max(16, Number(turnPlanner.minAnswerWords || 28)),
        turnIntent: String(turnPlanner.intent || ""),
        routingLane: String(routingLane || "normal_rotation"),
        flags,
        allowReassurance: reassuranceThisTurn,
        memory: sessionMemory,
      });
      reply = enforceReplyCompletenessGuard(validatedReply, {
        transcript,
        flags,
        forceDayFeelingOpener,
        preferQuestionEnding,
        gratitudeOnlyTurn: Boolean(flags.gratitudeOnly),
        openerKey: `${rid}|${sessionCount}|${transcript}`,
      });
      replyRepaired = reply !== validatedReply;
      heuristicTurnQuality = evaluateTurnQualityHeuristics({
        transcript,
        reply,
        flags,
        routingLane,
        turnIntent: String(turnPlanner.intent || "unknown"),
      });
      const heuristicBeforeHardFix = heuristicTurnQuality;
      const hardIntentRepairedReply = enforceHardIntentRepair(reply, {
        transcript,
        flags,
        turnIntent: String(turnPlanner.intent || ""),
        routingLane: String(routingLane || "normal_rotation"),
        quality: heuristicTurnQuality,
        adviceRequested: adviceRequestedByUser,
        gratitudeOnlyTurn: Boolean(flags.gratitudeOnly),
      });
      if (hardIntentRepairedReply && hardIntentRepairedReply !== reply) {
        reply = hardIntentRepairedReply;
        replyRepaired = true;
        heuristicTurnQuality = evaluateTurnQualityHeuristics({
          transcript,
          reply,
          flags,
          routingLane,
          turnIntent: String(turnPlanner.intent || "unknown"),
        });
        if (process.env.NODE_ENV !== "production") {
          const beforeTags = sanitizeAdaptiveQualityTags(heuristicBeforeHardFix?.tags, 8).join(",") || "none";
          const afterTags = sanitizeAdaptiveQualityTags(heuristicTurnQuality?.tags, 8).join(",") || "none";
          const beforeComponents = heuristicBeforeHardFix?.components && typeof heuristicBeforeHardFix.components === "object"
            ? heuristicBeforeHardFix.components
            : { specificity: 0.50, attunement: 0.50 };
          const afterComponents = heuristicTurnQuality?.components && typeof heuristicTurnQuality.components === "object"
            ? heuristicTurnQuality.components
            : { specificity: 0.50, attunement: 0.50 };
          logger.log(
            `[${rid}] hard_intent_fix applied=1 tags_before=${beforeTags} tags_after=${afterTags} spec=${clampUnit(beforeComponents.specificity, 0).toFixed(2)}->${clampUnit(afterComponents.specificity, 0).toFixed(2)} attn=${clampUnit(beforeComponents.attunement, 0).toFixed(2)}->${clampUnit(afterComponents.attunement, 0).toFixed(2)}`
          );
        }
      }
      const specificityScaledReply = enforceSpecificityScaling(reply, {
        transcript,
        flags,
        memory: sessionMemory,
        turnIntent: String(turnPlanner.intent || ""),
        routingLane: String(routingLane || "normal_rotation"),
        adviceRequested: adviceRequestedByUser,
        gratitudeOnlyTurn: Boolean(flags.gratitudeOnly),
      });
      if (specificityScaledReply && specificityScaledReply !== reply) {
        reply = specificityScaledReply;
        replyRepaired = true;
        heuristicTurnQuality = evaluateTurnQualityHeuristics({
          transcript,
          reply,
          flags,
          routingLane,
          turnIntent: String(turnPlanner.intent || "unknown"),
        });
      }
    }
    if (!isScreenplayPageWriteTurn && !localActionReply && screenplayQuestionPlan?.shouldAsk) {
      const plannedQuestionReply = enforceScreenplayQuestionPlan(reply, screenplayQuestionPlan);
      if (plannedQuestionReply && plannedQuestionReply !== reply) {
        reply = plannedQuestionReply;
        replyRepaired = true;
        heuristicTurnQuality = evaluateTurnQualityHeuristics({
          transcript,
          reply,
          flags,
          routingLane,
          turnIntent: String(turnPlanner.intent || "unknown"),
        });
      }
    }
    const talkScreenplayModeEnabled = Boolean(
      studioMeta?.screenplayProjectId ||
      studioMeta?.screenplayTarget ||
      studioMeta?.screenplayPromptSource
    );
    const talkScreenplayPhase = talkScreenplayModeEnabled
      ? (String(studioMeta?.screenplayTarget || "").trim().toLowerCase() === "page" ? "scene_draft" : "voice_pin")
      : "";
    const talkScreenplayContinuityStudioMeta = isScreenplayPageWriteTurn
      ? mergeTalkMomentumRepairStudioMeta(studioMeta, sessionMemory, req.creativeMemoryTrace)
      : studioMeta;
    let talkScreenplayOutput = null;
    const talkScreenplayRepairTrace = {
      attempted: false,
      outcome: "none",
      elapsedMs: 0,
      reason: "",
    };
    const structuralQualityTrace = {
      applicable: false,
      attempted: false,
      repaired: false,
      passed: true,
      outcome: "not_applicable",
      initialReason: "",
      finalReason: "",
      initialScore: 1,
      finalScore: 1,
      elapsedMs: 0,
    };
    if (isScreenplayPageWriteTurn && !localActionReply) {
      talkScreenplayOutput = buildTalkScreenplayOutput({
        reply,
        transcript: talkGenerationTranscript,
        studioMeta: talkScreenplayContinuityStudioMeta,
      });
      if (String(talkScreenplayOutput?.target || "").trim().toLowerCase() !== "page") {
        talkScreenplayRepairTrace.attempted = true;
        talkScreenplayRepairTrace.reason = normalizeSnippet(
          talkScreenplayOutput?.quality?.reason || talkScreenplayOutput?.source || "guard_low_page_quality",
          96
        );
        const repairPass = await attemptTalkScreenplayRepairPass({
          currentOutput: talkScreenplayOutput,
          rawReply,
          transcript: talkGenerationTranscript,
          studioMeta: talkScreenplayContinuityStudioMeta,
          chatModelPlan,
          chatTemperature,
          chatMaxTokens,
          screenplayRequestedPages,
          rid,
        });
        if (repairPass?.elapsedMs) {
          talkScreenplayRepairTrace.elapsedMs = Math.max(0, Number(repairPass.elapsedMs || 0));
          chatMs += talkScreenplayRepairTrace.elapsedMs;
        }
        talkScreenplayRepairTrace.outcome = normalizeSnippet(
          repairPass?.outcome || (repairPass?.repaired ? "repaired" : "not_repaired"),
          48
        ) || "not_repaired";
        if (repairPass?.repaired && repairPass.output) {
          talkScreenplayOutput = repairPass.output;
          reply = repairPass.reply || normalizeTalkScreenplayText(repairPass.output.text || reply);
          rawReply = reply;
          replyRepaired = true;
          heuristicTurnQuality = evaluateTurnQualityHeuristics({
            transcript,
            reply,
            flags,
            routingLane,
            turnIntent: String(turnPlanner.intent || "unknown"),
          });
        }
      }
      if (String(talkScreenplayOutput?.target || "").trim().toLowerCase() !== "page") {
        logger.log(
          `[${rid}] screenplay_page_quality_exhausted reason=${talkScreenplayRepairTrace.reason || "unknown"} outcome=${talkScreenplayRepairTrace.outcome}`
        );
        throw createTalkFailureError({
          requestId: rid,
          providerStage: "chat",
          status: 502,
          message: "Screenplay generation did not pass the requested page-quality contract.",
          errorClass: "screenplay_page_quality_failed",
        });
      }
    }
    if (!isScreenplayPageWriteTurn && !localActionReply) {
      const initialStructuralQuality = evaluateStructuralScreenplayReply({
        reply,
        modelReason: chatModelPlan.reason,
      });
      if (initialStructuralQuality.applicable) {
        structuralQualityTrace.applicable = true;
        structuralQualityTrace.passed = Boolean(initialStructuralQuality.ok);
        structuralQualityTrace.outcome = initialStructuralQuality.ok ? "initial_pass" : "initial_fail";
        structuralQualityTrace.initialReason = normalizeSnippet(initialStructuralQuality.reason, 96);
        structuralQualityTrace.finalReason = structuralQualityTrace.initialReason;
        structuralQualityTrace.initialScore = Math.max(0, Number(initialStructuralQuality.score || 0));
        structuralQualityTrace.finalScore = structuralQualityTrace.initialScore;
        if (!initialStructuralQuality.ok) {
          structuralQualityTrace.attempted = true;
          const repairStudioMeta = mergeTalkMomentumRepairStudioMeta(
            studioMeta,
            sessionMemory,
            req.creativeMemoryTrace
          );
          const repairPass = await attemptStructuralScreenplayAnalysisRepairPass({
            initialQuality: initialStructuralQuality,
            rawReply: reply,
            transcript: talkGenerationTranscript,
            studioMeta: repairStudioMeta,
            chatModelPlan,
            chatTemperature,
            chatMaxTokens,
            rid,
          });
          structuralQualityTrace.elapsedMs = Math.max(0, Number(repairPass?.elapsedMs || 0));
          chatMs += structuralQualityTrace.elapsedMs;
          effectiveChatUsage = mergeProviderUsage(effectiveChatUsage, repairPass?.usage);
          chatModelFallbackUsed = chatModelFallbackUsed || Boolean(repairPass?.fallbackUsed);
          structuralQualityTrace.outcome = normalizeSnippet(
            repairPass?.outcome || "not_repaired",
            48
          ) || "not_repaired";
          if (repairPass?.repaired && repairPass.reply && repairPass.quality) {
            reply = repairPass.reply;
            rawReply = reply;
            replyRepaired = true;
            structuralQualityTrace.repaired = true;
            structuralQualityTrace.passed = Boolean(repairPass.quality.ok);
            structuralQualityTrace.finalReason = normalizeSnippet(repairPass.quality.reason, 96);
            structuralQualityTrace.finalScore = Math.max(0, Number(repairPass.quality.score || 0));
            effectiveChatModel = String(repairPass.model || effectiveChatModel);
            effectiveChatApiMode = String(repairPass.apiMode || effectiveChatApiMode);
            effectiveChatReasoningEffort = String(
              repairPass.reasoningEffort || effectiveChatReasoningEffort
            );
            heuristicTurnQuality = evaluateTurnQualityHeuristics({
              transcript,
              reply,
              flags,
              routingLane,
              turnIntent: String(turnPlanner.intent || "unknown"),
            });
          }
        }
      }
    }
    const usedBoundaryEdgeLine = hasBoundaryEdgeStatement(reply);
    logger.log(`\n[${reqId}] assistant reply:\n${reply}\n`);
    const didUseCheckInOpener = startsWithDayFeelingCheckIn(reply);
    if (didUseCheckInOpener) {
      markRecentCheckInForIp(requesterIp);
    }
    const turnQualityComponents = heuristicTurnQuality.components && typeof heuristicTurnQuality.components === "object"
      ? heuristicTurnQuality.components
      : {
          specificity: 0.50,
          continuity: 0.50,
          attunement: 0.50,
          conversationalPull: 0.50,
          brevity: 0.50,
          completionRate: 0.50,
        };
    if (activeSession) {
      activeSession.memory = updateSessionAfterReply(
        activeSession.memory,
        transcript,
        reply,
        didUseCheckInOpener,
        studioMeta
      );
      if (usedBoundaryEdgeLine) {
        activeSession.memory.lastBoundaryEdgeTurn = Math.max(1, turnsInSession);
        activeSession.memory.boundaryEdgeCount = Math.max(
          0,
          Number(activeSession.memory.boundaryEdgeCount || 0)
        ) + 1;
        activeSession.memory.lastBoundaryEdgeReason = String(
          boundaryEdgeSignal.reason || "looping"
        );
      }
      activeSession.memory.turnQualityLastSpecificity = clampUnit(turnQualityComponents.specificity, 0.50);
      activeSession.memory.turnQualityLastContinuity = clampUnit(turnQualityComponents.continuity, 0.50);
      activeSession.memory.turnQualityLastAttunement = clampUnit(turnQualityComponents.attunement, 0.50);
      activeSession.memory.turnQualityLastPull = clampUnit(turnQualityComponents.conversationalPull, 0.50);
      activeSession.memory.turnQualityLastBrevity = clampUnit(turnQualityComponents.brevity, 0.50);
      activeSession.memory.turnQualityLastCompletionRate = clampUnit(turnQualityComponents.completionRate, 0.50);
      const qualityAppliedAt = Date.now();
      activeSession.memory = applyAdaptiveTurnLearning(
        activeSession.memory,
        heuristicTurnQuality,
        qualityAppliedAt,
        { countAsTurn: true }
      );
      const qualitySnapshot = recordUserTurnQualityMetric(
        requesterIp,
        activeSession.memory.turnQualityEMA || heuristicTurnQuality.score,
        qualityAppliedAt
      );
      const qualityTargetStatus = evaluateKpiTargets(qualitySnapshot);
      activeSession.memory.deepTurns7d = qualitySnapshot.deepTurns7d;
      activeSession.memory.avgSessionSeconds7d = qualitySnapshot.avgSessionSeconds7d;
      activeSession.memory.returns7d = qualitySnapshot.returns7d;
      activeSession.memory.userInitiatedSessions7d = qualitySnapshot.userInitiatedSessions7d;
      activeSession.memory.reflectiveQuestionAnswerRate = qualitySnapshot.reflectiveQuestionAnswerRate;
      activeSession.memory.avgTurnQuality7d = Number(qualitySnapshot.avgTurnQuality7d || 0.66);
      activeSession.memory.relationshipDepthDelta7d = Number(qualitySnapshot.relationshipDepthDelta7d || 0);
      activeSession.memory.relationshipDepthSlopePerDay7d = Number(
        qualitySnapshot.relationshipDepthSlopePerDay7d || 0
      );
      activeSession.memory.modeSwitches30d = qualitySnapshot.modeSwitches30d;
      activeSession.memory.kpiTargetsMetCount = qualityTargetStatus.metCount;
      activeSession.memory.kpiTargetsTotal = qualityTargetStatus.total;
      activeSession.memory.kpiTargetsAllMet = Boolean(qualityTargetStatus.allMet);
      activeSession.memory = await persistTalkMemory(activeSession.memory, qualityAppliedAt);

      if (process.env.NODE_ENV !== "production") {
        logger.log(
          `[${rid}] adaptive_turn score=${clampUnit(heuristicTurnQuality.score, 0.66).toFixed(2)} ema=${clampUnit(activeSession.memory.turnQualityEMA, 0.66).toFixed(2)} avg_q7=${Number(qualitySnapshot.avgTurnQuality7d || 0.66).toFixed(2)} tags=${sanitizeAdaptiveQualityTags(heuristicTurnQuality.tags, 8).join(",") || "none"} source=${String(heuristicTurnQuality.source || "heuristic")} spec=${clampUnit(turnQualityComponents.specificity, 0).toFixed(2)} cont=${clampUnit(turnQualityComponents.continuity, 0).toFixed(2)} attn=${clampUnit(turnQualityComponents.attunement, 0).toFixed(2)} pull=${clampUnit(turnQualityComponents.conversationalPull, 0).toFixed(2)} brev=${clampUnit(turnQualityComponents.brevity, 0).toFixed(2)} done=${clampUnit(turnQualityComponents.completionRate, 0).toFixed(2)}`
        );
      }

      const canRunAdaptiveEval =
        ADAPTIVE_INTELLIGENCE_ENABLED &&
        ADAPTIVE_QUALITY_EVAL_ENABLED &&
        Boolean(OPENAI_API_KEY);
      if (canRunAdaptiveEval) {
        void maybeEvaluateTurnQualityWithLLM({
          rid,
          transcript,
          reply,
          flags,
          routingLane,
        })
          .then(async (llmEval) => {
            if (!activeSession?.memory) return;
            const evalAt = Date.now();
            if (!llmEval || typeof llmEval !== "object") {
              activeSession.memory.adaptiveEvalFailureCount = Math.max(
                0,
                Number(activeSession.memory.adaptiveEvalFailureCount || 0)
              ) + 1;
              activeSession.memory.lastUpdatedAt = evalAt;
              activeSession.memory = await persistTalkMemory(activeSession.memory, evalAt);
              if (process.env.NODE_ENV !== "production") {
                logger.log(`[${rid}] adaptive_eval skipped=no_result`);
              }
              return;
            }

            const mergedQuality = mergeTurnQualitySignals(heuristicTurnQuality, llmEval);
            activeSession.memory = applyAdaptiveTurnLearning(
              activeSession.memory,
              mergedQuality,
              evalAt,
              { countAsTurn: false }
            );
            activeSession.memory = await persistTalkMemory(activeSession.memory, evalAt);
            if (process.env.NODE_ENV !== "production") {
              logger.log(
                `[${rid}] adaptive_eval score=${clampUnit(llmEval.score, 0.66).toFixed(2)} merged=${clampUnit(mergedQuality.score, 0.66).toFixed(2)} tags=${sanitizeAdaptiveQualityTags(llmEval.tags, 8).join(",") || "none"}`
              );
            }
          })
          .catch(async (err) => {
            if (!activeSession?.memory) return;
            const failAt = Date.now();
            activeSession.memory.adaptiveEvalFailureCount = Math.max(
              0,
              Number(activeSession.memory.adaptiveEvalFailureCount || 0)
            ) + 1;
            activeSession.memory.lastUpdatedAt = failAt;
            try {
              activeSession.memory = await persistTalkMemory(activeSession.memory, failAt);
            } catch (persistError) {
              logger.log(`[${rid}] adaptive_eval memory_error=${String(persistError?.message || persistError)}`);
            }
            if (process.env.NODE_ENV !== "production") {
              logger.log(`[${rid}] adaptive_eval error=${String(err?.message || err)}`);
            }
          });
      }
    }

    if (!talkScreenplayOutput) {
      talkScreenplayOutput = buildTalkScreenplayOutput({
        reply,
        transcript: talkGenerationTranscript,
        studioMeta: talkScreenplayContinuityStudioMeta,
      });
    }
    if (
      !isScreenplayPageWriteTurn &&
      !localActionReply &&
      shouldAttemptTalkMomentumRescueRepairPass(talkScreenplayOutput)
    ) {
      talkScreenplayRepairTrace.attempted = true;
      talkScreenplayRepairTrace.reason = normalizeSnippet(
        talkScreenplayOutput?.quality?.reason || talkScreenplayOutput?.source || "guard_momentum_rescue_quality",
        96
      );
      const momentumRepairStudioMeta = mergeTalkMomentumRepairStudioMeta(
        studioMeta,
        sessionMemory,
        req.creativeMemoryTrace
      );
      const repairPass = await attemptTalkMomentumRescueRepairPass({
        currentOutput: talkScreenplayOutput,
        rawReply,
        transcript: talkGenerationTranscript,
        studioMeta: momentumRepairStudioMeta,
        chatModelPlan,
        chatTemperature,
        chatMaxTokens,
        rid,
      });
      if (repairPass?.elapsedMs) {
        talkScreenplayRepairTrace.elapsedMs = Math.max(0, Number(repairPass.elapsedMs || 0));
        chatMs += talkScreenplayRepairTrace.elapsedMs;
      }
      talkScreenplayRepairTrace.outcome = normalizeSnippet(
        repairPass?.outcome || (repairPass?.repaired ? "repaired" : "not_repaired"),
        48
      ) || "not_repaired";
      if (repairPass?.repaired && repairPass.output) {
        talkScreenplayOutput = repairPass.output;
        reply = repairPass.reply || reply;
        rawReply = reply;
        replyRepaired = true;
      } else {
        const fallbackReply = buildMomentumRescueFallbackReply({
          transcript: talkGenerationTranscript,
          studioMeta: momentumRepairStudioMeta,
        });
        const fallbackOutput = buildTalkScreenplayOutput({
          reply: fallbackReply,
          transcript: talkGenerationTranscript,
          studioMeta: momentumRepairStudioMeta,
        });
        if (
          fallbackReply &&
          String(fallbackOutput?.target || "").trim().toLowerCase() === "voice_pin" &&
          String(fallbackOutput?.source || "").trim().toLowerCase() !== "guard_momentum_rescue_quality" &&
          fallbackOutput?.quality?.ok
        ) {
          const quality = fallbackOutput.quality && typeof fallbackOutput.quality === "object"
            ? { ...fallbackOutput.quality }
            : {};
          quality.source = "fallback_momentum_rescue";
          quality.confidence = "fallback";
          talkScreenplayOutput = {
            ...fallbackOutput,
            source: "fallback_momentum_rescue",
            quality,
          };
          reply = fallbackReply;
          rawReply = reply;
          replyRepaired = true;
          talkScreenplayRepairTrace.outcome = "fallback_momentum_rescue";
        }
      }
    }
    if (!isScreenplayPageWriteTurn && !localActionReply && screenplayQuestionPlan?.shouldAsk) {
      const finalPlannedQuestionReply = enforceScreenplayQuestionPlan(reply, screenplayQuestionPlan);
      if (finalPlannedQuestionReply && finalPlannedQuestionReply !== reply) {
        reply = finalPlannedQuestionReply;
        rawReply = reply;
        replyRepaired = true;
      }
      if (sessionMemory) {
        const provisionalOptions = screenplayQuestionPlan.mode === "provisional_options"
          ? extractProvisionalScreenplayOptions(reply)
          : [];
        const pendingQuestion = createPendingScreenplayLearningQuestion(
          screenplayQuestionPlan,
          {
            askedAtTurn: turnsInSession,
            provisionalOptions,
          }
        );
        if (pendingQuestion) {
          sessionMemory.pendingScreenplayLearningQuestions =
            upsertPendingScreenplayLearningQuestion(
              sessionMemory.pendingScreenplayLearningQuestions,
              pendingQuestion
            );
          screenplayQuestionInteraction = {
            ...pendingQuestion,
            questionId: pendingQuestion.id,
            responseStatus: "asked",
            respondedAt: 0,
          };
          if (activeSession) activeSession.memory = sessionMemory;
          sessionMemory = await persistTalkMemory(sessionMemory, Date.now());
          if (activeSession) activeSession.memory = sessionMemory;
        }
      }
    }
    const talkReplyPreview = buildTalkReplyPreview({
      reply,
      screenplayOutput: talkScreenplayOutput,
    });
    const screenplayQuestionMode = String(screenplayQuestionPlan?.mode || "").trim().toLowerCase();
    if (
      !isScreenplayPageWriteTurn &&
      !localActionReply &&
      (
        String(turnPlanner?.intent || "").trim().toLowerCase() === "momentum_rescue" ||
        screenplayQuestionMode.startsWith("rescue_")
      )
    ) {
      deliveredStoryRescueInteraction = buildDeliveredStoryRescueInteraction({
        systemPrompt: system,
        reply,
        requestId: rid,
        projectId: screenplayQuestionPlan?.projectId || studioMeta?.screenplayProjectId,
        projectTitle: screenplayQuestionPlan?.projectTitle || studioMeta?.screenplayProjectTitle,
        actKey: screenplayQuestionPlan?.actContext?.key,
        sequenceKey: screenplayQuestionPlan?.sequenceContext?.key,
      });
    }
    let talkAudioDurationMs = estimateTalkSpeechDurationMs(
      reply,
      cycleUiReflection.voiceSpeed
    );
    let talkScreenplayTimingSource = talkScreenplayOutput?.target === "page" ? "estimated" : "";
    let talkScreenplayCues = buildEstimatedTalkScreenplayCues(
      talkScreenplayOutput,
      talkAudioDurationMs
    );
    const creativeMemoryWritePromise = commitCreativeMemoryAfterTurn({
      transcript,
      reply,
      studioMeta,
      screenplayOutput: talkScreenplayOutput,
      source: talkScreenplayOutput?.target === "page" ? "talk_screenplay_output" : "talk_turn",
    });
    let talkTtsSegmentCount = 1;
    if (talkScreenplayOutput?.target === "page" && speculativeReuseApplied) {
      logger.log(`[${rid}] speculative_reuse audio_disabled_for_page_sync=1`);
      speculativeReuseApplied = false;
    }

    // ---- 3) TTS (MP3) ----
    const ttsStart = Date.now();
    logger.log(
      `[${rid}] director chars_in=${rawReply.length} chars_out=${reply.length} chat_stream=${streamChatUsed ? "1" : "0"} reply_repaired=${replyRepaired ? "1" : "0"}`
    );
    if (process.env.NODE_ENV !== "production") {
      const cinemaCheck = buildCinemaCheckEnvelope(reply);
      logger.log(
        `[${rid}] cinema_check ` +
        `lines=${cinemaCheck.lines}(${cinemaCheck.lineStatus}) ` +
        `questions=${cinemaCheck.questions}(${cinemaCheck.questionStatus}) ` +
        `exclaims=${cinemaCheck.exclaims}(${cinemaCheck.exclaimStatus}) ` +
        `targets(lines:2-3 q:0-1 !:0-1 hard(lines:2-5 q<=1 !<=1))`
      );
    }

    let ttsLeadIn = "";
    let remainderSpeech = "";
    let firstMp3 = Buffer.alloc(0);
    let secondMp3 = Buffer.alloc(0);
    let secondTtsResult = null;
    let ttsProviderUsed = "openai";
    let ttsVoiceUsed = String(
      interactiveVoiceProfile.provider === "openai"
        ? interactiveVoiceProfile.openaiVoice
        : interactiveVoiceProfile.elevenlabsVoiceId,
    );
    if (speculativeReuseApplied) {
      firstMp3 = Buffer.from(speculativeReuse.audioBuffer || []);
      if (!firstMp3.length || !isLikelyMp3Buffer(firstMp3)) {
        logger.log(
          `[${rid}] speculative_reuse audio_invalid=1 key=${speculativeReuseKeyInput} prompt_hash=${speculativePromptHashInput} -> fallback_tts=1`
        );
        speculativeReuseApplied = false;
        firstMp3 = Buffer.alloc(0);
      } else {
        ttsProviderUsed = String(speculativeReuse.ttsProvider || "speculative");
        ttsVoiceUsed = String(speculativeReuse.ttsVoice || ttsVoiceUsed);
        ttsMs = 0;
      }
    }
    if (!speculativeReuseApplied) {
      if (talkScreenplayOutput?.target === "page") {
        try {
          const screenplaySpeech = await ttsSupplier.synthesizeScreenplayPage({
            screenplayOutput: talkScreenplayOutput,
            speed: cycleUiReflection.voiceSpeed,
            rid,
            voiceProfile: interactiveVoiceProfile,
          });
          firstMp3 = Buffer.from(screenplaySpeech?.firstSegmentBuffer || []);
          secondMp3 = Buffer.from(screenplaySpeech?.remainderBuffer || []);
          ttsProviderUsed = String(screenplaySpeech?.providerLabel || "openai");
          ttsVoiceUsed = String(screenplaySpeech?.voiceLabel || ttsVoiceUsed);
          talkTtsSegmentCount = Math.max(1, Number(screenplaySpeech?.segmentCount || 1));
          talkAudioDurationMs = Math.max(
            0,
            Number(screenplaySpeech?.audioDurationMs || talkAudioDurationMs || 0)
          );
          talkScreenplayTimingSource = "tts_segmented";
          talkScreenplayCues = Array.isArray(screenplaySpeech?.cues) && screenplaySpeech.cues.length
            ? screenplaySpeech.cues
            : talkScreenplayCues;
        } catch (err) {
          const status = Number(err?.status || 500);
          const message = String(err?.message || "Speech synthesis failed.");
          ttsMs = Date.now() - ttsStart;
          const diagnostic = buildTalkFailureDiagnostics(err, {
            requestId: rid,
            providerStage: "tts",
            status,
          });
          logger.log(`[${rid}] screenplay cue TTS failed ${diagnostic.supportMessage}`);
          throw createTalkFailureError({
            requestId: rid,
            providerStage: "tts",
            status,
            message,
          });
        }
      } else {
        ttsLeadIn = earlyTtsLeadIn || pickTtsLeadIn({ rid, transcript, reply });
        const speechReply = applyTtsLeadIn(reply, ttsLeadIn);
        // Stability mode: synthesize one contiguous segment to avoid audible stitch points.
        const shouldSplitSpeech = false;
        const speechSplit = shouldSplitSpeech
          ? splitSpeechForEarlyTts(speechReply)
          : { firstSegment: speechReply, remainder: "" };
        const firstSpeechSegment = speechSplit.firstSegment || speechReply;
        const firstSpeechNorm = normalizeSpeechCompare(firstSpeechSegment);
        remainderSpeech = speechSplit.remainder || "";

        let firstTtsResult = null;
        if (earlyTtsPromise && firstSpeechSegment && shouldSplitSpeech) {
          try {
            const earlySpeechNorm = normalizeSpeechCompare(earlyTtsSeedSpeech);
            if (
              earlySpeechNorm &&
              firstSpeechNorm &&
              (firstSpeechNorm.startsWith(earlySpeechNorm) || earlySpeechNorm.startsWith(firstSpeechNorm))
            ) {
              firstTtsResult = await earlyTtsPromise;
            }
          } catch (err) {
            logger.log(`[${rid}] early_tts_skip reason=${String(err?.message || err)}`);
          }
        }

        if (!firstTtsResult) {
          try {
            firstTtsResult = await ttsSupplier.synthesize({
              text: firstSpeechSegment,
              speed: cycleUiReflection.voiceSpeed,
              rid,
              label: remainderSpeech ? "first_segment" : "full",
              voiceProfile: interactiveVoiceProfile,
            });
          } catch (err) {
            const status = Number(err?.status || 500);
            const message = String(err?.message || "Speech synthesis failed.");
            ttsMs = Date.now() - ttsStart;
            const diagnostic = buildTalkFailureDiagnostics(err, {
              requestId: rid,
              providerStage: "tts",
              status,
            });
            logger.log(`[${rid}] TTS failed ${diagnostic.supportMessage}`);
            throw createTalkFailureError({
              requestId: rid,
              providerStage: "tts",
              status,
              message,
            });
          }
        }

        if (!remainderSpeech || normalizeSpeechCompare(speechReply) === firstSpeechNorm) {
          remainderSpeech = "";
        }

        if (remainderSpeech && !streamAudioRequested) {
          try {
            secondTtsResult = await ttsSupplier.synthesize({
              text: remainderSpeech,
              speed: cycleUiReflection.voiceSpeed,
              rid,
              label: "remainder",
              voiceProfile: interactiveVoiceProfile,
            });
          } catch (err) {
            const status = Number(err?.status || 500);
            const message = String(err?.message || "Speech synthesis failed.");
            ttsMs = Date.now() - ttsStart;
            const diagnostic = buildTalkFailureDiagnostics(err, {
              requestId: rid,
              providerStage: "tts",
              status,
            });
            logger.log(`[${rid}] TTS failed ${diagnostic.supportMessage}`);
            throw createTalkFailureError({
              requestId: rid,
              providerStage: "tts",
              status,
              message,
            });
          }
        }

        firstMp3 = Buffer.from(firstTtsResult.buffer || []);
        const secondMp3Raw = secondTtsResult?.buffer ? Buffer.from(secondTtsResult.buffer) : Buffer.alloc(0);
        secondMp3 = secondMp3Raw.length ? stripLeadingId3Tag(secondMp3Raw) : secondMp3Raw;
        const firstProvider = String(firstTtsResult?.provider || "openai");
        const secondProvider = secondTtsResult?.provider
          ? String(secondTtsResult.provider || firstProvider)
          : firstProvider;
        ttsProviderUsed = firstProvider === secondProvider
          ? firstProvider
          : `${firstProvider}+${secondProvider}`;
        ttsVoiceUsed = String(firstTtsResult?.voice || secondTtsResult?.voice || ttsVoiceUsed);
        talkTtsSegmentCount = remainderSpeech ? 2 : 1;
      }
    }
    const combinedMp3 = secondMp3.length ? Buffer.concat([firstMp3, secondMp3]) : firstMp3;
    if (!combinedMp3.length) {
      throw createTalkFailureError({
        requestId: rid,
        providerStage: "tts",
        status: 502,
        message: "Speech synthesis returned empty audio.",
        errorClass: "response_invalid",
      });
    }

    if (!isLikelyMp3Buffer(combinedMp3)) {
      const signatureHex = combinedMp3.subarray(0, 8).toString("hex");
      logger.log(`[${rid}] TTS non-MP3 signature first8=${signatureHex}`);
      throw createTalkFailureError({
        requestId: rid,
        providerStage: "tts",
        status: 502,
        message: "Speech synthesis output was not MP3.",
        errorClass: "response_invalid",
      });
    }

    if (!didLogMp3SignatureLocal) {
      const marker =
        combinedMp3.length >= 3 && combinedMp3.subarray(0, 3).toString("utf8") === "ID3"
          ? "ID3"
          : "FFFB";
      const signatureHex = combinedMp3.subarray(0, 8).toString("hex");
      logger.log(`[${rid}] MP3 signature=${marker} first8=${signatureHex}`);
      didLogMp3SignatureLocal = true;
    }

    // Response headers
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("x-cycle-index", String(cycleUiReflection.cycleIndex));
    res.setHeader("x-ui-orb-saturation", cycleUiReflection.orbSaturation.toFixed(3));
    res.setHeader("x-ui-orb-reactivity", cycleUiReflection.orbReactivity.toFixed(3));
    res.setHeader("x-ui-orb-smoothing", cycleUiReflection.orbSmoothing.toFixed(3));
    res.setHeader("x-ui-voice-speed", cycleUiReflection.voiceSpeed.toFixed(3));
    res.setHeader("x-safeguard-over-attachment", overAttachmentSafeguard.active ? "1" : "0");
    res.setHeader("x-assistant-self-name", encodeURIComponent(assistantSelfName));
    res.setHeader("x-thinking-ms", String(thinkingDelayMs));
    res.setHeader("x-talk-stream-mode", streamAudioRequested ? "audio" : "off");
    res.setHeader("x-chat-stream-used", streamChatUsed ? "1" : "0");
    res.setHeader("x-speculative-reuse", speculativeReuseApplied ? "1" : "0");
    if (speculativeReuseApplied && speculativeReuseKeyInput) {
      res.setHeader("x-speculative-key", speculativeReuseKeyInput);
    }
    if (speculativeReuseApplied && speculativePromptHashInput) {
      res.setHeader("x-speculative-prompt-hash", speculativePromptHashInput);
    }
    res.setHeader("x-chat-model", effectiveChatModel);
    res.setHeader("x-chat-model-tier", chatModelPlan.tier);
    res.setHeader("x-chat-model-reason", chatModelPlan.reason);
    res.setHeader("x-chat-api-mode", effectiveChatApiMode);
    res.setHeader("x-chat-reasoning-effort", effectiveChatReasoningEffort || "none");
    res.setHeader("x-chat-model-fallback", chatModelFallbackUsed ? "1" : "0");
    res.setHeader("x-chat-input-tokens", String(Math.max(0, Number(effectiveChatUsage.inputTokens || 0))));
    res.setHeader("x-chat-output-tokens", String(Math.max(0, Number(effectiveChatUsage.outputTokens || 0))));
    res.setHeader("x-chat-reasoning-tokens", String(Math.max(0, Number(effectiveChatUsage.reasoningTokens || 0))));
    res.setHeader("x-chat-total-tokens", String(Math.max(0, Number(effectiveChatUsage.totalTokens || 0))));
    res.setHeader("x-structural-quality-applicable", structuralQualityTrace.applicable ? "1" : "0");
    res.setHeader("x-structural-quality-passed", structuralQualityTrace.passed ? "1" : "0");
    res.setHeader("x-structural-quality-repaired", structuralQualityTrace.repaired ? "1" : "0");
    res.setHeader("x-structural-quality-outcome", structuralQualityTrace.outcome);
    res.setHeader("x-structural-quality-reason", encodeURIComponent(structuralQualityTrace.finalReason || "none"));
    res.setHeader("x-structural-quality-score", Number(structuralQualityTrace.finalScore || 0).toFixed(3));
    res.setHeader("x-structural-repair-ms", String(Math.max(0, Number(structuralQualityTrace.elapsedMs || 0))));
    res.setHeader("x-chat-load-shed", chatModelPlan.loadShed ? "1" : "0");
    res.setHeader("x-chat-load-shed-cause", encodeURIComponent(String(chatModelPlan.loadShedCause || "none")));
    res.setHeader("x-chat-temperature", chatTemperature.toFixed(2));
    res.setHeader("x-chat-max-tokens", String(Math.max(0, Number(chatMaxTokens || 0))));
    res.setHeader("x-stt-model", encodeURIComponent(String(sttModelUsed || STT_MODEL_PRIMARY)));
    res.setHeader("x-stt-confidence", sttConfidence.toFixed(3));
    res.setHeader("x-knowledge-cards", String(knowledgeCardsUsed.length));
    res.setHeader("x-knowledge-semantic", knowledgeMeta?.semanticUsed ? "1" : "0");
    res.setHeader("x-knowledge-semantic-forced", knowledgeMeta?.forceSemantic ? "1" : "0");
    res.setHeader("x-knowledge-semantic-reason", String(knowledgeMeta?.semanticReason || "n/a"));
    res.setHeader("x-knowledge-retrieval-ms", String(Math.max(0, Number(knowledgeMeta?.retrievalMs || 0))));
    const knowledgeTopicWeights = knowledgeMeta?.profile?.topicWeights;
    const knowledgeTopicsHeader = knowledgeTopicWeights && typeof knowledgeTopicWeights === "object"
      ? Object.keys(knowledgeTopicWeights).slice(0, 6)
      : [];
    res.setHeader("x-knowledge-topics", encodeURIComponent(knowledgeTopicsHeader.join(",")));
    res.setHeader("x-vad-threshold", Number(continuationGate.dynamicVadThreshold || TURN_END_GUARD_VAD_BASE_RMS).toFixed(5));
    res.setHeader("x-noise-floor-rms", Number(continuationGate.noiseFloorRms || 0).toFixed(5));
    res.setHeader("x-tail-silence-threshold-ms", String(Math.max(0, Number(continuationGate.effectiveTailSilenceThreshold || TURN_END_GUARD_TAIL_SILENCE_MS))));
    res.setHeader("x-barge-in-enabled", BARGE_IN_ENABLED ? "1" : "0");
    res.setHeader("x-barge-in-stop-playback", BARGE_IN_STOP_PLAYBACK ? "1" : "0");
    res.setHeader("x-barge-in-threshold", Number(BARGE_IN_HINT_THRESHOLD).toFixed(5));
    if (transcript) {
      res.setHeader("x-transcript", encodeURIComponent(String(transcript)));
    }
    if (talkReplyPreview) {
      res.setHeader("x-reply", encodeURIComponent(String(talkReplyPreview)));
    }
    const hasAuthoritativeScreenplayText = isAuthoritativeTalkScreenplayOutput(
      talkScreenplayOutput,
      { studioMeta: talkScreenplayContinuityStudioMeta, transcript: talkGenerationTranscript }
    );
    const talkRenderContract = {
      reply_role: hasAuthoritativeScreenplayText ? "preview" : "final",
      authoritative_page_text_available: hasAuthoritativeScreenplayText,
      sync_ready: hasAuthoritativeScreenplayText,
    };
    res.setHeader("x-reply-role", talkRenderContract.reply_role);
    res.setHeader("x-screenplay-authoritative", talkRenderContract.authoritative_page_text_available ? "1" : "0");
    res.setHeader("x-screenplay-sync-ready", talkRenderContract.sync_ready ? "1" : "0");
    res.setHeader("x-audio-duration-ms", String(Math.max(0, Number(talkAudioDurationMs || 0))));
    res.setHeader("x-screenplay-mode", talkScreenplayModeEnabled ? "1" : "0");
    res.setHeader("x-screenplay-pack-lock", "0");
    if (talkScreenplayPhase) {
      res.setHeader("x-screenplay-phase", encodeURIComponent(talkScreenplayPhase));
    }
    if (studioMeta?.screenplayProjectId) {
      res.setHeader("x-screenplay-project-id", encodeURIComponent(String(studioMeta.screenplayProjectId)));
    }
    res.setHeader("x-screenplay-output-available", talkScreenplayOutput ? "1" : "0");
    if (talkScreenplayTimingSource) {
      res.setHeader("x-screenplay-timing-source", talkScreenplayTimingSource);
    }
    if (talkScreenplayOutput?.target) {
      res.setHeader("x-screenplay-target", encodeURIComponent(String(talkScreenplayOutput.target)));
    }
    const creativeMemoryWriteSummary = await creativeMemoryWritePromise;
    applyCreativeMemoryTraceHeaders(res, req.creativeMemoryTrace);
    applyCanonClarificationHeader(res, creativeMemoryWriteSummary);
    applyTalkScreenplayQualityHeaders(res, talkScreenplayOutput);
    applyTalkScreenplayRepairHeaders(res, talkScreenplayRepairTrace);
    if (talkScreenplayOutput) {
      const screenplayOutputJson = JSON.stringify(talkScreenplayOutput);
      if (screenplayOutputJson.length <= 5000) {
        res.setHeader("x-screenplay-output", encodeURIComponent(screenplayOutputJson));
      }
    }
    if (Array.isArray(talkScreenplayCues) && talkScreenplayCues.length) {
      const screenplayCuesJson = JSON.stringify(talkScreenplayCues);
      if (screenplayCuesJson.length <= 5000) {
        res.setHeader("x-screenplay-cues", encodeURIComponent(screenplayCuesJson));
      }
    }
    const studioActionsHeader = encodeStudioActionsHeader(studioActionExtraction?.actions);
    if (studioActionsHeader) {
      res.setHeader(STUDIO_ACTIONS_HEADER, studioActionsHeader);
    }
    res.setHeader("x-reply-repaired", replyRepaired ? "1" : "0");
    res.setHeader("x-tts-provider", encodeURIComponent(ttsProviderUsed));
    res.setHeader(
      "x-voice-emotion-lane",
      encodeURIComponent(String(interactiveVoiceProfile.emotionLane || "curious_steady")),
    );
    res.setHeader(
      "x-tts-voice",
      encodeURIComponent(ttsVoiceUsed),
    );
    res.setHeader("x-tts-filler", encodeURIComponent(ttsLeadIn || ""));
    res.setHeader("x-tts-segments", String(Math.max(1, Number(talkTtsSegmentCount || 1))));
    res.setHeader("x-tts-first-bytes", String(Math.max(0, Number(firstMp3.length || 0))));
    res.setHeader("x-turn-quality-specificity", clampUnit(turnQualityComponents.specificity, 0).toFixed(3));
    res.setHeader("x-turn-quality-continuity", clampUnit(turnQualityComponents.continuity, 0).toFixed(3));
    res.setHeader("x-turn-quality-attunement", clampUnit(turnQualityComponents.attunement, 0).toFixed(3));
    res.setHeader("x-turn-quality-pull", clampUnit(turnQualityComponents.conversationalPull, 0).toFixed(3));
    res.setHeader("x-turn-quality-brevity", clampUnit(turnQualityComponents.brevity, 0).toFixed(3));
    res.setHeader("x-turn-quality-completion", clampUnit(turnQualityComponents.completionRate, 0).toFixed(3));
    const committedSessionId = String(req.get("X-Client-Token") || "").trim() || `ip:${normalizeClientIp(requesterIp)}`;
    const committedTurnNumber = computeMemoryTurnNumber(activeSession?.memory);
    const committedTurnId = committedTurnNumber > 0 ? `turn-${committedTurnNumber}` : "";
    const committedLastUpdatedAt = deriveMemoryLastUpdatedAt(activeSession?.memory);
    const committedHistoryUpdatedAt = deriveHistoryUpdatedAt(activeSession?.memory);
    const committedMemoryUpdatedAt = deriveMemoriesUpdatedAt(activeSession?.memory);
    const committedStateVersion = buildMemoryStateVersion(activeSession?.memory);
    const talkDialogueTimeline = hasAuthoritativeScreenplayText
      ? buildTalkDialogueTimelineRevision({
        turnId: committedTurnId,
        requestId: rid,
        audioAssetId: committedTurnId ? `${committedTurnId}:audio` : `${rid}:audio`,
        audioDurationMs: talkAudioDurationMs,
        documentRevisionId: committedStateVersion || rid,
        screenplayOutput: talkScreenplayOutput,
        screenplayCues: talkScreenplayCues,
        studioMeta,
      })
      : null;
    if (talkDialogueTimeline) {
      const dialogueTimelineJson = JSON.stringify(talkDialogueTimeline);
      if (dialogueTimelineJson.length <= 12000) {
        res.setHeader("x-dialogue-timeline", encodeURIComponent(dialogueTimelineJson));
      }
    }
    if (committedTurnId) {
        storeTalkTurnMeta({
          turnId: committedTurnId,
          sessionId: committedSessionId,
          userId: trustedUserId,
          stateVersion: committedStateVersion,
          transcript,
          reply: talkReplyPreview,
          audioDurationMs: talkAudioDurationMs,
          timingSource: talkScreenplayTimingSource,
          screenplayCues: talkScreenplayCues,
          screenplayOutput: talkScreenplayOutput,
          dialogueTimeline: talkDialogueTimeline,
          renderContract: talkRenderContract,
          requestId: rid,
        });
      res.setHeader("x-turn-meta-available", "1");
    } else {
      res.setHeader("x-turn-meta-available", "0");
    }
    res.setHeader("x-session-id", committedSessionId);
    res.setHeader("x-state-version", committedStateVersion);
    res.setHeader("x-last-updated-at", String(committedLastUpdatedAt || 0));
    res.setHeader("x-history-updated-at", String(committedHistoryUpdatedAt || 0));
    res.setHeader("x-memory-updated-at", String(committedMemoryUpdatedAt || 0));
    res.setHeader("x-last-turn-id", committedTurnId);
    res.setHeader("x-turn-id", committedTurnId);
    res.setHeader("x-schema-version", String(API_SCHEMA_VERSION));
    res.setHeader("x-backend-build", BACKEND_BUILD);
    res.setHeader("x-backend-boot-id", BACKEND_BOOT_ID);
    const persistedUserName = normalizeUserPersonName(activeSession?.memory?.userPrimaryName);
    const persistedRememberedPeople = sanitizeRememberedPeople(
      activeSession?.memory?.rememberedPeople,
      USER_MEMORY_REMEMBERED_PEOPLE_MAX
    );
    if (persistedUserName) {
      res.setHeader("x-user-name", encodeURIComponent(persistedUserName));
    }
    res.setHeader("x-remembered-people-count", String(persistedRememberedPeople.length));
    res.setHeader("x-action-lane", String(actionLaneMeta?.lane || "chat"));
    res.setHeader("x-action-created", actionLaneMeta?.created ? "1" : "0");
    res.setHeader("x-turn-status", "responded");
    res.setHeader("x-continue-listening", "0");
    res.setHeader("x-note-captured", noteCaptureResult ? "1" : "0");
    if (noteCaptureResult) {
      res.setHeader("x-note-target", String(noteCaptureResult.target || "none"));
      if (noteCaptureResult.title) {
        res.setHeader("x-note-title", encodeURIComponent(String(noteCaptureResult.title)));
      }
      if (noteCaptureResult.path) {
        res.setHeader("x-note-path", encodeURIComponent(String(noteCaptureResult.path)));
      }
      res.setHeader("x-note-status", String(noteCaptureResult.status || "unknown"));
    }
    if (taskActionResult) {
      res.setHeader("x-task-action", String(taskActionResult.status || "none"));
      res.setHeader("x-task-status", String(taskActionResult.status || "none"));
      if (taskActionResult.task?.id) {
        res.setHeader("x-task-id", encodeURIComponent(String(taskActionResult.task.id)));
      }
      if (taskActionResult.task?.title) {
        res.setHeader("x-task-title", encodeURIComponent(String(taskActionResult.task.title)));
      }
      if (taskActionResult.task?.priority) {
        res.setHeader("x-task-priority", String(taskActionResult.task.priority));
      }
      if (Number(taskActionResult.task?.dueAt || 0) > 0) {
        res.setHeader("x-task-due-at", String(Math.max(0, Number(taskActionResult.task.dueAt || 0))));
      }
      if (Number(taskActionResult.task?.completedAt || 0) > 0) {
        res.setHeader("x-task-completed-at", String(Math.max(0, Number(taskActionResult.task.completedAt || 0))));
      }
    } else {
      res.setHeader("x-task-action", "none");
      res.setHeader("x-task-status", "none");
    }

    await ensureMinThinkingDelay({
      startedAtMs: thinkingStartedAt,
      targetDelayMs: thinkingDelayMs,
    });

    if (streamAudioRequested) {
      // Chunked streaming mode: write first sentence segment immediately, then remainder segment.
      if (remainderSpeech && !secondMp3.length) {
        try {
          secondTtsResult = await ttsSupplier.synthesize({
            text: remainderSpeech,
            speed: cycleUiReflection.voiceSpeed,
            rid,
            label: "remainder_stream",
            voiceProfile: interactiveVoiceProfile,
          });
          const streamedSecondRaw = Buffer.from(secondTtsResult.buffer || []);
          secondMp3 = streamedSecondRaw.length
            ? stripLeadingId3Tag(streamedSecondRaw)
            : streamedSecondRaw;
        } catch (err) {
          logger.log(`[${rid}] stream_tail_tts_error=${String(err?.message || err)}`);
          secondMp3 = Buffer.alloc(0);
        }
      }
      ttsMs = Date.now() - ttsStart;
      const streamedAudioBuffer = Buffer.concat([firstMp3, secondMp3]);
      const total_ms = Date.now() - t0;
      const talkStatus = speculativeReuseApplied ? "speculative_reuse" : "responded";
      res.setHeader(
        "Server-Timing",
        `stt;dur=${Math.max(0, sttMs)}, llm;dur=${Math.max(0, chatMs)}, repair;dur=${Math.max(0, Math.round(Number(talkScreenplayRepairTrace.elapsedMs || 0) + Number(structuralQualityTrace.elapsedMs || 0)))}, tts;dur=${Math.max(0, ttsMs)}, total;dur=${Math.max(0, total_ms)}`
      );
      commitTalkIdempotencySuccess(req, {
        statusCode: 200,
        headers: captureTalkResponseHeaders(res),
        body: streamedAudioBuffer,
      });
      recordTalkMetric({
        statusCode: 200,
        totalMs: total_ms,
        sttMs,
        chatMs,
        ttsMs,
        streamAudio: true,
        chatStreamUsed: streamChatUsed,
        talkStatus,
        lane: actionLaneMeta?.lane || "chat",
        model: effectiveChatModel,
        modelTier: chatModelPlan.tier,
        modelReason: chatModelPlan.reason,
        reasoningEffort: effectiveChatReasoningEffort || "none",
        modelFallback: chatModelFallbackUsed,
        inputTokens: effectiveChatUsage.inputTokens,
        outputTokens: effectiveChatUsage.outputTokens,
        reasoningTokens: effectiveChatUsage.reasoningTokens,
        structuralQualityApplicable: structuralQualityTrace.applicable,
        structuralQualityPassed: structuralQualityTrace.passed,
        structuralQualityRepaired: structuralQualityTrace.repaired,
        structuralQualityOutcome: structuralQualityTrace.outcome,
        structuralQualityReason: structuralQualityTrace.finalReason,
        structuralQualityInitialScore: structuralQualityTrace.initialScore,
        structuralQualityFinalScore: structuralQualityTrace.finalScore,
        structuralRepairMs: structuralQualityTrace.elapsedMs,
        ...buildScreenplayMetricFields({
          talkScreenplayModeEnabled,
          studioMeta,
          talkScreenplayOutput,
          hasAuthoritativeScreenplayText,
          replyRepaired,
          repairTrace: talkScreenplayRepairTrace,
        }),
      });
      void scaleBackplane.emitTalkCommit({
        id: randomUUID(),
        sessionId: committedSessionId,
        turnId: committedTurnId,
        stateVersion: committedStateVersion,
        statusCode: 200,
        totalMs: total_ms,
        sttMs,
        llmMs: chatMs,
        ttsMs,
        createdAt: Date.now(),
        payload: {
          streamAudio: true,
          chatStreamUsed: Boolean(streamChatUsed),
          lane: String(actionLaneMeta?.lane || "chat"),
          model: effectiveChatModel,
          modelTier: String(chatModelPlan.tier || "unknown"),
          reasoningEffort: effectiveChatReasoningEffort || "none",
          modelFallback: Boolean(chatModelFallbackUsed),
          inputTokens: Math.max(0, Number(effectiveChatUsage.inputTokens || 0)),
          outputTokens: Math.max(0, Number(effectiveChatUsage.outputTokens || 0)),
          reasoningTokens: Math.max(0, Number(effectiveChatUsage.reasoningTokens || 0)),
          structuralQualityPassed: Boolean(structuralQualityTrace.passed),
          structuralQualityRepaired: Boolean(structuralQualityTrace.repaired),
          structuralQualityScore: Math.max(0, Number(structuralQualityTrace.finalScore || 0)),
          structuralRepairMs: Math.max(0, Number(structuralQualityTrace.elapsedMs || 0)),
          speculativeReuse: Boolean(speculativeReuseApplied),
        },
      });
      res.removeHeader("Content-Length");
      res.write(firstMp3);
      if (secondMp3.length) {
        res.write(secondMp3);
      }
      res.end();
      const stt_ms = sttMs;
      const llm_ms = chatMs;
      const tts_ms = ttsMs;
      logger.log(`[${reqId}] timings:
  stt_ms=${stt_ms}
  stt_conf=${sttConfidence.toFixed(3)}
  llm_ms=${llm_ms}
  tts_ms=${tts_ms}
  total_ms=${total_ms}
  thinking_ms=${thinkingDelayMs}
  stream_audio=1
  speculative_reuse=${speculativeReuseApplied ? 1 : 0}
  tts_segments=${Math.max(1, Number(talkTtsSegmentCount || 1))}
  tts_provider=${ttsProviderUsed}
  chat_stream_used=${streamChatUsed ? 1 : 0}
  chat_model=${effectiveChatModel}
  chat_tier=${chatModelPlan.tier}
  chat_reason=${chatModelPlan.reason}
  chat_api=${effectiveChatApiMode}
  chat_reasoning=${effectiveChatReasoningEffort || "none"}
  chat_fallback=${chatModelFallbackUsed ? 1 : 0}
  chat_temp=${chatTemperature.toFixed(2)}
  knowledge_cards=${knowledgeCardsUsed.length}
  knowledge_semantic=${knowledgeMeta?.semanticUsed ? 1 : 0}
  knowledge_semantic_forced=${knowledgeMeta?.forceSemantic ? 1 : 0}
  knowledge_sem_reason=${String(knowledgeMeta?.semanticReason || "n/a")}
  knowledge_ms=${Math.max(0, Number(knowledgeMeta?.retrievalMs || 0))}
  action_lane=${String(actionLaneMeta?.lane || "chat")}
  action_created=${actionLaneMeta?.created ? 1 : 0}
  q_spec=${clampUnit(turnQualityComponents.specificity, 0).toFixed(2)}
  q_cont=${clampUnit(turnQualityComponents.continuity, 0).toFixed(2)}
  q_attn=${clampUnit(turnQualityComponents.attunement, 0).toFixed(2)}
  q_pull=${clampUnit(turnQualityComponents.conversationalPull, 0).toFixed(2)}
  q_brev=${clampUnit(turnQualityComponents.brevity, 0).toFixed(2)}
  q_done=${clampUnit(turnQualityComponents.completionRate, 0).toFixed(2)}
  mem_use_t=${String(activeSession?.memory?.memoryUsefulnessLastTrigger || "none")}
  mem_use_p=${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastPromotions || 0))}
  mem_use_d=${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastDemotions || 0))}
  mem_use_drop=${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastDropped || 0))}
  mem_theme_count=${Math.max(0, Number(activeSession?.memory?.memoryPromptLastThemeCount || 0))}
  mem_injected=${Math.max(0, Number(activeSession?.memory?.memoryPromptLastInjectedCount || 0))}
  mem_suppressed=${Math.max(0, Number(activeSession?.memory?.memoryPromptLastSuppressedCount || 0))}
  mem_use_delta=+${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastPromotions || 0))}/-${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastDemotions || 0))}
  reply_chars=${reply.length}
  audio_bytes_out=${streamedAudioBuffer.length}
`);
      logger.log(`[${reqId}] DONE`);
      logger.log("--------------------------------------------------");
      return;
    }

    ttsMs = Date.now() - ttsStart;
    const audioBuffer = Buffer.concat([firstMp3, secondMp3]);
    const stt_ms = sttMs;
    const llm_ms = chatMs;
    const tts_ms = ttsMs;
    const total_ms = Date.now() - t0;
    const talkStatus = speculativeReuseApplied ? "speculative_reuse" : "responded";
    res.setHeader(
      "Server-Timing",
      `stt;dur=${Math.max(0, sttMs)}, llm;dur=${Math.max(0, chatMs)}, repair;dur=${Math.max(0, Math.round(Number(talkScreenplayRepairTrace.elapsedMs || 0) + Number(structuralQualityTrace.elapsedMs || 0)))}, tts;dur=${Math.max(0, ttsMs)}, total;dur=${Math.max(0, total_ms)}`
    );
    commitTalkIdempotencySuccess(req, {
      statusCode: 200,
      headers: captureTalkResponseHeaders(res),
      body: audioBuffer,
    });
    recordTalkMetric({
      statusCode: 200,
      totalMs: total_ms,
      sttMs,
      chatMs,
      ttsMs,
      streamAudio: false,
      chatStreamUsed: streamChatUsed,
      talkStatus,
      lane: actionLaneMeta?.lane || "chat",
      model: effectiveChatModel,
      modelTier: chatModelPlan.tier,
      modelReason: chatModelPlan.reason,
      reasoningEffort: effectiveChatReasoningEffort || "none",
      modelFallback: chatModelFallbackUsed,
      inputTokens: effectiveChatUsage.inputTokens,
      outputTokens: effectiveChatUsage.outputTokens,
      reasoningTokens: effectiveChatUsage.reasoningTokens,
      structuralQualityApplicable: structuralQualityTrace.applicable,
      structuralQualityPassed: structuralQualityTrace.passed,
      structuralQualityRepaired: structuralQualityTrace.repaired,
      structuralQualityOutcome: structuralQualityTrace.outcome,
      structuralQualityReason: structuralQualityTrace.finalReason,
      structuralQualityInitialScore: structuralQualityTrace.initialScore,
      structuralQualityFinalScore: structuralQualityTrace.finalScore,
      structuralRepairMs: structuralQualityTrace.elapsedMs,
      ...buildScreenplayMetricFields({
        talkScreenplayModeEnabled,
        studioMeta,
        talkScreenplayOutput,
        hasAuthoritativeScreenplayText,
        replyRepaired,
        repairTrace: talkScreenplayRepairTrace,
      }),
    });
    void scaleBackplane.emitTalkCommit({
      id: randomUUID(),
      sessionId: committedSessionId,
      turnId: committedTurnId,
      stateVersion: committedStateVersion,
      statusCode: 200,
      totalMs: total_ms,
      sttMs,
      llmMs: chatMs,
      ttsMs,
      createdAt: Date.now(),
      payload: {
        streamAudio: false,
        chatStreamUsed: Boolean(streamChatUsed),
        lane: String(actionLaneMeta?.lane || "chat"),
        model: effectiveChatModel,
        modelTier: String(chatModelPlan.tier || "unknown"),
        reasoningEffort: effectiveChatReasoningEffort || "none",
        modelFallback: Boolean(chatModelFallbackUsed),
        inputTokens: Math.max(0, Number(effectiveChatUsage.inputTokens || 0)),
        outputTokens: Math.max(0, Number(effectiveChatUsage.outputTokens || 0)),
        reasoningTokens: Math.max(0, Number(effectiveChatUsage.reasoningTokens || 0)),
        structuralQualityPassed: Boolean(structuralQualityTrace.passed),
        structuralQualityRepaired: Boolean(structuralQualityTrace.repaired),
        structuralQualityScore: Math.max(0, Number(structuralQualityTrace.finalScore || 0)),
        structuralRepairMs: Math.max(0, Number(structuralQualityTrace.elapsedMs || 0)),
        speculativeReuse: Boolean(speculativeReuseApplied),
      },
    });
    logger.log(`[${reqId}] timings:
  stt_ms=${stt_ms}
  stt_conf=${sttConfidence.toFixed(3)}
  llm_ms=${llm_ms}
  tts_ms=${tts_ms}
  total_ms=${total_ms}
  thinking_ms=${thinkingDelayMs}
  stream_audio=0
  speculative_reuse=${speculativeReuseApplied ? 1 : 0}
  tts_segments=${Math.max(1, Number(talkTtsSegmentCount || 1))}
  tts_provider=${ttsProviderUsed}
  chat_stream_used=${streamChatUsed ? 1 : 0}
  chat_model=${effectiveChatModel}
  chat_tier=${chatModelPlan.tier}
  chat_reason=${chatModelPlan.reason}
  chat_api=${effectiveChatApiMode}
  chat_reasoning=${effectiveChatReasoningEffort || "none"}
  chat_fallback=${chatModelFallbackUsed ? 1 : 0}
  chat_temp=${chatTemperature.toFixed(2)}
  knowledge_cards=${knowledgeCardsUsed.length}
  knowledge_semantic=${knowledgeMeta?.semanticUsed ? 1 : 0}
  knowledge_semantic_forced=${knowledgeMeta?.forceSemantic ? 1 : 0}
  knowledge_sem_reason=${String(knowledgeMeta?.semanticReason || "n/a")}
  knowledge_ms=${Math.max(0, Number(knowledgeMeta?.retrievalMs || 0))}
  action_lane=${String(actionLaneMeta?.lane || "chat")}
  action_created=${actionLaneMeta?.created ? 1 : 0}
  q_spec=${clampUnit(turnQualityComponents.specificity, 0).toFixed(2)}
  q_cont=${clampUnit(turnQualityComponents.continuity, 0).toFixed(2)}
  q_attn=${clampUnit(turnQualityComponents.attunement, 0).toFixed(2)}
  q_pull=${clampUnit(turnQualityComponents.conversationalPull, 0).toFixed(2)}
  q_brev=${clampUnit(turnQualityComponents.brevity, 0).toFixed(2)}
  q_done=${clampUnit(turnQualityComponents.completionRate, 0).toFixed(2)}
  mem_use_t=${String(activeSession?.memory?.memoryUsefulnessLastTrigger || "none")}
  mem_use_p=${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastPromotions || 0))}
  mem_use_d=${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastDemotions || 0))}
  mem_use_drop=${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastDropped || 0))}
  mem_theme_count=${Math.max(0, Number(activeSession?.memory?.memoryPromptLastThemeCount || 0))}
  mem_injected=${Math.max(0, Number(activeSession?.memory?.memoryPromptLastInjectedCount || 0))}
  mem_suppressed=${Math.max(0, Number(activeSession?.memory?.memoryPromptLastSuppressedCount || 0))}
  mem_use_delta=+${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastPromotions || 0))}/-${Math.max(0, Number(activeSession?.memory?.memoryUsefulnessLastDemotions || 0))}
  reply_chars=${reply.length}
  audio_bytes_out=${audioBuffer.length}
`);
    logger.log(`[${reqId}] DONE`);
    logger.log("--------------------------------------------------");

    res.setHeader("Content-Length", String(audioBuffer.length));
    return res.send(audioBuffer);
  } catch (err) {
    const totalMs = Date.now() - t0;
    if (isPageCancelledError(err) && !res.headersSent) {
      clearTalkIdempotencyPending(req, { keepCompleted: true });
      const reservationId =
        err.reservationId || req.clementine?.reservationId || null;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("x-clementine-page-cancelled", "1");
      if (reservationId) {
        res.setHeader("x-clementine-page-reservation", String(reservationId));
      }
      recordTalkMetric({
        statusCode: 409,
        totalMs,
        sttMs,
        chatMs,
        ttsMs,
        streamAudio: false,
        chatStreamUsed: false,
        talkStatus: "cancelled",
        lane: "page_cancelled",
        model: "none",
      });
      return res.status(409).json({
        ok: false,
        error: "page_generation_cancelled",
        cancelled: true,
        reservation_id: reservationId,
        cancel_reason: err.cancelReason || null,
        status: "cancelled",
      });
    }
    const diagnostic = buildTalkFailureDiagnostics(err, {
      requestId: rid,
      providerStage: err?.stage || "server",
      status: Number(err?.status || 500),
    });
    const statusCode = diagnostic.status;
    const errStage = diagnostic.providerStage;
    const safeErrMessage = diagnostic.publicMessage;
    clearTalkIdempotencyPending(req, { keepCompleted: true });
    incrementErrorCounter(diagnostic.errorClass);
    console.error(`[${rid}] talk_failure after ${totalMs}ms ${diagnostic.supportMessage}`);

    // Reliability guard: recover server-stage failures with a short fallback voice response
    // so the client isn't left with a hard 500/no-audio path.
    if (!res.headersSent && statusCode >= 500) {
      try {
        let recoveryAudio = Buffer.alloc(0);
        let recoveryProvider = "openai";
        if (talkTestDebugOfflineMode) {
          recoveryAudio = getTalkTestDebugAudioBuffer();
          recoveryProvider = "fixture";
        }
        if (!recoveryAudio.length || !isLikelyMp3Buffer(recoveryAudio)) {
          const recoveryPromptText = diagnostic.errorClass === "screenplay_page_quality_failed"
            ? "Those pages did not meet my quality bar, so I left your draft unchanged. Try that page batch again."
            : TALK_RUNTIME_RECOVERY_PROMPT_TEXT;
          const recoveryResult = await ttsSupplier.synthesizeOpenAI({
            inputText: recoveryPromptText,
            speed: 1.0,
            voice: CLEMENTINE_PROFILE.voice.openaiVoice,
          });
          recoveryAudio = Buffer.from(recoveryResult?.buffer || []);
          recoveryProvider = "openai";
        }
        if (recoveryAudio.length && isLikelyMp3Buffer(recoveryAudio)) {
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("x-turn-status", "error_recovered");
          res.setHeader("x-continue-listening", "1");
          applyTalkFailureHeaders(res, diagnostic);
          res.setHeader("x-tts-provider", recoveryProvider);
          res.setHeader("x-tts-segments", "1");
          res.setHeader("x-turn-meta-available", "0");
          if (diagnostic.errorClass === "screenplay_page_quality_failed") {
            res.setHeader("x-screenplay-output-available", "0");
            res.setHeader("x-screenplay-authoritative", "0");
            res.setHeader("x-screenplay-sync-ready", "0");
            res.setHeader("x-screenplay-quality-ok", "0");
            res.setHeader("x-screenplay-repair-outcome", "exhausted");
          }
          res.setHeader("x-schema-version", String(API_SCHEMA_VERSION));
          res.setHeader("x-backend-build", BACKEND_BUILD);
          res.setHeader("x-backend-boot-id", BACKEND_BOOT_ID);
          res.setHeader("Content-Length", String(recoveryAudio.length));
          commitTalkIdempotencySuccess(req, {
            statusCode: 200,
            headers: captureTalkResponseHeaders(res),
            body: recoveryAudio,
          });
          recordTalkMetric({
            statusCode: 200,
            totalMs,
            sttMs,
            chatMs,
            ttsMs,
            streamAudio: streamAudioRequested,
            chatStreamUsed: false,
            talkStatus: "error_recovered",
            lane: "error_recovered",
            model: recoveryProvider === "fixture" ? "recovery_fixture" : "recovery_openai",
          });
          void scaleBackplane.emitTalkCommit({
            id: randomUUID(),
            sessionId: String(req.get("X-Client-Token") || "").trim() || `ip:${normalizeClientIp(ip)}`,
            turnId: "",
            stateVersion: "",
            statusCode: 200,
            totalMs,
            sttMs,
            llmMs: chatMs,
            ttsMs,
            createdAt: Date.now(),
            payload: {
              streamAudio: Boolean(streamAudioRequested),
              recovered: true,
              stage: errStage || "server",
              errorClass: diagnostic.errorClass,
              error: safeErrMessage,
            },
          });
          return res.status(200).send(recoveryAudio);
        }
      } catch (recoveryErr) {
        const recoveryDiagnostic = buildTalkFailureDiagnostics(recoveryErr, {
          requestId: rid,
          providerStage: "tts",
          status: Number(recoveryErr?.status || 500),
        });
        console.error(
          `[${rid}] talk_error_recovery_failed stage=${errStage || "server"} class=${diagnostic.errorClass} recovery=${recoveryDiagnostic.supportMessage}`
        );
      }
    }

    recordTalkMetric({
      statusCode,
      totalMs,
      sttMs,
      chatMs,
      ttsMs,
      streamAudio: streamAudioRequested,
      chatStreamUsed: false,
      talkStatus: "error",
      lane: "error",
      model: "unknown",
    });
    void scaleBackplane.emitTalkCommit({
      id: randomUUID(),
      sessionId: String(req.get("X-Client-Token") || "").trim() || `ip:${normalizeClientIp(ip)}`,
      turnId: "",
      stateVersion: "",
      statusCode,
      totalMs,
      sttMs,
      llmMs: chatMs,
      ttsMs,
      createdAt: Date.now(),
      payload: {
        streamAudio: Boolean(streamAudioRequested),
        error: safeErrMessage,
        stage: errStage || "server",
        errorClass: diagnostic.errorClass,
      },
    });
    applyTalkFailureHeaders(res, diagnostic);
    return res.status(statusCode).json(buildTalkFailureBody(diagnostic));
  }
  };
}

export { createTalkHandler, REQUIRED_DEPS };
