import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createAccountMemoryCAS } from "../lib/account_memory_cas.js";
import { createAccountMemoryMutationCommitter } from "../lib/account_memory_turn_commit.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { mountTasksRoutes } from "../lib/tasks_routes.js";

function parseQueryLimit(value, fallback = 24, max = 200) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function parseOneOf(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function normalizeSnippet(value, max = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function defaultReadMeta() {
  return {
    sessionId: "sess-test",
    stateVersion: "v-test",
    etag: 'W/"v-test"',
    lastUpdatedAt: 1700000000300,
    historyUpdatedAt: 1700000000300,
    memoryUpdatedAt: 1700000000300,
    lastTurnId: "turn-2",
    schemaVersion: 1,
    backendBuild: "test-build",
    backendBootId: "test-boot",
  };
}

function toTaskPayload(task) {
  if (!task) return null;
  return {
    id: task.id || "task-1",
    title: task.title || "",
    status: task.status || "open",
    priority: task.priority || "normal",
    dueAt: Math.max(0, Number(task.dueAt || 0)) || null,
  };
}

function defaultDeps(overrides = {}) {
  const calls = {
    canonicalReads: [],
    createTaskInMemory: [],
    completeTaskInMemory: [],
    memoryCommits: [],
    logs: [],
  };
  const memory = overrides.memory || {
    tasks: [
      { id: "task-1", title: "Finish the archive scene", status: "open", priority: "high" },
      { id: "task-2", title: "Cut the old subplot", status: "completed", priority: "normal" },
    ],
    taskLastUpdatedAt: 1700000000100,
  };
  const deps = {
    _calls: calls,
    applyReadStateHeaders: (res, meta) => {
      res.setHeader("x-state-version", meta.stateVersion);
      res.setHeader("x-session-id", meta.sessionId);
      if (meta.etag) res.setHeader("ETag", meta.etag);
    },
    buildReadStateMeta: () => defaultReadMeta(),
    buildTaskSnapshot: (snapshotMemory, { status = "all", limit = 80 } = {}) => {
      const all = Array.isArray(snapshotMemory?.tasks) ? snapshotMemory.tasks.map(toTaskPayload).filter(Boolean) : [];
      const filtered = status === "all" ? all : all.filter((task) => task.status === status);
      return {
        status,
        totalCount: all.length,
        openCount: all.filter((task) => task.status === "open").length,
        completedCount: all.filter((task) => task.status === "completed").length,
        taskLastUpdatedAt: Math.max(0, Number(snapshotMemory?.taskLastUpdatedAt || 0)),
        tasks: filtered.slice(0, limit),
      };
    },
    clearCompletedTasksInMemory: (nextMemory) => {
      const before = Array.isArray(nextMemory.tasks) ? nextMemory.tasks.length : 0;
      nextMemory.tasks = (nextMemory.tasks || []).filter((task) => task.status !== "completed");
      return before - nextMemory.tasks.length;
    },
    completeTaskInMemory: (nextMemory, query) => {
      calls.completeTaskInMemory.push({ nextMemory, query });
      const task = (nextMemory.tasks || []).find((item) => item.title === query || item.id === query);
      if (task) task.status = "completed";
      return task || null;
    },
    createCanonicalMemoryMutationCommitter: (context) => async (mutator, nowTs) => {
      const nextMemory = mutator(structuredClone(context.memory || {}));
      calls.memoryCommits.push({ context, nextMemory, nowTs });
      context.memory = structuredClone(nextMemory);
      return context.memory;
    },
    createRequestId: () => "req-task-test",
    createTaskInMemory: (nextMemory, input) => {
      calls.createTaskInMemory.push({ nextMemory, input });
      const task = {
        id: "task-created",
        title: input.title,
        status: "open",
        priority: input.priority,
        dueAt: input.dueAt,
      };
      nextMemory.tasks = [...(nextMemory.tasks || []), task];
      return task;
    },
    deleteTaskInMemory: () => null,
    ifNoneMatchStateHit: overrides.ifNoneMatchStateHit || (() => false),
    normalizeSnippet,
    normalizeTaskPriority: (value) => {
      const normalized = String(value || "normal").trim().toLowerCase();
      return new Set(["low", "normal", "high"]).has(normalized) ? normalized : "normal";
    },
    parseOneOf,
    parseQueryLimit,
    reopenTaskInMemory: () => null,
    resolveCanonicalWritableMemoryContext: async (_req, nowTs) => {
      calls.canonicalReads.push({ nowTs });
      return {
        canonical: false,
        requesterIp: "127.0.0.1",
        clientToken: "",
        memory: structuredClone(memory),
      };
    },
    sanitizePersistedSessionMemory: (value) => structuredClone(value || {}),
    selectMemoryRecordForRead: () => ({
      source: "auth_user",
      ip: "auth:user-1",
      memory,
    }),
    toTaskPayload,
    logger: {
      log: (line) => calls.logs.push(line),
      error() {},
    },
    TASKS_LIST_DEFAULT_LIMIT: 80,
    TASKS_MAX_STORED: 240,
    TASK_STATUS_FILTERS: new Set(["all", "open", "completed"]),
    TASK_UPDATE_ACTIONS: new Set(["add", "complete", "reopen", "delete", "clear_completed"]),
    ...overrides,
  };
  return deps;
}

async function withServer(deps, fn) {
  const app = express();
  mountTasksRoutes(app, deps);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function getJson(baseURL, path, headers = {}) {
  const res = await fetch(`${baseURL}${path}`, { headers });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: text ? JSON.parse(text) : null,
  };
}

async function postJson(baseURL, body) {
  const res = await fetch(`${baseURL}/tasks/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: text ? JSON.parse(text) : null,
  };
}

test("[tasks-routes] mount guards required deps", () => {
  assert.throws(() => mountTasksRoutes(null, defaultDeps()), /Express app/);
  const deps = defaultDeps();
  delete deps.buildTaskSnapshot;
  assert.throws(() => mountTasksRoutes(express(), deps), /buildTaskSnapshot/);
});

test("[tasks-routes] GET /tasks returns filtered task envelope", async () => {
  await withServer(defaultDeps(), async (baseURL) => {
    const r = await getJson(baseURL, "/tasks?status=open&limit=1");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-state-version"), "v-test");
    assert.equal(r.body.status_filter, "open");
    assert.equal(r.body.total_count, 2);
    assert.equal(r.body.open_count, 1);
    assert.equal(r.body.completed_count, 1);
    assert.equal(r.body.tasks.length, 1);
    assert.equal(r.body.tasks[0].title, "Finish the archive scene");
  });
});

test("[tasks-routes] GET /tasks honors If-None-Match 304", async () => {
  const deps = defaultDeps({ ifNoneMatchStateHit: () => true });
  await withServer(deps, async (baseURL) => {
    const r = await fetch(`${baseURL}/tasks`, { headers: { "If-None-Match": 'W/"v-test"' } });
    assert.equal(r.status, 304);
    assert.equal(await r.text(), "");
  });
});

test("[tasks-routes] GET /tasks fails closed when canonical memory is unavailable", async () => {
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => {
      throw new Error("database unavailable");
    },
  });
  await withServer(deps, async (baseURL) => {
    const r = await getJson(baseURL, "/tasks");
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.body.stage, "tasks");
    assert.equal(r.body.error, "memory_read_failed");
  });
});

test("[tasks-routes] GET /tasks reads newer next actions from an independent instance", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-tasks-read-"));
  const userId = "writer-tasks-read";
  const writerStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: (value) => structuredClone(value || {}),
  });
  const readerStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: (value) => structuredClone(value || {}),
  });
  const baseMemory = {
    lastUpdatedAt: 100,
    tasks: [{ id: "task-1", title: "Finish Act I", status: "open", priority: "high" }],
    taskLastUpdatedAt: 100,
  };
  const initial = await writerStore.read({ userId, fallbackMemory: baseMemory });
  await writerStore.commit({
    userId,
    expectedRecord: initial.record,
    memory: initial.memory,
    now: 100,
  });
  const staleLocal = await readerStore.read({ userId });
  const writerRead = await writerStore.read({ userId });
  const latest = structuredClone(writerRead.memory);
  latest.tasks.push({
    id: "task-2",
    title: "Design the midpoint reversal",
    status: "open",
    priority: "high",
  });
  latest.taskLastUpdatedAt = 120;
  await writerStore.commit({
    userId,
    expectedRecord: writerRead.record,
    memory: latest,
    now: 120,
  });

  const deps = defaultDeps({
    memory: staleLocal.memory,
    selectMemoryRecordForRead: () => ({
      source: "auth_user",
      ip: `auth:${userId}`,
      memory: staleLocal.memory,
    }),
    resolveCanonicalWritableMemoryContext: async () => {
      const canonical = await readerStore.read({ userId });
      return {
        authenticatedUserId: userId,
        canonical: true,
        canonicalRecord: canonical.record,
        requesterIp: `auth:${userId}`,
        memory: canonical.memory,
      };
    },
    buildReadStateMeta: (_req, memory) => ({
      ...defaultReadMeta(),
      stateVersion: `v-${memory.lastUpdatedAt}`,
      etag: `W/\"v-${memory.lastUpdatedAt}\"`,
    }),
  });
  await withServer(deps, async (baseURL) => {
    const r = await getJson(baseURL, "/tasks?status=open");
    assert.equal(r.status, 200);
    assert.equal(r.body.total_count, 2);
    assert.equal(r.body.tasks[1].title, "Design the midpoint reversal");
    assert.equal(r.headers.get("x-state-version"), "v-120");
  });
});

