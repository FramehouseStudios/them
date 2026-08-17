// T-decompose-phase6-memories — integration tests for
// `mountMemoriesRoutes`. Covers all 6 routes + mount guards +
// #238 no-setter regression.
//
// Test strategy: stub all required fn deps + 2 constants so each
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
    resolveCanonicalWritableMemoryContext: 0,
    persistCanonicalWritableMemoryContext: 0,
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
    resolveCanonicalWritableMemoryContext: async () => {
      calls.resolveCanonicalWritableMemoryContext += 1;
      return {
        memory: baseMemory,
        requesterIp: "10.0.0.1",
        authenticatedUserId: "user_memories_test",
        canonical: true,
        canonicalRecord: { userId: "user_memories_test", memory: baseMemory },
      };
    },
    sanitizePersistedSessionMemory: (m) => m || baseMemory,
    persistCanonicalWritableMemoryContext: async (_ctx, mem, _ts) => {
      calls.persistCanonicalWritableMemoryContext += 1;
      return { ok: true, status: "committed", memory: mem };
    },
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

async function postJson(baseURL, path, body, headers = {}) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
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
  // Spot-check a representative subset of the dependency contract.
  const sample = [
    "parseQueryLimit", "selectMemoryRecordForRead",
    "resolveCanonicalWritableMemoryContext",
    "persistCanonicalWritableMemoryContext", "buildReadStateMeta", "buildMemoryCards",
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
    assert.match(r.body.creative_memory_revision, /^cm_[a-f0-9]{24}$/);
    assert.equal(
      r.headers.get("x-creative-memory-revision"),
      r.body.creative_memory_revision
    );
  });
});

