import express from "express";
import { requireMemoryUserId } from "./memory_route_auth.js";
import {
  removePendingScreenplayLearningQuestion,
  resolvePendingScreenplayLearningAction,
  sanitizePendingScreenplayLearningQuestions,
} from "./screenplay_question_planner.js";

const SCREENPLAY_QUESTION_RESOLUTION_BODY_LIMIT = "64kb";

function mountScreenplayQuestionRoutes(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountScreenplayQuestionRoutes requires an Express app");
  }
  const {
    createRequestId,
    normalizeSnippet,
    resolveWritableMemoryContext,
    sanitizePersistedSessionMemory,
    persistWritableMemoryContext,
    recordCreativeMemoryTriggersForRequest,
    buildReadStateMeta,
    applyReadStateHeaders,
    resolveUserId,
    logger = console,
  } = deps;
  const requiredFns = {
    createRequestId,
    normalizeSnippet,
    resolveWritableMemoryContext,
    sanitizePersistedSessionMemory,
    persistWritableMemoryContext,
    recordCreativeMemoryTriggersForRequest,
    buildReadStateMeta,
    applyReadStateHeaders,
  };
  for (const [key, fn] of Object.entries(requiredFns)) {
    if (typeof fn !== "function") {
      throw new Error(`mountScreenplayQuestionRoutes: ${key} is required`);
    }
  }

  app.post(
    "/memory/screenplay-question/resolve",
    express.json({ limit: SCREENPLAY_QUESTION_RESOLUTION_BODY_LIMIT }),
    async (req, res) => {
      const userId = requireMemoryUserId(req, res, {
        resolveUserId,
        stage: "screenplay_question_resolution",
      });
      if (!userId) return;

      const rid = req.requestId || createRequestId();
      const questionId = normalizeSnippet(
        req.body?.question_id ?? req.body?.questionId,
        120
      );
      const projectId = normalizeSnippet(
        req.body?.project_id ?? req.body?.projectId,
        96
      );
      const projectTitle = normalizeSnippet(
        req.body?.project_title ?? req.body?.projectTitle,
        160
      );
      const responseStatus = normalizeSnippet(
        req.body?.response_status ?? req.body?.responseStatus,
        24
      ).toLowerCase();
      const answer = normalizeSnippet(req.body?.answer, 2_000);

      res.setHeader("Cache-Control", "no-store");
      if (!questionId || (!projectId && !projectTitle)) {
        return res.status(400).json({
          stage: "screenplay_question_resolution",
          error: "question_id and project identity are required.",
        });
      }
      if (!["answered", "declined"].includes(responseStatus)) {
        return res.status(400).json({
          stage: "screenplay_question_resolution",
          error: "response_status must be answered or declined.",
        });
      }
      if (responseStatus === "answered" && !answer) {
        return res.status(400).json({
          stage: "screenplay_question_resolution",
          error: "answer is required when response_status is answered.",
        });
      }

      const now = Date.now();
      const context = resolveWritableMemoryContext(req, now);
      const memory = sanitizePersistedSessionMemory(context.memory);
      const pendingQuestions = sanitizePendingScreenplayLearningQuestions(
        memory.pendingScreenplayLearningQuestions
      );
      const pending = pendingQuestions.find((item) => item.id === questionId) || null;
      if (!pending) {
        return res.status(200).json({
          ok: true,
          action: "screenplay_question_resolution",
          status: "already_resolved",
          question_id: questionId,
          response_status: responseStatus,
          learning_promoted: false,
          correction_protected: false,
        });
      }

      const resolution = resolvePendingScreenplayLearningAction({
        pending,
        responseStatus,
        answer,
        projectId,
        projectTitle,
        currentTurn: pending.askedAtTurn,
        now,
      });
      if (resolution.status === "provisional_options") {
        const readMeta = buildReadStateMeta(req, memory, context.requesterIp);
        applyReadStateHeaders(res, readMeta);
        return res.status(200).json({
          ok: true,
          action: "screenplay_question_resolution",
          status: "awaiting_options",
          question_id: questionId,
          response_status: "provisional_options",
          target_field: pending.targetField,
          option_generation_required: true,
          learning_promoted: false,
          correction_protected: false,
          session_id: readMeta.sessionId,
          state_version: readMeta.stateVersion,
          last_updated_at: readMeta.lastUpdatedAt || null,
          history_updated_at: readMeta.historyUpdatedAt || null,
          memory_updated_at: readMeta.memoryUpdatedAt || null,
          last_turn_id: readMeta.lastTurnId || null,
          schema_version: readMeta.schemaVersion,
          backend_build: readMeta.backendBuild,
          backend_boot_id: readMeta.backendBootId,
        });
      }
      if (!resolution.shouldClear) {
        return res.status(resolution.status === "different_project" ? 409 : 400).json({
          stage: "screenplay_question_resolution",
          error: resolution.status,
        });
      }

      let creativeMemorySummary;
      try {
        creativeMemorySummary = await recordCreativeMemoryTriggersForRequest(req, {
          transcript: resolution.status === "answered" ? answer : "skip",
          reply: "",
          turnStartedAt: now,
          projectId: pending.projectId || projectId,
          projectTitle: pending.projectTitle || projectTitle,
          source: "screenplay_question_resolution",
          learningContext: resolution.learningContext,
          questionInteraction: resolution.interaction,
        });
      } catch (error) {
        logger.error?.(
          `[${rid}] screenplay_question_resolution memory_failed error=${String(error?.message || error)}`
        );
        return res.status(503).json({
          stage: "screenplay_question_resolution",
          error: "memory_write_failed",
        });
      }

      memory.pendingScreenplayLearningQuestions =
        removePendingScreenplayLearningQuestion(pendingQuestions, pending);
      const persisted = persistWritableMemoryContext(context, memory, now);
      const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
      applyReadStateHeaders(res, readMeta);

      const learningPromoted = Math.max(
        0,
        Number(creativeMemorySummary?.learningAnswersPromoted || 0)
      ) > 0;
      const correctionProtected = Math.max(
        0,
        Number(creativeMemorySummary?.learningAnswersCorrectionProtected || 0)
      ) > 0;
      logger.warn?.(
        `[${rid}] screenplay_question_resolution question=${questionId} status=${resolution.status} promoted=${learningPromoted ? "1" : "0"} protected=${correctionProtected ? "1" : "0"}`
      );
      return res.status(200).json({
        ok: true,
        action: "screenplay_question_resolution",
        status: "resolved",
        question_id: questionId,
        response_status: resolution.status,
        target_field: pending.targetField,
        ...(resolution.answerClassification?.selectedOptionId
          ? {
            selected_option_id: resolution.answerClassification.selectedOptionId,
            selected_option_rank: resolution.answerClassification.selectedOptionRank,
          }
          : {}),
        learning_promoted: learningPromoted,
        correction_protected: correctionProtected,
        session_id: readMeta.sessionId,
        state_version: readMeta.stateVersion,
        last_updated_at: readMeta.lastUpdatedAt || null,
        history_updated_at: readMeta.historyUpdatedAt || null,
        memory_updated_at: readMeta.memoryUpdatedAt || null,
        last_turn_id: readMeta.lastTurnId || null,
        schema_version: readMeta.schemaVersion,
        backend_build: readMeta.backendBuild,
        backend_boot_id: readMeta.backendBootId,
      });
    }
  );
}

export {
  mountScreenplayQuestionRoutes,
  SCREENPLAY_QUESTION_RESOLUTION_BODY_LIMIT,
};
