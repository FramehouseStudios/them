import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildStateEtag,
  createReadStateHelpers,
  parseIfNoneMatchValues,
} from "../lib/read_state.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function request(headers = {}, authUserId = "") {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    authUserId,
    get(name) {
      return normalized[String(name).toLowerCase()];
    },
  };
}

function responseRecorder() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = String(value);
    },
  };
}

function deps(overrides = {}) {
  return {
    apiSchemaVersion: 3,
    backendBuild: "test-build",
    backendBootId: "test-boot",
    taskMaxStored: 20,
    screenplayProjectMemoryMax: 4,
    buildTaskSnapshot: (memory) => {
      const tasks = Array.isArray(memory?.tasks) ? memory.tasks : [];
      return { tasks, totalCount: tasks.length };
    },
    cleanupUserMemoryStore: () => {},
    clientIp: () => "10.0.0.5",
    createEmptyEmotionMemory: () => ({ empty: true }),
    formatLocalDateStamp: (timestamp) => `day-${Math.floor(timestamp / DAY_MS)}`,
    getLocalDayStartTs: (timestamp) => Math.floor(timestamp / DAY_MS) * DAY_MS,
    getPersistedIpForClientToken: () => "",
    getPersistedUserMemoryForClientToken: () => null,
    getPersistedUserMemoryForIp: () => null,
    getPersistedUserMemoryForUserId: () => null,
    getValidSession: () => null,
    legacyAuthMemoryIp: (userId) => `auth:${userId}`,
    normalizeClientIp: (value) => String(value || "").trim(),
    normalizeClientToken: (value) => String(value || "").trim(),
    normalizeSnippet: (value, limit) => String(value || "").trim().slice(0, limit),
    parseOneOf: (value, allowed, fallback) => allowed.has(value) ? value : fallback,
    resolveAuthenticatedUserId: (req) => String(req.authUserId || "").trim(),
    sanitizeActiveThemes: (value) => Array.isArray(value) ? value : [],
    sanitizeMemoryCardIdList: (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [],
    sanitizePersistedSessionMemory: (value) => ({ ...value }),
    sanitizeScreenplayProjectMemoryItems: (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [],
    sanitizeStudioTurnMetadata: (value) => value && typeof value === "object" ? value : null,
    sanitizeTaskItems: (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [],
    sanitizeTurnHistoryItems: (value) => Array.isArray(value) ? value : [],
    ...overrides,
  };
}

test("[read-state] parses conditional state validators", () => {
  assert.equal(buildStateEtag("abc123"), 'W/"abc123"');
  assert.deepEqual(parseIfNoneMatchValues('W/"abc123", "other"'), [
    'W/"abc123"',
    '"other"',
  ]);

  const helpers = createReadStateHelpers(deps());
  const req = request({ "If-None-Match": '"abc123"' });
  assert.equal(helpers.ifNoneMatchStateHit(req, 'W/"abc123"', "abc123"), true);
  assert.equal(helpers.ifNoneMatchStateHit(request(), 'W/"abc123"', "abc123"), false);
});

test("[read-state] an empty validator never produces a conditional hit", () => {
  const helpers = createReadStateHelpers(deps());
  // ETag-only routes (memories list with a creative store) pass no state version.
  for (const header of ['""', 'W/""', '"", "other"']) {
    const req = request({ "If-None-Match": header });
    assert.equal(helpers.ifNoneMatchStateHit(req, 'W/"memories_abc"', ""), false, header);
    assert.equal(helpers.ifNoneMatchStateHit(req, "", ""), false, header);
    assert.equal(helpers.ifNoneMatchStateHit(req, "", "abc123"), false, header);
  }
  // Real validators still match with or without the weak prefix.
  const hit = request({ "If-None-Match": '"memories_abc"' });
  assert.equal(helpers.ifNoneMatchStateHit(hit, 'W/"memories_abc"', ""), true);
  assert.equal(helpers.ifNoneMatchStateHit(request({ "If-None-Match": "abc123" }), "", "abc123"), true);
});

test("[read-state] never accepts a session owned by another authenticated user", () => {
  const helpers = createReadStateHelpers(deps({
    getValidSession: () => ({ userId: "other-user", memory: { marker: "wrong-session" } }),
    getPersistedUserMemoryForUserId: (userId) => ({ marker: `persisted:${userId}` }),
  }));

  const selected = helpers.selectMemoryRecordForRead(
    request({ "X-Client-Token": "client-a" }, "user-a"),
    123
  );

  assert.equal(selected.source, "auth_user");
  assert.equal(selected.ip, "auth:user-a");
  assert.equal(selected.memory.marker, "persisted:user-a");
});

test("[read-state] authenticated sessions produce stable state metadata and headers", () => {
  const helpers = createReadStateHelpers(deps({
    getValidSession: () => ({ userId: "user-a", memory: { marker: "session" } }),
  }));
  const req = request({ "X-Client-Token": "client-a" }, "user-a");
  const memory = {
    turns: 4,
    lastUpdatedAt: 8_000,
    turnHistory: [{ role: "user", content: "hello", turn: 4, ts: 7_500 }],
  };

  const meta = helpers.buildReadStateMeta(req, memory, "auth:user-a");
  const res = responseRecorder();
  helpers.applyReadStateHeaders(res, meta);

  assert.equal(meta.sessionId, "client-a");
  assert.equal(meta.lastTurnId, "turn-4");
  assert.match(meta.stateVersion, /^[a-f0-9]{24}$/);
  assert.equal(res.headers.etag, meta.etag);
  assert.equal(res.headers["x-session-id"], "client-a");
  assert.equal(res.headers["x-state-version"], meta.stateVersion);
  assert.equal(res.headers["x-schema-version"], "3");
  assert.equal(res.headers["x-backend-build"], "test-build");
});

test("[read-state] groups screenplay history by turn and filters by project", () => {
  const helpers = createReadStateHelpers(deps());
  const memory = {
    turnHistory: [
      {
        role: "user",
        content: "Continue the ferry scene",
        turn: 2,
        ts: 2_000,
        requestId: "req-2",
        studio: { screenplayProjectId: "project-a", screenplayWriteId: "write-2" },
      },
      {
        role: "assistant",
        content: "EXT. FERRY DOCK - NIGHT",
        turn: 2,
        ts: 2_100,
        requestId: "req-2",
        studio: { screenplayProjectId: "project-a", screenplayWriteId: "write-2" },
      },
      {
        role: "user",
        content: "Another project",
        turn: 3,
        ts: 3_000,
        studio: { screenplayProjectId: "project-b" },
      },
    ],
  };

  const threads = helpers.buildConversationHistoryThreads(memory, 10, {
    screenplayProjectId: "project-a",
  });

  assert.equal(threads.length, 1);
  assert.equal(threads[0].turn, 2);
  assert.equal(threads[0].user, "Continue the ferry scene");
  assert.equal(threads[0].assistant, "EXT. FERRY DOCK - NIGHT");
  assert.equal(threads[0].screenplay_project_id, "project-a");
  assert.equal(threads[0].screenplay_write_id, "write-2");
});

test("[read-state] preserves full Studio voice-pin advice across restore", () => {
  const helpers = createReadStateHelpers(deps());
  const longAdvice = `Ranked strongest move - relationship pressure: ${"cost and consequence ".repeat(30)}I remember the last reversal did not get you moving here.`;
  const memory = {
    turnHistory: [
      {
        role: "assistant",
        content: longAdvice,
        turn: 4,
        ts: 4_100,
        studio: {
          screenplayProjectId: "project-a",
          screenplayTarget: "voice_pin",
        },
      },
    ],
  };

  const threads = helpers.buildConversationHistoryThreads(memory, 10, {
    screenplayProjectId: "project-a",
  });

  assert.equal(threads.length, 1);
  assert.equal(threads[0].assistant, longAdvice.trim());
  assert.match(threads[0].assistant, /I remember the last reversal did not get you moving here/);
  assert.ok(threads[0].assistant.length > 280);
});

test("[read-state] daily recap keeps outcomes and next actions inside the requested window", () => {
  const now = (10 * DAY_MS) + 12_000;
  const todayStart = 10 * DAY_MS;
  const helpers = createReadStateHelpers(deps());
  const memory = {
    tasks: [
      { title: "Polish the midpoint", status: "completed", completedAt: todayStart + 2_000 },
      { title: "Write the climax", status: "open", completedAt: 0 },
      { title: "Old polish", status: "completed", completedAt: todayStart - DAY_MS },
    ],
  };
  const history = [
    { assistant: "Mara chooses the dangerous route.", updatedAt: todayStart + 3_000 },
    { assistant: "Yesterday's scene.", updatedAt: todayStart - 1_000 },
  ];

  const recap = helpers.buildDailyRecapPayload(memory, history, now, "today");

  assert.equal(recap.window, "today");
  assert.equal(recap.stats.turnsToday, 1);
  assert.deepEqual(recap.outcomes, ["Polish the midpoint"]);
  assert.deepEqual(recap.nextActions, ["Write the climax"]);
  assert.equal(recap.recap, "Mara chooses the dangerous route.");
});