test("[tasks-routes] POST /tasks/update adds a task and persists", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, {
      action: "add",
      title: "Write the Act II reversal",
      priority: "high",
      due_at: 1700001000000,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "created");
    assert.equal(r.body.task.title, "Write the Act II reversal");
    assert.equal(deps._calls.createTaskInMemory.length, 1);
    assert.equal(deps._calls.createTaskInMemory[0].input.source, "api");
    assert.equal(deps._calls.memoryCommits.length, 1);
    assert.match(deps._calls.logs[0], /tasks_update action=add status=created/);
    assert.doesNotMatch(deps._calls.logs[0], /Write the Act II reversal/);
  });
});

test("[tasks-routes] POST /tasks/update returns 400 on missing add title", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, { action: "add", title: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.status, "failed");
    assert.equal(r.body.message, "Missing task title.");
    assert.equal(deps._calls.createTaskInMemory.length, 0);
    assert.equal(deps._calls.memoryCommits.length, 1);
  });
});

test("[tasks-routes] POST /tasks/update fails closed when canonical mutation cannot commit", async () => {
  const deps = defaultDeps({
    createCanonicalMemoryMutationCommitter: () => async () => {
      throw new Error("contention");
    },
  });
  await withServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, { action: "add", title: "Write the climax" });
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.body.stage, "tasks");
    assert.equal(r.body.error, "memory_write_failed");
  });
});

