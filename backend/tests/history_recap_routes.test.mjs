import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createAccountMemoryCAS } from "../lib/account_memory_cas.js";
import { createAccountMemoryMutationCommitter } from "../lib/account_memory_turn_commit.js";
import { mountHistoryRoutes } from "../lib/history_routes.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { mountRecapRoutes } from "../lib/recap_routes.js";

function parseQueryLimit(value, fallback = 24, max = 200) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function parseTurnIdToNumber(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return 0;
  const normalized = raw.startsWith("turn-") ? raw.slice(5) : raw;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function normalizeSnippet(value, max = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function defaultMemory() {
  return {
    assistantSelfName: "Clem",
    userPrimaryName: "June",
    conversationCount: 2,
    lastConversationRecap: "Mara wants the final reel back.",
    lastConversationAt: 1700000000100,
    rememberedPeople: [{ name: "Mara", relation: "protagonist" }],
    turnHistory: [
      {
        turn: 1,
        role: "user",
        content: "Write Mara entering the archive.",
        ts: 1700000000000,
        requestId: "r1",
      },
      {
        turn: 1,
        role: "assistant",
        content: "INT. ARCHIVE - NIGHT",
        ts: 1700000000100,
        requestId: "r1",
      },
    ],
  };
}

function defaultThreads() {
  return [
    {
      id: "turn-2",
      turn: 2,
      title: "Continue the archive scene.",
      preview: "Mara hears the projector start.",
      user: "Continue the archive scene.",
      assistant: "INT. ARCHIVE - NIGHT\nThe projector starts.",
      updatedAt: 1700000000200,
    },
    {
      id: "turn-1",
      turn: 1,
      title: "Write Mara entering the archive.",
      preview: "INT. ARCHIVE - NIGHT",
      user: "Write Mara entering the archive.",
      assistant: "INT. ARCHIVE - NIGHT",
      updatedAt: 1700000000100,
    },
  ];
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

function defaultDeps(overrides = {}) {
  const calls = {
    memoryCommits: [],
    upsertScreenplayProjectMemory: [],
  };
  const memory = overrides.memory || defaultMemory();
  const readMeta = overrides.readMeta || defaultReadMeta();
  return {
    _calls: calls,
    applyReadStateHeaders: (res, meta) => {
      res.setHeader("x-state-version", meta.stateVersion);
      res.setHeader("x-session-id", meta.sessionId);
      if (meta.etag) res.setHeader("ETag", meta.etag);
    },
    buildConversationHistoryThreads: () => overrides.threads || defaultThreads(),
    buildDailyRecapPayload: (_memory, _threads, _now, windowKey) => ({
      window: windowKey || "today",
      windowLabel: windowKey || "today",
      windowStartAt: 1700000000000,
      windowEndAt: 1700086400000,
      localDay: "2023-11-14",
      generatedAt: 1700000000400,
      recap: "Mara hears the projector start.",
      highlights: ["The projector starts."],
      outcomes: [],
      nextActions: ["Finish the archive scene."],
      openTasks: [],
      completedToday: [],
      stats: { windowTurns: 1 },
    }),
    buildReadStateMeta: () => readMeta,
    getAssistantSelfNameForIp: () => "Clementine",
    ifNoneMatchStateHit: overrides.ifNoneMatchStateHit || (() => false),
    normalizeAssistantSelfName: normalizeSnippet,
    normalizeSnippet,
    normalizeUserPersonName: normalizeSnippet,
    parseQueryLimit,
    parseTurnIdToNumber,
    createCanonicalMemoryMutationCommitter: (context) => async (mutator, nowTs) => {
      const nextMemory = mutator(structuredClone(context.memory || {}));
      calls.memoryCommits.push({ context, nextMemory, nowTs });
      context.memory = structuredClone(nextMemory);
      return context.memory;
    },
    resolveCanonicalWritableMemoryContext: async () => ({
      requesterIp: "127.0.0.1",
      clientToken: "",
      memory: structuredClone(memory),
    }),
    sanitizePersistedSessionMemory: (value) => structuredClone(value || {}),
    sanitizeRememberedPeople: (people) => Array.isArray(people) ? people : [],
    sanitizeStudioTurnMetadata: (input) => input && typeof input === "object" ? {
      screenplayProjectId: normalizeSnippet(input.screenplayProjectId, 96),
      screenplayTarget: normalizeSnippet(input.screenplayTarget || "scene", 96),
      screenplayWriteId: normalizeSnippet(input.screenplayWriteId || "write-1", 96),
    } : null,
    sanitizeTurnHistoryItems: (items) => Array.isArray(items) ? items : [],
    selectMemoryRecordForRead: () => ({
      source: "auth_user",
      ip: "auth:user-1",
      memory,
    }),
    upsertScreenplayProjectMemory: (nextMemory, studioMeta, context) => {
      calls.upsertScreenplayProjectMemory.push({ nextMemory, studioMeta, context });
    },
    USER_MEMORY_REMEMBERED_PEOPLE_MAX: 24,
    ...overrides,
  };
}

async function withServer(deps, fn) {
  const app = express();
  mountHistoryRoutes(app, deps);
  mountRecapRoutes(app, deps);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
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

async function postJson(baseURL, path, body) {
  const res = await fetch(`${baseURL}${path}`, {
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

test("[history-routes] mount guards required deps", () => {
  assert.throws(() => mountHistoryRoutes(null, defaultDeps()), /Express app/);
  const deps = defaultDeps();
  delete deps.buildReadStateMeta;
  assert.throws(() => mountHistoryRoutes(express(), deps), /buildReadStateMeta/);
  const mutationDeps = defaultDeps();
  delete mutationDeps.createCanonicalMemoryMutationCommitter;
  assert.throws(
    () => mountHistoryRoutes(express(), mutationDeps),
    /createCanonicalMemoryMutationCommitter/,
  );
});

test("[history-routes] GET /history returns the canonical envelope", async () => {
  await withServer(defaultDeps(), async (baseURL) => {
    const r = await getJson(baseURL, "/history?sinceTurnId=turn-1");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-state-version"), "v-test");
    assert.equal(r.body.assistant_name, "Clem");
    assert.equal(r.body.user_name, "June");
    assert.equal(r.body.is_delta, true);
    assert.equal(r.body.since_turn_id, "turn-1");
    assert.deepEqual(r.body.remembered_names, [{ name: "Mara", relation: "protagonist" }]);
    assert.equal(r.body.threads.length, 1);
    assert.equal(r.body.threads[0].turn, 2);
  });
});

test("[history-routes] GET /history honors If-None-Match 304", async () => {
  const deps = defaultDeps({ ifNoneMatchStateHit: () => true });
  await withServer(deps, async (baseURL) => {
    const r = await fetch(`${baseURL}/history`, { headers: { "If-None-Match": 'W/"v-test"' } });
    assert.equal(r.status, 304);
    assert.equal(await r.text(), "");
  });
});

test("[history-routes] POST /history/annotate_turn annotates and persists", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/history/annotate_turn", {
      turn_id: "turn-1",
      studio: {
        screenplayProjectId: "feature-1",
        screenplayTarget: "scene",
        screenplayWriteId: "write-99",
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-turn-id"), "turn-1");
    assert.equal(r.body.status, "updated");
    assert.equal(deps._calls.memoryCommits.length, 1);
    assert.equal(deps._calls.upsertScreenplayProjectMemory.length, 1);
    assert.equal(deps._calls.upsertScreenplayProjectMemory[0].context.transcript, "Write Mara entering the archive.");
    assert.equal(deps._calls.upsertScreenplayProjectMemory[0].context.reply, "INT. ARCHIVE - NIGHT");
  });
});

test("[history-routes] POST /history/annotate_turn returns 404 for a missing turn", async () => {
  await withServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/history/annotate_turn", {
      turn_id: "turn-99",
      studio: { screenplayProjectId: "feature-1" },
    });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "turn_not_found");
  });
});

