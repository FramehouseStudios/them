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

  app.post("/realtime/turn_commit", express.json({ limit: TURN_COMMIT_BODY_LIMIT }), (req, res) => {
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
    const studioMeta = sanitizeStudioTurnMetadata(req.body?.studio || req.body || null);

    if (!transcript || !reply) {
      return res.status(400).json({
        stage: "realtime_turn_commit",
        error: "Both transcript and reply are required.",
      });
    }

    const context = resolveWritableMemoryContext(req, nowTs);
    const previousMemory = sanitizePersistedSessionMemory(context.memory);
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

    const persisted = persistWritableMemoryContext(context, nextMemory, nowTs);
    const acceptedPageText = normalizeSnippet(studioMeta?.screenplayInsertedText ?? "", 12_000);
    void Promise.resolve(recordCreativeMemoryTriggersForRequest(req, {
      transcript,
      reply: acceptedPageText || reply,
      studioMeta,
      source: acceptedPageText ? "talk_screenplay_output" : "realtime_turn_commit",
    })).catch((error) => {
      console.error(
        `[${rid}] realtime_turn_commit creative_memory_failed error=${String(error?.message || error || "unknown")}`,
      );
    });
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
    });
  });
}

export { mountRealtimeTurnCommitRoute, TURN_COMMIT_BODY_LIMIT };
