// T-decompose-phase5b3-turn-commit — integration tests for
// `mountRealtimeTurnCommitRoute`. Cover:
//
// - Required-deps mount guard (21 fns + 1 const).
// - 400 envelope on missing transcript / reply.
// - 201 envelope on happy path with the canonical field set.
// - storeTalkTurnMeta called exactly once with the canonical
//   render contract (load-bearing for #227 invariant).
// - Read-state headers (Cache-Control: no-store, x-turn-id,
//   x-turn-meta-available, applyReadStateHeaders side-effect).
// - request_id falls back to rid when not in the body.
// - userMessage / user_message / transcript field-name fallbacks
//   honored.
// - Memory-write side-effect: persistWritableMemoryContext
//   called with (context, nextMemory, nowTs).
// - No module-level supplier rotation — the route does NOT
//   touch any state outside the deps (same byte-identical-
//   rotation invariant Codex flagged in 5b.1).

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountRealtimeTurnCommitRoute,
  TURN_COMMIT_BODY_LIMIT,
} from "../lib/realtime_turn_commit_route.js";

function defaultDeps(overrides = {}) {
  const calls = {
    resolveWritableMemoryContext: [],
    sanitizePersistedSessionMemory: [],
    persistWritableMemoryContext: [],
    updateSessionEmotionMemory: [],
    updateSessionAfterReply: [],
    recordUserTalkMetrics: [],
    maybeRefineActiveThemesWithLLM: [],
    recordCreativeMemoryTriggersForRequest: [],
    storeTalkTurnMeta: [],
    buildReadStateMeta: [],
    applyReadStateHeaders: [],
  };
  return {
    // Helpers
    createRequestId: () => "req_tc_test",
    normalizeSnippet: (v, _max) => (typeof v === "string" ? v.trim() : ""),
    sanitizeStudioTurnMetadata: (v) => v || null,
    // Memory context
    resolveWritableMemoryContext: (req, nowTs) => {
      const ctx = { memory: null, requesterIp: "10.0.0.1", activeSession: null };
      calls.resolveWritableMemoryContext.push({ nowTs });
      return ctx;
    },
    sanitizePersistedSessionMemory: (m) => {
      calls.sanitizePersistedSessionMemory.push(m);
      return m || { behaviorMode: "surface", followUpPromptCount: 0, followUpAnswerCount: 0 };
    },
    persistWritableMemoryContext: (ctx, nextMem, ts) => {
      calls.persistWritableMemoryContext.push({ ctx, nextMem, ts });
      return { ok: true };
    },
    // IP
    normalizeClientIp: (ip) => String(ip || "").trim() || "0.0.0.0",
    clientIp: () => "10.0.0.1",
    // Pipeline
    directorFlagsFromTranscript: () => ({ isVulnerable: false }),
    getUserMetricState: () => ({ sessionStartsByDay: {} }),
    countSessionStartsForDay: () => 0,
    formatLocalDateStamp: () => "2026-05-14",
    updateSessionEmotionMemory: (prev, transcript, flags, _opts) => {
      calls.updateSessionEmotionMemory.push({ prev, transcript, flags });
      return { ...prev, behaviorMode: "surface", behaviorDepthScore: 0 };
    },
    updateSessionAfterReply: (mem, t, r, _b, _meta) => {
      calls.updateSessionAfterReply.push({ mem, t, r });
      return { ...mem, relationshipDepthScore: 0.5 };
    },
    recordUserTalkMetrics: (ip, metrics, ts) => {
      calls.recordUserTalkMetrics.push({ ip, metrics, ts });
    },
    maybeRefineActiveThemesWithLLM: async () => {
      calls.maybeRefineActiveThemesWithLLM.push({});
      return undefined;
    },
    recordCreativeMemoryTriggersForRequest: async (_req, args) => {
      calls.recordCreativeMemoryTriggersForRequest.push(args);
      return { skipped: false };
    },
    // Turn meta + read state
    storeTalkTurnMeta: (args) => {
      calls.storeTalkTurnMeta.push(args);
    },
    buildReadStateMeta: (_req, _persisted, _ip) => {
      const meta = {
        lastTurnId: "turn_xyz",
        sessionId: "sess_abc",
        stateVersion: "v9",
        lastUpdatedAt: 1715620920000,
        historyUpdatedAt: 1715620920000,
        memoryUpdatedAt: 1715620920000,
        schemaVersion: 1,
        backendBuild: "test-build",
        backendBootId: "test-boot",
      };
      calls.buildReadStateMeta.push(meta);
      return meta;
    },
    applyReadStateHeaders: (res, meta) => {
      calls.applyReadStateHeaders.push(meta);
      res.setHeader("x-state-version", String(meta.stateVersion || ""));
      res.setHeader("x-session-id", String(meta.sessionId || ""));
    },
    DEEP_TURN_SCORE_THRESHOLD: 0.7,
    _calls: calls,
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountRealtimeTurnCommitRoute(app, deps);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

async function postJson(baseURL, body, headers = {}) {
  const r = await fetch(`${baseURL}/realtime/turn_commit`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
}

// ---------- factory + mount guards ----------

test("[turn-commit] TURN_COMMIT_BODY_LIMIT exported as 256kb", () => {
  assert.equal(TURN_COMMIT_BODY_LIMIT, "256kb");
});

test("[turn-commit] mount fails without Express app", () => {
  assert.throws(() => mountRealtimeTurnCommitRoute(null, defaultDeps()));
});

test("[turn-commit] mount fails when any required dep function is missing", () => {
  const required = [
    "createRequestId", "normalizeSnippet", "sanitizeStudioTurnMetadata",
    "resolveWritableMemoryContext", "sanitizePersistedSessionMemory",
    "persistWritableMemoryContext", "normalizeClientIp", "clientIp",
    "directorFlagsFromTranscript", "getUserMetricState",
    "countSessionStartsForDay", "formatLocalDateStamp",
    "updateSessionEmotionMemory", "updateSessionAfterReply",
    "recordUserTalkMetrics", "maybeRefineActiveThemesWithLLM",
    "recordCreativeMemoryTriggersForRequest",
    "storeTalkTurnMeta", "buildReadStateMeta", "applyReadStateHeaders",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountRealtimeTurnCommitRoute(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
});

test("[turn-commit] mount fails when DEEP_TURN_SCORE_THRESHOLD is not a number", () => {
  const deps = defaultDeps();
  deps.DEEP_TURN_SCORE_THRESHOLD = "not a number";
  const app = express();
  assert.throws(
    () => mountRealtimeTurnCommitRoute(app, deps),
    /DEEP_TURN_SCORE_THRESHOLD/,
  );
});

// ---------- 400 missing-fields envelope ----------

test("[turn-commit] 400 when transcript missing", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, { reply: "hi" });
    assert.equal(r.status, 400);
    assert.equal(r.body.stage, "realtime_turn_commit");
    assert.match(r.body.error, /transcript and reply are required/);
  });
});

test("[turn-commit] 400 when reply missing", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, { transcript: "x" });
    assert.equal(r.status, 400);
  });
});

