// T-decompose-phase6-1a-outbox-data-state — mountDataRoutes
//
// Phase 6.1a of docs/specs/T-decompose-backend-index.md. Extracts
// POST /data/history/clear + POST /data/memories/clear out of backend/index.js, byte-identically.
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


function mountDataRoutes(app, deps = {}) {
  if (!deps || typeof deps !== "object") {
    throw new Error("mountDataRoutes requires a deps object");
  }
  const {
    logger = console,
    applyReadStateHeaders,
    buildReadStateMeta,
    clearAllMemoriesMemory,
    clearConversationHistoryMemory,
    createRequestId,
    persistWritableMemoryContext,
    resolveWritableMemoryContext,
  } = deps;
  for (const k of ["resolveWritableMemoryContext","persistWritableMemoryContext","clearConversationHistoryMemory","clearAllMemoriesMemory"]) {
    if (deps[k] === undefined) throw new Error("mountDataRoutes requires dep: " + k);
  }

  app.post("/data/history/clear", (req, res) => {
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const context = resolveWritableMemoryContext(req, nowTs);
    const cleared = clearConversationHistoryMemory(context.memory, nowTs);
    const persisted = persistWritableMemoryContext(context, cleared, nowTs);
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    res.setHeader("x-backend-status", "up");
    logger.log(
      `[${rid}] data_control action=clear_history ip=${context.requesterIp} mode=${context.clientToken ? "session" : "ip"} state=${readMeta.stateVersion}`
    );

    return res.status(200).json({
      ok: true,
      action: "clear_history",
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });

  app.post("/data/memories/clear", (req, res) => {
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const context = resolveWritableMemoryContext(req, nowTs);
    const cleared = clearAllMemoriesMemory(context.memory, nowTs);
    const persisted = persistWritableMemoryContext(context, cleared, nowTs);
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    res.setHeader("x-backend-status", "up");
    logger.log(
      `[${rid}] data_control action=clear_memories ip=${context.requesterIp} mode=${context.clientToken ? "session" : "ip"} state=${readMeta.stateVersion}`
    );

    return res.status(200).json({
      ok: true,
      action: "clear_memories",
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      backend_boot_id: readMeta.backendBootId,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });
}

export { mountDataRoutes };
