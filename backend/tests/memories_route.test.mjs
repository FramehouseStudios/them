// T-decompose-phase6-memories — integration tests for
// `mountMemoriesRoutes`. Covers all 6 routes + mount guards +
// #238 no-setter regression.
//
// Test strategy: stub all 31 fn deps + 2 constants so each
// route's response shape is pinned without spinning up the real
// memory store. The stubs return canonical fixtures matching
// what the live helpers produce in the happy path.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountMemoriesRoutes,
  MEMORIES_MUTATION_BODY_LIMIT,
} from "../lib/memories_route.js";

function defaultDeps(overrides = {}) {
  const calls = {
    selectMemoryRecordForRead: 0,
    resolveWritableMemoryContext: 0,
    persistWritableMemoryContext: 0,
    setPersistedUserMemoryForIp: 0,
    maybeBackfillThemesFromHistory: 0,
    updateMemoryCardInMemory: [],
    forgetMemoryCardInMemory: [],
    promoteMemoryCardToThemeInMemory: [],
    incrementThemeQualitySignal: [],
    logs: [],
  };
  const baseMemory = {
    assistantSelfName: "Clementine",
    userPrimaryName: "Ada",
    relationshipDepthScore: 0.5,
    behaviorMode: "surface",
    cycleIndex: 1,
    season: 1,
    seasonProgress: 0.2,
  };
  const baseReadMeta = {
    sessionId: "sess_abc",
    stateVersion: "v9",
    lastUpdatedAt: 1715620920000,
    historyUpdatedAt: 1715620920000,
    memoryUpdatedAt: 1715620920000,
    lastTurnId: "turn_xyz",
    schemaVersion: 1,
    backendBuild: "test-build",
    backendBootId: "test-boot",
    etag: "etag_v9",
  };
  return {
    parseQueryLimit: (v, def, max) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) return def;
      return Math.min(max, n);
    },
    createRequestId: () => "req_test",
    normalizeSnippet: (v, _max) => (typeof v === "string" ? v.trim() : ""),
    clampUnit: (v, def) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return def;
      return Math.max(0, Math.min(1, n));
    },
    selectMemoryRecordForRead: () => {
      calls.selectMemoryRecordForRead += 1;
      return { source: "ip", ip: "10.0.0.1", memory: baseMemory };
    },
    resolveWritableMemoryContext: () => {
      calls.resolveWritableMemoryContext += 1;
      return { memory: baseMemory, requesterIp: "10.0.0.1" };
    },
    sanitizePersistedSessionMemory: (m) => m || baseMemory,
    persistWritableMemoryContext: (_ctx, mem, _ts) => {
      calls.persistWritableMemoryContext += 1;
      return mem;
    },
    setPersistedUserMemoryForIp: () => {
      calls.setPersistedUserMemoryForIp += 1;
    },
    normalizeClientToken: (v) => String(v || "").trim(),
    buildReadStateMeta: () => baseReadMeta,
    applyReadStateHeaders: (res, meta) => {
      res.setHeader("x-state-version", String(meta.stateVersion || ""));
      res.setHeader("x-session-id", String(meta.sessionId || ""));
    },
    ifNoneMatchStateHit: () => false,
    buildConversationHistoryThreads: () => [
      { turn: 1, transcript: "hello", reply: "hi" },
      { turn: 2, transcript: "what's up", reply: "thinking" },
    ],
    buildMemoryCards: () => [
      { id: "card_1", key: "tone", title: "Warm", summary: "User likes warmth" },
    ],
    buildMemoryQualitySnapshot: () => ({
      hasMemory: true,
      counts: { characters: 0, charactersWithVoice: 0, charactersWithTraits: 0, toneSignals: 1, habitSignals: 0 },
      lastUpdatedMs: 1715620920000,
    }),
    maybeBackfillThemesFromHistory: () => {
      calls.maybeBackfillThemesFromHistory += 1;
      return { applied: false, created: 0, keys: [] };
    },
    buildTaskSnapshot: () => ({ tasks: [{ id: "t1", title: "Buy milk", status: "open" }] }),
    sanitizeActiveThemes: () => [],
    sanitizeRememberedPeople: () => [],
    formatLocalDateStamp: () => "2026-05-14",
    normalizeAssistantSelfName: (v) => String(v || "Clementine").trim(),
    getAssistantSelfNameForIp: () => "Clementine",
    normalizeUserPersonName: (v) => String(v || "Ada").trim(),
    normalizeMemoryCardId: (v) => String(v || "").trim(),
    updateMemoryCardInMemory: (mem, args, _ts) => {
      calls.updateMemoryCardInMemory.push(args);
      return { ok: true, status: "updated", cardId: args.cardId };
    },
    forgetMemoryCardInMemory: (mem, args, _ts) => {
      calls.forgetMemoryCardInMemory.push(args);
      return { ok: true, status: "forgotten", forgottenId: args.cardId, themeKey: args.key || "" };
    },
    promoteMemoryCardToThemeInMemory: (mem, args, _ts) => {
      calls.promoteMemoryCardToThemeInMemory.push(args);
      return { ok: true, status: "promoted", cardId: args.cardId, themeKey: args.key, created: 1 };
    },
    resolveThemeKeyFromMemoryCard: (cardId, key) => String(key || "").trim().toLowerCase() || cardId,
    normalizeMemoryQualitySignal: (v) => {
      const s = String(v || "").trim().toLowerCase();
      return ["hit", "correction"].includes(s) ? s : "none";
    },
    incrementThemeQualitySignal: (mem, themeKey, args) => {
      calls.incrementThemeQualitySignal.push({ themeKey, args });
      return { ok: true, status: args.signal };
    },
    logger: {
      log: (line) => calls.logs.push(String(line || "")),
    },
    TASKS_MAX_STORED: 200,
    USER_MEMORY_REMEMBERED_PEOPLE_MAX: 24,
    _calls: calls,
    ...overrides,
  };
}

