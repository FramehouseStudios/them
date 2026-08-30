// Phase 6.1a — extraction-contract proof for the 3 route libs.
//
// Deterministic, no network: required-deps guards + Express
// router-stack registration (paths/methods registered, and the
// /outbox/retry route carries its own express.json parser layer —
// the "route needs its own parser" regression guard from the
// decomposition rules). Deep handler behavior is byte-identical
// (verbatim bodies from index.js) and is proven by the full backend
// `npm test` against the real app + real deps.

import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

import { mountOutboxRoutes } from "../lib/outbox_routes.js";
import { buildStateContinuityPayload, mountStateRoute } from "../lib/state_route.js";
import { mountDataRoutes } from "../lib/data_routes.js";

function routes(app) {
  // Express 4: app._router.stack holds the registered route layers.
  const router = app._router;
  const out = [];
  for (const layer of router.stack) {
    if (layer.route) {
      out.push({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
        handlerCount: layer.route.stack.length,
      });
    }
  }
  return out;
}
const find = (rs, p, m) => rs.find((r) => r.path === p && r.methods.includes(m));

const outboxDeps = {
  OUTBOX_WORKER_BATCH_SIZE: 25, createRequestId: () => "rid",
  parseQueryLimit: () => 50, processOutboxBatch: async () => ({}),
  processSingleOutboxItemById: async () => ({}), scaleBackplane: {},
};
const stateDeps = {
  applyReadStateHeaders: () => {}, buildConversationHistoryThreads: () => [],
  buildMemoryCards: () => [], buildReadStateMeta: () => ({}),
  maybeBackfillThemesFromHistory: () => {}, normalizeClientToken: (t) => t,
  parseQueryLimit: () => 50, parseTurnIdToNumber: () => 0,
  persistCanonicalWritableMemoryContext: async (_context, memory) => ({ ok: true, memory }),
  resolveCanonicalWritableMemoryContext: async () => ({ canonical: false }),
  sanitizePersistedSessionMemory: (m) => m, selectMemoryRecordForRead: () => ({}),
  setPersistedUserMemoryForIp: () => {},
};
const dataDeps = {
  applyReadStateHeaders: () => {}, buildReadStateMeta: () => ({}),
  clearAllMemoriesMemory: () => ({}), clearConversationHistoryMemory: () => ({}),
  createRequestId: () => "rid",
  persistCanonicalWritableMemoryContext: async (_context, memory) => ({ ok: true, memory }),
  creativeMemoryStore: { clearUserMemory: async () => ({ ok: true }) },
  resolveCanonicalWritableMemoryContext: async () => ({}),
};

test("[6.1a] required-deps guards throw on missing deps", () => {
  assert.throws(() => mountOutboxRoutes(express(), {}), /mountOutboxRoutes requires/);
  assert.throws(() => mountStateRoute(express(), {}), /mountStateRoute requires/);
  assert.throws(() => mountDataRoutes(express(), {}), /mountDataRoutes requires/);
  assert.throws(() => mountOutboxRoutes(express()), /requires/);
});

test("[6.1a] mountOutboxRoutes registers GET /outbox + POST /outbox/retry (with own json parser)", () => {
  const app = express();
  mountOutboxRoutes(app, outboxDeps);
  const rs = routes(app);
  assert.ok(find(rs, "/outbox", "get"), "GET /outbox registered");
  const retry = find(rs, "/outbox/retry", "post");
  assert.ok(retry, "POST /outbox/retry registered");
  // route-local express.json parser + handler => >= 2 handlers on the route
  assert.ok(retry.handlerCount >= 2, `/outbox/retry must carry its own parser (handlers=${retry.handlerCount})`);
});

test("[6.1a] mountStateRoute registers GET /state", () => {
  const app = express();
  mountStateRoute(app, stateDeps);
  assert.ok(find(routes(app), "/state", "get"), "GET /state registered");
});

