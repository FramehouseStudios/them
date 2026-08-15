import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountDataRoutes } from "../lib/data_routes.js";

function routeHandler(app, path) {
  const layer = app._router.stack.find((candidate) => candidate.route?.path === path);
  assert.ok(layer, `missing route ${path}`);
  return layer.route.stack.at(-1).handle;
}

function responseDouble() {
  return {
    body: null,
    headers: new Map(),
    statusCode: 200,
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), String(value));
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function createRouteHarness(overrides = {}) {
  const app = express();
  const seenMeta = [];
  const deps = {
    logger: { log: () => {} },
    applyReadStateHeaders: (res, meta) => {
      res.setHeader("x-state-version", meta.stateVersion);
    },
    buildReadStateMeta: (_req, memory) => {
      seenMeta.push(memory);
      return {
        sessionId: "account:writer-a",
        stateVersion: `state-${memory.lastUpdatedAt || 0}`,
        lastTurnId: "",
        lastUpdatedAt: memory.lastUpdatedAt || 0,
        historyUpdatedAt: memory.historyClearedAt || 0,
        memoryUpdatedAt: memory.memoriesClearedAt || 0,
        backendBootId: "boot-test",
        schemaVersion: 1,
        backendBuild: "test",
      };
    },
    clearAllMemoriesMemory: (memory, nowTs) => ({
      ...memory,
      screenplayProjectMemory: [],
      memoriesClearedAt: nowTs,
      lastUpdatedAt: nowTs,
    }),
    clearConversationHistoryMemory: (memory, nowTs) => ({
      ...memory,
      turns: 0,
      turnHistory: [],
      historyClearedAt: nowTs,
      lastUpdatedAt: nowTs,
    }),
    createRequestId: () => "request-clear",
    creativeMemoryStore: {
      clearUserMemory: async () => ({ ok: true, cleared: true }),
    },
    persistCanonicalWritableMemoryContext: async (_context, memory) => ({
      ok: true,
      memory,
    }),
    resolveCanonicalWritableMemoryContext: async () => ({
      canonical: true,
      canonicalRecord: { updatedAt: 10 },
      memory: { turns: 2, turnHistory: ["old"], lastUpdatedAt: 10 },
      requesterIp: "auth:writer-a",
      clientToken: "device-a",
    }),
    ...overrides,
  };
  mountDataRoutes(app, deps);
  return { app, seenMeta };
}

async function invoke(app, path) {
  const req = {
    authUser: { id: "writer-a" },
    requestId: "request-clear",
  };
  const res = responseDouble();
  let nextError = null;
  await routeHandler(app, path)(req, res, (error) => {
    nextError = error || null;
  });
  return { res, nextError };
}

test("history clear rebases onto a concurrent account winner", async () => {
  const writes = [];
  let committedMemory = null;
  const winner = {
    turns: 3,
    turnHistory: ["old", "simultaneous Mac turn"],
    lastUpdatedAt: 20,
  };
  const { app, seenMeta } = createRouteHarness({
    persistCanonicalWritableMemoryContext: async (context, memory) => {
      writes.push({ context, memory });
      if (writes.length === 1) {
        return {
          ok: false,
          status: "stale_memory_state_version",
          record: { updatedAt: 20, memory: winner },
          memory: winner,
        };
      }
      committedMemory = { ...memory, lastUpdatedAt: memory.lastUpdatedAt + 1 };
      return { ok: true, memory: committedMemory };
    },
  });

  const { res, nextError } = await invoke(app, "/data/history/clear");

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "clear_history");
  assert.equal(writes.length, 2);
  assert.equal(writes[1].context.canonicalRecord.updatedAt, 20);
  assert.deepEqual(writes[1].memory.turnHistory, []);
  assert.equal(writes[1].memory.turns, 0);
  assert.deepEqual(seenMeta.at(-1), committedMemory);
  assert.equal(res.headers.get("x-state-version"), `state-${committedMemory.lastUpdatedAt}`);
});

test("memory clear erases creative memory before committing rebased account memory", async () => {
  const events = [];
  const winner = {
    screenplayProjectMemory: [{ projectId: "split-ferries", currentBeat: "new turn" }],
    memoriesClearedAt: 0,
    lastUpdatedAt: 30,
  };
  let writes = 0;
  const { app } = createRouteHarness({
    creativeMemoryStore: {
      clearUserMemory: async ({ userId }) => {
        events.push(`creative:${userId}`);
        return { ok: true, cleared: true };
      },
    },
    persistCanonicalWritableMemoryContext: async (_context, memory) => {
      writes += 1;
      events.push(`account:${writes}`);
      if (writes === 1) {
        return {
          ok: false,
          status: "stale_memory_state_version",
          record: { updatedAt: 30, memory: winner },
          memory: winner,
        };
      }
      return { ok: true, memory: { ...memory, lastUpdatedAt: memory.lastUpdatedAt + 1 } };
    },
  });

  const { res, nextError } = await invoke(app, "/data/memories/clear");

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "clear_memories");
  assert.deepEqual(events, ["creative:writer-a", "account:1", "account:2"]);
  assert.equal(res.body.memory_updated_at > 0, true);
});

test("data clears fail closed when canonical persistence never accepts the clear", async () => {
  const { app } = createRouteHarness({
    persistCanonicalWritableMemoryContext: async (_context, memory) => ({
      ok: false,
      status: "stale_memory_state_version",
      record: { updatedAt: (memory.lastUpdatedAt || 0) + 1 },
      memory: { ...memory, lastUpdatedAt: (memory.lastUpdatedAt || 0) + 1 },
    }),
  });

  const { res, nextError } = await invoke(app, "/data/history/clear");

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    ok: false,
    action: "clear_history",
    status: "memory_persistence_unavailable",
    message: "Memory sync is temporarily unavailable. No success was recorded.",
    request_id: "request-clear",
  });
});

test("creative deletion failure prevents account-memory success", async () => {
  let accountWrites = 0;
  const deletionError = new Error("creative delete unavailable");
  const { app } = createRouteHarness({
    creativeMemoryStore: {
      clearUserMemory: async () => {
        throw deletionError;
      },
    },
    persistCanonicalWritableMemoryContext: async (_context, memory) => {
      accountWrites += 1;
      return { ok: true, memory };
    },
  });

  const { res, nextError } = await invoke(app, "/data/memories/clear");

  assert.equal(res.body, null);
  assert.equal(nextError, deletionError);
  assert.equal(accountWrites, 0);
});
