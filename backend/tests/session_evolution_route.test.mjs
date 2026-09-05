import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createAccountMemoryCAS } from "../lib/account_memory_cas.js";
import { createAccountMemoryMutationCommitter } from "../lib/account_memory_turn_commit.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { mountSessionEvolutionRoute } from "../lib/session_evolution_route.js";

function sanitize(value) {
  return structuredClone(value || {});
}

function parseBoundedNumber(value, min, max, integer = false) {
  if (value == null || String(value).trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const bounded = Math.max(min, Math.min(max, parsed));
  return integer ? Math.round(bounded) : bounded;
}

function defaultMemory() {
  return {
    lastUpdatedAt: 100,
    relationshipDepthScore: 40,
    relationshipDepthPeak: 40,
    turnHistory: [{ turn: 1, content: "Mara enters the archive.", ts: 100 }],
    screenplayProjectMemory: [{
      projectId: "feature-1",
      projectTitle: "The Lost Reel",
      currentBeat: "Mara enters the archive.",
    }],
    evolutionSync: {
      stage: 1,
      preferredName: "June",
      affectionStyleHint: "casual",
    },
  };
}

function defaultDeps(overrides = {}) {
  const context = overrides.context || {
    authenticatedUserId: "writer-evolution",
    canonical: true,
    canonicalRecord: { revision: 1 },
    requesterIp: "auth:writer-evolution",
    memory: defaultMemory(),
    activeSession: { memory: defaultMemory() },
  };
  const calls = { reads: 0, writes: 0 };
  return {
    _calls: calls,
    _context: context,
    applyReadStateHeaders: (res, meta) => {
      res.setHeader("x-state-version", meta.stateVersion);
    },
    buildReadStateMeta: (_req, memory) => ({
      stateVersion: `v-${memory.lastUpdatedAt}`,
    }),
    clampUnit: (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
    },
    clientIp: () => "127.0.0.1",
    createCanonicalMemoryMutationCommitter: (candidateContext) => async (mutator, nowTs) => {
      calls.writes += 1;
      const next = sanitize(mutator(sanitize(candidateContext.memory)));
      next.lastUpdatedAt = nowTs;
      candidateContext.memory = next;
      if (candidateContext.activeSession) candidateContext.activeSession.memory = next;
      return next;
    },
    createRequestId: () => "evolution-test",
    normalizeAffectionStyle: (value, fallback) => String(value || fallback).trim().toLowerCase(),
    normalizeClientIp: (value) => String(value || "unknown"),
    normalizeReassuranceStyle: (value, fallback) => String(value || fallback).trim().toLowerCase(),
    normalizeSnippet: (value, max = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max),
    normalizeUserPersonName: (value) => String(value || "").trim().slice(0, 80),
    parseBool: (value) => ["1", "true", "yes"].includes(String(value).trim().toLowerCase()),
    parseBoundedFloat: (value, min, max) => parseBoundedNumber(value, min, max, false),
    parseBoundedInt: (value, min, max) => parseBoundedNumber(value, min, max, true),
    resolveCanonicalWritableMemoryContext: async () => {
      calls.reads += 1;
      return context;
    },
    sanitizePersistedSessionMemory: sanitize,
    logger: { log() {}, error() {} },
    RELATIONSHIP_DEPTH_MAX: 160,
    ...overrides,
  };
}

async function withServer(deps, fn) {
  const app = express();
  app.use((req, _res, next) => {
    req.authUser = { id: "writer-evolution" };
    next();
  });
  mountSessionEvolutionRoute(app, deps);
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

async function patchEvolution(baseURL, body) {
  const response = await fetch(`${baseURL}/session/evolution`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
  };
}

test("[session-evolution] mount guards required dependencies", () => {
  assert.throws(() => mountSessionEvolutionRoute(null, defaultDeps()), /Express app/);
  const deps = defaultDeps();
  delete deps.resolveCanonicalWritableMemoryContext;
  assert.throws(
    () => mountSessionEvolutionRoute(express(), deps),
    /resolveCanonicalWritableMemoryContext/,
  );
});

test("[session-evolution] applies the full evolution payload through canonical mutation", async () => {
  const deps = defaultDeps();
  await withServer(deps, async (baseURL) => {
    const response = await patchEvolution(baseURL, {
      stage: 3,
      depth_score: 7,
      romance_tension: 4,
      session_count: 12,
      reassurance_need: 0.6,
      boundary_need: 0.2,
      playful_momentum: 0.8,
      trust_signal: 0.9,
      last_theme_cue: "truth versus belonging",
      latest_user_message: "Mara chooses June over the reel.",
      reassurance_style_hint: "direct",
      affection_style_hint: "warm",
      support_intent_hint: "clarity_then_comfort",
      romance_depth_hint: 0.5,
      love_topic_active: true,
      is_screenwriter: true,
      preferred_name: "June Writer",
    });
    assert.equal(response.status, 204);
    assert.equal(response.body, null);
    assert.equal(deps._calls.reads, 1);
    assert.equal(deps._calls.writes, 1);
    assert.equal(deps._context.memory.userPrimaryName, "June Writer");
    assert.equal(deps._context.memory.isScreenwriter, true);
    assert.equal(deps._context.memory.evolutionSync.stage, 3);
    assert.equal(deps._context.memory.evolutionSync.preferredName, "June Writer");
    assert.equal(deps._context.memory.evolutionSync.supportIntentHint, "clarity_then_comfort");
    assert.equal(deps._context.memory.screenplayProjectMemory[0].projectId, "feature-1");
    assert.match(response.headers.get("x-state-version"), /^v-/);
  });
});

test("[session-evolution] fails closed when canonical memory cannot be read", async () => {
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => {
      throw new Error("database unavailable");
    },
  });
  await withServer(deps, async (baseURL) => {
    const response = await patchEvolution(baseURL, { preferred_name: "June" });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.body.stage, "session_evolution");
    assert.equal(response.body.error, "memory_read_failed");
  });
});

