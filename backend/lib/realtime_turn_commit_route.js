// T-decompose-phase5b3-turn-commit — extract
// `POST /realtime/turn_commit` from backend/index.js.
//
// Phase 5b.3 of the decomposition (spec:
// docs/specs/T-decompose-backend-index.md, design note #227).
// Phase 5b.1 (#238) extracted /realtime/client_secret; Phase
// 5b.2 (#264) extracted /realtime/studio_render +
// /studio_render_stream. This PR extracts /realtime/turn_commit.
//
// V1 pillar: realtime
// V1 effect: continues the realtime route decomposition required
// by docs/v1-definition.md line 68. After 5b.3, only 5b.4
// (/realtime/call) remains in the 5b chain.
//
// The HTTP contract remains identical to the previous inline handler.
// The 201 envelope, the 400 missing-fields envelope, the read-
// state headers (x-turn-id, x-turn-meta-available,
// Cache-Control: no-store + headers from applyReadStateHeaders),
// the storeTalkTurnMeta side-effect (exactly once per success
// with the canonical render contract), the same body limit
// (256kb), and the same console.log line all match the inline
// source exactly.
//
// Per the #227 design note's "memory-write test" constraint:
// this is the third decomp sub-phase deliberately because the
// memory write surface (resolveWritableMemoryContext,
// sanitizePersistedSessionMemory, updateSessionEmotionMemory,
// updateSessionAfterReply, persistWritableMemoryContext,
// storeTalkTurnMeta, etc.) is the heaviest dep set in the 5b
// chain. The extraction passes all of those as deps so they
// remain swappable for tests, and the lib does NOT mutate any
// module-level state itself — same byte-identical-rotation
// rule that Codex flagged in the 5b.1 review.
//
// Access-control posture: SAFE-PUBLIC at the HTTP layer (the
// inline handler had no bearer-token guard). The memory write
// surface itself is PER-USER scoped — `resolveWritableMemoryContext`
// resolves the writable scope from the request (IP, user
// session). The route is the public commit handler iOS uses
// after a realtime turn lands; the per-user gating happens
// inside the dep functions.

import express from "express";
import { buildCanonClarificationPayload } from "./canon_clarification.js";
import { withIdempotency } from "./idempotency_envelope.js";
import {
  createProvisionalScreenplayOptionQuestion,
  extractProvisionalScreenplayOptions,
  removePendingScreenplayLearningQuestion,
  resolvePendingScreenplayLearningAnswer,
  selectPendingScreenplayLearningQuestion,
  selectProvisionalScreenplayMoveFamilies,
  upsertPendingScreenplayLearningQuestion,
} from "./screenplay_question_planner.js";

const TURN_COMMIT_BODY_LIMIT = "256kb";