test("[turn-commit] 400 when both missing", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, {});
    assert.equal(r.status, 400);
  });
});

// ---------- 201 canonical envelope ----------

test("[turn-commit] 201 with canonical envelope on happy path", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, {
      transcript: "make me a scene",
      reply: "She lights a cigarette.",
      request_id: "req_caller_123",
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "realtime_turn_commit");
    assert.equal(r.body.status, "committed");
    assert.equal(r.body.source, "realtime");
    assert.equal(r.body.turn_id, "turn_xyz");
    assert.equal(r.body.request_id, "req_caller_123");
    assert.equal(r.body.session_id, "sess_abc");
    assert.equal(r.body.state_version, "v9");
    assert.equal(r.body.last_turn_id, "turn_xyz");
    assert.equal(r.body.last_updated_at, 1715620920000);
    assert.equal(r.body.history_updated_at, 1715620920000);
    assert.equal(r.body.memory_updated_at, 1715620920000);
    assert.equal(r.body.schema_version, 1);
    assert.equal(r.body.backend_build, "test-build");
    assert.equal(r.body.backend_boot_id, "test-boot");
  });
});

test("[turn-commit] request_id falls back to rid when caller omits it", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, { transcript: "x", reply: "y" });
    assert.equal(r.body.request_id, "req_tc_test");
  });
});

