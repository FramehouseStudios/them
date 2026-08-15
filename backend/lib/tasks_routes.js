import express from "express";

const TASKS_UPDATE_BODY_LIMIT = "256kb";

function requireRouteDep(deps, key) {
  if (deps?.[key] === undefined) {
    throw new Error(`mountTasksRoutes requires dep: ${key}`);
  }
  return deps[key];
}

function mountTasksRoutes(app, deps = {}) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function") {
    throw new Error("mountTasksRoutes requires an Express app");
  }
  const applyReadStateHeaders = requireRouteDep(deps, "applyReadStateHeaders");
  const buildReadStateMeta = requireRouteDep(deps, "buildReadStateMeta");
  const buildTaskSnapshot = requireRouteDep(deps, "buildTaskSnapshot");
  const clearCompletedTasksInMemory = requireRouteDep(deps, "clearCompletedTasksInMemory");
  const completeTaskInMemory = requireRouteDep(deps, "completeTaskInMemory");
  const createCanonicalMemoryMutationCommitter = requireRouteDep(
    deps,
    "createCanonicalMemoryMutationCommitter",
  );
  const createRequestId = requireRouteDep(deps, "createRequestId");
  const createTaskInMemory = requireRouteDep(deps, "createTaskInMemory");
  const deleteTaskInMemory = requireRouteDep(deps, "deleteTaskInMemory");
  const ifNoneMatchStateHit = requireRouteDep(deps, "ifNoneMatchStateHit");
  const normalizeSnippet = requireRouteDep(deps, "normalizeSnippet");
  const normalizeTaskPriority = requireRouteDep(deps, "normalizeTaskPriority");
  const parseOneOf = requireRouteDep(deps, "parseOneOf");
  const parseQueryLimit = requireRouteDep(deps, "parseQueryLimit");
  const reopenTaskInMemory = requireRouteDep(deps, "reopenTaskInMemory");
  const resolveCanonicalWritableMemoryContext = requireRouteDep(
    deps,
    "resolveCanonicalWritableMemoryContext",
  );
  const sanitizePersistedSessionMemory = requireRouteDep(deps, "sanitizePersistedSessionMemory");
  const selectMemoryRecordForRead = requireRouteDep(deps, "selectMemoryRecordForRead");
  const toTaskPayload = requireRouteDep(deps, "toTaskPayload");
  const logger = deps.logger || console;
  const TASKS_LIST_DEFAULT_LIMIT = Number(deps.TASKS_LIST_DEFAULT_LIMIT);
  const TASKS_MAX_STORED = Number(deps.TASKS_MAX_STORED);
  const TASK_STATUS_FILTERS = requireRouteDep(deps, "TASK_STATUS_FILTERS");
  const TASK_UPDATE_ACTIONS = requireRouteDep(deps, "TASK_UPDATE_ACTIONS");
  if (!Number.isFinite(TASKS_LIST_DEFAULT_LIMIT) || TASKS_LIST_DEFAULT_LIMIT < 1) {
    throw new Error("mountTasksRoutes requires numeric TASKS_LIST_DEFAULT_LIMIT");
  }
  if (!Number.isFinite(TASKS_MAX_STORED) || TASKS_MAX_STORED < 1) {
    throw new Error("mountTasksRoutes requires numeric TASKS_MAX_STORED");
  }

  app.get("/tasks", async (req, res) => {
    const limit = parseQueryLimit(req.query?.limit, TASKS_LIST_DEFAULT_LIMIT, TASKS_MAX_STORED);
    const status = parseOneOf(
      String(req.query?.status || "all").trim().toLowerCase(),
      TASK_STATUS_FILTERS,
      "all"
    );
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
      const rid = String(req.requestId || "tasks_read");
      logger.error?.(`[${rid}] tasks memory_read_failed error=${String(error?.message || error)}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({ stage: "tasks", error: "memory_read_failed" });
    }
    const memory = sanitizePersistedSessionMemory(selected.memory);
    const readMeta = buildReadStateMeta(req, memory, selected.ip);
    const snapshot = buildTaskSnapshot(memory, { status, limit });

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
      status_filter: snapshot.status,
      task_last_updated_at: snapshot.taskLastUpdatedAt || null,
      total_count: snapshot.totalCount,
      open_count: snapshot.openCount,
      completed_count: snapshot.completedCount,
      tasks: snapshot.tasks,
    });
  });

  app.post("/tasks/update", express.json({ limit: TASKS_UPDATE_BODY_LIMIT }), async (req, res) => {
    const rid = req.requestId || createRequestId();
    const nowTs = Date.now();
    const action = parseOneOf(
      String(req.body?.action || "complete").trim().toLowerCase(),
      TASK_UPDATE_ACTIONS,
      "complete"
    );
    const title = normalizeSnippet(req.body?.title ?? req.body?.text ?? "", 160);
    const query = normalizeSnippet(
      req.body?.query ?? req.body?.task_id ?? req.body?.taskId ?? title,
      160
    );
    const dueAt = Math.max(0, Number(req.body?.due_at ?? req.body?.dueAt ?? 0));
    const priority = normalizeTaskPriority(req.body?.priority);
    let context;
    try {
      context = await resolveCanonicalWritableMemoryContext(req, nowTs);
    } catch (error) {
      logger.error?.(`[${rid}] tasks_update memory_read_failed error=${String(error?.message || error)}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({ stage: "tasks", error: "memory_read_failed" });
    }

    let status = "ok";
    let message = "";
    let task = null;
    let removedCount = 0;
    let persisted;
    try {
      const commitMemoryMutation = createCanonicalMemoryMutationCommitter(context);
      persisted = await commitMemoryMutation((currentMemory) => {
        const memory = sanitizePersistedSessionMemory(currentMemory);
        status = "ok";
        message = "";
        task = null;
        removedCount = 0;
        if (action === "add") {
          if (!title) {
            status = "failed";
            message = "Missing task title.";
          } else {
            task = createTaskInMemory(memory, {
              title,
              dueAt,
              priority,
              source: "api",
            }, nowTs);
            if (!task) {
              status = "failed";
              message = "Task was not created.";
            } else if (task.duplicate) {
              status = "duplicate";
            } else {
              status = "created";
            }
          }
        } else if (action === "complete") {
          task = completeTaskInMemory(memory, query, nowTs);
          status = task ? "completed" : "none";
        } else if (action === "reopen") {
          task = reopenTaskInMemory(memory, query, nowTs);
          status = task ? "reopened" : "none";
        } else if (action === "delete") {
          task = deleteTaskInMemory(memory, query, nowTs);
          status = task ? "deleted" : "none";
        } else if (action === "clear_completed") {
          removedCount = clearCompletedTasksInMemory(memory, nowTs);
          status = removedCount > 0 ? "cleared_completed" : "none";
        }
        return memory;
      }, nowTs);
    } catch (error) {
      logger.error?.(`[${rid}] tasks_update memory_write_failed error=${String(error?.message || error)}`);
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({ stage: "tasks", error: "memory_write_failed" });
    }
    const readMeta = buildReadStateMeta(req, persisted, context.requesterIp);
    const snapshot = buildTaskSnapshot(persisted, { status: "all", limit: TASKS_LIST_DEFAULT_LIMIT });
    const payloadTask = toTaskPayload(task);
    const ok = status !== "failed";
    const statusCode = ok ? 200 : 400;
    logger.log(
      `[${rid}] tasks_update action=${action} status=${status} removed=${removedCount} title_chars=${String(payloadTask?.title || title || "").length}`
    );

    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, readMeta);
    return res.status(statusCode).json({
      ok,
      action,
      status,
      message: message || null,
      task: payloadTask,
      removed_count: removedCount,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      task_last_updated_at: snapshot.taskLastUpdatedAt || null,
      total_count: snapshot.totalCount,
      open_count: snapshot.openCount,
      completed_count: snapshot.completedCount,
      backend_boot_id: readMeta.backendBootId,
      schema_version: readMeta.schemaVersion,
      backend_build: readMeta.backendBuild,
    });
  });
}

export {
  TASKS_UPDATE_BODY_LIMIT,
  mountTasksRoutes,
};
