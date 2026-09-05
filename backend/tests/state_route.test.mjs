import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createAccountMemoryCAS } from "../lib/account_memory_cas.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { mountStateRoute } from "../lib/state_route.js";

function defaultMemory() {
  return {
    lastUpdatedAt: 100,
    turnHistory: [
      {
        turn: 1,
        role: "user",
        content: "Open on Mara in the archive.",
        ts: 1700000000100,
      },
    ],
    screenplayProjectMemory: [
      {
        projectId: "feature-1",
        projectTitle: "The Lost Reel",
        act: "Act I",
        currentBeat: "Mara enters the archive.",
      },
    ],
  };
}

function buildThreads(memory) {
  return (Array.isArray(memory?.turnHistory) ? memory.turnHistory : [])
    .map((item) => ({
      id: `turn-${item.turn}`,
      turn: item.turn,
      title: item.content,
      preview: item.content,
      user: item.role === "user" ? item.content : "",
      assistant: item.role === "assistant" ? item.content : "",
      updatedAt: item.ts,
    }))
    .sort((left, right) => right.turn - left.turn);
}

function defaultDeps(overrides = {}) {
  const memory = overrides.memory || defaultMemory();
  const calls = {
    canonicalReads: 0,
    canonicalWrites: 0,
    localWrites: 0,
  };
  return {
    _calls: calls,
    applyReadStateHeaders: (res, meta) => {
      res.setHeader("x-state-version", meta.stateVersion);
      res.setHeader("ETag", meta.etag);
    },
    buildConversationHistoryThreads: buildThreads,
    buildMemoryCards: (value) => (value.screenplayProjectMemory || []).map((project) => ({
      id: `project-${project.projectId}`,
      title: project.projectTitle,
      detail: project.currentBeat,
    })),
    buildReadStateMeta: (_req, value) => ({
      sessionId: "session-state",
      stateVersion: `v-${value.lastUpdatedAt}`,
      etag: `W/\"v-${value.lastUpdatedAt}\"`,
      lastUpdatedAt: value.lastUpdatedAt,
      historyUpdatedAt: value.lastUpdatedAt,
      memoryUpdatedAt: value.lastUpdatedAt,
      lastTurnId: value.turnHistory?.length
        ? `turn-${Math.max(...value.turnHistory.map((item) => Number(item.turn || 0)))}`
        : null,
      schemaVersion: 1,
      backendBuild: "test-build",
      backendBootId: "test-boot",
    }),
    buildSessionContinuitySnapshot: (value) => {
      const project = value.screenplayProjectMemory?.[0];
      return project ? {
        has_continuity: true,
        project_id: project.projectId,
        project_title: project.projectTitle,
        act: project.act,
        current_beat: project.currentBeat,
      } : null;
    },
    maybeBackfillThemesFromHistory: () => ({ applied: false, created: 0, keys: [] }),
    normalizeClientToken: (value) => String(value || ""),
    parseQueryLimit: (value, fallback, max) => {
      const parsed = Number.parseInt(String(value ?? ""), 10);
      return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
    },
    parseTurnIdToNumber: (value) => {
      const parsed = Number.parseInt(String(value || "").replace(/^turn-/, ""), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    },
    persistCanonicalWritableMemoryContext: async (_context, nextMemory) => {
      calls.canonicalWrites += 1;
      return { ok: true, status: "saved", memory: structuredClone(nextMemory) };
    },
    resolveCanonicalWritableMemoryContext: async () => {
      calls.canonicalReads += 1;
      return {
        canonical: false,
        requesterIp: "127.0.0.1",
        memory: structuredClone(memory),
      };
    },
    sanitizePersistedSessionMemory: (value) => structuredClone(value || {}),
    selectMemoryRecordForRead: () => ({
      source: "auth_user",
      ip: "auth:writer-state",
      memory: structuredClone(memory),
    }),
    setPersistedUserMemoryForIp: () => {
      calls.localWrites += 1;
    },
    logger: { log() {}, error() {} },
    ...overrides,
  };
}

async function withServer(deps, fn) {
  const app = express();
  app.use((req, _res, next) => {
    req.authUser = { id: "writer-state" };
    next();
  });
  mountStateRoute(app, deps);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function getJson(baseURL, route = "/state") {
  const response = await fetch(`${baseURL}${route}`);
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : {},
  };
}

test("[state-route] fails closed when canonical account state is unavailable", async () => {
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => {
      throw new Error("database unavailable");
    },
  });
  await withServer(deps, async (baseURL) => {
    const response = await getJson(baseURL);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.body.stage, "state");
    assert.equal(response.body.error, "memory_read_failed");
  });
});

test("[state-route] restores a newer screenplay turn from an independent instance", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-state-read-freshness-"));
  const userId = "writer-state-freshness";
  const writerStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: (value) => structuredClone(value || {}),
  });
  const readerStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: (value) => structuredClone(value || {}),
  });
  const initial = await writerStore.read({ userId, fallbackMemory: defaultMemory() });
  await writerStore.commit({
    userId,
    expectedRecord: initial.record,
    memory: initial.memory,
    now: 100,
  });
  const staleLocal = await readerStore.read({ userId });
  const writerRead = await writerStore.read({ userId });
  const latest = structuredClone(writerRead.memory);
  latest.screenplayProjectMemory[0] = {
    ...latest.screenplayProjectMemory[0],
    act: "Act II",
    currentBeat: "Mara screens the reel for June.",
  };
  latest.turnHistory.push({
    turn: 2,
    role: "user",
    content: "Continue after the projector starts.",
    ts: 1700000000200,
  });
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
  });
  await withServer(deps, async (baseURL) => {
    const response = await getJson(baseURL, "/state?sinceTurnId=turn-1");
    assert.equal(response.status, 200);
    assert.equal(response.body.source, "auth_user");
    assert.equal(response.body.history_delta.length, 1);
    assert.equal(response.body.history_delta[0].turn, 2);
    assert.equal(response.body.continuity.act, "Act II");
    assert.equal(response.body.continuity.current_beat, "Mara screens the reel for June.");
    assert.equal(response.headers.get("x-state-version"), "v-120");
  });
});

test("[state-route] canonical theme backfill preserves and serves a concurrent winner", async () => {
  const staleMemory = defaultMemory();
  const winnerMemory = {
    ...defaultMemory(),
    lastUpdatedAt: 140,
    turnHistory: [
      ...defaultMemory().turnHistory,
      {
        turn: 2,
        role: "user",
        content: "June corrects the ending on macOS.",
        ts: 1700000000400,
      },
    ],
  };
  const deps = defaultDeps({
    memory: staleMemory,
    resolveCanonicalWritableMemoryContext: async () => ({
      canonical: true,
      requesterIp: "auth:writer-state",
      memory: structuredClone(staleMemory),
      canonicalRecord: { revision: 1 },
    }),
    maybeBackfillThemesFromHistory: (memory) => {
      memory.activeThemes = [{ key: "archive", label: "Archive" }];
      return { applied: true, created: 1, keys: ["archive"] };
    },
    persistCanonicalWritableMemoryContext: async () => ({
      ok: false,
      status: "stale_memory_state_version",
      memory: structuredClone(winnerMemory),
      record: { revision: 2 },
    }),
  });
  await withServer(deps, async (baseURL) => {
    const response = await getJson(baseURL);
    assert.equal(response.status, 200);
    assert.equal(response.body.state_version, "v-140");
    assert.equal(response.body.history_delta[0].turn, 2);
    assert.equal(deps._calls.localWrites, 0);
  });
});
