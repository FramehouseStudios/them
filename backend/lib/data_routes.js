// T-decompose-phase6-1a-outbox-data-state — mountDataRoutes
//
// Phase 6.1a of docs/specs/T-decompose-backend-index.md. Extracts
// POST /data/history/clear + POST /data/memories/clear out of backend/index.js.
//
// V1 pillar: infra
// V1 effect: infrastructure for iOS Release Readiness — continues the
// backend/index.js decomposition (no release/auth/privacy surface).
//
// No module-level mutable state; deps injected; boundary proven by
// backend/tools/freevars.mjs (acorn).

import { defaultResolveMemoryUserId } from "./memory_route_auth.js";

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
    creativeMemoryStore,
    persistWritableMemoryContext,
    resolveWritableMemoryContext,
    resolveUserId = defaultResolveMemoryUserId,
  } = deps;
  for (const k of ["resolveWritableMemoryContext","persistWritableMemoryContext","clearConversationHistoryMemory","clearAllMemoriesMemory"]) {
    if (deps[k] === undefined) throw new Error("mountDataRoutes requires dep: " + k);
  }
  if (!creativeMemoryStore || typeof creativeMemoryStore.clearUserMemory !== "function") {
    throw new Error("mountDataRoutes requires dep: creativeMemoryStore.clearUserMemory");
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

  app.post("/data/memories/clear", async (req, res, next) => {
    try {
      const rid = req.requestId || createRequestId();
      const nowTs = Date.now();
      const userId = String(resolveUserId(req) || "").trim();
      if (userId) {
        await creativeMemoryStore.clearUserMemory({ userId });
      }
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
    } catch (error) {
      return next(error);
    }
  });
}

export { mountDataRoutes };