async function withTestServer(deps, fn, { authenticated = true } = {}) {
  const app = express();
  if (authenticated) {
    app.use((req, _res, next) => {
      req.authUser = { id: "user_memories_test" };
      req.userId = "user_memories_test";
      next();
    });
  }
  mountMemoriesRoutes(app, deps);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((r) => server.close(r)); }
}

async function getJson(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
}

async function postJson(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
}

// ---------- exports + mount guards ----------

test("[memories] MEMORIES_MUTATION_BODY_LIMIT exported as 256kb", () => {
  assert.equal(MEMORIES_MUTATION_BODY_LIMIT, "256kb");
});

test("[memories] mount fails without Express app", () => {
  assert.throws(() => mountMemoriesRoutes(null, defaultDeps()));
});

test("[memories] mount fails when a required fn dep is missing", () => {
  // Spot-check a representative subset (full list = 31).
  const sample = [
    "parseQueryLimit", "selectMemoryRecordForRead", "resolveWritableMemoryContext",
    "persistWritableMemoryContext", "buildReadStateMeta", "buildMemoryCards",
    "updateMemoryCardInMemory", "forgetMemoryCardInMemory",
    "promoteMemoryCardToThemeInMemory", "incrementThemeQualitySignal",
  ];
  for (const key of sample) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(() => mountMemoriesRoutes(app, deps), new RegExp(key));
  }
});

test("[memories] mount fails when TASKS_MAX_STORED is not a number", () => {
  const deps = defaultDeps();
  deps.TASKS_MAX_STORED = "200";
  const app = express();
  assert.throws(() => mountMemoriesRoutes(app, deps), /TASKS_MAX_STORED/);
});

// ============== GET /memories ==============

test("[memories] GET /memories: full envelope on happy path", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await getJson(baseURL, "/memories");
    assert.equal(r.status, 200);
    assert.equal(r.body.source, "ip");
    assert.equal(r.body.source_ip, "10.0.0.1");
    assert.equal(r.body.assistant_name, "Clementine");
    assert.equal(r.body.session_id, "sess_abc");
    assert.equal(r.body.state_version, "v9");
    assert.equal(r.body.is_delta, false);
    assert.equal(r.body.delta_no_change, false);
    assert.ok(Array.isArray(r.body.memories));
    assert.equal(r.body.memories.length, 1);
    assert.ok(Array.isArray(r.body.conversation_samples));
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-state-version"), "v9");
  });
});

