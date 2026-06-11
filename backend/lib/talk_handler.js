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
// BYTE-IDENTICAL MOVE. The function body below is the verbatim text from
// backend/index.js (handleTalkRequest @ main #328, inner body lines
// 27674-31235). Response envelopes, log prefixes, status codes, headers,
// counter order, error classes and side-effect ordering are unchanged
// because the body is unchanged. Supplier glue (STT/chat/TTS calls) is
// left inline — boxing it is Phase 7c, explicitly out of 7b scope.
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
import { incrementErrorCounter } from "./talk_error_counter.js";
import {
  applyTalkFailureHeaders,
  buildTalkFailureBody,
  buildTalkFailureDiagnostics,
  createTalkFailureError,
} from "./talk_failure_diagnostics.js";

const REQUIRED_DEPS = Object.freeze(["OPENAI_API_KEY","CLEMENTINE_PROFILE","recordTalkMetric","scaleBackplane","storeTalkTurnMeta","setPersistedUserMemoryForIp","clientIp","commitTalkIdempotencySuccess","isAuthoritativeTalkScreenplayOutput"]);

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
    CALENDAR_COMPOSE_TARGET,
    CHAT_STREAM_ENABLED,
    CHAT_TIMEOUT_MS,
    CLEMENTINE_CHAOS_FACTOR_BASELINE,
    CLEMENTINE_PROFILE,
    CLEMENTINE_ROMANTIC_DEPTH_BASELINE,
    COMPANION_MODE_PROFILE,
    DEEP_TURN_SCORE_THRESHOLD,
    DEFAULT_ASSISTANT_SELF_NAME,
    EMAIL_COMPOSE_BODY_MAX_CHARS,
    EMAIL_SEND_TARGET,
    EMOTIONAL_TRAJECTORY,
    EMPTY_TRANSCRIPT_VOICE_PROMPT_ENABLED,
    EMPTY_TRANSCRIPT_VOICE_PROMPT_MIN_BYTES,
    EMPTY_TRANSCRIPT_VOICE_PROMPT_STREAK,
    ENABLE_LOCAL_EMAIL_SEND,
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
    applyAdaptiveTurnLearning,
    applyTtsLeadIn,
    applyUserIdentityIntentToMemory,
    buildBackReferenceAddendum,
    buildBackReferencePlan,
    buildCalendarActionReply,
    buildCalendarComposeUrl,
    buildCharacterTextureAddendum,
    buildCinemaCheckEnvelope,
    buildCycleConsciousMemoryAddendum,
    buildCycleConsciousMemoryPlan,
    buildCycleEvolutionAddendum,
    buildEmailSendReply,
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
    clearPendingEmailDraft,
    clearPendingLocalAction,
    clearTalkIdempotencyPending,
    clientIp,
    commitTalkIdempotencySuccess,
    completeTaskInMemory,
    computeChatMaxTokensForTurn,
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
    extractCalendarIntent,
    extractEmailSendIntent,
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
    normalizeAssistantSelfName,
    normalizeClientIp,
    normalizeClientToken,
    normalizeEmailAddress,
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
    resolveEmailSendIntentWithPending,
    resolveTalkSessionKey,
    sanitizeActiveThemes,
    sanitizeAdaptiveBias,
    sanitizeAdaptiveQualityTags,
    sanitizeRememberedPeople,
    sanitizeStudioTurnMetadata,
    scaleBackplane,
    selectChatModelForTurn,
    selectChatTemperatureForTurn,
    selectExecutableLocalActionCandidate,
    sendLocalEmail,
    setAssistantSelfNameForIp,
    setPendingEmailDraft,
    setPendingLocalAction,
    setPersistedUserMemoryForIp,
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
  const chatSupplier = deps.chatSupplier || createChatSupplier({
    OPENAI_API_KEY,
    CHAT_TIMEOUT_MS,
    fetchWithTimeout,
    isAbortError,
    streamChatReplyWithFirstSentence,
  });
  const ttsSupplier = deps.ttsSupplier || createTtsSupplier({
    synthesizeSpeechMp3,
    synthesizeSpeechMp3OpenAI,
    synthesizeTalkScreenplayPageAudio,
  });

  function buildScreenplayMetricFields({
    talkScreenplayModeEnabled = false,
    studioMeta = null,
    talkScreenplayOutput = null,
    hasAuthoritativeScreenplayText = false,
    replyRepaired = false,
  } = {}) {
    const requestedTarget = talkScreenplayModeEnabled
      ? (String(studioMeta?.screenplayTarget || "").trim().toLowerCase() || "unspecified")
      : "none";
    return {
      screenplayMode: Boolean(talkScreenplayModeEnabled),
      screenplayRequestedTarget: requestedTarget,
      screenplayFinalTarget: String(talkScreenplayOutput?.target || "").trim().toLowerCase() || "none",
      screenplayOutputSource: String(talkScreenplayOutput?.source || "").trim().toLowerCase() || "none",
      screenplayAuthoritative: Boolean(hasAuthoritativeScreenplayText),
      screenplayReplyRepaired: Boolean(
        replyRepaired ||
        String(talkScreenplayOutput?.source || "").trim().toLowerCase().startsWith("repaired_")
      ),
    };
  }

  async function attemptTalkScreenplayRepairPass({
    currentOutput = null,
    rawReply = "",
    transcript = "",
    studioMeta = null,
    chatModelPlan = null,
    chatTemperature = 0.4,
    chatMaxTokens = 1_500,
    rid = "",
  } = {}) {
    if (typeof applyTalkScreenplayRepairCandidate !== "function") return null;
    if (String(studioMeta?.screenplayTarget || "").trim().toLowerCase() !== "page") return null;
    const currentSource = String(currentOutput?.source || "").trim().toLowerCase();
    const currentTarget = String(currentOutput?.target || "").trim().toLowerCase();
    if (currentTarget === "page" && !currentSource.startsWith("guard_")) return null;
    if (currentSource && !currentSource.startsWith("guard_")) return null;

    const failedDraft = normalizeTalkMultilineSnippet(rawReply, 6_000);
    const userRequest = normalizeTalkMultilineSnippet(transcript, 2_000);
    if (!failedDraft && !userRequest) return null;
    const sceneAnchor = normalizeSnippet(
      studioMeta?.screenplayAnchorSceneLabel || studioMeta?.screenplaySceneLabel || studioMeta?.sceneLabel,
      180
    );
    const requestedPages = normalizeSnippet(
      studioMeta?.screenplayRequestedPages ??
        studioMeta?.screenplay_requested_pages ??
        studioMeta?.screenplayPageBatch ??
        studioMeta?.screenplay_page_batch ??
        studioMeta?.screenplayTargetPages ??
        "",
      32
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
    const screenplayActPressureState = normalizeSnippet(
      studioMeta?.screenplayActPressureState || studioMeta?.screenplay_act_pressure_state,
      220
    );
    const screenplayEndingImage = normalizeSnippet(
      studioMeta?.screenplayEndingImage || studioMeta?.screenplay_ending_image,
      220
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
    const featureObligationLines = [
      screenplayAct ? `ACT: ${screenplayAct}` : "",
      screenplayFeatureSequence ? `FEATURE_SEQUENCE: ${screenplayFeatureSequence}` : "",
      screenplayFeatureObligation ? `STRUCTURAL_OBLIGATION: ${screenplayFeatureObligation}` : "",
      screenplaySceneObjective ? `SCENE_OBJECTIVE: ${screenplaySceneObjective}` : "",
      screenplayCurrentBeat ? `CURRENT_BEAT: ${screenplayCurrentBeat}` : "",
      screenplayActPressureState ? `ACT_PRESSURE: ${screenplayActPressureState}` : "",
      screenplayCharacterArcState ? `CHANGED_BEHAVIOR_DUE: ${screenplayCharacterArcState}` : "",
      screenplayEndingImage ? `ENDING_IMAGE_PRESSURE: ${screenplayEndingImage}` : "",
      ...screenplayNextThreeTurns.map((item) => `NEXT_TURN: ${item}`),
      ...screenplayActThreePayoffPath.map((item) => `ACT_THREE_PAYOFF: ${item}`),
      ...screenplayUnresolvedSetups.map((item) => `SETUP_TO_CARRY_OR_PAY: ${item}`),
    ].filter(Boolean);
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
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `FAILED_GATE: ${currentSource || "guard_low_page_quality"}`,
          requestedPages ? `REQUESTED_PAGES: ${requestedPages}` : "",
          sceneAnchor ? `SCENE_ANCHOR: ${sceneAnchor}` : "",
          featureObligationLines.length ? "FEATURE_OBLIGATIONS:" : "",
          ...featureObligationLines.map((line) => `- ${line}`),
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
      const repairResult = await chatSupplier.chat({
        model: String(chatModelPlan?.model || ""),
        temperature: Math.min(0.35, Math.max(0, Number(chatTemperature || 0.4))),
        maxTokens: Math.max(512, Math.min(6_000, Number(chatMaxTokens || 1_500))),
        messages: repairMessages,
      });
      const repairMs = Date.now() - startedAt;
      if (!repairResult?.response?.ok) {
        logger.log(
          `[${rid}] screenplay_repair_pass failed status=${Number(repairResult?.response?.status || 0)} source=${currentSource || "unknown"}`
        );
        return { repaired: false, elapsedMs: repairMs };
      }
      let repairJson;
      try {
        repairJson = JSON.parse(String(repairResult.rawText || ""));
      } catch (_err) {
        logger.log(`[${rid}] screenplay_repair_pass invalid_json=1 source=${currentSource || "unknown"}`);
        return { repaired: false, elapsedMs: repairMs };
      }
      const candidateReply = normalizeTalkMultilineSnippet(
        repairJson?.choices?.[0]?.message?.content || "",
        8_000
      );
      const repairedOutput = applyTalkScreenplayRepairCandidate({
        currentOutput,
        candidateReply,
        transcript,
        studioMeta,
      });
      if (!repairedOutput) {
        logger.log(`[${rid}] screenplay_repair_pass rejected_by_gate=1 source=${currentSource || "unknown"}`);
        return { repaired: false, elapsedMs: repairMs };
      }
      logger.log(
        `[${rid}] screenplay_repair_pass repaired=1 source=${currentSource || "unknown"} chars=${candidateReply.length}`
      );
      return {
        repaired: true,
        elapsedMs: repairMs,
        reply: normalizeTalkScreenplayText(repairedOutput.text || candidateReply),
        output: repairedOutput,
      };
    } catch (err) {
      logger.log(
        `[${rid}] screenplay_repair_pass error=${normalizeSnippet(String(err?.message || err || "unknown"), 180)}`
      );
      return { repaired: false, elapsedMs: Date.now() - startedAt };
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
  const interactiveVoiceProfile = {
    ...CLEMENTINE_PROFILE.voice,
    provider: INTERACTIVE_TTS_PROVIDER,
  };
  let thinkingDelayMs = pickThinkingDurationMs();
  const thinkingStartedAt = Date.now();

  const t0 = Date.now();
  let sttMs = 0, chatMs = 0, ttsMs = 0;
  let debugTranscriptOverride = "";
  let talkTestDebugOfflineMode = false;
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
    if (!String(transcript || "").trim() && !String(memoryReply || "").trim()) return;
    void recordCreativeMemoryTriggersForRequest(req, {
      transcript,
      reply: memoryReply,
      studioMeta,
      screenplayOutput,
      sessionStartedAt,
      sessionDurationMs,
      source: source || (screenplayText ? "talk_screenplay_output" : "talk_turn"),
    }).catch((err) => {
      console.error(`[creative_memory] trigger error rid=${rid}:`, err?.message || err);
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

    const clientTokenHeader = normalizeClientToken(req.get("X-Client-Token"));
    const activeSession = req.clientSession && typeof req.clientSession === "object"
      ? req.clientSession
      : (clientTokenHeader ? getValidSession(clientTokenHeader) : null);
    if (activeSession && !req.clientSession) {
      req.clientSession = activeSession;
    }
    const previousMemory = activeSession?.memory && typeof activeSession.memory === "object"
      ? activeSession.memory
      : null;
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
          setPersistedUserMemoryForIp(ip, emptyMemory, now);
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
        setPersistedUserMemoryForIp(ip, previousMemory, Date.now());
      }
    }
    const forcedErrorStageRaw = TALK_TEST_DEBUG_FAILURE_ENABLED
      ? normalizeSnippet(
        req.get("x-debug-force-error") ?? req.body?.debug_force_error ?? req.body?.debugForceError,
        24
      ).toLowerCase()
      : "";
    if (forcedErrorStageRaw) {
      const allowedStages = new Set(["server", "stt", "chat", "tts"]);
      const forcedStage = allowedStages.has(forcedErrorStageRaw) ? forcedErrorStageRaw : "server";
      const forcedErr = new Error(`Forced /talk failure (${forcedStage})`);
      forcedErr.stage = forcedStage;
      forcedErr.status = 500;
      logger.log(`[${rid}] debug_force_error stage=${forcedStage}`);
      throw forcedErr;
    }

    const customSystemPrompt = normalizeSystemPrompt(req.body?.system_prompt || req.body?.systemPrompt);
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
    let rawCalendarIntent = extractCalendarIntent(transcript);
    let rawEmailSendIntent = ENABLE_LOCAL_EMAIL_SEND
      ? extractEmailSendIntent(transcript)
      : {
        shouldSend: false,
        needsRecipient: false,
        needsContent: false,
        trigger: "",
        recipient: "",
        subject: "",
        body: "",
      };
    const hasStrongActionTrigger = Boolean(
      noteCaptureIntent.shouldCapture ||
      rawTaskCreateIntent.shouldCreate ||
      rawTaskCompleteIntent.shouldComplete ||
      rawCalendarIntent.shouldCreate ||
      rawEmailSendIntent.shouldSend
    );
    const shouldPromptLowConfidenceRepeat =
      isLikelyAmbiguousLowConfidenceUtterance(transcript, sttConfidence) &&
      !hasStrongActionTrigger;
    if (shouldPromptLowConfidenceRepeat) {
      const clarificationPrompt = buildLowConfidenceClarificationPrompt(transcript);
      try {
        const promptTts = await ttsSupplier.synthesize({
          text: clarificationPrompt,
          speed: CLEMENTINE_PROFILE.voice.speed,
          rid,
          label: "low_confidence_repeat_prompt",
          voiceProfile: interactiveVoiceProfile,
        });
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
      rawCalendarIntent = { shouldCreate: false, title: "", startAt: 0, endAt: 0, trigger: "" };
      rawEmailSendIntent = {
        shouldSend: false,
        needsRecipient: false,
        needsContent: false,
        trigger: "",
        recipient: "",
        subject: "",
        body: "",
      };
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
    let emailSendIntent = resolveEmailSendIntentWithPending({
      transcript,
      baseIntent: rawEmailSendIntent,
      memory: activeSession?.memory || previousMemory,
      noteCaptureIntent,
    });
    let taskCreateIntent =
      noteCaptureIntent.shouldCapture || emailSendIntent.shouldSend
        ? { shouldCreate: false, title: "", dueAt: 0, priority: "normal", trigger: "" }
        : rawTaskCreateIntent;
    let taskCompleteIntent =
      noteCaptureIntent.shouldCapture || emailSendIntent.shouldSend
        ? { shouldComplete: false, query: "", trigger: "" }
        : rawTaskCompleteIntent;
    let calendarIntent =
      noteCaptureIntent.shouldCapture || emailSendIntent.shouldSend
        ? { shouldCreate: false, title: "", startAt: 0, endAt: 0, trigger: "" }
        : rawCalendarIntent;
    let hasTaskIntent = Boolean(taskCreateIntent.shouldCreate || taskCompleteIntent.shouldComplete);
    let hasCalendarIntent = Boolean(calendarIntent.shouldCreate);
    let actionGateReply = "";
    const pendingLocalActionMemory = activeSession?.memory && typeof activeSession.memory === "object"
      ? activeSession.memory
      : (previousMemory && typeof previousMemory === "object" ? previousMemory : null);
    const pendingLocalActionBeforeTurn = readPendingLocalAction(pendingLocalActionMemory);
    const askedLocalActionConfirm = isLocalActionConfirmationTranscript(transcript);
    const askedLocalActionCancel = isLocalActionCancelTranscript(transcript);
    const executableLocalActionCandidate = selectExecutableLocalActionCandidate({
      noteCaptureIntent,
      emailSendIntent,
      calendarIntent,
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
      emailSendIntent = {
        shouldSend: false,
        needsRecipient: false,
        needsContent: false,
        trigger: "",
        recipient: "",
        subject: "",
        body: "",
        fromPending: false,
        canceled: false,
      };
      taskCreateIntent = { shouldCreate: false, title: "", dueAt: 0, priority: "normal", trigger: "" };
      taskCompleteIntent = { shouldComplete: false, query: "", trigger: "" };
      calendarIntent = { shouldCreate: false, title: "", startAt: 0, endAt: 0, trigger: "" };
      hasTaskIntent = false;
      hasCalendarIntent = false;
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
        } else if (pendingType === "email_compose") {
          emailSendIntent = {
            shouldSend: true,
            needsRecipient: false,
            needsContent: false,
            trigger: normalizeSnippet(pendingPayload.trigger || "confirm", 64) || "confirm",
            recipient: normalizeEmailAddress(pendingPayload.recipient || pendingPayload.to),
            subject: trimToMax(String(pendingPayload.subject || "").trim(), 120),
            body: normalizeSnippet(pendingPayload.body, EMAIL_COMPOSE_BODY_MAX_CHARS),
            fromPending: true,
            canceled: false,
          };
        } else if (pendingType === "calendar_compose") {
          calendarIntent = {
            shouldCreate: true,
            title: normalizeSnippet(pendingPayload.title, 120) || "Calendar block",
            startAt: Math.max(0, Number(pendingPayload.startAt || 0)),
            endAt: Math.max(0, Number(pendingPayload.endAt || 0)),
            trigger: normalizeSnippet(pendingPayload.trigger || "confirm", 64) || "confirm",
          };
          hasCalendarIntent = true;
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
      !emailSendIntent.shouldSend &&
      !hasTaskIntent &&
      !hasCalendarIntent
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
        setPersistedUserMemoryForIp(ip, holdMemory, Date.now());
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

    const requesterIp = ip;
    const metricStateBeforeTurn = getUserMetricState(requesterIp);
    const sameDaySessionStartCount = countSessionStartsForDay(
      metricStateBeforeTurn,
      formatLocalDateStamp(Date.now())
    );
    const sameDaySessionReturns = sameDaySessionStartCount >= 2;
    const prevBehaviorMode = String(previousMemory?.behaviorMode || "surface");
    const prevFollowUpPromptCount = Math.max(0, Number(previousMemory?.followUpPromptCount || 0));
    const prevFollowUpAnswerCount = Math.max(0, Number(previousMemory?.followUpAnswerCount || 0));
    const sessionMemory = activeSession
      ? updateSessionEmotionMemory(activeSession.memory, transcript, flags, {
        sameDaySessionReturns,
      })
      : null;
    if (activeSession) activeSession.memory = sessionMemory;
    if (sessionMemory) {
      setPersistedUserMemoryForIp(requesterIp, sessionMemory, Date.now());
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
    const runtimeStatusSnapshot = deriveBackendRuntimeStatus();
    const chatModelPlan = selectChatModelForTurn({
      transcript,
      turnPlanner,
      flags,
      routingLane,
      runtimeStatus: runtimeStatusSnapshot,
    });
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

    const shouldProcessEmailIntent = emailSendIntent.shouldSend || emailSendIntent.canceled;
    const shouldProcessNoteIntent = noteCaptureIntent.shouldCapture && !shouldProcessEmailIntent;
    const shouldProcessCalendarIntent = hasCalendarIntent && !shouldProcessEmailIntent && !shouldProcessNoteIntent;
    const shouldProcessTaskIntent =
      hasTaskIntent &&
      !shouldProcessEmailIntent &&
      !shouldProcessNoteIntent &&
      !shouldProcessCalendarIntent;
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
    let emailSendResult = null;
    if (shouldProcessEmailIntent) {
      const emailActionSignature = buildLocalActionSignature("email_send", {
        to: emailSendIntent.recipient,
        subject: emailSendIntent.subject,
        body: normalizeSnippet(emailSendIntent.body, 280),
        trigger: emailSendIntent.trigger,
      });
      const duplicateEmailAction = Boolean(sessionMemory) && !emailSendIntent.canceled &&
        isLocalActionDuplicate(sessionMemory, {
          type: "email_send",
          signature: emailActionSignature,
          nowTs: Date.now(),
          windowMs: LOCAL_ACTION_DEDUPE_WINDOW_MS,
        });

      if (emailSendIntent.canceled) {
        if (sessionMemory) {
          clearPendingEmailDraft(sessionMemory, Date.now());
          if (activeSession) activeSession.memory = sessionMemory;
        }
        emailSendResult = {
          status: "canceled",
          target: EMAIL_SEND_TARGET,
          to: "",
          subject: "",
        };
      } else if (duplicateEmailAction) {
        emailSendResult = {
          status: "duplicate",
          action: "none",
          target: EMAIL_SEND_TARGET,
          transport: "none",
          to: emailSendIntent.recipient,
          subject: emailSendIntent.subject,
          composeUrl: "",
        };
      } else if (emailSendIntent.needsRecipient) {
        if (sessionMemory) {
          clearPendingEmailDraft(sessionMemory, Date.now());
          if (activeSession) activeSession.memory = sessionMemory;
        }
        emailSendResult = {
          status: "needs_recipient",
          target: EMAIL_SEND_TARGET,
          to: "",
          subject: "",
        };
      } else if (emailSendIntent.needsContent) {
        if (sessionMemory) {
          setPendingEmailDraft(sessionMemory, {
            recipient: emailSendIntent.recipient,
            subject: emailSendIntent.subject,
          }, Date.now());
          if (activeSession) activeSession.memory = sessionMemory;
        }
        emailSendResult = {
          status: "needs_content",
          target: EMAIL_SEND_TARGET,
          to: emailSendIntent.recipient,
          subject: emailSendIntent.subject,
        };
      } else {
        emailSendResult = await sendLocalEmail({
          recipient: emailSendIntent.recipient,
          subject: emailSendIntent.subject,
          body: emailSendIntent.body,
          reqId: rid,
        });
        if (sessionMemory) {
          if (emailSendResult?.status === "composed" || emailSendResult?.status === "failed") {
            // Avoid accidental resend loops after compose/failure.
            clearPendingEmailDraft(sessionMemory, Date.now());
          }
          if (emailSendResult?.status === "composed" || emailSendResult?.status === "needs_content") {
            recordLocalAction(sessionMemory, {
              type: "email_send",
              signature: emailActionSignature,
              nowTs: Date.now(),
            });
          }
          if (activeSession) activeSession.memory = sessionMemory;
        }
      }
      const emailLogTarget = String(emailSendResult?.target || "none");
      const emailLogStatus = String(emailSendResult?.status || "unknown");
      const emailLogTo = trimToMax(String(emailSendResult?.to || ""), 120);
      const emailLogSubject = trimToMax(String(emailSendResult?.subject || ""), 96);
      logger.log(
        `[${rid}] email_send intent=1 trigger="${emailSendIntent.trigger}" from_pending=${emailSendIntent.fromPending ? "1" : "0"} status=${emailLogStatus} target=${emailLogTarget} to="${emailLogTo}" subject="${emailLogSubject}"`
      );
      if (emailSendResult?.error) {
        logger.log(`[${rid}] email_send error=${emailSendResult.error}`);
      }
    }
    let calendarActionResult = null;
    if (shouldProcessCalendarIntent) {
      const compose = buildCalendarComposeUrl({
        title: calendarIntent.title,
        startAt: calendarIntent.startAt,
        endAt: calendarIntent.endAt,
        details: `Drafted by CLEMENTINE at ${formatNoteTimestamp()}`,
        target: CALENDAR_COMPOSE_TARGET,
      });
      calendarActionResult = {
        status: compose?.url ? "composed" : "failed",
        action: compose?.url ? "compose" : "none",
        trigger: calendarIntent.trigger,
        title: normalizeSnippet(calendarIntent.title, 120) || "Calendar block",
        startAt: Math.max(0, Number(calendarIntent.startAt || 0)),
        endAt: Math.max(0, Number(calendarIntent.endAt || 0)),
        target: String(compose?.target || CALENDAR_COMPOSE_TARGET),
        transport: String(compose?.transport || "none"),
        composeUrl: String(compose?.url || ""),
      };
      logger.log(
        `[${rid}] calendar_action intent=1 trigger="${calendarIntent.trigger}" status=${calendarActionResult.status} target=${calendarActionResult.target} title="${trimToMax(calendarActionResult.title, 96)}"`
      );
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
          actionKey: noteActionKey,
          payload: notePayload,
          result: noteCaptureResult,
          status: isNoteSuccess ? "completed" : "pending",
          retryAt: isNoteSuccess ? 0 : computeOutboxRetryAt(0),
          reqId: rid,
        });
      }
      if (emailSendResult) {
        const emailStatus = String(emailSendResult.status || "");
        const emailPayload = {
          recipient: normalizeEmailAddress(emailSendIntent.recipient || emailSendResult.to),
          subject: trimToMax(String(emailSendIntent.subject || emailSendResult.subject || "").trim(), 120),
          body: normalizeSnippet(emailSendIntent.body, EMAIL_COMPOSE_BODY_MAX_CHARS),
          trigger: normalizeSnippet(emailSendIntent.trigger, 64),
          fromPending: Boolean(emailSendIntent.fromPending),
        };
        const emailActionKey = buildOutboxActionKey("email_compose", emailPayload);
        const emailRetryableFailure = emailStatus === "failed";
        const emailCompletedLike = emailStatus === "composed" ||
          emailStatus === "duplicate" ||
          emailStatus === "canceled" ||
          emailStatus === "needs_content" ||
          emailStatus === "needs_recipient" ||
          emailStatus === "disabled";
        await enqueueActionOutbox({
          type: "email_compose",
          actionKey: emailActionKey,
          payload: emailPayload,
          result: emailSendResult,
          status: emailCompletedLike && !emailRetryableFailure ? "completed" : "pending",
          retryAt: emailRetryableFailure ? computeOutboxRetryAt(0) : 0,
          reqId: rid,
        });
      }
      if (calendarActionResult) {
        const calStatus = String(calendarActionResult.status || "");
        const calPayload = {
          title: normalizeSnippet(calendarActionResult.title, 120),
          startAt: Math.max(0, Number(calendarActionResult.startAt || 0)),
          endAt: Math.max(0, Number(calendarActionResult.endAt || 0)),
          target: normalizeSnippet(calendarActionResult.target, 32),
          details: "Drafted by CLEMENTINE",
          trigger: normalizeSnippet(calendarIntent.trigger, 64),
        };
        const calActionKey = buildOutboxActionKey("calendar_compose", calPayload);
        const calRetryableFailure = calStatus === "failed";
        await enqueueActionOutbox({
          type: "calendar_compose",
          actionKey: calActionKey,
          payload: calPayload,
          result: calendarActionResult,
          status: calRetryableFailure ? "pending" : "completed",
          retryAt: calRetryableFailure ? computeOutboxRetryAt(0) : 0,
          reqId: rid,
        });
      }
    }
    const noteCaptureReply = noteCaptureResult
      ? buildNoteCaptureReply(noteCaptureResult)
      : "";
    const emailSendReply = emailSendResult
      ? buildEmailSendReply(emailSendResult)
      : "";
    const calendarActionReply = calendarActionResult
      ? buildCalendarActionReply(calendarActionResult)
      : "";
    const taskActionReply = taskActionResult
      ? buildTaskActionReply(taskActionResult)
      : "";
    const localActionReply =
      actionGateReply || emailSendReply || calendarActionReply || taskActionReply || noteCaptureReply;
    const actionLaneMeta = classifyActionLane({
      emailResult: emailSendResult,
      noteResult: noteCaptureResult,
      calendarResult: calendarActionResult,
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
      let talkScreenplayOutput = buildTalkScreenplayOutput({
        reply: "",
        transcript: talkGenerationTranscript,
        studioMeta,
      });
      if (
        String(talkScreenplayOutput?.target || "").trim().toLowerCase() !== "page" &&
        isScreenplayPageWriteTurn &&
        talkGenerationTranscript
      ) {
        const directTranscriptOutput = buildTalkDirectTranscriptScreenplayOutput(talkGenerationTranscript, studioMeta);
        if (directTranscriptOutput) {
          talkScreenplayOutput = directTranscriptOutput;
        }
      }
      const hasAuthoritativeScreenplayText = isAuthoritativeTalkScreenplayOutput(
        talkScreenplayOutput,
        { studioMeta, transcript: talkGenerationTranscript }
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
      commitCreativeMemoryAfterTurn({
        transcript,
        reply,
        studioMeta,
        screenplayOutput: talkScreenplayOutput,
        source: hasAuthoritativeScreenplayText ? "talk_screenplay_output" : "talk_turn",
      });
      const committedMemory = activeSession
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
        setPersistedUserMemoryForIp(requesterIp, committedMemory, Date.now());
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
          userId: req.get("X-User-Id"),
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
      const emailComposed = emailSendResult?.status === "composed";
      res.setHeader("x-email-sent", "0");
      res.setHeader("x-email-composed", emailComposed ? "1" : "0");
      if (emailSendResult) {
        res.setHeader("x-email-action", String(emailSendResult.action || (emailComposed ? "compose" : "none")));
        res.setHeader("x-email-status", String(emailSendResult.status || "unknown"));
        res.setHeader("x-email-target", String(emailSendResult.target || "none"));
        if (emailSendResult.to) {
          res.setHeader("x-email-to", encodeURIComponent(String(emailSendResult.to)));
        }
        if (emailSendResult.subject) {
          res.setHeader("x-email-subject", encodeURIComponent(String(emailSendResult.subject)));
        }
        if (emailSendResult.composeUrl) {
          res.setHeader("x-email-compose-url", encodeURIComponent(String(emailSendResult.composeUrl)));
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
    const systemBaseRaw = normalizeSystemPrompt(withOutputContract(presetBoundSystem));
    // T08: augment with per-user creative memory when present (no-op for cold users).
    const systemBaseWithMemory = await wrapSystemPromptWithCreativeMemory(systemBaseRaw, req, {
      screenplayTaskHint: transcript,
      memory: sessionMemory,
    });
    // T21: when this is a screenplay page-write turn, append a compact
    // craft-context block describing the active framework (and, when
    // available, the user's coverage state). Cheap and additive: the
    // LLM gets structural awareness without changing any other path.
    const systemBase = isScreenplayPageWriteTurn
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
OUTPUT: default 2-3 short lines (up to 5 when needed), blank line between lines, one question max, question-ending only ~10%.
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
OUTPUT: default 2-3 short lines (up to 5 when needed), blank line between lines, one question max, question-ending only ~10%.
`.trim();
    }

    const systemWithIdentity = appendDirectorAddendum(systemBase, assistantSelfNameAddendum);
    const systemWithStyle = appendDirectorAddendum(systemWithIdentity, humanStyleAddendum);
    const systemWithTherapeuticDepth = appendDirectorAddendum(systemWithStyle, therapeuticDepthAddendum);
    const systemWithSocialSpark = appendDirectorAddendum(systemWithTherapeuticDepth, socialSparkAddendum);
    const systemWithSocialSparkMemory = appendDirectorAddendum(
      systemWithSocialSpark,
      socialSparkMemoryHookAddendum
    );
    const systemWithKnowledge = appendDirectorAddendum(systemWithSocialSparkMemory, knowledgeAddendum);
    const systemWithHiddenMode = appendDirectorAddendum(systemWithKnowledge, hiddenDepthModeAddendum);
    const systemWithSeasonalWave = appendDirectorAddendum(systemWithHiddenMode, seasonalWaveAddendum);
    const systemWithCycleEvolution = appendDirectorAddendum(systemWithSeasonalWave, cycleEvolutionAddendum);
    const systemWithCycleMemory = appendDirectorAddendum(
      systemWithCycleEvolution,
      cycleConsciousMemoryAddendum
    );
    const systemWithBackReference = appendDirectorAddendum(
      systemWithCycleMemory,
      backReferenceAddendum
    );
    const systemWithTexture = appendDirectorAddendum(systemWithBackReference, characterTextureAddendum);
    const systemWithTrajectory = appendDirectorAddendum(systemWithTexture, trajectoryAddendum);
    const systemWithTimeTone = appendDirectorAddendum(systemWithTrajectory, timeOfDayToneAddendum);
    const systemWithArc = appendDirectorAddendum(systemWithTimeTone, weeklyArcAddendum);
    const systemWithExpansion = appendDirectorAddendum(systemWithArc, weeklyExpansionAddendum);
    const systemWithMovement = appendDirectorAddendum(systemWithExpansion, movementAddendum);
    const systemWithSelfAwareness = appendDirectorAddendum(systemWithMovement, selfAwarenessAddendum);
    const systemWithMelancholy = appendDirectorAddendum(systemWithSelfAwareness, melancholySeedAddendum);
    const rawSystem = appendDirectorAddendum(systemWithMelancholy, directorAddendum);
    const system = fitSystemPromptForTurnLatency(rawSystem, {
      turnPlanner,
      flags,
      routingLane,
      chatModelPlan,
    });
    if (process.env.NODE_ENV !== "production" && rawSystem.length !== system.length) {
      logger.log(
        `[${rid}] system_trim chars=${rawSystem.length}->${system.length} ` +
        `budget_fast=${FAST_TURN_SYSTEM_PROMPT_MAX_CHARS} budget_rich=${RICH_TURN_SYSTEM_PROMPT_MAX_CHARS} tier=${chatModelPlan.tier}`
      );
    }
    const chatMaxTokens = computeChatMaxTokensForTurn({
      transcript,
      turnPlanner,
      flags,
      routingLane,
      chatModelPlan,
      screenplayPageWrite: isScreenplayPageWriteTurn,
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
      `[${rid}] chat_system=${customSystemPrompt ? "client" : "default"} chars=${system.length} ` +
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
        speculativeReuse.audioBuffer.length
      );
      logger.log(
        `[${rid}] speculative_reuse requested=1 hit=${speculativeReuseApplied ? "1" : "0"} key=${speculativeReuseKeyInput} prompt_hash=${speculativePromptHashInput}`
      );
    }
    let rawReply = "";
    let streamFirstSentence = "";
    let streamChatUsed = false;
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
      if (emailSendResult) {
        logger.log(
          `[${rid}] email_send handled_internally status=${String(emailSendResult?.status || "unknown")} target=${String(emailSendResult?.target || "none")} llm_bypassed=1`
        );
      } else if (calendarActionResult) {
        logger.log(
          `[${rid}] calendar_action handled_internally status=${String(calendarActionResult?.status || "unknown")} target=${String(calendarActionResult?.target || "none")} llm_bypassed=1`
        );
      } else if (taskActionResult) {
        logger.log(
          `[${rid}] task_action handled_internally status=${String(taskActionResult?.status || "unknown")} llm_bypassed=1`
        );
      } else {
        logger.log(
          `[${rid}] note_capture handled_internally status=${String(noteCaptureResult?.status || "unknown")} target=${String(noteCaptureResult?.target || "none")} llm_bypassed=1`
        );
      }
    } else {
      if (useChatStreaming) {
        try {
          const streamStart = Date.now();
          const streamResult = await chatSupplier.stream({
            rid,
            system,
            shortTermContextMessages,
            transcript: talkGenerationTranscript,
            onFirstSentence: maybeStartEarlyTts,
            model: chatModelPlan.model,
            temperature: chatTemperature,
            maxTokens: chatMaxTokens,
          });
          rawReply = String(streamResult.reply || "").trim();
          streamFirstSentence = String(streamResult.firstSentence || "").trim();
          streamChatUsed = Boolean(rawReply);
          chatMs = Date.now() - streamStart;
          if (streamFirstSentence && !earlyTtsPromise) {
            maybeStartEarlyTts(streamFirstSentence);
          }
        } catch (err) {
          const streamDiagnostic = buildTalkFailureDiagnostics(err, {
            requestId: rid,
            providerStage: "chat",
            status: Number(err?.status || 500),
          });
          logger.log(`[${rid}] CHAT stream fallback ${streamDiagnostic.supportMessage}`);
          rawReply = "";
        }
      }

      if (!rawReply) {
        let chatResult;
        try {
          chatResult = await chatSupplier.chat({
            model: chatModelPlan.model,
            temperature: chatTemperature,
            maxTokens: chatMaxTokens,
            messages: chatMessages,
          });
        } catch (err) {
          throw createTalkFailureError({
            requestId: rid,
            providerStage: "chat",
            status: Number(err?.status || 500),
            message: String(err?.message || "Chat completion failed."),
          });
        }

        const chatResp = chatResult.response;
        const chatText = chatResult.rawText;
        chatMs = Date.now() - chatStart;

        if (!chatResp.ok) {
          const diagnostic = buildTalkFailureDiagnostics(
            { stage: "chat", status: chatResp.status, rawBody: chatText },
            {
              requestId: rid,
              providerStage: "chat",
              status: chatResp.status,
              rawBody: chatText,
            }
          );
          logger.log(`[${rid}] CHAT failed ${diagnostic.supportMessage}`);
          throw createTalkFailureError({
            requestId: rid,
            providerStage: "chat",
            status: chatResp.status,
            rawBody: chatText,
          });
        }

        let chatJson;
        try {
          chatJson = JSON.parse(chatText);
        } catch (_) {
          throw createTalkFailureError({
            requestId: rid,
            providerStage: "chat",
            status: 502,
            message: "Chat completion response was invalid JSON.",
            errorClass: "response_invalid",
          });
        }
        rawReply = (chatJson.choices?.[0]?.message?.content || "").trim();
      }

      if (!rawReply) {
        throw createTalkFailureError({
          requestId: rid,
          providerStage: "chat",
          status: 502,
          message: "Chat completion returned an empty reply.",
          errorClass: "response_invalid",
        });
      }
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
      setPersistedUserMemoryForIp(requesterIp, activeSession.memory, qualityAppliedAt);

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
          .then((llmEval) => {
            if (!activeSession?.memory) return;
            const evalAt = Date.now();
            if (!llmEval || typeof llmEval !== "object") {
              activeSession.memory.adaptiveEvalFailureCount = Math.max(
                0,
                Number(activeSession.memory.adaptiveEvalFailureCount || 0)
              ) + 1;
              activeSession.memory.lastUpdatedAt = evalAt;
              setPersistedUserMemoryForIp(requesterIp, activeSession.memory, evalAt);
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
            setPersistedUserMemoryForIp(requesterIp, activeSession.memory, evalAt);
            if (process.env.NODE_ENV !== "production") {
              logger.log(
                `[${rid}] adaptive_eval score=${clampUnit(llmEval.score, 0.66).toFixed(2)} merged=${clampUnit(mergedQuality.score, 0.66).toFixed(2)} tags=${sanitizeAdaptiveQualityTags(llmEval.tags, 8).join(",") || "none"}`
              );
            }
          })
          .catch((err) => {
            if (!activeSession?.memory) return;
            const failAt = Date.now();
            activeSession.memory.adaptiveEvalFailureCount = Math.max(
              0,
              Number(activeSession.memory.adaptiveEvalFailureCount || 0)
            ) + 1;
            activeSession.memory.lastUpdatedAt = failAt;
            setPersistedUserMemoryForIp(requesterIp, activeSession.memory, failAt);
            if (process.env.NODE_ENV !== "production") {
              logger.log(`[${rid}] adaptive_eval error=${String(err?.message || err)}`);
            }
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
    let talkScreenplayOutput = buildTalkScreenplayOutput({
      reply,
      transcript: talkGenerationTranscript,
      studioMeta,
    });
    if (
      isScreenplayPageWriteTurn &&
      !localActionReply &&
      String(talkScreenplayOutput?.target || "").trim().toLowerCase() !== "page"
    ) {
      const repairPass = await attemptTalkScreenplayRepairPass({
        currentOutput: talkScreenplayOutput,
        rawReply,
        transcript: talkGenerationTranscript,
        studioMeta,
        chatModelPlan,
        chatTemperature,
        chatMaxTokens,
        rid,
      });
      if (repairPass?.elapsedMs) {
        chatMs += Math.max(0, Number(repairPass.elapsedMs || 0));
      }
      if (repairPass?.repaired && repairPass.output) {
        talkScreenplayOutput = repairPass.output;
        reply = repairPass.reply || normalizeTalkScreenplayText(repairPass.output.text || reply);
        rawReply = reply;
        replyRepaired = true;
      }
    }
    const talkReplyPreview = buildTalkReplyPreview({
      reply,
      screenplayOutput: talkScreenplayOutput,
    });
    let talkAudioDurationMs = estimateTalkSpeechDurationMs(
      reply,
      cycleUiReflection.voiceSpeed
    );
    let talkScreenplayTimingSource = talkScreenplayOutput?.target === "page" ? "estimated" : "";
    let talkScreenplayCues = buildEstimatedTalkScreenplayCues(
      talkScreenplayOutput,
      talkAudioDurationMs
    );
    commitCreativeMemoryAfterTurn({
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
    res.setHeader("x-chat-model", chatModelPlan.model);
    res.setHeader("x-chat-model-tier", chatModelPlan.tier);
    res.setHeader("x-chat-model-reason", chatModelPlan.reason);
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
      { studioMeta, transcript: talkGenerationTranscript }
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
    res.setHeader("x-reply-repaired", replyRepaired ? "1" : "0");
    res.setHeader("x-tts-provider", encodeURIComponent(ttsProviderUsed));
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
          userId: req.get("X-User-Id"),
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
    const emailComposed = emailSendResult?.status === "composed";
    res.setHeader("x-email-sent", "0");
    res.setHeader("x-email-composed", emailComposed ? "1" : "0");
    if (emailSendResult) {
      res.setHeader("x-email-action", String(emailSendResult.action || (emailComposed ? "compose" : "none")));
      res.setHeader("x-email-status", String(emailSendResult.status || "unknown"));
      res.setHeader("x-email-target", String(emailSendResult.target || "none"));
      if (emailSendResult.to) {
        res.setHeader("x-email-to", encodeURIComponent(String(emailSendResult.to)));
      }
      if (emailSendResult.subject) {
        res.setHeader("x-email-subject", encodeURIComponent(String(emailSendResult.subject)));
      }
      if (emailSendResult.composeUrl) {
        res.setHeader("x-email-compose-url", encodeURIComponent(String(emailSendResult.composeUrl)));
      }
    }
    const calendarComposed = calendarActionResult?.status === "composed";
    res.setHeader("x-calendar-composed", calendarComposed ? "1" : "0");
    if (calendarActionResult) {
      res.setHeader("x-calendar-action", String(calendarActionResult.action || (calendarComposed ? "compose" : "none")));
      res.setHeader("x-calendar-status", String(calendarActionResult.status || "unknown"));
      res.setHeader("x-calendar-target", String(calendarActionResult.target || "none"));
      res.setHeader("x-calendar-start-at", String(Math.max(0, Number(calendarActionResult.startAt || 0))));
      res.setHeader("x-calendar-end-at", String(Math.max(0, Number(calendarActionResult.endAt || 0))));
      if (calendarActionResult.title) {
        res.setHeader("x-calendar-title", encodeURIComponent(String(calendarActionResult.title)));
      }
      if (calendarActionResult.composeUrl) {
        res.setHeader("x-calendar-compose-url", encodeURIComponent(String(calendarActionResult.composeUrl)));
      }
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
        `stt;dur=${Math.max(0, sttMs)}, llm;dur=${Math.max(0, chatMs)}, tts;dur=${Math.max(0, ttsMs)}, total;dur=${Math.max(0, total_ms)}`
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
        model: chatModelPlan.model,
        ...buildScreenplayMetricFields({
          talkScreenplayModeEnabled,
          studioMeta,
          talkScreenplayOutput,
          hasAuthoritativeScreenplayText,
          replyRepaired,
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
          model: String(chatModelPlan.model || "unknown"),
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
  chat_model=${chatModelPlan.model}
  chat_tier=${chatModelPlan.tier}
  chat_reason=${chatModelPlan.reason}
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
      `stt;dur=${Math.max(0, sttMs)}, llm;dur=${Math.max(0, chatMs)}, tts;dur=${Math.max(0, ttsMs)}, total;dur=${Math.max(0, total_ms)}`
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
      model: chatModelPlan.model,
      ...buildScreenplayMetricFields({
        talkScreenplayModeEnabled,
        studioMeta,
        talkScreenplayOutput,
        hasAuthoritativeScreenplayText,
        replyRepaired,
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
        model: String(chatModelPlan.model || "unknown"),
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
  chat_model=${chatModelPlan.model}
  chat_tier=${chatModelPlan.tier}
  chat_reason=${chatModelPlan.reason}
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
          const recoveryResult = await ttsSupplier.synthesizeOpenAI({
            inputText: TALK_RUNTIME_RECOVERY_PROMPT_TEXT,
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