function mountRealtimeTurnCommitRoute(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountRealtimeTurnCommitRoute requires an Express app");
  }
  const {
    // ---------- helpers ----------
    createRequestId,
    normalizeSnippet,
    sanitizeStudioTurnMetadata,
    // ---------- memory context resolution ----------
    resolveWritableMemoryContext,
    sanitizePersistedSessionMemory,
    persistWritableMemoryContext,
    // ---------- request / IP ----------
    normalizeClientIp,
    clientIp,
    // ---------- director / metric / emotion-memory pipeline ----------
    directorFlagsFromTranscript,
    getUserMetricState,
    countSessionStartsForDay,
    formatLocalDateStamp,
    updateSessionEmotionMemory,
    updateSessionAfterReply,
    recordUserTalkMetrics,
    maybeRefineActiveThemesWithLLM,
    recordCreativeMemoryTriggersForRequest,
    getCreativeMemoryForPrompt = null,
    // ---------- turn meta storage + read state ----------
    storeTalkTurnMeta,
    buildReadStateMeta,
    applyReadStateHeaders,
    // ---------- constants ----------
    DEEP_TURN_SCORE_THRESHOLD,
  } = deps;

  const requiredFns = {
    createRequestId,
    normalizeSnippet,
    sanitizeStudioTurnMetadata,
    resolveWritableMemoryContext,
    sanitizePersistedSessionMemory,
    persistWritableMemoryContext,
    normalizeClientIp,
    clientIp,
    directorFlagsFromTranscript,
    getUserMetricState,
    countSessionStartsForDay,
    formatLocalDateStamp,
    updateSessionEmotionMemory,
    updateSessionAfterReply,
    recordUserTalkMetrics,
    maybeRefineActiveThemesWithLLM,
    recordCreativeMemoryTriggersForRequest,
    storeTalkTurnMeta,
    buildReadStateMeta,
    applyReadStateHeaders,
  };
  for (const [key, fn] of Object.entries(requiredFns)) {
    if (typeof fn !== "function") {
      throw new Error(`mountRealtimeTurnCommitRoute: ${key} is required`);
    }
  }
  if (typeof DEEP_TURN_SCORE_THRESHOLD !== "number") {
    throw new Error("mountRealtimeTurnCommitRoute: DEEP_TURN_SCORE_THRESHOLD must be a number");
  }

  const handleRealtimeTurnCommit = async (req, res) => {
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const transcript = normalizeSnippet(
      req.body?.transcript ?? req.body?.user_message ?? req.body?.userMessage ?? "",
      6_000,
    );
    const reply = normalizeSnippet(
      req.body?.reply ?? req.body?.assistant_message ?? req.body?.assistantMessage ?? "",
      8_000,
    );
    const requestId = normalizeSnippet(req.body?.request_id ?? req.body?.requestId ?? "", 32);
    const rawStudioInput = req.body?.studio && typeof req.body.studio === "object"
      ? req.body.studio
      : req.body || null;
    const studioMeta = sanitizeStudioTurnMetadata(rawStudioInput);
    const acceptedPageText = String(
      rawStudioInput?.screenplayInsertedText ??
        rawStudioInput?.screenplay_inserted_text ??
        rawStudioInput?.insertedText ??
        rawStudioInput?.inserted_text ??
        ""
    ).trim().slice(0, 20_000);

    if (!transcript || !reply) {
      return res.status(400).json({
        stage: "realtime_turn_commit",
        error: "Both transcript and reply are required.",
      });
    }

    const context = resolveWritableMemoryContext(req, nowTs);
    const previousMemory = sanitizePersistedSessionMemory(context.memory);
    const screenplayProjectId = normalizeSnippet(
      studioMeta?.screenplayProjectId ??
        rawStudioInput?.screenplayProjectId ??
        rawStudioInput?.screenplay_project_id ??
        "",
      96,
    );
    const screenplayProjectTitle = normalizeSnippet(
      studioMeta?.screenplayProjectTitle ??
        rawStudioInput?.screenplayProjectTitle ??
        rawStudioInput?.screenplay_project_title ??
        rawStudioInput?.projectTitle ??
        rawStudioInput?.project_title ??
        "",
      160,
    );
    const pendingScreenplayQuestion = selectPendingScreenplayLearningQuestion(
      previousMemory.pendingScreenplayLearningQuestions,
      {
        projectId: screenplayProjectId,
        projectTitle: screenplayProjectTitle,
      },
    );
    const pendingScreenplayResolution = resolvePendingScreenplayLearningAnswer({
      pending: pendingScreenplayQuestion,
      transcript,
      projectId: screenplayProjectId,
      projectTitle: screenplayProjectTitle,
      currentTurn: previousMemory.turns,
      now: nowTs,
    });
    const provisionalScreenplayOptions =
      pendingScreenplayResolution.status === "provisional_options"
        ? extractProvisionalScreenplayOptions(reply)
        : [];
    let provisionalMoveFamilies = [];
    if (
      pendingScreenplayResolution.status === "provisional_options" &&
      pendingScreenplayQuestion
    ) {
      let projectMemory = null;
      if (typeof getCreativeMemoryForPrompt === "function") {
        try {
          const creativeMemory = await getCreativeMemoryForPrompt({
            userId: String(req?.authUser?.id || req?.userId || "").trim(),
            projectId: screenplayProjectId,
            projectTitle: screenplayProjectTitle,
            query: [
              screenplayProjectTitle,
              pendingScreenplayQuestion.question,
              "screenplay story move taste",
            ].filter(Boolean).join(" "),
            maxEpisodicMemories: 0,
            recordEpisodicRecall: false,
          });
          projectMemory = creativeMemory?.projectContinuity || null;
        } catch (_error) { /* never block a realtime commit on taste recall */ }
      }
      provisionalMoveFamilies = selectProvisionalScreenplayMoveFamilies({
        pending: pendingScreenplayQuestion,
        projectMemory,
        transcript: pendingScreenplayQuestion.question,
      });
    }
    const provisionalScreenplayQuestion = createProvisionalScreenplayOptionQuestion(
      pendingScreenplayQuestion,
      provisionalScreenplayOptions,
      {
        askedAtTurn: previousMemory.turns,
        now: nowTs,
        moveFamilies: provisionalMoveFamilies,
      },
    );
    const requesterIp = normalizeClientIp(context.requesterIp || clientIp(req));
    const flags = directorFlagsFromTranscript(transcript);
    const metricStateBeforeTurn = getUserMetricState(requesterIp, nowTs);
    const sameDaySessionStartCount = countSessionStartsForDay(
      metricStateBeforeTurn,
      formatLocalDateStamp(nowTs),
    );
    const sameDaySessionReturns = sameDaySessionStartCount >= 2;
    const prevBehaviorMode = String(previousMemory?.behaviorMode || "surface");
    const prevFollowUpPromptCount = Math.max(0, Number(previousMemory?.followUpPromptCount || 0));
    const prevFollowUpAnswerCount = Math.max(0, Number(previousMemory?.followUpAnswerCount || 0));

    let nextMemory = updateSessionEmotionMemory(previousMemory, transcript, flags, {
      sameDaySessionReturns,
    });
    nextMemory = updateSessionAfterReply(nextMemory, transcript, reply, false, studioMeta);
    if (provisionalScreenplayQuestion) {
      nextMemory.pendingScreenplayLearningQuestions =
        upsertPendingScreenplayLearningQuestion(
          nextMemory.pendingScreenplayLearningQuestions,
          provisionalScreenplayQuestion,
        );
    }

    const modeSwitchedThisTurn =
      prevBehaviorMode !== String(nextMemory?.behaviorMode || prevBehaviorMode);
    const followUpPromptDelta = Math.max(
      0,
      Math.max(0, Number(nextMemory?.followUpPromptCount || 0)) - prevFollowUpPromptCount,
    );
    const followUpAnswerDelta = Math.max(
      0,
      Math.max(0, Number(nextMemory?.followUpAnswerCount || 0)) - prevFollowUpAnswerCount,
    );
    const deepTurnThisTurn =
      Boolean(flags.isVulnerable) ||
      Math.max(0, Number(nextMemory?.behaviorDepthScore || 0)) >= DEEP_TURN_SCORE_THRESHOLD;

    recordUserTalkMetrics(requesterIp, {
      deepTurn: deepTurnThisTurn,
      relationshipDepthScore: Number(nextMemory?.relationshipDepthScore || 0),
      reflectivePromptDelta: followUpPromptDelta,
      reflectiveAnswerDelta: followUpAnswerDelta,
      modeSwitched: modeSwitchedThisTurn,
    }, nowTs);

    const activeThemeRefreshPromise = maybeRefineActiveThemesWithLLM({
      rid,
      transcript,
      memory: nextMemory,
    });
    activeThemeRefreshPromise
      .catch(() => {})
      .finally(() => {
        if (context.activeSession && typeof context.activeSession === "object") {
          context.activeSession.memory = nextMemory;
        }
      });

    let persisted = persistWritableMemoryContext(context, nextMemory, nowTs);
    const creativeMemoryWritePromise = Promise.resolve()
      .then(() => recordCreativeMemoryTriggersForRequest(req, {
        transcript,
        reply: acceptedPageText || reply,
        acceptedPageText,
        studioMeta,
        source: acceptedPageText ? "talk_screenplay_output" : "realtime_turn_commit",
        learningContext: pendingScreenplayResolution.learningContext,
        questionInteraction: pendingScreenplayResolution.interaction,
      }))
      .catch((error) => {
        console.error(
          `[${rid}] realtime_turn_commit creative_memory_failed error=${String(error?.message || error || "unknown")}`,
        );
        return null;
      });
    const creativeMemoryWriteSummary = await creativeMemoryWritePromise;
    const screenplayQuestionResolved = Boolean(
      pendingScreenplayQuestion &&
      pendingScreenplayResolution.shouldClear &&
      creativeMemoryWriteSummary &&
      creativeMemoryWriteSummary.skipped !== true
    );
    if (screenplayQuestionResolved) {
      nextMemory.pendingScreenplayLearningQuestions =
        removePendingScreenplayLearningQuestion(
          nextMemory.pendingScreenplayLearningQuestions,
          pendingScreenplayQuestion,
        );
      persisted = persistWritableMemoryContext(context, nextMemory, nowTs);
    }

    const readMeta = buildReadStateMeta(req, persisted, requesterIp);
    if (readMeta.lastTurnId) {
      storeTalkTurnMeta({
        turnId: readMeta.lastTurnId,
        sessionId: readMeta.sessionId,
        stateVersion: readMeta.stateVersion,
        transcript,
        reply,
        renderContract: {
          reply_role: "final",
          authoritative_page_text_available: false,
          sync_ready: false,
        },
        requestId: requestId || rid,
        now: nowTs,
      });
    }

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    res.setHeader("x-turn-id", String(readMeta.lastTurnId || ""));
    res.setHeader("x-turn-meta-available", readMeta.lastTurnId ? "1" : "0");

    // Diagnostics line: inline source used console.log; lib uses
    // console.warn per the established lib precedent (pre-flight's
    // console-log-in-lib rule treats console.warn as the correct
    // lib-level surface). Ops log capture receives both stdout +
    // stderr so operator output is unchanged.
    console.warn(
      `[${rid}] realtime_turn_commit turn=${readMeta.lastTurnId || "none"} session=${readMeta.sessionId || "unknown"} chars_u=${transcript.length} chars_a=${reply.length}`,
    );

    const canonClarification = buildCanonClarificationPayload(creativeMemoryWriteSummary);
    const screenplayQuestionResolution = screenplayQuestionResolved
      ? {
        question_id: pendingScreenplayQuestion.id,
        response_status: pendingScreenplayResolution.status,
        target_field: pendingScreenplayQuestion.targetField,
        ...(pendingScreenplayResolution.answerClassification?.selectedOptionId
          ? {
            selected_option_id:
              pendingScreenplayResolution.answerClassification.selectedOptionId,
            selected_option_rank:
              pendingScreenplayResolution.answerClassification.selectedOptionRank,
          }
          : {}),
        learning_promoted: Math.max(
          0,
          Number(creativeMemoryWriteSummary?.learningAnswersPromoted || 0),
        ) > 0,
        correction_protected: Math.max(
          0,
          Number(creativeMemoryWriteSummary?.learningAnswersCorrectionProtected || 0),
        ) > 0,
      }
      : provisionalScreenplayQuestion
        ? {
          question_id: provisionalScreenplayQuestion.id,
          response_status: "provisional_options",
          target_field: provisionalScreenplayQuestion.targetField,
          learning_promoted: false,
          correction_protected: false,
          provisional_options: provisionalScreenplayQuestion.provisionalOptions.map((option) => ({
            id: option.id,
            rank: option.rank,
            value: option.value,
            recommended: option.recommended,
          })),
        }
        : null;
    const canonClarificationPending = Boolean(
      creativeMemoryWriteSummary?.canonCorrectionAmbiguityId,
    );
    const canonGroundingChanged = !canonClarificationPending && Boolean(
      Math.max(0, Number(creativeMemoryWriteSummary?.corrections || 0)) > 0 ||
      Math.max(0, Number(creativeMemoryWriteSummary?.acceptedCanonFactsRetired || 0)) > 0 ||
      Math.max(0, Number(creativeMemoryWriteSummary?.writerCanonFactsRecorded || 0)) > 0 ||
      String(creativeMemoryWriteSummary?.canonCorrectionReceiptId || "").trim(),
    );
    const memoryGroundingChanged = Boolean(
      screenplayQuestionResolved ||
      provisionalScreenplayQuestion ||
      canonGroundingChanged
    );
    const memoryGroundingReason = screenplayQuestionResolved
      ? "screenplay_question_resolved"
      : provisionalScreenplayQuestion
        ? "screenplay_options_proposed"
      : canonGroundingChanged
        ? "canon_correction"
        : null;

    return res.status(201).json({
      ok: true,
      action: "realtime_turn_commit",
      status: "committed",
      source: "realtime",
      turn_id: readMeta.lastTurnId || null,
      request_id: requestId || rid,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
      backend_boot_id: readMeta.backendBootId,
      canon_clarification: canonClarification,
      screenplay_question_resolution: screenplayQuestionResolution,
      memory_grounding_changed: memoryGroundingChanged,
      memory_grounding_reason: memoryGroundingReason,
      memory_grounding_project_id: memoryGroundingChanged ? screenplayProjectId || null : null,
      memory_grounding_project_title: memoryGroundingChanged ? screenplayProjectTitle || null : null,
    });
  };

  app.post(
    "/realtime/turn_commit",
    express.json({ limit: TURN_COMMIT_BODY_LIMIT }),
    (req, _res, next) => {
      const headerKey = String(req.header?.("x-idempotency-key") || "").trim();
      const requestId = normalizeSnippet(
        req.body?.request_id ?? req.body?.requestId ?? "",
        128,
      );
      if (!headerKey && requestId) {
        req.headers["x-idempotency-key"] = requestId;
      }
      next();
    },
    withIdempotency(handleRealtimeTurnCommit, {
      resolveUserId: (req) => req?.authUser?.id || req?.user?.id || req?.userId || null,
    }),
  );
}

export { mountRealtimeTurnCommitRoute, TURN_COMMIT_BODY_LIMIT };
