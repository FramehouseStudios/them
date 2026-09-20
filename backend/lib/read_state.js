import { createHash } from "node:crypto";

const RECAP_WINDOWS = new Set(["today", "yesterday", "last_7_days"]);

function requireDep(deps, key) {
  if (deps?.[key] === undefined) {
    throw new Error(`createReadStateHelpers requires dep: ${key}`);
  }
  return deps[key];
}

function buildStateEtag(stateVersion) {
  return `W/"${String(stateVersion || "none")}"`;
}

function parseIfNoneMatchValues(rawHeader) {
  const raw = String(rawHeader || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function ifNoneMatchStateHit(req, etag, stateVersion) {
  const candidates = parseIfNoneMatchValues(req.get("If-None-Match"));
  if (!candidates.length) return false;
  const etagLower = String(etag || "").toLowerCase();
  const stateLower = String(stateVersion || "").toLowerCase();
  return candidates.some((candidate) => {
    const normalized = candidate.toLowerCase();
    return normalized === etagLower ||
      normalized === stateLower ||
      normalized.replace(/^w\//, "") === etagLower.replace(/^w\//, "") ||
      normalized.replace(/^w\//, "").replace(/^"|"$/g, "") === stateLower.replace(/^"|"$/g, "");
  });
}

function createReadStateHelpers(deps = {}) {
  const apiSchemaVersion = Math.max(1, Number(deps.apiSchemaVersion || 1));
  const backendBuild = String(deps.backendBuild || "dev");
  const backendBootId = String(deps.backendBootId || "boot");
  const taskMaxStored = Math.max(1, Number(deps.taskMaxStored || 240));
  const screenplayProjectMemoryMax = Math.max(1, Number(deps.screenplayProjectMemoryMax || 8));

  const buildTaskSnapshot = requireDep(deps, "buildTaskSnapshot");
  const cleanupUserMemoryStore = requireDep(deps, "cleanupUserMemoryStore");
  const clientIp = requireDep(deps, "clientIp");
  const createEmptyEmotionMemory = requireDep(deps, "createEmptyEmotionMemory");
  const formatLocalDateStamp = requireDep(deps, "formatLocalDateStamp");
  const getLocalDayStartTs = requireDep(deps, "getLocalDayStartTs");
  const getPersistedIpForClientToken = requireDep(deps, "getPersistedIpForClientToken");
  const getPersistedUserMemoryForClientToken = requireDep(deps, "getPersistedUserMemoryForClientToken");
  const getPersistedUserMemoryForIp = requireDep(deps, "getPersistedUserMemoryForIp");
  const getPersistedUserMemoryForUserId = requireDep(deps, "getPersistedUserMemoryForUserId");
  const getValidSession = requireDep(deps, "getValidSession");
  const legacyAuthMemoryIp = requireDep(deps, "legacyAuthMemoryIp");
  const normalizeClientIp = requireDep(deps, "normalizeClientIp");
  const normalizeClientToken = requireDep(deps, "normalizeClientToken");
  const normalizeSnippet = requireDep(deps, "normalizeSnippet");
  const parseOneOf = requireDep(deps, "parseOneOf");
  const resolveAuthenticatedUserId = requireDep(deps, "resolveAuthenticatedUserId");
  const sanitizeActiveThemes = requireDep(deps, "sanitizeActiveThemes");
  const sanitizeMemoryCardIdList = requireDep(deps, "sanitizeMemoryCardIdList");
  const sanitizePersistedSessionMemory = requireDep(deps, "sanitizePersistedSessionMemory");
  const sanitizeScreenplayProjectMemoryItems = requireDep(deps, "sanitizeScreenplayProjectMemoryItems");
  const sanitizeStudioTurnMetadata = requireDep(deps, "sanitizeStudioTurnMetadata");
  const sanitizeTaskItems = requireDep(deps, "sanitizeTaskItems");
  const sanitizeTurnHistoryItems = requireDep(deps, "sanitizeTurnHistoryItems");

  function deriveMemoryLastUpdatedAt(memory) {
    return Math.max(
      0,
      Number(
        memory?.lastUpdatedAt ||
        memory?.lastConversationAt ||
        memory?.lastConversationSnapshotAt ||
        0
      )
    );
  }

  function deriveHistoryUpdatedAt(memory) {
    const history = sanitizeTurnHistoryItems(memory?.turnHistory);
    let historyTs = 0;
    for (const item of history) {
      historyTs = Math.max(historyTs, Number(item?.ts || 0));
    }
    return Math.max(
      historyTs,
      Number(memory?.lastConversationAt || 0),
      Number(memory?.lastConversationSnapshotAt || 0),
      Number(memory?.historyClearedAt || 0),
      0
    );
  }

  function deriveMemoriesUpdatedAt(memory) {
    const sourceThemes = Array.isArray(memory?.sessionThreads) && memory.sessionThreads.length
      ? memory.sessionThreads
      : memory?.activeThemes;
    const themes = sanitizeActiveThemes(sourceThemes, Number(memory?.turns || 0));
    const screenplayProjectMemory = sanitizeScreenplayProjectMemoryItems(
      memory?.screenplayProjectMemory,
      screenplayProjectMemoryMax
    );
    let themeTs = 0;
    for (const theme of themes) {
      themeTs = Math.max(themeTs, Number(theme?.lastMentionedAt || 0));
    }
    let screenplayProjectMemoryTs = Math.max(
      0,
      Number(memory?.screenplayProjectMemoryUpdatedAt || 0)
    );
    for (const item of screenplayProjectMemory) {
      screenplayProjectMemoryTs = Math.max(screenplayProjectMemoryTs, Number(item?.updatedAt || 0));
    }
    return Math.max(
      themeTs,
      screenplayProjectMemoryTs,
      Number(memory?.taskLastUpdatedAt || 0),
      Number(memory?.lastUpdatedAt || 0),
      Number(memory?.lastConversationSnapshotAt || 0),
      0
    );
  }

  function computeMemoryTurnNumber(memory) {
    return Math.max(
      0,
      Number(memory?.turns || memory?.conversationCount || 0)
    );
  }

  function buildMemoryStateVersion(memory) {
    const turnNumber = computeMemoryTurnNumber(memory);
    const lastUpdatedAt = deriveMemoryLastUpdatedAt(memory);
    const cycleIndex = Math.max(0, Number(memory?.cycleIndex || 0));
    const season = Math.max(1, Number(memory?.season || 1));
    const taskItems = sanitizeTaskItems(memory?.tasks, taskMaxStored);
    const openTaskCount = taskItems.filter((item) => item.status === "open").length;
    const taskUpdatedAt = Math.max(0, Number(memory?.taskLastUpdatedAt || 0));
    const forgottenMemoryCardIds = sanitizeMemoryCardIdList(memory?.forgottenMemoryCardIds, 768);
    const screenplayProjectMemory = sanitizeScreenplayProjectMemoryItems(
      memory?.screenplayProjectMemory,
      screenplayProjectMemoryMax
    );
    const screenplayProjectMemoryUpdatedAt = Math.max(
      0,
      Number(memory?.screenplayProjectMemoryUpdatedAt || 0),
      ...screenplayProjectMemory.map((item) => Number(item?.updatedAt || 0))
    );
    const activeThemeCount = sanitizeActiveThemes(
      Array.isArray(memory?.sessionThreads) && memory.sessionThreads.length
        ? memory.sessionThreads
        : memory?.activeThemes,
      turnNumber
    ).length;
    const historyCount = sanitizeTurnHistoryItems(memory?.turnHistory).length;
    const raw = [
      `schema:${apiSchemaVersion}`,
      `turn:${turnNumber}`,
      `updated:${lastUpdatedAt}`,
      `cycle:${cycleIndex}`,
      `season:${season}`,
      `themes:${activeThemeCount}`,
      `history:${historyCount}`,
      `tasks:${taskItems.length}`,
      `tasks_open:${openTaskCount}`,
      `tasks_updated:${taskUpdatedAt}`,
      `screenplay_projects:${screenplayProjectMemory.length}`,
      `screenplay_memory_updated:${screenplayProjectMemoryUpdatedAt}`,
      `mem_hidden:${forgottenMemoryCardIds.length}`,
    ].join("|");
    return createHash("sha1").update(raw).digest("hex").slice(0, 24);
  }

  function resolveSessionIdForRead(req, selectedIp = "") {
    const clientToken = normalizeClientToken(req.get("X-Client-Token"));
    if (clientToken) {
      const validSession = getValidSession(clientToken);
      if (validSession) return clientToken;
      const mappedIp = getPersistedIpForClientToken(clientToken, Date.now());
      if (mappedIp && mappedIp === normalizeClientIp(selectedIp)) return clientToken;
    }
    const normalizedIp = normalizeClientIp(selectedIp);
    return normalizedIp ? `ip:${normalizedIp}` : "unknown";
  }

  function buildReadStateMeta(req, memory, selectedIp = "") {
    const lastUpdatedAt = deriveMemoryLastUpdatedAt(memory);
    const historyUpdatedAt = deriveHistoryUpdatedAt(memory);
    const memoryUpdatedAt = deriveMemoriesUpdatedAt(memory);
    const turnNumber = computeMemoryTurnNumber(memory);
    const lastTurnId = turnNumber > 0 ? `turn-${turnNumber}` : "";
    const stateVersion = buildMemoryStateVersion(memory);
    const etag = buildStateEtag(stateVersion);
    return {
      sessionId: resolveSessionIdForRead(req, selectedIp),
      stateVersion,
      etag,
      lastUpdatedAt,
      historyUpdatedAt,
      memoryUpdatedAt,
      lastTurnId,
      schemaVersion: apiSchemaVersion,
      backendBuild,
      backendBootId,
    };
  }

  function applyReadStateHeaders(res, meta) {
    const safeMeta = meta && typeof meta === "object" ? meta : {};
    const etag = String(safeMeta.etag || "").trim();
    if (etag) res.setHeader("ETag", etag);
    res.setHeader("x-session-id", String(safeMeta.sessionId || "unknown"));
    res.setHeader("x-state-version", String(safeMeta.stateVersion || "none"));
    res.setHeader("x-last-updated-at", String(Math.max(0, Number(safeMeta.lastUpdatedAt || 0))));
    res.setHeader("x-history-updated-at", String(Math.max(0, Number(safeMeta.historyUpdatedAt || 0))));
    res.setHeader("x-memory-updated-at", String(Math.max(0, Number(safeMeta.memoryUpdatedAt || 0))));
    res.setHeader("x-last-turn-id", String(safeMeta.lastTurnId || ""));
    res.setHeader("x-schema-version", String(Math.max(1, Number(safeMeta.schemaVersion || apiSchemaVersion))));
    res.setHeader("x-backend-build", String(safeMeta.backendBuild || backendBuild));
    res.setHeader("x-backend-boot-id", String(safeMeta.backendBootId || backendBootId));
  }

  function selectMemoryRecordForRead(req, now = Date.now()) {
    cleanupUserMemoryStore(now);
    const clientToken = normalizeClientToken(req.get("X-Client-Token"));
    const authenticatedUserId = resolveAuthenticatedUserId(req);
    if (authenticatedUserId) {
      const authMemoryKey = legacyAuthMemoryIp(authenticatedUserId);
      const session = clientToken ? getValidSession(clientToken) : null;
      if (
        session?.memory &&
        typeof session.memory === "object" &&
        String(session.userId || "").trim() === authenticatedUserId
      ) {
        return {
          ip: authMemoryKey || "unknown",
          source: "session",
          memory: sanitizePersistedSessionMemory(session.memory),
        };
      }
      const userMemory = getPersistedUserMemoryForUserId(authenticatedUserId, now);
      if (userMemory) {
        return {
          ip: authMemoryKey || "unknown",
          source: "auth_user",
          memory: sanitizePersistedSessionMemory(userMemory),
        };
      }
      const authMemory = getPersistedUserMemoryForIp(authMemoryKey, now);
      if (authMemory) {
        return {
          ip: authMemoryKey || "unknown",
          source: "auth_user_legacy",
          memory: sanitizePersistedSessionMemory(authMemory),
        };
      }
      return {
        ip: authMemoryKey || "unknown",
        source: "auth_user_empty",
        memory: createEmptyEmotionMemory(),
      };
    }
    if (clientToken) {
      const session = getValidSession(clientToken);
      if (session?.memory && typeof session.memory === "object") {
        return {
          ip: normalizeClientIp(session.ip) || "unknown",
          source: "session",
          memory: sanitizePersistedSessionMemory(session.memory),
        };
      }
      const aliasedIp = getPersistedIpForClientToken(clientToken, now);
      const tokenMemory = getPersistedUserMemoryForClientToken(clientToken, now);
      if (tokenMemory) {
        return {
          ip: aliasedIp || "unknown",
          source: "client_token",
          memory: sanitizePersistedSessionMemory(tokenMemory),
        };
      }
    }

    const requesterIp = normalizeClientIp(clientIp(req));
    const directMemory = getPersistedUserMemoryForIp(requesterIp, now);
    if (directMemory) {
      return {
        ip: requesterIp || "unknown",
        source: "ip",
        memory: sanitizePersistedSessionMemory(directMemory),
      };
    }

    return {
      ip: requesterIp || "unknown",
      source: "empty",
      memory: createEmptyEmotionMemory(),
    };
  }

  function buildConversationHistoryThreads(memory, limit = 60, options = {}) {
    const history = sanitizeTurnHistoryItems(memory?.turnHistory);
    if (!history.length) return [];
    const screenplayProjectId = normalizeSnippet(
      options.screenplayProjectId ?? options.screenplay_project_id ?? "",
      96
    );

    const grouped = new Map();
    for (let idx = 0; idx < history.length; idx += 1) {
      const item = history[idx];
      const turn = Math.max(0, Number(item.turn || 0));
      const key = turn > 0 ? `turn-${turn}` : `idx-${idx}`;
      const studio = sanitizeStudioTurnMetadata(item.studio);
      const current = grouped.get(key) || {
        id: key,
        turn,
        user: "",
        assistant: "",
        updatedAt: 0,
        requestId: "",
        screenplayProjectId: "",
        screenplayTarget: "",
        screenplayPromptSource: "",
        screenplayWriteId: "",
        screenplayAnchorLine: 0,
        screenplayAnchorEndLine: 0,
        screenplayAnchorSceneLabel: "",
        screenplayNoteTitle: "",
        screenplayNoteBody: "",
        screenplayInsertedText: "",
        screenplayReplacementApplied: false,
        screenplayReplacedWriteId: "",
        screenplayRevisedBlockText: "",
        screenplayInsertionMode: "",
        screenplayResolvedAnchorExcerpt: "",
      };
      if (item.role === "assistant") {
        current.assistant = normalizeSnippet(
          item.content,
          studio?.screenplayTarget === "voice_pin" ? 6000 : 280
        );
      } else {
        current.user = normalizeSnippet(item.content, 280);
      }
      current.requestId = item.requestId || current.requestId;
      if (studio) {
        current.screenplayProjectId = studio.screenplayProjectId || current.screenplayProjectId;
        current.screenplayTarget = studio.screenplayTarget || current.screenplayTarget;
        current.screenplayPromptSource = studio.screenplayPromptSource || current.screenplayPromptSource;
        current.screenplayWriteId = studio.screenplayWriteId || current.screenplayWriteId;
        current.screenplayAnchorLine = Math.max(current.screenplayAnchorLine, Number(studio.screenplayAnchorLine || 0));
        current.screenplayAnchorEndLine = Math.max(current.screenplayAnchorEndLine, Number(studio.screenplayAnchorEndLine || 0));
        current.screenplayAnchorSceneLabel = studio.screenplayAnchorSceneLabel || current.screenplayAnchorSceneLabel;
        current.screenplayNoteTitle = studio.screenplayNoteTitle || current.screenplayNoteTitle;
        current.screenplayNoteBody = studio.screenplayNoteBody || current.screenplayNoteBody;
        current.screenplayInsertedText = studio.screenplayInsertedText || current.screenplayInsertedText;
        current.screenplayReplacementApplied = Boolean(
          current.screenplayReplacementApplied || studio.screenplayReplacementApplied
        );
        current.screenplayReplacedWriteId = studio.screenplayReplacedWriteId || current.screenplayReplacedWriteId;
        current.screenplayRevisedBlockText = studio.screenplayRevisedBlockText || current.screenplayRevisedBlockText;
        current.screenplayInsertionMode = studio.screenplayInsertionMode || current.screenplayInsertionMode;
        current.screenplayResolvedAnchorExcerpt =
          studio.screenplayResolvedAnchorExcerpt || current.screenplayResolvedAnchorExcerpt;
      }
      current.updatedAt = Math.max(current.updatedAt, Number(item.ts || 0));
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .filter((item) => !screenplayProjectId || item.screenplayProjectId === screenplayProjectId)
      .filter((item) => item.user || item.assistant)
      .sort((a, b) => {
        const byTime = Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
        if (byTime !== 0) return byTime;
        return Number(b.turn || 0) - Number(a.turn || 0);
      })
      .slice(0, Math.max(1, limit))
      .map((item, index) => {
        const titleSource = item.user || item.assistant || "Conversation";
        const previewSource = item.assistant || item.user || "Conversation";
        return {
          id: String(item.id || `history-${index}`),
          turn: Math.max(0, Number(item.turn || 0)),
          title: normalizeSnippet(titleSource, 120),
          preview: normalizeSnippet(previewSource, 170),
          user: normalizeSnippet(item.user, 280),
          assistant: normalizeSnippet(item.assistant, 6000),
          updatedAt: Math.max(0, Number(item.updatedAt || 0)),
          request_id: item.requestId || null,
          screenplay_project_id: item.screenplayProjectId || null,
          screenplay_target: item.screenplayTarget || null,
          screenplay_prompt_source: item.screenplayPromptSource || null,
          screenplay_write_id: item.screenplayWriteId || null,
          screenplay_anchor_line: item.screenplayAnchorLine > 0 ? item.screenplayAnchorLine : null,
          screenplay_anchor_end_line: item.screenplayAnchorEndLine > 0 ? item.screenplayAnchorEndLine : null,
          screenplay_anchor_scene_label: item.screenplayAnchorSceneLabel || null,
          screenplay_note_title: item.screenplayNoteTitle || null,
          screenplay_note_body: item.screenplayNoteBody || null,
          screenplay_inserted_text: item.screenplayInsertedText || null,
          screenplay_replacement_applied: item.screenplayReplacementApplied ? true : null,
          screenplay_replaced_write_id: item.screenplayReplacedWriteId || null,
          screenplay_revised_block_text: item.screenplayRevisedBlockText || null,
          screenplay_insertion_mode: item.screenplayInsertionMode || null,
          screenplay_resolved_anchor_excerpt: item.screenplayResolvedAnchorExcerpt || null,
        };
      });
  }

  function resolveRecapWindowRange(windowKey, nowTs = Date.now()) {
    const normalizedWindow = parseOneOf(
      String(windowKey || "today").trim().toLowerCase(),
      RECAP_WINDOWS,
      "today"
    );
    const dayMs = 24 * 60 * 60 * 1000;
    const todayStartTs = getLocalDayStartTs(nowTs);
    if (normalizedWindow === "yesterday") {
      const startAt = todayStartTs - dayMs;
      const endAt = todayStartTs;
      return {
        window: normalizedWindow,
        startAt,
        endAt,
        label: formatLocalDateStamp(startAt),
      };
    }
    if (normalizedWindow === "last_7_days") {
      const startAt = todayStartTs - (6 * dayMs);
      const endAt = todayStartTs + dayMs;
      return {
        window: normalizedWindow,
        startAt,
        endAt,
        label: `${formatLocalDateStamp(startAt)} to ${formatLocalDateStamp(nowTs)}`,
      };
    }
    return {
      window: "today",
      startAt: todayStartTs,
      endAt: todayStartTs + dayMs,
      label: formatLocalDateStamp(nowTs),
    };
  }

  function buildDailyRecapPayload(memory, historyThreads = [], nowTs = Date.now(), windowKey = "today") {
    const windowRange = resolveRecapWindowRange(windowKey, nowTs);
    const dayStamp = formatLocalDateStamp(nowTs);
    const threads = Array.isArray(historyThreads) ? historyThreads : [];
    const windowThreads = threads
      .filter((thread) => {
        const ts = Math.max(0, Number(thread?.updatedAt || 0));
        return ts >= windowRange.startAt && ts < windowRange.endAt;
      })
      .slice(0, 12);
    const taskSnapshot = buildTaskSnapshot(memory, {
      status: "all",
      limit: taskMaxStored,
    });
    const completedInWindow = taskSnapshot.tasks.filter(
      (task) => {
        const completedAt = Math.max(0, Number(task.completedAt || 0));
        return task.status === "completed" &&
          completedAt >= windowRange.startAt &&
          completedAt < windowRange.endAt;
      }
    );
    const openTasks = taskSnapshot.tasks.filter((task) => task.status === "open");
    const recapLine =
      normalizeSnippet(windowThreads[0]?.assistant || windowThreads[0]?.preview || "", 220) ||
      normalizeSnippet(memory?.lastConversationRecap, 220) ||
      (windowRange.window === "today"
        ? "No major recap yet today."
        : `No major recap found for ${windowRange.label}.`);
    const highlights = windowThreads
      .slice(0, 3)
      .map((thread) => normalizeSnippet(thread?.preview || thread?.assistant || thread?.title || "", 170))
      .filter(Boolean);
    const outcomes = completedInWindow
      .slice(0, 4)
      .map((task) => normalizeSnippet(task.title, 140))
      .filter(Boolean);
    const nextActions = openTasks
      .slice(0, 4)
      .map((task) => normalizeSnippet(task.title, 140))
      .filter(Boolean);

    return {
      window: windowRange.window,
      windowLabel: windowRange.label,
      windowStartAt: windowRange.startAt,
      windowEndAt: windowRange.endAt,
      localDay: dayStamp,
      generatedAt: nowTs,
      recap: recapLine,
      highlights,
      outcomes,
      nextActions,
      openTasks: openTasks.slice(0, 8),
      completedToday: completedInWindow.slice(0, 8),
      stats: {
        turnsToday: windowThreads.length,
        windowTurns: windowThreads.length,
        openTasks: openTasks.length,
        completedToday: completedInWindow.length,
        windowCompleted: completedInWindow.length,
        totalTasks: taskSnapshot.totalCount,
        windowStartAt: windowRange.startAt,
        windowEndAt: windowRange.endAt,
      },
    };
  }

  return {
    applyReadStateHeaders,
    buildConversationHistoryThreads,
    buildDailyRecapPayload,
    buildMemoryStateVersion,
    buildReadStateMeta,
    buildStateEtag,
    computeMemoryTurnNumber,
    deriveHistoryUpdatedAt,
    deriveMemoriesUpdatedAt,
    deriveMemoryLastUpdatedAt,
    ifNoneMatchStateHit,
    parseIfNoneMatchValues,
    resolveRecapWindowRange,
    resolveSessionIdForRead,
    selectMemoryRecordForRead,
  };
}

export {
  buildStateEtag,
  createReadStateHelpers,
  ifNoneMatchStateHit,
  parseIfNoneMatchValues,
};