test("[session-evolution] fails closed when canonical mutation cannot commit", async () => {
  const deps = defaultDeps({
    createCanonicalMemoryMutationCommitter: () => async () => {
      throw new Error("contention");
    },
  });
  await withServer(deps, async (baseURL) => {
    const response = await patchEvolution(baseURL, { preferred_name: "June" });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.body.stage, "session_evolution");
    assert.equal(response.body.error, "memory_write_failed");
  });
});

test("[session-evolution] rebases preferences over a concurrent screenplay turn", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-evolution-race-"));
  const userId = "writer-evolution-race";
  const writerStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: sanitize,
  });
  const readerStore = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory: sanitize,
  });
  const initial = await writerStore.read({ userId, fallbackMemory: defaultMemory() });
  await writerStore.commit({
    userId,
    expectedRecord: initial.record,
    memory: initial.memory,
    now: 100,
  });
  let persistCalls = 0;
  const deps = defaultDeps({
    resolveCanonicalWritableMemoryContext: async () => {
      const canonical = await readerStore.read({ userId });
      return {
        authenticatedUserId: userId,
        canonical: true,
        canonicalRecord: canonical.record,
        requesterIp: `auth:${userId}`,
        memory: canonical.memory,
        activeSession: { memory: canonical.memory },
      };
    },
    createCanonicalMemoryMutationCommitter: (context) => createAccountMemoryMutationCommitter({
      context,
      sanitizeMemory: sanitize,
      persistMemory: async (candidateContext, memory, nowTs) => {
        persistCalls += 1;
        if (persistCalls === 1) {
          const competingRead = await writerStore.read({ userId });
          const competing = sanitize(competingRead.memory);
          competing.turnHistory.push({
            turn: 2,
            content: "Mara hears the projector on iPhone.",
            ts: nowTs + 1,
          });
          competing.screenplayProjectMemory[0].currentBeat = "The projector starts.";
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
    const response = await patchEvolution(baseURL, {
      preferred_name: "June Across Devices",
      is_screenwriter: true,
    });
    assert.equal(response.status, 204);
  });

  assert.equal(persistCalls, 2);
  const durable = await writerStore.read({ userId });
  assert.equal(durable.memory.userPrimaryName, "June Across Devices");
  assert.equal(durable.memory.isScreenwriter, true);
  assert.equal(durable.memory.turnHistory.at(-1).turn, 2);
  assert.equal(
    durable.memory.screenplayProjectMemory[0].currentBeat,
    "The projector starts.",
  );
});
