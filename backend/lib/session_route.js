// D009 — POST /session, extracted verbatim from backend/index.js.
//
// The handler body is unchanged; everything it used from index.js scope is
// passed in through `deps` (session helpers, memory helpers, limits and the
// two shared stores), and library imports are re-imported here. The rate
// limiter stays boot-side and is passed in as `sessionRateLimitGuard`, same
// as before the extract. Missing dependencies fail at mount, not at first
// request.

import { API_SCHEMA_VERSION, BACKEND_BOOT_ID, BACKEND_BUILD } from "../config.js";
import { sanitizePersistedSessionMemory, selectFreshestSessionMemory, setPersistedUserMemoryForIp } from "./memory_store.js";
import { selectPendingScreenplayLearningQuestion } from "./screenplay_question_planner.js";
import { refreshScreenplayOwnerRecord } from "./screenplay_store.js";
import { restoreAuthenticatedSessionMemory } from "./session_memory_restore.js";
import { normalizeSnippet } from "./utils.js";

const REQUIRED_DEPS = Object.freeze([
  "MEMORY_BACKFILL_MAX_SCAN",
  "SCREENPLAY_PROJECT_MEMORY_MAX",
  "SESSION_TTL_MS",
  "USER_MEMORY_REMEMBERED_PEOPLE_MAX",
  "buildConversationHistoryThreads",
  "buildMemoryStateVersion",
  "buildSessionContinuitySnapshot",
  "clientIp",
  "clientSessions",
  "computeMemoryTurnNumber",
  "creativeMemoryStore",
  "deriveHistoryUpdatedAt",
  "deriveMemoriesUpdatedAt",
  "deriveMemoryLastUpdatedAt",
  "evaluateKpiTargets",
  "getAssistantSelfNameForIp",
  "getPersistedUserMemoryForAccount",
  "getValidSession",
  "initializeSessionMemoryState",
  "issueSessionToken",
  "legacyAuthMemoryIp",
  "maybeBackfillThemesFromHistory",
  "normalizeClientIp",
  "normalizeClientToken",
  "normalizeUserPersonName",
  "persistCanonicalWritableMemoryContext",
  "recordUserInitiatedSession",
  "resolveAuthenticatedUserId",
  "resolveCanonicalWritableMemoryContext",
  "resolveScreenplayOwnerKey",
  "sanitizeRememberedPeople",
  "sanitizeScreenplayProjectMemoryItems",
  "sessionRateLimitGuard",
  "setPersistedUserMemoryForAccount",
]);