test("[memories] GET /memories requires authenticated user and does not read memory on spoofed header", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await fetch(`${baseURL}/memories`, {
      headers: { "X-User-Id": "spoofed-user" },
    });
    const body = await r.json();
    assert.equal(r.status, 401);
    assert.equal(body.error, "user_auth_required");
    assert.equal(deps._calls.selectMemoryRecordForRead, 0);
  }, { authenticated: false });
});

test("[memories] GET /memories?sinceVersion=v9 → delta-no-change envelope", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await getJson(baseURL, "/memories?sinceVersion=v9");
    assert.equal(r.status, 200);
    assert.equal(r.body.is_delta, true);
    assert.equal(r.body.delta_no_change, true);
    assert.deepEqual(r.body.memories, []);
    assert.deepEqual(r.body.conversation_samples, []);
  });
});

test("[memories] GET /memories with If-None-Match hit → 304 empty", async () => {
  const deps = defaultDeps({ ifNoneMatchStateHit: () => true });
  await withTestServer(deps, async (baseURL) => {
    const r = await fetch(`${baseURL}/memories`);
    assert.equal(r.status, 304);
  });
});

test("[memories] GET /memories: backfill side-effect fires when applied", async () => {
  const deps = defaultDeps({
    maybeBackfillThemesFromHistory: () => ({ applied: true, created: 1, keys: ["a"] }),
  });
  await withTestServer(deps, async (baseURL) => {
    await getJson(baseURL, "/memories");
    assert.equal(deps._calls.setPersistedUserMemoryForIp, 1);
  });
});

// ============== GET /memories/export ==============

test("[memories] GET /memories/export: export envelope with embedded JSON string", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await getJson(baseURL, "/memories/export");
    assert.equal(r.status, 200);
    assert.match(r.body.filename, /^clementine_memory_export_\d{8}_\d+\.json$/);
    assert.equal(typeof r.body.export_json, "string");
    assert.ok(r.body.export_json.endsWith("\n"), "export_json must end with newline");
    const inner = JSON.parse(r.body.export_json);
    assert.equal(inner.exported_at, r.body.exported_at);
    assert.equal(inner.session_id, r.body.session_id);
  });
});

// ============== POST /memories/update ==============

test("[memories] POST /memories/update: 200 with updated card on success", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/update", {
      card_id: "card_1",
      title: "New title",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "update");
    assert.equal(r.body.status, "updated");
    assert.ok(r.body.memory_card);
    assert.ok(deps._calls.logs.some((line) => line.includes("memories_update status=updated")));
  });
});

test("[memories] POST /memories/update requires authenticated user and does not resolve writable context", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/update", { card_id: "card_1" });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "user_auth_required");
    assert.equal(deps._calls.resolveWritableMemoryContext, 0);
  }, { authenticated: false });
});

test("[memories] POST /memories/update: 400 when mutation fails", async () => {
  const deps = defaultDeps({
    updateMemoryCardInMemory: () => ({ ok: false, status: "not_found", message: "card not found" }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/update", { card_id: "nope" });
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.status, "not_found");
  });
});

