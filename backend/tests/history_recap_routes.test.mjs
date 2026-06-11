import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mountHistoryRoutes } from "../lib/history_routes.js";
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
    persistWritableMemoryContext: [],
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
    persistWritableMemoryContext: (context, nextMemory, nowTs) => {
      calls.persistWritableMemoryContext.push({ context, nextMemory, nowTs });
      return nextMemory;
    },
    resolveWritableMemoryContext: () => ({
      requesterIp: "127.0.0.1",
      clientToken: "",
      memory,
    }),
    sanitizePersistedSessionMemory: (value) => value || {},
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
    assert.equal(deps._calls.persistWritableMemoryContext.length, 1);
    assert.equal(deps._calls.upsertScreenplayProjectMemory.length, 1);
    assert.equal(deps._calls.upsertScreenplayProjectMemory[0].context.transcript, "Write Mara entering the archive.");
    assert.equal(deps._calls.upsertScreenplayProjectMemory[0].context.reply, "INT. ARCHIVE - NIGHT");
  });
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