test("[history-routes] POST /history/annotate_turn fails closed on canonical read errors", async () => {
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => {
      throw new Error("database unavailable");
    },
  });
  await withServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/history/annotate_turn", {
      turn_id: "turn-1",
      studio: { screenplayProjectId: "feature-1" },
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "memory_read_failed");
  });
});

test("[history-routes] POST /history/annotate_turn fails closed on commit errors", async () => {
  const deps = defaultDeps({
    createCanonicalMemoryMutationCommitter: () => async () => {
      const error = new Error("contention");
      error.status = 503;
      throw error;
    },
  });
  await withServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/history/annotate_turn", {
      turn_id: "turn-1",
      studio: { screenplayProjectId: "feature-1" },
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "memory_write_failed");
  });
});

test("[history-routes] stale Studio annotation preserves a concurrent voice turn", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-history-voice-race-"));
  const userId = "writer-history-voice-race";
  const studioStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: (value) => structuredClone(value || {}),
  });
  const voiceStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: (value) => structuredClone(value || {}),
  });
  const initial = await studioStore.read({ userId, fallbackMemory: {
    ...defaultMemory(),
    screenplayProjectMemory: [{
      projectId: "feature-1",
      currentBeat: "Mara enters the archive.",
      updatedAt: 100,
    }],
    lastUpdatedAt: 100,
  } });
  await studioStore.commit({
    userId,
    expectedRecord: initial.record,
    memory: initial.memory,
    now: 100,
  });
  const staleStudioRead = await studioStore.read({ userId });
  const voiceRead = await voiceStore.read({ userId });
  const voiceWinner = structuredClone(voiceRead.memory);
  voiceWinner.turnHistory.push({
    turn: 2,
    role: "user",
    content: "Mara hears the projector start.",
    ts: 1700000000200,
  });
  voiceWinner.screenplayProjectMemory[0].currentBeat = "The projector starts behind Mara.";
  voiceWinner.screenplayProjectMemory[0].updatedAt = 120;
  await voiceStore.commit({
    userId,
    expectedRecord: voiceRead.record,
    memory: voiceWinner,
    now: 120,
  });

  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => ({
      authenticatedUserId: userId,
      canonical: true,
      canonicalRecord: staleStudioRead.record,
      requesterIp: `auth:${userId}`,
      memory: staleStudioRead.memory,
    }),
    createCanonicalMemoryMutationCommitter: (context) =>
      createAccountMemoryMutationCommitter({
        context,
        sanitizeMemory: (value) => structuredClone(value || {}),
        persistMemory: (activeContext, memory, now) => studioStore.commit({
          userId: activeContext.authenticatedUserId,
          expectedRecord: activeContext.canonicalRecord,
          memory,
          now,
        }),
      }),
  });
  await withServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/history/annotate_turn", {
      turn_id: "turn-1",
      studio: {
        screenplayProjectId: "feature-1",
        screenplayTarget: "scene",
        screenplayWriteId: "write-race",
      },
    });
    assert.equal(r.status, 200);
  });

  assert.equal(deps._calls.upsertScreenplayProjectMemory.length, 2);
  const repairedUpsert = deps._calls.upsertScreenplayProjectMemory.at(-1);
  assert.equal(
    repairedUpsert.nextMemory.screenplayProjectMemory[0].currentBeat,
    "The projector starts behind Mara.",
  );
  assert.equal(repairedUpsert.context.transcript, "Write Mara entering the archive.");
  assert.equal(repairedUpsert.context.reply, "INT. ARCHIVE - NIGHT");

  const relaunched = await voiceStore.read({ userId });
  assert.equal(relaunched.memory.turnHistory.length, 3);
  assert.equal(relaunched.memory.turnHistory.at(-1).content, "Mara hears the projector start.");
  assert.equal(
    relaunched.memory.screenplayProjectMemory[0].currentBeat,
    "The projector starts behind Mara.",
  );
  const annotated = relaunched.memory.turnHistory.filter((item) => item.turn === 1);
  assert.equal(annotated.length, 2);
  assert.ok(annotated.every((item) => item.studio?.screenplayProjectId === "feature-1"));
});