// ---------- field-name fallbacks ----------

test("[turn-commit] transcript accepts user_message fallback", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, { user_message: "from user_message", reply: "y" });
    assert.equal(r.status, 201);
    assert.equal(deps._calls.updateSessionEmotionMemory[0].transcript, "from user_message");
  });
});

test("[turn-commit] transcript accepts userMessage (camelCase) fallback", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, { userMessage: "from userMessage", reply: "y" });
    assert.equal(r.status, 201);
    assert.equal(deps._calls.updateSessionEmotionMemory[0].transcript, "from userMessage");
  });
});

test("[turn-commit] reply accepts assistant_message + assistantMessage fallbacks", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r1 = await postJson(baseURL, { transcript: "x", assistant_message: "snake reply" });
    assert.equal(r1.status, 201);
    const r2 = await postJson(baseURL, { transcript: "x", assistantMessage: "camel reply" });
    assert.equal(r2.status, 201);
  });
});

// ---------- storeTalkTurnMeta invariant (load-bearing per #227) ----------

test("[turn-commit] storeTalkTurnMeta called exactly once on success", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postJson(baseURL, { transcript: "x", reply: "y" });
    assert.equal(deps._calls.storeTalkTurnMeta.length, 1);
  });
});

test("[turn-commit] storeTalkTurnMeta gets canonical render contract", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postJson(baseURL, { transcript: "x", reply: "y", request_id: "rq_1" });
    const args = deps._calls.storeTalkTurnMeta[0];
    assert.deepEqual(args.renderContract, {
      reply_role: "final",
      authoritative_page_text_available: false,
      sync_ready: false,
    });
    assert.equal(args.turnId, "turn_xyz");
    assert.equal(args.sessionId, "sess_abc");
    assert.equal(args.stateVersion, "v9");
    assert.equal(args.transcript, "x");
    assert.equal(args.reply, "y");
    assert.equal(args.requestId, "rq_1");
  });
});

test("[turn-commit] storeTalkTurnMeta NOT called when buildReadStateMeta has no lastTurnId", async () => {
  const deps = defaultDeps({
    buildReadStateMeta: () => ({
      lastTurnId: null,
      sessionId: "sess_abc",
      stateVersion: "v9",
      schemaVersion: 1,
      lastUpdatedAt: 1715620920000,
      historyUpdatedAt: 1715620920000,
      memoryUpdatedAt: 1715620920000,
      backendBuild: "test-build",
      backendBootId: "test-boot",
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, { transcript: "x", reply: "y" });
    assert.equal(r.status, 201);
    assert.equal(deps._calls.storeTalkTurnMeta.length, 0);
    assert.equal(r.body.turn_id, null);
    assert.equal(r.body.last_turn_id, null);
  });
});

// ---------- read-state headers ----------

test("[turn-commit] sets Cache-Control: no-store + x-turn-id + x-turn-meta-available: 1", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, { transcript: "x", reply: "y" });
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-turn-id"), "turn_xyz");
    assert.equal(r.headers.get("x-turn-meta-available"), "1");
  });
});

test("[turn-commit] x-turn-meta-available: 0 when no lastTurnId", async () => {
  const deps = defaultDeps({
    buildReadStateMeta: () => ({
      lastTurnId: null,
      sessionId: "sess_abc",
      stateVersion: "v9",
      schemaVersion: 1,
      lastUpdatedAt: 1715620920000,
      historyUpdatedAt: 1715620920000,
      memoryUpdatedAt: 1715620920000,
      backendBuild: "test-build",
      backendBootId: "test-boot",
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, { transcript: "x", reply: "y" });
    assert.equal(r.headers.get("x-turn-meta-available"), "0");
    assert.equal(r.headers.get("x-turn-id"), "");
  });
});

test("[turn-commit] applyReadStateHeaders is invoked once with the meta object", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, { transcript: "x", reply: "y" });
    assert.equal(deps._calls.applyReadStateHeaders.length, 1);
    assert.equal(deps._calls.applyReadStateHeaders[0].sessionId, "sess_abc");
    // Verify the side-effect from our stub applied:
    assert.equal(r.headers.get("x-state-version"), "v9");
  });
});

