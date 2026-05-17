// T-decompose-phase6-1a-outbox-data-state — mountStateRoute
//
// Phase 6.1a of docs/specs/T-decompose-backend-index.md. Extracts
// GET /state out of backend/index.js, byte-identically.
//
// V1 pillar: infra
// V1 effect: infrastructure for iOS Release Readiness — continues the
// backend/index.js decomposition (no release/auth/privacy surface).
//
// BYTE-IDENTICAL: route handler bodies are verbatim text from
// backend/index.js. Mount order is preserved by the call site. The
// method-not-allowed (405) app.all guards are intentionally left
// inline in index.js this phase to guarantee identical Express
// registration order with zero behavioral reasoning.
//
// No module-level mutable state; deps injected; boundary proven by
// backend/tools/freevars.mjs (acorn).


function mountStateRoute(app, deps = {}) {
  if (!deps || typeof deps !== "object") {
    throw new Error("mountStateRoute requires a deps object");
  }
  const {
    logger = console,
    applyReadStateHeaders,
    buildConversationHistoryThreads,
    buildMemoryCards,
    buildReadStateMeta,
    maybeBackfillThemesFromHistory,
    normalizeClientToken,
    parseQueryLimit,
    parseTurnIdToNumber,
    sanitizePersistedSessionMemory,
    selectMemoryRecordForRead,
    setPersistedUserMemoryForIp,
  } = deps;
  for (const k of ["selectMemoryRecordForRead","buildReadStateMeta","applyReadStateHeaders"]) {
    if (deps[k] === undefined) throw new Error("mountStateRoute requires dep: " + k);
  }

  app.get("/state", (req, res) => {
    const sinceVersion = String(req.query?.sinceVersion || "").trim();
    const sinceTurnNumber = parseTurnIdToNumber(req.query?.sinceTurnId);
    const historyLimit = parseQueryLimit(
      req.query?.historyLimit ??
        req.query?.history_limit ??
        req.query?.limit_history ??
        req.query?.limit,
      60,
      240
    );
    const memoriesLimit = parseQueryLimit(
      req.query?.memoriesLimit ??
        req.query?.memories_limit ??
        req.query?.limit_memories,
      24,
      120
    );

    const selected = selectMemoryRecordForRead(req, Date.now());
    const memory = sanitizePersistedSessionMemory(selected.memory);
    const fullThreads = buildConversationHistoryThreads(memory, Math.max(historyLimit, 260));
    const backfillResult = maybeBackfillThemesFromHistory(
      memory,
      fullThreads,
      Date.now(),
      { trigger: "state_read" }
    );
    if (backfillResult.applied && selected.ip && selected.ip !== "unknown") {
      setPersistedUserMemoryForIp(selected.ip, memory, Date.now(), {
        clientTokenAliases: [normalizeClientToken(req.get("X-Client-Token"))],
      });
      logger.log(
        `[state_backfill] source=${selected.source} ip=${selected.ip} created=${backfillResult.created} keys=${(backfillResult.keys || []).join(",") || "none"}`
      );
    }
    const readMeta = buildReadStateMeta(req, memory, selected.ip);
    const historyDelta = sinceTurnNumber > 0
      ? fullThreads
          .filter((item) => Math.max(0, Number(item?.turn || 0)) > sinceTurnNumber)
          .slice(0, historyLimit)
      : fullThreads.slice(0, historyLimit);
    const memoriesDelta = buildMemoryCards(memory, fullThreads, memoriesLimit);
    const deltaNoChange = Boolean(sinceVersion && sinceVersion === readMeta.stateVersion);

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    if (deltaNoChange) {
      return res.status(200).json({
        source: selected.source,
        source_ip: selected.ip,
        session_id: readMeta.sessionId,
        state_version: readMeta.stateVersion,
        last_updated_at: readMeta.lastUpdatedAt || null,
        history_updated_at: readMeta.historyUpdatedAt || null,
        memory_updated_at: readMeta.memoryUpdatedAt || null,
        last_turn_id: readMeta.lastTurnId || null,
        schema_version: readMeta.schemaVersion,
        backend_build: readMeta.backendBuild,
        backend_boot_id: readMeta.backendBootId,
        is_delta: true,
        delta_no_change: true,
        history_changed: false,
        memory_changed: false,
        since_version: sinceVersion || null,
        since_turn_id: sinceTurnNumber > 0 ? `turn-${sinceTurnNumber}` : null,
        history_delta: [],
        memories_delta: [],
      });
    }

    return res.status(200).json({
      source: selected.source,
      source_ip: selected.ip,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      last_turn_id: readMeta.lastTurnId || null,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
      backend_boot_id: readMeta.backendBootId,
      is_delta: Boolean(sinceVersion || sinceTurnNumber > 0),
      delta_no_change: false,
      history_changed: historyDelta.length > 0,
      memory_changed: memoriesDelta.length > 0,
      since_version: sinceVersion || null,
      since_turn_id: sinceTurnNumber > 0 ? `turn-${sinceTurnNumber}` : null,
      history_delta: historyDelta,
      memories_delta: memoriesDelta,
    });
  });
}

export { mountStateRoute };