test("[memories] POST /memories/character-bible/update: records structured character correction", async () => {
  const recordCalls = [];
  const deps = defaultDeps({
    creativeMemoryStore: {
      recordCharacterMention: async (args) => {
        recordCalls.push(args);
        return { ok: true, action: "updated", characterName: args.characterName };
      },
      getCreativeMemoryForPrompt: async () => ({
        characters: [
          {
            name: "Mara",
            last_referenced: 1_800_000_000_000,
            bible: {
              canon: ["Mara is Eli's sister."],
              arc: { want: "expose the forged testimony" },
            },
          },
        ],
      }),
    },
    buildMemoryCards: (_memory, _threads, _limit, creativeMemory) => [
      {
        id: "character-mara",
        key: "character:Mara",
        title: "Mara Character Memory",
        summary: "Want: expose the forged testimony",
        source: "character_bible",
        character_bible: creativeMemory?.characters?.[0]?.bible ? {
          character: "Mara",
          arc: { want: "expose the forged testimony" },
        } : null,
      },
    ],
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/character-bible/update", {
      character_bible: {
        character: "Mara",
        canon: ["Mara is Eli's sister."],
        corrections: ["User corrected Mara's false belief."],
        corrected_terms: ["perfect proof can keep everyone safe"],
        correction_replacements: ["perfect proof can keep everyone safe -> truth will get Eli killed"],
        arc: {
          act: "Act II",
          want: "expose the forged testimony",
          false_belief: "truth will get Eli killed",
          next_emotional_turn: "public courage",
        },
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "character_bible_update");
    assert.equal(r.body.memory_card.id, "character-mara");
    assert.equal(recordCalls.length, 1);
    assert.equal(recordCalls[0].userId, "user_memories_test");
    assert.equal(recordCalls[0].characterName, "Mara");
    assert.equal(recordCalls[0].source, "memory_character_bible_edit");
    assert.deepEqual(recordCalls[0].characterBible.canon, ["Mara is Eli's sister."]);
    assert.deepEqual(recordCalls[0].characterBible.correctedTerms, ["perfect proof can keep everyone safe"]);
    assert.equal(recordCalls[0].characterBible.arc.falseBelief, "truth will get Eli killed");
    assert.equal(recordCalls[0].characterBible.arc.nextEmotionalTurn, "public courage");
  });
});

// ============== POST /memories/forget ==============

test("[memories] POST /memories/forget: returns forgotten_id + theme_key", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/memories/forget", {
      card_id: "card_1",
      key: "tone",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.action, "forget");
    assert.equal(r.body.status, "forgotten");
    assert.equal(r.body.forgotten_id, "card_1");
  });
});

// ============== POST /memories/promote ==============

test("[memories] POST /memories/promote: returns theme_key + memory_card", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/memories/promote", {
      card_id: "card_1",
      key: "growth",
      title: "Growth",
      summary: "User chasing growth",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.action, "promote");
    assert.equal(r.body.status, "promoted");
    assert.equal(r.body.theme_key, "growth");
  });
});

// ============== POST /memories/feedback ==============

test("[memories] POST /memories/feedback: 200 on valid signal + theme card", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/memories/feedback", {
      card_id: "card_1",
      key: "tone",
      signal: "hit",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "feedback");
    assert.equal(r.body.status, "hit");
  });
});

test("[memories] POST /memories/feedback: 400 when card is not a theme", async () => {
  const deps = defaultDeps({
    resolveThemeKeyFromMemoryCard: () => "",
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/feedback", {
      card_id: "card_1",
      signal: "hit",
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.status, "not_editable");
  });
});

test("[memories] POST /memories/feedback: 400 when signal is invalid", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/memories/feedback", {
      card_id: "card_1",
      key: "tone",
      signal: "wat",
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.status, "invalid_signal");
  });
});

// ============== persistence side-effect invariants ==============

test("[memories] all 4 mutation routes call persistWritableMemoryContext exactly once", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postJson(baseURL, "/memories/update", { card_id: "c", title: "t" });
    await postJson(baseURL, "/memories/forget", { card_id: "c" });
    await postJson(baseURL, "/memories/promote", { card_id: "c", key: "k", title: "t", summary: "s" });
    await postJson(baseURL, "/memories/feedback", { card_id: "c", key: "k", signal: "hit" });
    assert.equal(deps._calls.persistWritableMemoryContext, 4);
  });
});

// ============== #238 invariant inheritance ==============

test("[memories] lib does NOT accept any setter-shaped fn dep (except the inline-source setPersistedUserMemoryForIp which is a write, not a state-replacement setter)", () => {
  const deps = defaultDeps();
  // The one exception is `setPersistedUserMemoryForIp` — that's a
  // write to an existing accessor, not a new setRealtimeSupplier-
  // style state-replacement setter. The byte-identical inline
  // source calls this same accessor on the backfill path, so the
  // lib mirrors that.
  const setters = Object.keys(deps).filter((k) =>
    !k.startsWith("_") && /^set[A-Z]/.test(k),
  );
  assert.deepEqual(
    setters,
    ["setPersistedUserMemoryForIp"],
    "only setPersistedUserMemoryForIp is allowed (byte-identical inline-source write); any other setter would indicate new module-level state mutation",
  );
});