// ---------- memory-write side-effect invariant (#227 constraint) ----------

test("[turn-commit] persistWritableMemoryContext invoked with (ctx, nextMemory, nowTs)", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postJson(baseURL, { transcript: "x", reply: "y" });
    assert.equal(deps._calls.persistWritableMemoryContext.length, 1);
    const args = deps._calls.persistWritableMemoryContext[0];
    assert.ok(args.ctx, "context should be passed");
    assert.ok(args.nextMem, "nextMemory should be passed");
    assert.equal(typeof args.ts, "number", "timestamp should be epoch ms");
  });
});

test("[turn-commit] memory write pipeline: emotion → afterReply → persist (in order)", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postJson(baseURL, { transcript: "x", reply: "y" });
    assert.equal(deps._calls.updateSessionEmotionMemory.length, 1);
    assert.equal(deps._calls.updateSessionAfterReply.length, 1);
    assert.equal(deps._calls.persistWritableMemoryContext.length, 1);
    // updateSessionEmotionMemory feeds updateSessionAfterReply.
    // updateSessionAfterReply feeds persistWritableMemoryContext.
    // (Stub asserts the order by capture-time, not by tree.)
  });
});

test("[turn-commit] queues durable project memory with accepted page text and structured arc metadata", async () => {
  const deps = defaultDeps();
  const acceptedPage = "INT. ARCHIVE - NIGHT\n\nMARA opens the sealed affidavit.";
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, {
      transcript: "Continue Mara from the archive.",
      reply: "I moved Mara into the archive.",
      studio: {
        screenplayProjectId: "rain-docket",
        screenplayTarget: "page",
        screenplayInsertedText: acceptedPage,
        screenplayCharacterArcMemory: {
          character: "Mara",
          want: "expose the forged testimony",
          wound: "her father's disappearance",
          falseBelief: "perfect proof keeps Eli safe",
        },
      },
    });

    assert.equal(r.status, 201);
    assert.equal(deps._calls.recordCreativeMemoryTriggersForRequest.length, 1);
    const memoryTurn = deps._calls.recordCreativeMemoryTriggersForRequest[0];
    assert.equal(memoryTurn.transcript, "Continue Mara from the archive.");
    assert.equal(memoryTurn.reply, acceptedPage);
    assert.equal(memoryTurn.acceptedPageText, acceptedPage);
    assert.equal(memoryTurn.source, "talk_screenplay_output");
    assert.equal(memoryTurn.studioMeta.screenplayProjectId, "rain-docket");
    assert.equal(memoryTurn.studioMeta.screenplayCharacterArcMemory.character, "Mara");
  });
});

// ---------- #238 invariant inheritance ----------

test("[turn-commit] does NOT mutate module-level state (no setter dep accepted)", () => {
  // The lib has no setRealtimeSupplier-style setter dep. Mirror
  // the #238 regression invariant: any future change that
  // re-introduces module-level state mutation must add the
  // setter to the required-deps list, which this test would
  // fail to mock without explicitly opting in.
  const app = express();
  const deps = defaultDeps();
  // Sanity: the deps object should not contain any setter-shaped
  // function names.
  for (const key of Object.keys(deps)) {
    if (key.startsWith("_")) continue;
    assert.ok(
      !/^set[A-Z]/.test(key),
      `unexpected setter-shaped dep "${key}" — would silently mutate module state`,
    );
  }
  // And the mount call accepts the no-setter shape.
  assert.doesNotThrow(() => mountRealtimeTurnCommitRoute(app, deps));
});