test("[tasks-routes] task update rebases over a concurrent screenplay turn", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-tasks-race-"));
  const userId = "writer-tasks-race";
  const writerStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: (value) => structuredClone(value || {}),
  });
  const readerStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: (value) => structuredClone(value || {}),
  });
  const baseMemory = {
    lastUpdatedAt: 100,
    tasks: [{ id: "task-1", title: "Finish Act I", status: "open", priority: "high" }],
    taskLastUpdatedAt: 100,
    turnHistory: [{ turn: 1, content: "Mara enters the archive.", ts: 100 }],
    screenplayProjectMemory: [{
      projectId: "feature-1",
      currentBeat: "Mara enters the archive.",
    }],
  };
  const initial = await writerStore.read({ userId, fallbackMemory: baseMemory });
  await writerStore.commit({
    userId,
    expectedRecord: initial.record,
    memory: initial.memory,
    now: 100,
  });
  let persistCalls = 0;
  const deps = defaultDeps({
    memory: baseMemory,
    resolveCanonicalWritableMemoryContext: async () => {
      const canonical = await readerStore.read({ userId });
      return {
        authenticatedUserId: userId,
        canonical: true,
        canonicalRecord: canonical.record,
        requesterIp: `auth:${userId}`,
        memory: canonical.memory,
      };
    },
    createCanonicalMemoryMutationCommitter: (context) => createAccountMemoryMutationCommitter({
      context,
      sanitizeMemory: (value) => structuredClone(value || {}),
      persistMemory: async (candidateContext, memory, nowTs) => {
        persistCalls += 1;
        if (persistCalls === 1) {
          const competingRead = await writerStore.read({ userId });
          const competing = structuredClone(competingRead.memory);
          competing.turnHistory.push({
            turn: 2,
            content: "Mara hears the projector start.",
            ts: nowTs + 1,
          });
          competing.screenplayProjectMemory[0].currentBeat = "The projector starts.";
          competing.tasks.push({
            id: "task-concurrent",
            title: "Protect the midpoint setup",
            status: "open",
            priority: "normal",
          });
          await writerStore.commit({
            userId,
            expectedRecord: competingRead.record,
            memory: competing,
            now: nowTs + 1,
          });
        }
        return readerStore.commit({
          userId,
          expectedRecord: candidateContext.canonicalRecord,
          memory,
          now: nowTs,
        });
      },
    }),
  });
  await withServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, {
      action: "add",
      title: "Write the climax",
      priority: "high",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "created");
  });

  assert.equal(persistCalls, 2);
  const durable = await writerStore.read({ userId });
  assert.deepEqual(
    durable.memory.tasks.map((task) => task.title),
    ["Finish Act I", "Protect the midpoint setup", "Write the climax"],
  );
  assert.equal(durable.memory.turnHistory.at(-1).turn, 2);
  assert.equal(durable.memory.screenplayProjectMemory[0].currentBeat, "The projector starts.");
});