test("[memories] GET /memories serves the canonical account row over a stale local mirror", async () => {
  const staleMemory = {
    assistantSelfName: "Old Clementine",
    userPrimaryName: "Old Name",
  };
  const canonicalMemory = {
    assistantSelfName: "Clementine",
    userPrimaryName: "Ada Canonical",
    relationshipDepthScore: 0.8,
    behaviorMode: "deepening",
    cycleIndex: 7,
    season: 2,
    seasonProgress: 0.4,
  };
  const deps = defaultDeps({
    selectMemoryRecordForRead: () => ({
      source: "ip",
      ip: "10.0.0.1",
      memory: staleMemory,
    }),
    resolveCanonicalWritableMemoryContext: async () => ({
      memory: canonicalMemory,
      requesterIp: "10.0.0.1",
      authenticatedUserId: "user_memories_test",
      canonical: true,
      canonicalRecord: {
        userId: "user_memories_test",
        memory: canonicalMemory,
      },
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await getJson(baseURL, "/memories");
    assert.equal(r.status, 200);
    assert.equal(r.body.assistant_name, "Clementine");
    assert.equal(r.body.user_name, "Ada Canonical");
    assert.equal(r.body.relationship_depth_score, 0.8);
    assert.equal(r.body.behavior_mode, "deepening");
  });
});

test("[memories] GET exposes project-scoped learned and corrected story preferences", async () => {
  const creativeMemoryStore = {
    getCreativeMemoryLedger: async () => ({
      projects: [{
        projectId: "newer-project",
        projectTitle: "Newer Project",
        updatedAt: 8_000,
        questionEffectiveness: [],
        storyMovePreferenceOverrides: [{
          family: "reversal_pressure",
          stance: "avoid",
          updatedAt: 8_000,
        }],
      }, {
        projectId: "split-ferries",
        projectTitle: "Split Ferries",
        updatedAt: 4_000,
        questionEffectiveness: [{
          questionId: "choice-1",
          targetField: "story.next_irreversible_choice",
          responseStatus: "answered",
          selectedMoveFamily: "reversal_pressure",
          offeredMoveFamilies: [
            "reversal_pressure",
            "relationship_pressure",
            "obstacle_pressure",
          ],
          acceptedPageCount: 1,
          blockResolutionCount: 1,
          recommendationOnly: true,
          answeredAt: 3_000,
        }, {
          questionId: "rescue-failed-1",
          targetField: "story.writer_block_rescue",
          responseStatus: "answered",
          selectedMoveFamily: "relationship_pressure",
          offeredMoveFamilies: [
            "relationship_pressure",
            "reversal_pressure",
            "obstacle_pressure",
          ],
          failedRescueCount: 1,
          recommendationOnly: true,
          answeredAt: 3_500,
        }],
        storyMovePreferenceOverrides: [{
          family: "relationship_pressure",
          stance: "prefer",
          updatedAt: 4_000,
        }],
      }],
    }),
  };
  await withTestServer(defaultDeps({ creativeMemoryStore }), async (baseURL) => {
    const r = await getJson(baseURL, "/memories");
    assert.equal(r.status, 200);
    const relationship = r.body.story_move_preferences.find(
      (item) => item.family === "relationship_pressure"
    );
    assert.equal(relationship.project_id, "split-ferries");
    assert.equal(relationship.display_name, "Relationship pressure");
    assert.equal(relationship.explicit_stance, "prefer");
    assert.ok(relationship.effective_score >= 10);
    const reversal = r.body.story_move_preferences.find(
      (item) => item.project_id === "split-ferries" && item.family === "reversal_pressure"
    );
    assert.equal(reversal.successful_rescue_count, 1);
    assert.equal(relationship.failed_rescue_count, 1);
    assert.equal(JSON.stringify(r.body.story_move_preferences).includes("Option"), false);

    const scoped = await getJson(
      baseURL,
      "/memories?story_preference_project_id=split-ferries"
    );
    assert.equal(scoped.status, 200);
    assert.deepEqual(
      [...new Set(scoped.body.story_move_preferences.map((item) => item.project_id))],
      ["split-ferries"]
    );
  });
});

test("[memories] POST story preference update is authenticated and returns refreshed profile", async () => {
  const calls = [];
  const canonicalMemory = {
    source: "canonical-account",
    lastUpdatedAt: 4_900,
  };
  const project = {
    projectId: "split-ferries",
    projectTitle: "Split Ferries",
    updatedAt: 5_000,
    questionEffectiveness: [],
    storyMovePreferenceOverrides: [{
      family: "relationship_pressure",
      stance: "avoid",
      updatedAt: 5_000,
    }],
  };
  const creativeMemoryStore = {
    updateStoryMovePreference: async (input) => {
      calls.push(input);
      return {
        ok: true,
        action: input.action,
        family: input.family,
        projectId: input.projectId,
        projectTitle: "Split Ferries",
        updatedAt: 5_000,
      };
    },
    getCreativeMemoryLedger: async () => ({ projects: [project] }),
  };
  const deps = defaultDeps({
    creativeMemoryStore,
    selectMemoryRecordForRead: () => {
      throw new Error("story preference update must not use local memory");
    },
    resolveCanonicalWritableMemoryContext: async () => ({
      memory: canonicalMemory,
      requesterIp: "authuser:user_memories_test",
      authenticatedUserId: "user_memories_test",
      canonical: true,
      canonicalRecord: { userId: "user_memories_test", memory: canonicalMemory },
    }),
    sanitizePersistedSessionMemory: (memory) => memory,
    buildReadStateMeta: (_req, memory) => {
      assert.equal(memory, canonicalMemory);
      return {
        sessionId: "sess_story_preferences",
        stateVersion: "state_story_preferences_42",
        lastUpdatedAt: memory.lastUpdatedAt,
        historyUpdatedAt: null,
        memoryUpdatedAt: memory.lastUpdatedAt,
        lastTurnId: "turn_story_preferences",
        schemaVersion: 1,
        backendBuild: "test-build",
        backendBootId: "test-boot",
      };
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/story-preferences/update", {
      project_id: "split-ferries",
      family: "relationship_pressure",
      action: "avoid",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.status, "avoid");
    assert.equal(r.body.story_move_preferences[0].explicit_stance, "avoid");
    assert.equal(r.body.state_version, "state_story_preferences_42");
    assert.equal(r.headers.get("x-state-version"), "state_story_preferences_42");
    assert.ok(r.body.memory_updated_at >= 5_000);
    assert.equal(calls[0].userId, "user_memories_test");
    assert.equal(calls[0].projectId, "split-ferries");
  });
});

test("[memories] story preference updates fail closed when canonical account memory is unavailable", async () => {
  let updateCalls = 0;
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => {
      throw new Error("account memory unavailable");
    },
    creativeMemoryStore: {
      updateStoryMovePreference: async () => {
        updateCalls += 1;
        return { ok: true };
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const response = await postJson(baseURL, "/memories/story-preferences/update", {
      project_id: "split-ferries",
      family: "relationship_pressure",
      action: "avoid",
    });
    assert.equal(response.status, 503);
    assert.equal(response.body.action, "story_move_preference");
    assert.equal(response.body.status, "memory_persistence_unavailable");
    assert.match(response.body.message, /No changes were applied/i);
  });
  assert.equal(updateCalls, 0);
});

test("[memories] rejects a stale cross-device story preference before writing", async () => {
  const calls = [];
  const creativeMemoryStore = {
    updateStoryMovePreference: async (input) => {
      calls.push(input);
      const error = new Error("Creative memory changed on another device.");
      error.code = "stale_creative_memory_revision";
      error.expectedRevision = input.expectedRevision;
      error.currentRevision = "cm_current_revision";
      throw error;
    },
  };
  await withTestServer(defaultDeps({ creativeMemoryStore }), async (baseURL) => {
    const r = await postJson(baseURL, "/memories/story-preferences/update", {
      project_id: "split-ferries",
      family: "relationship_pressure",
      action: "avoid",
      expected_creative_memory_revision: "cm_stale_revision",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_creative_memory_revision");
    assert.equal(r.body.expected_creative_memory_revision, "cm_stale_revision");
    assert.equal(r.body.current_creative_memory_revision, "cm_current_revision");
    assert.equal(r.headers.get("x-creative-memory-revision"), "cm_current_revision");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].expectedRevision, "cm_stale_revision");
  });
});

test("[memories] corrects an accepted story obligation for the authenticated project", async () => {
  const calls = [];
  const creativeMemoryStore = {
    correctStoryObligation: async (input) => {
      calls.push(input);
      return {
        ok: true,
        action: input.action,
        projectId: input.projectId,
        projectTitle: "Split Ferries",
        updatedAt: 6_000,
        correction: {
          id: "obligation_correction_1",
          obligation: input.obligation,
          action: input.action,
          correctedAt: 6_000,
        },
      };
    },
    getCreativeMemoryLedger: async () => ({
      projects: [{
        projectId: "split-ferries",
        storyObligationCorrections: [{
          id: "obligation_correction_1",
          obligation: "The cracked ferry token Mara gave June",
          action: "keep_open",
          correctedAt: 6_000,
        }],
      }],
    }),
  };
  await withTestServer(defaultDeps({ creativeMemoryStore }), async (baseURL) => {
    const response = await postJson(baseURL, "/memories/story-obligations/correct", {
      project_id: "split-ferries",
      obligation: "The cracked ferry token Mara gave June",
      action: "keep_open",
      note: "The return was only a false victory.",
      source_change_id: "obligation_1_1",
      source_status: "paid_off",
      expected_creative_memory_revision: "cm_current",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.action, "story_obligation_correction");
    assert.equal(response.body.status, "keep_open");
    assert.equal(response.body.story_obligation_correction.action, "keep_open");
    assert.equal(calls[0].userId, "user_memories_test");
    assert.equal(calls[0].projectId, "split-ferries");
    assert.equal(calls[0].expectedRevision, "cm_current");
  });
});

test("[memories] story obligation correction rejects stale cross-device memory", async () => {
  const creativeMemoryStore = {
    correctStoryObligation: async (input) => {
      const error = new Error("Creative memory changed on another device.");
      error.code = "stale_creative_memory_revision";
      error.expectedRevision = input.expectedRevision;
      error.currentRevision = "cm_newer";
      throw error;
    },
  };
  await withTestServer(defaultDeps({ creativeMemoryStore }), async (baseURL) => {
    const response = await postJson(baseURL, "/memories/story-obligations/correct", {
      project_id: "split-ferries",
      obligation: "The cracked ferry token Mara gave June",
      action: "retire",
      expected_creative_memory_revision: "cm_stale",
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.status, "stale_creative_memory_revision");
    assert.equal(response.body.current_creative_memory_revision, "cm_newer");
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
    assert.equal(deps._calls.persistCanonicalWritableMemoryContext, 1);
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

test("[memories] GET /memories/export serializes the canonical account row", async () => {
  const canonicalMemory = {
    assistantSelfName: "Clementine",
    userPrimaryName: "Ada Canonical",
    relationshipDepthScore: 0.8,
    behaviorMode: "deepening",
    cycleIndex: 7,
    season: 2,
    seasonProgress: 0.4,
  };
  const deps = defaultDeps({
    selectMemoryRecordForRead: () => ({
      source: "ip",
      ip: "10.0.0.1",
      memory: { userPrimaryName: "Old Name" },
    }),
    resolveCanonicalWritableMemoryContext: async () => ({
      memory: canonicalMemory,
      requesterIp: "10.0.0.1",
      authenticatedUserId: "user_memories_test",
      canonical: true,
      canonicalRecord: {
        userId: "user_memories_test",
        memory: canonicalMemory,
      },
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await getJson(baseURL, "/memories/export");
    assert.equal(r.status, 200);
    const exported = JSON.parse(r.body.export_json);
    assert.equal(exported.user_name, "Ada Canonical");
    assert.equal(exported.behavior_mode, "deepening");
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

test("[memories] POST /memories/update preserves a newer cross-device Story Spine", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/update", {
      card_id: "screenplay-project-split-ferries",
      story_spine: { next_scene_plan: "Mara returns for Eli." },
      expected_state_version: "v8",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_memory_state_version");
    assert.equal(r.body.expected_state_version, "v8");
    assert.equal(r.body.current_state_version, "v9");
    assert.equal(r.headers.get("x-state-version"), "v9");
    assert.match(r.body.message, /another device/i);
  });
  assert.equal(deps._calls.updateMemoryCardInMemory.length, 0);
});

test("[memories] POST /memories/update returns the durable winner when adapter CAS loses", async () => {
  const localMemory = { version: "v9", story: "Mara waits." };
  const winnerMemory = { version: "v10", story: "Mara goes back for Eli." };
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => ({
      memory: localMemory,
      requesterIp: "authuser:user_memories_test",
      authenticatedUserId: "user_memories_test",
      canonical: true,
      canonicalRecord: { memory: localMemory },
    }),
    persistCanonicalWritableMemoryContext: async () => ({
      ok: false,
      status: "stale_memory_state_version",
      memory: winnerMemory,
      record: { memory: winnerMemory },
    }),
    buildReadStateMeta: (_req, memory) => ({
      stateVersion: memory.version,
      sessionId: "sess_cas",
      schemaVersion: 1,
      backendBuild: "test-build",
      backendBootId: "test-boot",
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/update", {
      card_id: "screenplay-project-split-ferries",
      story_spine: { next_scene_plan: "Mara follows June." },
      expected_state_version: "v9",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_memory_state_version");
    assert.equal(r.body.current_state_version, "v10");
    assert.equal(r.headers.get("x-state-version"), "v10");
  });
});

test("[memories] POST /memories/update fails closed when canonical memory cannot be read", async () => {
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => {
      throw new Error("database unavailable");
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/update", {
      card_id: "screenplay-project-split-ferries",
      story_spine: { next_scene_plan: "Mara goes back." },
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.status, "memory_persistence_unavailable");
    assert.match(r.body.message, /No changes were applied/i);
  });
  assert.equal(deps._calls.updateMemoryCardInMemory.length, 0);
});

test("[memories] POST /memories/update fails closed when canonical memory cannot be committed", async () => {
  const deps = defaultDeps({
    persistCanonicalWritableMemoryContext: async () => {
      throw new Error("database unavailable");
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/update", {
      card_id: "screenplay-project-split-ferries",
      story_spine: { next_scene_plan: "Mara goes back." },
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.status, "memory_persistence_unavailable");
  });
  assert.equal(deps._calls.updateMemoryCardInMemory.length, 1);
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

test("[memories] POST /memories/character-bible/update: derives structured replacements from correction prose", async () => {
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
            },
          },
        ],
      }),
    },
    buildMemoryCards: () => [
      {
        id: "character-mara",
        key: "character:Mara",
        title: "Mara Character Memory",
        summary: "Mara is Eli's sister.",
        source: "character_bible",
      },
    ],
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/character-bible/update", {
      character_bible: {
        character: "Mara",
        corrections: ["Authoritative correction for Mara: Mara is Eli's sister, not his mother."],
      },
    });

    assert.equal(r.status, 200);
    assert.equal(recordCalls.length, 1);
    assert.deepEqual(recordCalls[0].characterBible.correctedTerms, ["mother"]);
    assert.deepEqual(recordCalls[0].characterBible.correctionReplacements, ["mother -> Eli's sister"]);
    assert.ok(recordCalls[0].characterBible.canon.includes("Authoritative correction for Mara: Mara is Eli's sister."));
  });
});

test("[memories] POST /memories/character-bible/update: repairs active Story Spine memory", async () => {
  const memory = {
    assistantSelfName: "Clementine",
    userPrimaryName: "Ada",
    relationshipDepthScore: 0.5,
    behaviorMode: "surface",
    cycleIndex: 1,
    season: 1,
    seasonProgress: 0.2,
    screenplayProjectMemory: [
      {
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        characterFocus: ["Mara"],
        currentBeat: "Mara thinks Eli's mother forged the testimony.",
        nextScenePlan: "Confront Eli's mother at the archive.",
        unresolvedStoryThreads: ["Mara still believes the mother is the hidden witness."],
        continuityNotes: [],
        correctedTerms: [],
        correctionReplacements: [],
        updatedAt: 1_800_000_000_000,
      },
    ],
    screenplayProjectMemoryUpdatedAt: 1_800_000_000_000,
  };
  let persistedMemory = null;
  const recordCalls = [];
  const repairCalls = [];
  const applyReplacement = (value, replacements) => {
    let out = String(value || "");
    for (const replacement of replacements || []) {
      const [from, to] = String(replacement || "").split(/\s*->\s*/);
      if (!from || !to) continue;
      out = out.replaceAll(from, to);
    }
    return out;
  };
  const deps = defaultDeps({
    selectMemoryRecordForRead: () => ({ source: "ip", ip: "10.0.0.1", memory }),
    resolveCanonicalWritableMemoryContext: async () => ({
      memory,
      requesterIp: "10.0.0.1",
      authenticatedUserId: "user_memories_test",
      canonical: true,
      canonicalRecord: { userId: "user_memories_test", memory },
    }),
    sanitizePersistedSessionMemory: (value) => value || memory,
    persistCanonicalWritableMemoryContext: async (_context, value) => {
      persistedMemory = JSON.parse(JSON.stringify(value));
      return { ok: true, status: "committed", memory: value };
    },
    creativeMemoryStore: {
      recordCharacterMention: async (args) => {
        recordCalls.push(args);
        return { ok: true, action: "updated", characterName: args.characterName };
      },
      getCreativeMemoryForPrompt: async () => ({
        characters: [
          {
            name: "Mara",
            last_referenced: 1_800_000_001_000,
            bible: {
              canon: ["Authoritative correction for Mara: Mara is Eli's sister."],
              corrections: ["Authoritative correction for Mara: Mara is Eli's sister, not his mother."],
              correctedTerms: ["mother"],
              correctionReplacements: ["mother -> Eli's sister"],
            },
          },
        ],
      }),
    },
    updateMemoryCardInMemory: (mem, args, nowTs) => {
      repairCalls.push(args);
      const project = mem.screenplayProjectMemory[0];
      const replacements = args.storySpine?.correctionReplacements || [];
      project.currentBeat = applyReplacement(project.currentBeat, replacements);
      project.nextScenePlan = applyReplacement(project.nextScenePlan, replacements);
      project.unresolvedStoryThreads = project.unresolvedStoryThreads.map((item) => (
        applyReplacement(item, replacements)
      ));
      project.characterFocus = Array.from(new Set([
        ...project.characterFocus,
        ...(args.storySpine?.characterFocus || []),
      ]));
      project.continuityNotes = [
        ...(args.storySpine?.continuityNotes || []),
        ...project.continuityNotes,
      ];
      project.correctedTerms = args.storySpine?.correctedTerms || [];
      project.correctionReplacements = replacements;
      project.updatedAt = nowTs;
      mem.screenplayProjectMemoryUpdatedAt = nowTs;
      return {
        ok: true,
        status: "updated",
        cardId: "screenplay-project-rain-docket",
        projectId: "rain-docket",
      };
    },
    buildMemoryCards: (currentMemory, _threads, _limit, creativeMemory) => [
      {
        id: "character-mara",
        key: "character:Mara",
        title: "Mara Character Memory",
        summary: "Mara is Eli's sister.",
        source: "character_bible",
        character_bible: creativeMemory?.characters?.[0]?.bible || null,
      },
      {
        id: "screenplay-project-rain-docket",
        key: "rain-docket",
        title: "Rain Docket",
        summary: currentMemory.screenplayProjectMemory[0].currentBeat,
        source: "screenplay_project",
        storySpine: currentMemory.screenplayProjectMemory[0],
      },
    ],
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/character-bible/update", {
      character_bible: {
        character: "Mara",
        corrections: ["Authoritative correction for Mara: Mara is Eli's sister, not his mother."],
      },
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.story_spine_repaired, true);
    assert.equal(r.body.story_spine_repair_count, 1);
    assert.deepEqual(r.body.story_spine_repaired_card_ids, ["screenplay-project-rain-docket"]);
    assert.equal(recordCalls.length, 1);
    assert.equal(repairCalls.length, 1);
    assert.deepEqual(repairCalls[0].storySpine.correctedTerms, ["mother"]);
    assert.deepEqual(repairCalls[0].storySpine.correctionReplacements, ["mother -> Eli's sister"]);
    assert.match(repairCalls[0].storySpine.continuityNotes[0], /Authoritative user correction for Mara/);
    assert.ok(persistedMemory, "Story Spine repair should persist session memory");
    assert.match(persistedMemory.screenplayProjectMemory[0].currentBeat, /Eli's sister/);
    assert.doesNotMatch(persistedMemory.screenplayProjectMemory[0].currentBeat, /\bmother\b/);
    assert.match(persistedMemory.screenplayProjectMemory[0].nextScenePlan, /Eli's sister/);
    assert.deepEqual(persistedMemory.screenplayProjectMemory[0].correctedTerms, ["mother"]);
  });
});

// ============== POST /memories/corrections/undo ==============

test("[memories] POST /memories/corrections/undo restores one authenticated correction receipt", async () => {
  const calls = [];
  const deps = defaultDeps({
    creativeMemoryStore: {
      undoCanonCorrection: async (args) => {
        calls.push(args);
        return {
          ok: true,
          status: "undone",
          receipt: {
            id: args.receiptId,
            status: "undone",
            projectId: "rain-docket",
            projectTitle: "Rain Docket",
            correctionText: "Actually, Mara never burns the affidavit.",
            matchedFacts: ["Mara burns the affidavit."],
            replacementFacts: ["Mara never burns the affidavit."],
            replacementFactIds: ["writer_canon_123"],
            structuredUpdates: ["unresolvedSetups: the affidavit survives"],
            correctionMemoryId: "episode-correction",
            createdAt: 1715620920000,
            undoneAt: 1715620980000,
          },
        };
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/undo", {
      receipt_id: "canon_correction_123",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "undo_correction");
    assert.equal(r.body.status, "undone");
    assert.equal(r.body.correction_receipt.id, "canon_correction_123");
    assert.deepEqual(r.body.correction_receipt.matched_facts, ["Mara burns the affidavit."]);
    assert.deepEqual(r.body.correction_receipt.replacement_facts, ["Mara never burns the affidavit."]);
    assert.deepEqual(r.body.correction_receipt.replacement_fact_ids, ["writer_canon_123"]);
    assert.deepEqual(r.body.correction_receipt.structured_updates, [
      "unresolvedSetups: the affidavit survives",
    ]);
  });
  assert.equal(deps._calls.resolveCanonicalWritableMemoryContext, 1);
  assert.deepEqual(calls, [{
    userId: "user_memories_test",
    receiptId: "canon_correction_123",
  }]);
});

test("[memories] correction responses report canonical account state metadata", async () => {
  const canonicalMemory = {
    screenplayProjectMemory: [{ projectId: "split-ferries", currentBeat: "Mara turns back." }],
    lastUpdatedAt: 1715620999000,
  };
  let metadataMemory = null;
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => ({
      memory: canonicalMemory,
      requesterIp: "authuser:user_memories_test",
      authenticatedUserId: "user_memories_test",
      canonical: true,
      canonicalRecord: { userId: "user_memories_test", memory: canonicalMemory },
    }),
    sanitizePersistedSessionMemory: (memory) => memory,
    buildReadStateMeta: (_req, memory) => {
      metadataMemory = memory;
      return {
        sessionId: "sess_canonical",
        stateVersion: "state_canonical_42",
        lastUpdatedAt: memory.lastUpdatedAt,
        historyUpdatedAt: null,
        memoryUpdatedAt: memory.lastUpdatedAt,
        lastTurnId: "turn_canonical",
        schemaVersion: 1,
        backendBuild: "test-build",
        backendBootId: "test-boot",
      };
    },
    creativeMemoryStore: {
      undoCanonCorrection: async () => ({ ok: true, status: "undone" }),
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const response = await postJson(baseURL, "/memories/corrections/undo", {
      receipt_id: "canon_correction_123",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.state_version, "state_canonical_42");
    assert.equal(response.body.session_id, "sess_canonical");
    assert.equal(response.headers.get("x-state-version"), "state_canonical_42");
  });
  assert.equal(metadataMemory, canonicalMemory);
});

test("[memories] correction mutations fail closed when canonical account memory is unavailable", async () => {
  const cases = [
    {
      path: "/memories/corrections/undo",
      body: { receipt_id: "canon_correction_123" },
      action: "undo_correction",
    },
    {
      path: "/memories/corrections/resolve",
      body: {
        ambiguity_id: "canon_ambiguity_123",
        selected_fact: "Mara abandons Eli at the east ferry dock.",
      },
      action: "resolve_correction",
    },
  ];
  for (const scenario of cases) {
    let mutationCalls = 0;
    const deps = defaultDeps({
      resolveCanonicalWritableMemoryContext: async () => {
        throw new Error("account memory unavailable");
      },
      creativeMemoryStore: {
        undoCanonCorrection: async () => {
          mutationCalls += 1;
          return { ok: true, status: "undone" };
        },
        resolveCanonCorrectionAmbiguity: async () => {
          mutationCalls += 1;
          return { ok: true, status: "resolved" };
        },
      },
    });
    await withTestServer(deps, async (baseURL) => {
      const response = await postJson(baseURL, scenario.path, scenario.body);
      assert.equal(response.status, 503);
      assert.equal(response.body.status, "memory_persistence_unavailable");
      assert.equal(response.body.action, scenario.action);
      assert.match(response.body.message, /No changes were applied/i);
    });
    assert.equal(mutationCalls, 0);
  }
});

test("[memories] POST /memories/corrections/undo refuses out-of-order project undo", async () => {
  const deps = defaultDeps({
    creativeMemoryStore: {
      undoCanonCorrection: async () => ({ ok: false, status: "newer_correction_exists" }),
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/undo", {
      receipt_id: "canon_correction_older",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "newer_correction_exists");
    assert.match(r.body.message, /newer correction/i);
  });
  assert.equal(deps._calls.resolveCanonicalWritableMemoryContext, 1);
});

test("[memories] POST /memories/corrections/undo rejects a stale device revision", async () => {
  const calls = [];
  const deps = defaultDeps({
    creativeMemoryStore: {
      undoCanonCorrection: async (input) => {
        calls.push(input);
        const error = new Error("Creative memory changed on another device.");
        error.code = "stale_creative_memory_revision";
        error.expectedRevision = input.expectedRevision;
        error.currentRevision = "cm_current_undo";
        throw error;
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/undo", {
      receipt_id: "canon_correction_123",
      expected_creative_memory_revision: "cm_stale_undo",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_creative_memory_revision");
    assert.equal(r.body.current_creative_memory_revision, "cm_current_undo");
    assert.equal(r.headers.get("x-creative-memory-revision"), "cm_current_undo");
  });
  assert.equal(calls[0].expectedRevision, "cm_stale_undo");
  assert.equal(deps._calls.resolveCanonicalWritableMemoryContext, 1);
});

test("[memories] POST /memories/corrections/undo requires authenticated user", async () => {
  let called = false;
  const deps = defaultDeps({
    creativeMemoryStore: {
      undoCanonCorrection: async () => {
        called = true;
        return { ok: true, status: "undone" };
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/undo", {
      receipt_id: "canon_correction_123",
    });
    assert.equal(r.status, 401);
  }, { authenticated: false });
  assert.equal(called, false);
  assert.equal(deps._calls.resolveCanonicalWritableMemoryContext, 0);
});

// ============== POST /memories/corrections/resolve ==============

test("[memories] POST /memories/corrections/resolve applies an authenticated writer choice", async () => {
  const calls = [];
  const deps = defaultDeps({
    creativeMemoryStore: {
      resolveCanonCorrectionAmbiguity: async (args) => {
        calls.push(args);
        return {
          ok: true,
          status: "resolved",
          ambiguity: {
            id: args.ambiguityId,
            status: "resolved",
            projectId: "split-ferries",
            projectTitle: "Split Ferries",
            correctionText: "Actually, Mara never abandons anyone at the ferry dock.",
            candidateFacts: [
              "Mara abandons Eli at the east ferry dock.",
              "Mara abandons June at the east ferry dock.",
            ],
            correctionMemoryId: "episode-ambiguous",
            selectedFact: args.selectedFacts[0],
            selectedFacts: args.selectedFacts,
            receiptId: "canon_correction_resolved",
            createdAt: 1715620920000,
            resolvedAt: 1715620980000,
          },
          receipt: {
            id: "canon_correction_resolved",
            status: "active",
            projectId: "split-ferries",
            projectTitle: "Split Ferries",
            correctionText: "Actually, Mara never abandons anyone at the ferry dock.",
            matchedFacts: args.selectedFacts,
            replacementFacts: ["Mara never abandons anyone at the ferry dock."],
            replacementFactIds: ["writer_canon_resolved"],
            structuredUpdates: ["Mara.falseBelief: abandonment is inevitable"],
            correctionMemoryId: "episode-resolution",
            createdAt: 1715620980000,
          },
        };
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/resolve", {
      ambiguity_id: "canon_ambiguity_123",
      selected_facts: [
        "Mara abandons Eli at the east ferry dock.",
        "Mara abandons June at the east ferry dock.",
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.action, "resolve_correction");
    assert.equal(r.body.correction_ambiguity.status, "resolved");
    assert.equal(r.body.correction_ambiguity.selected_fact, "Mara abandons Eli at the east ferry dock.");
    assert.deepEqual(r.body.correction_ambiguity.selected_facts, [
      "Mara abandons Eli at the east ferry dock.",
      "Mara abandons June at the east ferry dock.",
    ]);
    assert.equal(r.body.correction_receipt.id, "canon_correction_resolved");
    assert.deepEqual(r.body.correction_receipt.replacement_facts, [
      "Mara never abandons anyone at the ferry dock.",
    ]);
    assert.deepEqual(r.body.correction_receipt.replacement_fact_ids, ["writer_canon_resolved"]);
    assert.deepEqual(r.body.correction_receipt.structured_updates, [
      "Mara.falseBelief: abandonment is inevitable",
    ]);
  });
  assert.deepEqual(calls, [{
    userId: "user_memories_test",
    ambiguityId: "canon_ambiguity_123",
    selectedFacts: [
      "Mara abandons Eli at the east ferry dock.",
      "Mara abandons June at the east ferry dock.",
    ],
  }]);
  assert.equal(deps._calls.resolveCanonicalWritableMemoryContext, 1);
});

test("[memories] POST /memories/corrections/resolve preserves the legacy singular request", async () => {
  const calls = [];
  const deps = defaultDeps({
    creativeMemoryStore: {
      resolveCanonCorrectionAmbiguity: async (args) => {
        calls.push(args);
        return { ok: true, status: "already_resolved" };
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/resolve", {
      ambiguity_id: "canon_ambiguity_legacy",
      selected_fact: "Mara abandons Eli at the east ferry dock.",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "already_resolved");
  });
  assert.deepEqual(calls, [{
    userId: "user_memories_test",
    ambiguityId: "canon_ambiguity_legacy",
    selectedFacts: ["Mara abandons Eli at the east ferry dock."],
  }]);
});

test("[memories] POST /memories/corrections/resolve rejects a stale device revision", async () => {
  const calls = [];
  const deps = defaultDeps({
    creativeMemoryStore: {
      resolveCanonCorrectionAmbiguity: async (input) => {
        calls.push(input);
        const error = new Error("Creative memory changed on another device.");
        error.code = "stale_creative_memory_revision";
        error.expectedRevision = input.expectedRevision;
        error.currentRevision = "cm_current_resolution";
        throw error;
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/resolve", {
      ambiguity_id: "canon_ambiguity_123",
      selected_fact: "Mara abandons Eli at the east ferry dock.",
      expected_creative_memory_revision: "cm_stale_resolution",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_creative_memory_revision");
    assert.equal(r.body.current_creative_memory_revision, "cm_current_resolution");
  });
  assert.equal(calls[0].expectedRevision, "cm_stale_resolution");
  assert.equal(deps._calls.resolveCanonicalWritableMemoryContext, 1);
});

test("[memories] POST /memories/corrections/resolve rejects a stale accepted fact without syncing", async () => {
  const deps = defaultDeps({
    creativeMemoryStore: {
      resolveCanonCorrectionAmbiguity: async () => ({
        ok: false,
        status: "accepted_canon_fact_not_found",
      }),
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/resolve", {
      ambiguity_id: "canon_ambiguity_stale",
      selected_fact: "Mara abandons Eli at the east ferry dock.",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "accepted_canon_fact_not_found");
    assert.match(r.body.message, /stale/i);
  });
  assert.equal(deps._calls.resolveCanonicalWritableMemoryContext, 1);
});

test("[memories] POST /memories/corrections/resolve requires authenticated user", async () => {
  let called = false;
  const deps = defaultDeps({
    creativeMemoryStore: {
      resolveCanonCorrectionAmbiguity: async () => {
        called = true;
        return { ok: true, status: "resolved" };
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/corrections/resolve", {
      ambiguity_id: "canon_ambiguity_123",
      selected_fact: "Mara abandons Eli at the east ferry dock.",
    });
    assert.equal(r.status, 401);
  }, { authenticated: false });
  assert.equal(called, false);
  assert.equal(deps._calls.resolveCanonicalWritableMemoryContext, 0);
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

test("[memories] POST /memories/forget: deletes durable character memory before hiding its card", async () => {
  const events = [];
  await withTestServer(defaultDeps({
    creativeMemoryStore: {
      forgetMemoryCard: async ({ userId, key }) => {
        events.push(`durable:${userId}:${key}`);
        return { ok: true, forgotten: true };
      },
    },
    forgetMemoryCardInMemory: (_memory, args) => {
      events.push(`card:${args.cardId}`);
      return { ok: true, status: "forgotten", forgottenId: args.cardId, themeKey: args.key };
    },
  }), async (baseURL) => {
    const r = await postJson(baseURL, "/memories/forget", {
      card_id: "character-mara",
      key: "character:Mara",
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.durable_memory_deleted, true);
    assert.deepEqual(events, ["durable:user_memories_test:character:Mara", "card:character-mara"]);
  });
});

test("[memories] POST /memories/forget: forwards both revisions for durable deletion", async () => {
  const calls = [];
  await withTestServer(defaultDeps({
    creativeMemoryStore: {
      forgetMemoryCard: async (input) => {
        calls.push(input);
        return {
          ok: true,
          forgotten: true,
          creativeMemoryRevision: "cm_after_forget",
        };
      },
    },
  }), async (baseURL) => {
    const r = await postJson(baseURL, "/memories/forget", {
      card_id: "character-mara",
      key: "character:Mara",
      expected_state_version: "v9",
      expected_creative_memory_revision: "cm_before_forget",
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.creative_memory_revision, "cm_after_forget");
    assert.equal(r.headers.get("x-creative-memory-revision"), "cm_after_forget");
    assert.deepEqual(calls, [{
      userId: "user_memories_test",
      key: "character:Mara",
      expectedRevision: "cm_before_forget",
    }]);
  });
});

test("[memories] POST /memories/forget: rejects stale state before durable deletion", async () => {
  let durableForgetCalled = false;
  const deps = defaultDeps({
    creativeMemoryStore: {
      forgetMemoryCard: async () => {
        durableForgetCalled = true;
        return { ok: true, forgotten: true };
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/forget", {
      card_id: "character-mara",
      key: "character:Mara",
      expected_state_version: "v8",
    });

    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_memory_state_version");
    assert.equal(r.body.current_state_version, "v9");
  });
  assert.equal(durableForgetCalled, false);
  assert.equal(deps._calls.forgetMemoryCardInMemory.length, 0);
});

test("[memories] POST /memories/forget: returns typed creative conflict without hiding the card", async () => {
  const deps = defaultDeps({
    creativeMemoryStore: {
      forgetMemoryCard: async (input) => {
        const error = new Error("Creative memory changed on another device.");
        error.code = "stale_creative_memory_revision";
        error.expectedRevision = input.expectedRevision;
        error.currentRevision = "cm_current_forget";
        throw error;
      },
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/forget", {
      card_id: "character-mara",
      key: "character:Mara",
      expected_state_version: "v9",
      expected_creative_memory_revision: "cm_stale_forget",
    });

    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_creative_memory_revision");
    assert.equal(r.body.current_creative_memory_revision, "cm_current_forget");
  });
  assert.equal(deps._calls.forgetMemoryCardInMemory.length, 0);
});

test("[memories] POST /memories/forget: does not hide a durable card when deletion fails", async () => {
  let legacyForgetCalled = false;
  await withTestServer(defaultDeps({
    creativeMemoryStore: {
      forgetMemoryCard: async () => {
        throw new Error("persistence unavailable");
      },
    },
    forgetMemoryCardInMemory: () => {
      legacyForgetCalled = true;
      return { ok: true, status: "forgotten" };
    },
  }), async (baseURL) => {
    const r = await postJson(baseURL, "/memories/forget", {
      card_id: "episode-memory-1",
      key: "episode:memory-1",
    });

    assert.equal(r.status, 500);
    assert.equal(r.body.status, "creative_memory_forget_failed");
    assert.equal(legacyForgetCalled, false);
  });
});

test("[memories] POST /memories/forget repairs the visible card after a concurrent account write", async () => {
  let attempts = 0;
  const deps = defaultDeps({
    creativeMemoryStore: {
      forgetMemoryCard: async () => ({
        ok: true,
        forgotten: true,
        creativeMemoryRevision: "cm_after_forget",
      }),
    },
    persistCanonicalWritableMemoryContext: async (_context, memory) => {
      attempts += 1;
      if (attempts === 1) {
        const winnerMemory = { ...memory, concurrentTheme: "grief" };
        return {
          ok: false,
          status: "stale_memory_state_version",
          memory: winnerMemory,
          record: { memory: winnerMemory },
        };
      }
      return { ok: true, status: "committed", memory };
    },
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/forget", {
      card_id: "character-mara",
      key: "character:Mara",
      expected_state_version: "v9",
      expected_creative_memory_revision: "cm_before_forget",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.durable_memory_deleted, true);
    assert.equal(r.body.creative_memory_revision, "cm_after_forget");
  });
  assert.equal(attempts, 2);
  assert.equal(deps._calls.forgetMemoryCardInMemory.length, 2);
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

test("[memories] POST /memories/promote: preserves a newer cross-device theme state", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/promote", {
      card_id: "card_1",
      key: "growth",
      title: "Growth",
      expected_state_version: "v8",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_memory_state_version");
  });
  assert.equal(deps._calls.promoteMemoryCardToThemeInMemory.length, 0);
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

test("[memories] POST /memories/feedback: preserves newer cross-device quality feedback", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/memories/feedback", {
      card_id: "card_1",
      key: "tone",
      signal: "correction",
      expected_state_version: "v8",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "stale_memory_state_version");
  });
  assert.equal(deps._calls.incrementThemeQualitySignal.length, 0);
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

test("[memories] all 4 account card mutation routes persist canonical context exactly once", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    await postJson(baseURL, "/memories/update", { card_id: "c", title: "t" });
    await postJson(baseURL, "/memories/forget", { card_id: "c" });
    await postJson(baseURL, "/memories/promote", { card_id: "c", key: "k", title: "t", summary: "s" });
    await postJson(baseURL, "/memories/feedback", { card_id: "c", key: "k", signal: "hit" });
    assert.equal(deps._calls.persistCanonicalWritableMemoryContext, 4);
  });
});

// ============== #238 invariant inheritance ==============

test("[memories] lib does NOT accept setter-shaped function dependencies", () => {
  const deps = defaultDeps();
  const setters = Object.keys(deps).filter((k) =>
    !k.startsWith("_") && /^set[A-Z]/.test(k),
  );
  assert.deepEqual(setters, []);
});