function mountSessionRoute(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountSessionRoute requires an Express app");
  }
  const missing = REQUIRED_DEPS.filter((name) => deps[name] === undefined);
  if (missing.length) {
    throw new Error(`mountSessionRoute missing dependencies: ${missing.join(", ")}`);
  }
  const {
    MEMORY_BACKFILL_MAX_SCAN,
    SCREENPLAY_PROJECT_MEMORY_MAX,
    SESSION_TTL_MS,
    USER_MEMORY_REMEMBERED_PEOPLE_MAX,
    buildConversationHistoryThreads,
    buildMemoryStateVersion,
    buildSessionContinuitySnapshot,
    clientIp,
    clientSessions,
    computeMemoryTurnNumber,
    creativeMemoryStore,
    deriveHistoryUpdatedAt,
    deriveMemoriesUpdatedAt,
    deriveMemoryLastUpdatedAt,
    evaluateKpiTargets,
    getAssistantSelfNameForIp,
    getPersistedUserMemoryForAccount,
    getValidSession,
    initializeSessionMemoryState,
    issueSessionToken,
    legacyAuthMemoryIp,
    maybeBackfillThemesFromHistory,
    normalizeClientIp,
    normalizeClientToken,
    normalizeUserPersonName,
    persistCanonicalWritableMemoryContext,
    recordUserInitiatedSession,
    resolveAuthenticatedUserId,
    resolveCanonicalWritableMemoryContext,
    resolveScreenplayOwnerKey,
    sanitizeRememberedPeople,
    sanitizeScreenplayProjectMemoryItems,
    sessionRateLimitGuard,
    setPersistedUserMemoryForAccount,
  } = deps;

  app.post("/session", sessionRateLimitGuard, async (req, res) => {
    console.log(`[session] has_app_token_header=${Boolean(req.get("X-APP-TOKEN"))}`);
    const requesterIp = clientIp(req);
    const authUserId = resolveAuthenticatedUserId(req);
    const requestedClientToken = normalizeClientToken(req.get("X-Client-Token"));
    const existingSessionCandidate = requestedClientToken ? getValidSession(requestedClientToken) : null;
    const existingSession = existingSessionCandidate && (!authUserId || String(existingSessionCandidate.userId || "").trim() === authUserId)
      ? existingSessionCandidate
      : null;
    let token = "";
    let expiresAt = 0;

    if (existingSession) {
      existingSession.expiresAt = Date.now() + SESSION_TTL_MS;
      existingSession.ip = authUserId ? legacyAuthMemoryIp(authUserId) : normalizeClientIp(requesterIp);
      if (authUserId) {
        existingSession.userId = authUserId;
      }
      token = requestedClientToken;
      expiresAt = existingSession.expiresAt;
      if (authUserId) {
        const latestAccountMemory = getPersistedUserMemoryForAccount(authUserId, Date.now());
        existingSession.memory = selectFreshestSessionMemory(
          existingSession.memory,
          latestAccountMemory
        );
        existingSession.memory = setPersistedUserMemoryForAccount(authUserId, existingSession.memory, Date.now(), {
          clientTokenAliases: [requestedClientToken],
          skipPersistenceWrite: true,
        });
      } else {
        setPersistedUserMemoryForIp(existingSession.ip, existingSession.memory, Date.now(), {
          clientTokenAliases: [requestedClientToken],
        });
      }
    } else {
      const issued = issueSessionToken(requesterIp, authUserId ? "" : requestedClientToken, authUserId);
      token = issued.token;
      expiresAt = issued.expiresAt;
    }

    const sessionKpis = recordUserInitiatedSession(requesterIp);
    const sessionTargets = evaluateKpiTargets(sessionKpis);
    const sessionNowTs = Date.now();
    const activeSession = clientSessions.get(token) || null;
    let restoredMemory;
    let backfillResult = { applied: false, created: 0, trigger: "session_load", keys: [] };
    if (authUserId) {
      try {
        const restored = await restoreAuthenticatedSessionMemory({
          req,
          token,
          activeSession,
          isNewSession: !existingSession,
          nowTs: sessionNowTs,
          resolveCanonicalWritableMemoryContext,
          persistCanonicalWritableMemoryContext,
          sanitizeMemory: sanitizePersistedSessionMemory,
          initializeNewSessionMemory: (memory, nowTs) => initializeSessionMemoryState(
            memory,
            nowTs,
            getAssistantSelfNameForIp(requesterIp),
          ),
          buildConversationHistoryThreads,
          maybeBackfillThemesFromHistory,
          historyLimit: Math.max(20, MEMORY_BACKFILL_MAX_SCAN),
        });
        restoredMemory = restored.memory;
        backfillResult = restored.backfillResult;
        setPersistedUserMemoryForAccount(authUserId, restoredMemory, sessionNowTs, {
          clientTokenAliases: [token],
          skipPersistenceWrite: true,
        });
      } catch (error) {
        const rid = String(req.requestId || "session_restore");
        console.error(`[${rid}] session memory_restore_failed error=${String(error?.message || error)}`);
        if (!existingSession && token) clientSessions.delete(token);
        res.setHeader("Cache-Control", "no-store");
        return res.status(503).json({
          stage: "session",
          error: "memory_restore_failed",
        });
      }
    } else {
      restoredMemory = sanitizePersistedSessionMemory(activeSession?.memory);
      const sessionHistoryThreads = buildConversationHistoryThreads(
        restoredMemory,
        Math.max(20, MEMORY_BACKFILL_MAX_SCAN)
      );
      backfillResult = maybeBackfillThemesFromHistory(
        restoredMemory,
        sessionHistoryThreads,
        sessionNowTs,
        { trigger: "session_load" }
      );
      if (backfillResult.applied) {
        setPersistedUserMemoryForIp(normalizeClientIp(requesterIp), restoredMemory, Date.now(), {
          clientTokenAliases: [token],
        });
      }
    }
    if (backfillResult.applied) {
      console.log(
        `[session_backfill] token=${token.slice(0, 8)} created=${backfillResult.created} trigger=${backfillResult.trigger} keys=${(backfillResult.keys || []).join(",") || "none"}`
      );
    }
    const assistantSelfName = getAssistantSelfNameForIp(requesterIp);
    const userPrimaryName = normalizeUserPersonName(restoredMemory?.userPrimaryName);
    const rememberedPeople = sanitizeRememberedPeople(
      restoredMemory?.rememberedPeople,
      USER_MEMORY_REMEMBERED_PEOPLE_MAX
    ).map((person) => ({
      name: person.name,
      relation: String(person.relation || ""),
    }));
    const lastConversationRecap = normalizeSnippet(restoredMemory?.lastConversationRecap, 220);
    const lastConversationSnapshot = normalizeSnippet(restoredMemory?.lastConversationSnapshot, 420);
    const lastConversationAt = Math.max(0, Number(restoredMemory?.lastConversationAt || 0));
    const restoredEvolutionSync =
      restoredMemory?.evolutionSync && typeof restoredMemory.evolutionSync === "object"
        ? restoredMemory.evolutionSync
        : {};
    const evolutionSync = {
      stage: Number.isFinite(Number(restoredEvolutionSync.stage))
        ? Number(restoredEvolutionSync.stage)
        : null,
      depth_score: Number.isFinite(Number(restoredEvolutionSync.depthScore))
        ? Number(restoredEvolutionSync.depthScore)
        : null,
      romance_tension: Number.isFinite(Number(restoredEvolutionSync.romanceTension))
        ? Number(restoredEvolutionSync.romanceTension)
        : null,
      session_count: Number.isFinite(Number(restoredEvolutionSync.sessionCount))
        ? Number(restoredEvolutionSync.sessionCount)
        : null,
      reassurance_need: Number.isFinite(Number(restoredEvolutionSync.reassuranceNeed))
        ? Number(restoredEvolutionSync.reassuranceNeed)
        : null,
      boundary_need: Number.isFinite(Number(restoredEvolutionSync.boundaryNeed))
        ? Number(restoredEvolutionSync.boundaryNeed)
        : null,
      playful_momentum: Number.isFinite(Number(restoredEvolutionSync.playfulMomentum))
        ? Number(restoredEvolutionSync.playfulMomentum)
        : null,
      trust_signal: Number.isFinite(Number(restoredEvolutionSync.trustSignal))
        ? Number(restoredEvolutionSync.trustSignal)
        : null,
      last_theme_cue: normalizeSnippet(restoredEvolutionSync.lastThemeCue || restoredMemory?.lastTheme || "", 96) || null,
      preferred_name: normalizeUserPersonName(
        restoredEvolutionSync.preferredName || restoredMemory?.userPrimaryName || ""
      ) || null,
      is_screenwriter: Boolean(restoredEvolutionSync.isScreenwriter || restoredMemory?.isScreenwriter || false),
    };
    const sanitizedRestoredMemory = sanitizePersistedSessionMemory(restoredMemory);
    const sessionProjectMemoryItems = sanitizeScreenplayProjectMemoryItems(
      sanitizedRestoredMemory?.screenplayProjectMemory,
      SCREENPLAY_PROJECT_MEMORY_MAX
    );
    let sessionScreenplayOwner = null;
    try {
      const refreshedScreenplayOwner = await refreshScreenplayOwnerRecord(resolveScreenplayOwnerKey(req));
      if (refreshedScreenplayOwner?.ok) {
        sessionScreenplayOwner = refreshedScreenplayOwner.owner || null;
      } else {
        console.warn("[session] canonical screenplay refresh failed; omitting cached screenplay state");
      }
    } catch (error) {
      console.warn(
        `[session] canonical screenplay refresh failed; omitting cached screenplay state: ${String(error?.message || error)}`
      );
    }
    const sessionActiveProjectId = normalizeSnippet(sessionScreenplayOwner?.activeProjectId, 64);
    const sessionActiveProject = Array.isArray(sessionScreenplayOwner?.projects)
      ? sessionScreenplayOwner.projects.find((project) => project?.id === sessionActiveProjectId) || null
      : null;
    const sessionActiveProjectTitle = normalizeSnippet(sessionActiveProject?.title, 160);
    const sessionProjectMemory = sessionProjectMemoryItems.find((item) => (
      (sessionActiveProjectId && normalizeSnippet(item?.projectId, 96) === sessionActiveProjectId) ||
      (
        sessionActiveProjectTitle &&
        normalizeSnippet(item?.projectTitle, 160).toLowerCase() === sessionActiveProjectTitle.toLowerCase()
      )
    )) || sessionProjectMemoryItems[0] || null;
    const sessionPendingScreenplayQuestion = selectPendingScreenplayLearningQuestion(
      sanitizedRestoredMemory?.pendingScreenplayLearningQuestions,
      {
        projectId: sessionActiveProjectId || sessionProjectMemory?.projectId || "",
        projectTitle: sessionActiveProjectTitle || sessionProjectMemory?.projectTitle || "",
      }
    );
    const sessionPendingScreenplayQuestionPayload = sessionPendingScreenplayQuestion
      ? {
          id: sessionPendingScreenplayQuestion.id,
          project_id: sessionPendingScreenplayQuestion.projectId,
          project_title: sessionPendingScreenplayQuestion.projectTitle,
          target_field: sessionPendingScreenplayQuestion.targetField,
          target_label: sessionPendingScreenplayQuestion.targetLabel,
          question: sessionPendingScreenplayQuestion.question,
          provisional_options: sessionPendingScreenplayQuestion.provisionalOptions.map((option) => ({
            id: option.id,
            rank: option.rank,
            value: option.value,
            recommended: option.recommended,
          })),
          asked_at: Math.max(0, Number(sessionPendingScreenplayQuestion.askedAt || 0)) || null,
        }
      : null;
    let sessionCreativeMemory = null;
    if (authUserId) {
      try {
        const continuityQuery = normalizeSnippet(
          [
            sessionProjectMemory?.projectId,
            sessionProjectMemory?.act,
            sessionProjectMemory?.featureSequence,
            sessionProjectMemory?.currentBeat,
            sessionProjectMemory?.lastSceneOutcome,
            Array.isArray(sessionProjectMemory?.characterFocus)
              ? sessionProjectMemory.characterFocus.join(" ")
              : "",
            "continue screenplay session restore",
          ].filter(Boolean).join(" "),
          1_000
        );
        sessionCreativeMemory = await creativeMemoryStore.getCreativeMemoryForPrompt({
          userId: authUserId,
          projectId: sessionProjectMemory?.projectId || "",
          projectTitle: sessionProjectMemory?.projectTitle || sessionProjectMemory?.projectId || "",
          query: continuityQuery,
          maxEpisodicMemories: 3,
          recordEpisodicRecall: true,
        });
      } catch (_e) {
        sessionCreativeMemory = null;
      }
    }
    const sessionContinuity = buildSessionContinuitySnapshot(
      sanitizedRestoredMemory,
      sessionCreativeMemory
    );
    const sessionStateVersion = buildMemoryStateVersion(sanitizedRestoredMemory);
    const sessionLastUpdatedAt = deriveMemoryLastUpdatedAt(sanitizedRestoredMemory);
    const sessionHistoryUpdatedAt = deriveHistoryUpdatedAt(sanitizedRestoredMemory);
    const sessionMemoryUpdatedAt = deriveMemoriesUpdatedAt(sanitizedRestoredMemory);
    const sessionTurnNumber = computeMemoryTurnNumber(sanitizedRestoredMemory);
    const sessionLastTurnId = sessionTurnNumber > 0 ? `turn-${sessionTurnNumber}` : null;
    const expiresIn = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
    console.log(
      `[session_kpi] ip=${requesterIp} user_initiated_sessions_7d=${sessionKpis.userInitiatedSessions7d} ` +
        `returns_7d=${sessionKpis.returns7d} avg_session_seconds_7d=${sessionKpis.avgSessionSeconds7d.toFixed(1)} ` +
        `deep_turns_7d=${sessionKpis.deepTurns7d} reflective_question_answer_rate=${sessionKpis.reflectiveQuestionAnswerRate.toFixed(2)} ` +
        `rel_depth_delta_7d=${Number(sessionKpis.relationshipDepthDelta7d || 0).toFixed(2)} ` +
        `mode_switches_30d=${sessionKpis.modeSwitches30d} avg_turn_quality_7d=${Number(sessionKpis.avgTurnQuality7d || 0.66).toFixed(2)} ` +
        `target_score=${sessionTargets.metCount}/${sessionTargets.total} session_mode=${existingSession ? "resume" : "new"}`
    );

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("x-session-id", token);
    res.setHeader("x-state-version", sessionStateVersion);
    res.setHeader("x-last-updated-at", String(sessionLastUpdatedAt || 0));
    res.setHeader("x-history-updated-at", String(sessionHistoryUpdatedAt || 0));
    res.setHeader("x-memory-updated-at", String(sessionMemoryUpdatedAt || 0));
    res.setHeader("x-last-turn-id", String(sessionLastTurnId || ""));
    res.setHeader("x-schema-version", String(API_SCHEMA_VERSION));
    res.setHeader("x-backend-build", BACKEND_BUILD);
    res.setHeader("x-backend-boot-id", BACKEND_BOOT_ID);
    if (authUserId) res.setHeader("x-user-id", authUserId);
    return res.status(201).json({
      user_id: authUserId || null,
      authenticated: Boolean(authUserId),
      client_token: token,
      session_id: token,
      expires_in: expiresIn,
      assistant_name: assistantSelfName,
      assistant_self_name: assistantSelfName,
      user_name: userPrimaryName,
      remembered_names: rememberedPeople,
      last_conversation_recap: lastConversationRecap,
      last_conversation_snapshot: lastConversationSnapshot,
      last_conversation_at: lastConversationAt || null,
      continuity: sessionContinuity,
      pending_screenplay_question: sessionPendingScreenplayQuestionPayload,
      evolution_sync: evolutionSync,
      state_version: sessionStateVersion,
      last_updated_at: sessionLastUpdatedAt || null,
      history_updated_at: sessionHistoryUpdatedAt || null,
      memory_updated_at: sessionMemoryUpdatedAt || null,
      last_turn_id: sessionLastTurnId,
      schema_version: API_SCHEMA_VERSION,
      backend_build: BACKEND_BUILD,
      backend_boot_id: BACKEND_BOOT_ID,
    });
  });
}

export { mountSessionRoute, REQUIRED_DEPS as SESSION_ROUTE_REQUIRED_DEPS };