test("[6.1a] state continuity helper reads user/project creative memory", async () => {
  const memory = {
    screenplayProjectMemory: [
      {
        projectId: "rain-docket",
        projectTitle: "Rain Docket",
        act: "Act II",
        featureSequence: "Act II - Midpoint",
        currentBeat: "Mara finds the sealed affidavit.",
        lastSceneOutcome: "The courthouse hallway turns unsafe.",
        characterFocus: ["Mara"],
      },
    ],
  };
  let requestedMemoryArgs = null;
  const snapshot = await buildStateContinuityPayload(
    { authUser: { id: "user-state-restore" } },
    memory,
    {
      creativeMemoryStore: {
        async getCreativeMemoryForPrompt(args) {
          requestedMemoryArgs = args;
          return {
            episodicMemories: [
              {
                projectId: "rain-docket",
                projectTitle: "Rain Docket",
                summary: "Mara hides the affidavit behind the courthouse vent.",
                excerpt: "The sealed affidavit becomes dangerous.",
                characterNames: ["Mara"],
                tags: ["screenplay"],
              },
            ],
          };
        },
      },
      buildSessionContinuitySnapshot: (_memory, creativeMemory) => ({
        has_continuity: true,
        source: creativeMemory?.episodicMemories?.length
          ? "screenplay_project_memory+creative_memory"
          : "screenplay_project_memory",
        opening_line: "Welcome back. We were in Rain Docket - Act II.",
        project_id: "rain-docket",
        project_title: "Rain Docket",
        act: "Act II",
        next_scene_plan: "Force the affidavit into public view.",
      }),
    }
  );

  assert.equal(requestedMemoryArgs.userId, "user-state-restore");
  assert.equal(requestedMemoryArgs.projectId, "rain-docket");
  assert.equal(requestedMemoryArgs.projectTitle, "Rain Docket");
  assert.match(requestedMemoryArgs.query, /Mara finds the sealed affidavit/);
  assert.equal(snapshot.has_continuity, true);
  assert.equal(snapshot.project_title, "Rain Docket");
  assert.equal(snapshot.next_scene_plan, "Force the affidavit into public view.");
});

test("[6.1a] state continuity helper forwards durable project continuity without legacy state", async () => {
  let requestedMemoryArgs = null;
  let receivedCreativeMemory = null;
  const snapshot = await buildStateContinuityPayload(
    { authUser: { id: "user-cold-restore" } },
    { screenplayProjectMemory: [] },
    {
      creativeMemoryStore: {
        async getCreativeMemoryForPrompt(args) {
          requestedMemoryArgs = args;
          return {
            projectContinuity: {
              projectId: "rain-docket",
              projectTitle: "Rain Docket",
              act: "Act II",
              currentBeat: "Eli catches Mara hiding the affidavit.",
              nextScenePlan: "Force Mara to choose between Eli and public truth.",
            },
          };
        },
      },
      buildSessionContinuitySnapshot: (_memory, creativeMemory) => {
        receivedCreativeMemory = creativeMemory;
        return {
          has_continuity: true,
          source: "creative_project_continuity",
          project_id: creativeMemory.projectContinuity.projectId,
          project_title: creativeMemory.projectContinuity.projectTitle,
          act: creativeMemory.projectContinuity.act,
          current_beat: creativeMemory.projectContinuity.currentBeat,
          next_scene_plan: creativeMemory.projectContinuity.nextScenePlan,
        };
      },
    }
  );

  assert.equal(requestedMemoryArgs.userId, "user-cold-restore");
  assert.equal(requestedMemoryArgs.projectId, "");
  assert.equal(requestedMemoryArgs.projectTitle, "");
  assert.match(requestedMemoryArgs.query, /continue screenplay session restore/);
  assert.equal(receivedCreativeMemory.projectContinuity.projectId, "rain-docket");
  assert.equal(snapshot.source, "creative_project_continuity");
  assert.equal(snapshot.project_title, "Rain Docket");
  assert.equal(snapshot.current_beat, "Eli catches Mara hiding the affidavit.");
});

test("[6.1a] mountDataRoutes registers POST /data/history/clear + /data/memories/clear", () => {
  const app = express();
  mountDataRoutes(app, dataDeps);
  const rs = routes(app);
  assert.ok(find(rs, "/data/history/clear", "post"), "POST /data/history/clear registered");
  assert.ok(find(rs, "/data/memories/clear", "post"), "POST /data/memories/clear registered");
});

test("[6.1a] libs add no module-level state / no setter exports (#238)", async () => {
  const ob = await import("../lib/outbox_routes.js");
  const st = await import("../lib/state_route.js");
  const dt = await import("../lib/data_routes.js");
  assert.deepEqual(Object.keys(ob), ["mountOutboxRoutes"]);
  assert.deepEqual(Object.keys(st), ["buildStateContinuityPayload", "mountStateRoute"]);
  assert.deepEqual(Object.keys(dt), ["mountDataRoutes"]);
});
