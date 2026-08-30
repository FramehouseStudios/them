// T-decompose-phase6-1a-outbox-data-state — mountDataRoutes
//
// Phase 6.1a of docs/specs/T-decompose-backend-index.md. Extracts
// POST /data/history/clear + POST /data/memories/clear out of backend/index.js.
//
// V1 pillar: longitudinal learning
// V1 effect: account-level privacy clears remain authoritative when voice,
// Studio, iPhone, and macOS mutate memory at the same time.
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
    persistCanonicalWritableMemoryContext,
    resolveCanonicalWritableMemoryContext,
    resolveUserId = defaultResolveMemoryUserId,
  } = deps;
  for (const k of ["resolveCanonicalWritableMemoryContext","persistCanonicalWritableMemoryContext","clearConversationHistoryMemory","clearAllMemoriesMemory"]) {
    if (deps[k] === undefined) throw new Error("mountDataRoutes requires dep: " + k);
  }
  if (!creativeMemoryStore || typeof creativeMemoryStore.clearUserMemory !== "function") {
    throw new Error("mountDataRoutes requires dep: creativeMemoryStore.clearUserMemory");
  }

  function sendPersistenceUnavailable(res, { action, requestId }) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({
      ok: false,
      action,
      status: "memory_persistence_unavailable",
      message: "Memory sync is temporarily unavailable. No success was recorded.",
      request_id: requestId,
    });
  }

  async function loadCanonicalContext(req, nowTs) {
    try {
      return await resolveCanonicalWritableMemoryContext(req, nowTs);
    } catch (cause) {
      const error = new Error("canonical memory read unavailable", { cause });
      error.code = "memory_persistence_unavailable";
      throw error;
    }
  }

  async function commitClearMutation(context, clearMemory, nowTs) {
    let candidateContext = context;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const cleared = clearMemory(candidateContext.memory, nowTs);
      let result;
      try {
        result = await persistCanonicalWritableMemoryContext(
          candidateContext,
          cleared,
          nowTs,
        );
      } catch (cause) {
        const error = new Error("canonical memory write unavailable", { cause });
        error.code = "memory_persistence_unavailable";
        throw error;
      }
      if (result?.ok) return result.memory;
      if (result?.status !== "stale_memory_state_version" || attempt === 2) break;
      candidateContext = {
        ...candidateContext,
        canonical: true,
        canonicalRecord: result.record || null,
        memory: result.memory,
      };
    }
    const error = new Error("canonical memory changed too often during clear");
    error.code = "memory_persistence_unavailable";
    throw error;
  }

  app.post("/data/history/clear", async (req, res, next) => {
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    let context;
    let persisted;
    try {
      context = await loadCanonicalContext(req, nowTs);
      persisted = await commitClearMutation(
        context,
        clearConversationHistoryMemory,
        nowTs,
      );
    } catch (error) {
      if (error?.code === "memory_persistence_unavailable") {
        logger.log(`[${rid}] data_control action=clear_history persistence=unavailable`);
        return sendPersistenceUnavailable(res, { action: "clear_history", requestId: rid });
      }
      return next(error);
    }
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
      const context = await loadCanonicalContext(req, nowTs);
      if (userId) {
        await creativeMemoryStore.clearUserMemory({ userId });
      }
      const persisted = await commitClearMutation(context, clearAllMemoriesMemory, nowTs);
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
      if (error?.code === "memory_persistence_unavailable") {
        const rid = req.requestId || createRequestId();
        logger.log(`[${rid}] data_control action=clear_memories persistence=unavailable`);
        return sendPersistenceUnavailable(res, { action: "clear_memories", requestId: rid });
      }
      return next(error);
    }
  });
}

export { mountDataRoutes };
