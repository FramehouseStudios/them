function requireRouteDep(deps, key) {
  if (deps?.[key] === undefined) {
    throw new Error(`mountRecapRoutes requires dep: ${key}`);
  }
  return deps[key];
}

function mountRecapRoutes(app, deps = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountRecapRoutes requires an Express app");
  }
  const applyReadStateHeaders = requireRouteDep(deps, "applyReadStateHeaders");
  const buildConversationHistoryThreads = requireRouteDep(deps, "buildConversationHistoryThreads");
  const buildDailyRecapPayload = requireRouteDep(deps, "buildDailyRecapPayload");
  const buildReadStateMeta = requireRouteDep(deps, "buildReadStateMeta");
  const ifNoneMatchStateHit = requireRouteDep(deps, "ifNoneMatchStateHit");
  const resolveCanonicalWritableMemoryContext = requireRouteDep(
    deps,
    "resolveCanonicalWritableMemoryContext",
  );
  const sanitizePersistedSessionMemory = requireRouteDep(deps, "sanitizePersistedSessionMemory");
  const selectMemoryRecordForRead = requireRouteDep(deps, "selectMemoryRecordForRead");
  const logger = deps.logger || console;

  async function sendRecapResponse(req, res, windowKey = "today") {
    const nowTs = Date.now();
    const localSelected = selectMemoryRecordForRead(req, nowTs);
    let selected = localSelected;
    try {
      const canonicalContext = await resolveCanonicalWritableMemoryContext(req, nowTs);
      if (canonicalContext?.canonical) {
        selected = {
          source: "auth_user",
          ip: String(canonicalContext.requesterIp || localSelected.ip || ""),
          memory: canonicalContext.memory,
        };
      }
    } catch (error) {
      const rid = String(req.requestId || "recap_read");
      logger.error?.(
        `[${rid}] recap memory_read_failed error=${String(error?.message || error)}`,
      );
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        stage: "recap",
        error: "memory_read_failed",
      });
    }
    const memory = sanitizePersistedSessionMemory(selected.memory);
    const readMeta = buildReadStateMeta(req, memory, selected.ip);
    const historyThreads = buildConversationHistoryThreads(memory, 140);
    const recap = buildDailyRecapPayload(memory, historyThreads, nowTs, windowKey);

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    if (ifNoneMatchStateHit(req, readMeta.etag, readMeta.stateVersion)) {
      return res.status(304).end();
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
      window: recap.window,
      window_label: recap.windowLabel,
      window_start_at: recap.windowStartAt,
      window_end_at: recap.windowEndAt,
      local_day: recap.localDay,
      generated_at: recap.generatedAt,
      recap: recap.recap,
      highlights: recap.highlights,
      outcomes: recap.outcomes,
      next_actions: recap.nextActions,
      open_tasks: recap.openTasks,
      completed_today: recap.completedToday,
      stats: recap.stats,
    });
  }

  app.get("/recap", async (req, res) => {
    const requestedWindow = String(req.query?.window || "today").trim().toLowerCase();
    return sendRecapResponse(req, res, requestedWindow);
  });

  app.get("/recap/today", async (req, res) => {
    return sendRecapResponse(req, res, "today");
  });
}

export { mountRecapRoutes };