test("[recap-routes] mount guards required deps", () => {
  assert.throws(() => mountRecapRoutes(null, defaultDeps()), /Express app/);
  const deps = defaultDeps();
  delete deps.buildDailyRecapPayload;
  assert.throws(() => mountRecapRoutes(express(), deps), /buildDailyRecapPayload/);
});

test("[recap-routes] GET /recap and /recap/today return recap envelopes", async () => {
  await withServer(defaultDeps(), async (baseURL) => {
    const weekly = await getJson(baseURL, "/recap?window=last_7_days");
    assert.equal(weekly.status, 200);
    assert.equal(weekly.body.window, "last_7_days");
    assert.equal(weekly.body.recap, "Mara hears the projector start.");

    const today = await getJson(baseURL, "/recap/today");
    assert.equal(today.status, 200);
    assert.equal(today.body.window, "today");
    assert.deepEqual(today.body.next_actions, ["Finish the archive scene."]);
  });
});

test("[recap-routes] GET /recap honors If-None-Match 304", async () => {
  const deps = defaultDeps({ ifNoneMatchStateHit: () => true });
  await withServer(deps, async (baseURL) => {
    const r = await fetch(`${baseURL}/recap`, { headers: { "If-None-Match": 'W/"v-test"' } });
    assert.equal(r.status, 304);
    assert.equal(await r.text(), "");
  });
});
