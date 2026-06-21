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

function cleanContinuityText(value, maxChars = 1_000) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 1_000)))
    .trim();
}

function resolveStateRouteUserId(req) {
  return cleanContinuityText(
    req?.authUser?.id || req?.user?.id || req?.userId || "",
    128
  );
}

function firstScreenplayProjectMemory(memory) {
  const items = Array.isArray(memory?.screenplayProjectMemory)
    ? memory.screenplayProjectMemory
    : [];
  return items.find((item) => item && typeof item === "object") || null;
}

function buildStateContinuityQuery(project = null) {
  return cleanContinuityText([
    project?.projectId,
    project?.projectTitle,
    project?.act,
    project?.featureSequence,
    project?.currentBeat,
    project?.lastSceneOutcome,
    Array.isArray(project?.characterFocus) ? project.characterFocus.join(" ") : "",
    "continue screenplay session restore",
  ].filter(Boolean).join(" "), 1_000);
}

async function buildStateContinuityPayload(req, memory, {
  creativeMemoryStore = null,
  buildSessionContinuitySnapshot = null,
} = {}) {
  if (typeof buildSessionContinuitySnapshot !== "function") return null;
  const project = firstScreenplayProjectMemory(memory);
  const userId = resolveStateRouteUserId(req);
  let creativeMemory = null;
  if (userId && creativeMemoryStore && typeof creativeMemoryStore.getCreativeMemoryForPrompt === "function") {
    try {
      creativeMemory = await creativeMemoryStore.getCreativeMemoryForPrompt({
        userId,
        projectId: cleanContinuityText(project?.projectId, 96),
        projectTitle: cleanContinuityText(project?.projectTitle || project?.projectId, 160),
        query: buildStateContinuityQuery(project),
        maxEpisodicMemories: 3,
      });
    } catch (_err) {
      creativeMemory = null;
    }
  }
  const snapshot = buildSessionContinuitySnapshot(memory, creativeMemory);
  return snapshot && typeof snapshot === "object" ? snapshot : null;
}

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
    creativeMemoryStore = null,
    buildSessionContinuitySnapshot = null,
  } = deps;
  for (const k of ["selectMemoryRecordForRead","buildReadStateMeta","applyReadStateHeaders"]) {
    if (deps[k] === undefined) throw new Error("mountStateRoute requires dep: " + k);
  }

  app.get("/state", async (req, res) => {
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
    const continuity = await buildStateContinuityPayload(req, memory, {
      creativeMemoryStore,
      buildSessionContinuitySnapshot,
    });

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
        continuity,
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
      continuity,
      history_delta: historyDelta,
      memories_delta: memoriesDelta,
    });
  });
}

export { mountStateRoute, buildStateContinuityPayload };
