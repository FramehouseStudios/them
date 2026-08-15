import express from "express";

const HISTORY_ANNOTATE_BODY_LIMIT = "256kb";

function requireRouteDep(deps, key) {
  if (deps?.[key] === undefined) {
    throw new Error(`mountHistoryRoutes requires dep: ${key}`);
  }
  return deps[key];
}

function mountHistoryRoutes(app, deps = {}) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function") {
    throw new Error("mountHistoryRoutes requires an Express app");
  }
  const applyReadStateHeaders = requireRouteDep(deps, "applyReadStateHeaders");
  const buildConversationHistoryThreads = requireRouteDep(deps, "buildConversationHistoryThreads");
  const buildReadStateMeta = requireRouteDep(deps, "buildReadStateMeta");
  const getAssistantSelfNameForIp = requireRouteDep(deps, "getAssistantSelfNameForIp");
  const ifNoneMatchStateHit = requireRouteDep(deps, "ifNoneMatchStateHit");
  const normalizeAssistantSelfName = requireRouteDep(deps, "normalizeAssistantSelfName");
  const normalizeSnippet = requireRouteDep(deps, "normalizeSnippet");
  const normalizeUserPersonName = requireRouteDep(deps, "normalizeUserPersonName");
  const parseQueryLimit = requireRouteDep(deps, "parseQueryLimit");
  const parseTurnIdToNumber = requireRouteDep(deps, "parseTurnIdToNumber");
  const createCanonicalMemoryMutationCommitter = requireRouteDep(
    deps,
    "createCanonicalMemoryMutationCommitter",
  );
  const resolveCanonicalWritableMemoryContext = requireRouteDep(
    deps,
    "resolveCanonicalWritableMemoryContext",
  );
  const sanitizePersistedSessionMemory = requireRouteDep(deps, "sanitizePersistedSessionMemory");
  const sanitizeRememberedPeople = requireRouteDep(deps, "sanitizeRememberedPeople");
  const sanitizeStudioTurnMetadata = requireRouteDep(deps, "sanitizeStudioTurnMetadata");
  const sanitizeTurnHistoryItems = requireRouteDep(deps, "sanitizeTurnHistoryItems");
  const selectMemoryRecordForRead = requireRouteDep(deps, "selectMemoryRecordForRead");
  const upsertScreenplayProjectMemory = requireRouteDep(deps, "upsertScreenplayProjectMemory");
  const logger = deps.logger || console;
  const USER_MEMORY_REMEMBERED_PEOPLE_MAX = Number(deps.USER_MEMORY_REMEMBERED_PEOPLE_MAX);
  if (!Number.isFinite(USER_MEMORY_REMEMBERED_PEOPLE_MAX) || USER_MEMORY_REMEMBERED_PEOPLE_MAX < 1) {
    throw new Error("mountHistoryRoutes requires numeric USER_MEMORY_REMEMBERED_PEOPLE_MAX");
  }

  app.get("/history", (req, res) => {
    const limit = parseQueryLimit(req.query?.limit, 60, 240);
    const sinceTurnNumber = parseTurnIdToNumber(req.query?.sinceTurnId);
    const screenplayProjectId = normalizeSnippet(req.query?.screenplayProjectId ?? "", 96);
    const selected = selectMemoryRecordForRead(req, Date.now());
    const memory = sanitizePersistedSessionMemory(selected.memory);
    const readMeta = buildReadStateMeta(req, memory, selected.ip);
    const fullThreads = buildConversationHistoryThreads(
      memory,
      Math.max(limit, 260),
      screenplayProjectId ? { screenplayProjectId } : {}
    );
    const threads = sinceTurnNumber > 0
      ? fullThreads.filter((item) => Math.max(0, Number(item?.turn || 0)) > sinceTurnNumber).slice(0, limit)
      : fullThreads.slice(0, limit);
    const rememberedPeople = sanitizeRememberedPeople(
      memory?.rememberedPeople,
      USER_MEMORY_REMEMBERED_PEOPLE_MAX
    ).map((person) => ({
      name: person.name,
      relation: String(person.relation || ""),
    }));

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    if (ifNoneMatchStateHit(req, readMeta.etag, readMeta.stateVersion)) {
      return res.status(304).end();
    }
    return res.status(200).json({
      source: selected.source,
      source_ip: selected.ip,
      assistant_name:
        normalizeAssistantSelfName(memory?.assistantSelfName) || getAssistantSelfNameForIp(selected.ip),
      user_name: normalizeUserPersonName(memory?.userPrimaryName),
      remembered_names: rememberedPeople,
      conversation_count: Math.max(0, Number(memory?.conversationCount || 0)),
      last_conversation_recap: normalizeSnippet(memory?.lastConversationRecap, 220),
      last_conversation_at: Math.max(0, Number(memory?.lastConversationAt || 0)) || null,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      last_turn_id: readMeta.lastTurnId || null,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
      backend_boot_id: readMeta.backendBootId,
      is_delta: sinceTurnNumber > 0,
      since_turn_id: sinceTurnNumber > 0 ? `turn-${sinceTurnNumber}` : null,
      threads,
    });
  });

  app.post("/history/annotate_turn", express.json({ limit: HISTORY_ANNOTATE_BODY_LIMIT }), async (req, res) => {
    const nowTs = Date.now();
    const rid = String(req.requestId || "history_annotate_turn");
    const turnNumber = parseTurnIdToNumber(req.body?.turn_id ?? req.body?.turnId);
    const studioMeta = sanitizeStudioTurnMetadata(req.body?.studio || req.body || null);
    if (turnNumber <= 0) {
      return res.status(400).json({
        stage: "history_annotate_turn",
        error: "valid_turn_id_required",
      });
    }
    if (!studioMeta) {
      return res.status(400).json({
        stage: "history_annotate_turn",
        error: "studio_metadata_required",
      });
    }

    let context;
    try {
      context = await resolveCanonicalWritableMemoryContext(req, nowTs);
    } catch (error) {
      logger.error?.(
        `[${rid}] history_annotate_turn memory_read_failed error=${String(error?.message || error)}`,
      );
      return res.status(503).json({
        stage: "history_annotate_turn",
        error: "memory_read_failed",
      });
    }

    const commitMemoryMutation = createCanonicalMemoryMutationCommitter(context);
    let persisted;
    try {
      persisted = await commitMemoryMutation((currentMemory) => {
        const nextMemory = sanitizePersistedSessionMemory(currentMemory);
        const history = sanitizeTurnHistoryItems(nextMemory.turnHistory);
        let touched = 0;
        let matchedUserTurn = "";
        let matchedAssistantTurn = "";
        nextMemory.turnHistory = history.map((item) => {
          if (Math.max(0, Number(item?.turn || 0)) !== turnNumber) {
            return item;
          }
          touched += 1;
          if (item.role === "assistant") {
            matchedAssistantTurn = normalizeSnippet(item.content, 280) || matchedAssistantTurn;
          } else {
            matchedUserTurn = normalizeSnippet(item.content, 280) || matchedUserTurn;
          }
          const mergedStudio = sanitizeStudioTurnMetadata({
            ...(item?.studio && typeof item.studio === "object" ? item.studio : {}),
            ...studioMeta,
          });
          return {
            ...item,
            studio: mergedStudio,
          };
        });

        if (touched < 1) {
          const error = new Error("turn_not_found");
          error.code = "turn_not_found";
          error.status = 404;
          throw error;
        }
        upsertScreenplayProjectMemory(nextMemory, studioMeta, {
          transcript: matchedUserTurn,
          reply: matchedAssistantTurn,
          nowTs,
        });
        nextMemory.lastUpdatedAt = Math.max(0, Number(nextMemory.lastUpdatedAt || 0), nowTs);
        return nextMemory;
      }, nowTs);
    } catch (error) {
      if (error?.code === "turn_not_found") {
        return res.status(404).json({
          stage: "history_annotate_turn",
          error: "turn_not_found",
        });
      }
      logger.error?.(
        `[${rid}] history_annotate_turn memory_write_failed error=${String(error?.message || error)}`,
      );
      return res.status(Number(error?.status || 503)).json({
        stage: "history_annotate_turn",
        error: "memory_write_failed",
      });
    }
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    res.setHeader("x-turn-id", `turn-${turnNumber}`);
    res.setHeader("x-turn-meta-available", "1");
    return res.status(200).json({
      ok: true,
      action: "annotate_turn",
      status: "updated",
      turn_id: `turn-${turnNumber}`,
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

export {
  HISTORY_ANNOTATE_BODY_LIMIT,
  mountHistoryRoutes,
};
