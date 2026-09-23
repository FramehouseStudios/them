// T-creative-memory-export — V1 core-only endpoint tests.
//
// Proves the reduced V1 contract: GET /memory/export returns ONLY the
// requesting user's own creative-memory core (creativeMemory /
// characters / habits), is user-scoped, returns empty when
// unauthenticated, and does NOT expose any projectIds-derived data
// (loglineHistory / acceptedTwists) — the IDOR-prone expansion was
// removed for V1 (see
// tasks/_proposals/T-creative-memory-export-projectids-ownership.md).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { mountCreativeMemoryExportRoute } from "../lib/creative_memory_export_route.js";
import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-mem-export-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

async function withServer(fn, { userId = "u-export", store } = {}) {
  const creativeMemoryStore = store || freshStore();
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  }
  mountCreativeMemoryExportRoute(app, { creativeMemoryStore });
  const server = listenEphemeral(app);
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try {
    return await fn({ port, creativeMemoryStore });
  } finally {
    server.close();
  }
}

async function getExport(port, query = "") {
  const res = await fetch(`http://127.0.0.1:${port}/memory/export${query}`);
  const body = await res.json();
  return { status: res.status, body, headers: res.headers };
}

const CORE_KEYS = ["schemaVersion", "exportedAt", "userId", "creativeMemory", "characters", "habits"];

test("[memory-export] required-deps guard", () => {
  const app = express();
  assert.throws(() => mountCreativeMemoryExportRoute(app, {}), /requires a creativeMemoryStore/);
  assert.throws(() => mountCreativeMemoryExportRoute(null, { creativeMemoryStore: {} }), /requires an Express app/);
});

test("[memory-export] V1 contract: response has ONLY core keys, no projectIds-derived data", async () => {
  await withServer(async ({ port }) => {
    const { status, body, headers } = await getExport(port);
    assert.equal(status, 200);
    assert.equal(headers.get("cache-control"), "no-store");
    assert.deepEqual(Object.keys(body).sort(), [...CORE_KEYS].sort());
    assert.equal("loglineHistory" in body, false, "loglineHistory must NOT be present in V1 export");
    assert.equal("acceptedTwists" in body, false, "acceptedTwists must NOT be present in V1 export");
    assert.equal(body.schemaVersion, 2);
  });
});

test("[memory-export] ?projectIds= query is ignored (no project-linked data returned)", async () => {
  await withServer(async ({ port }) => {
    const plain = await getExport(port, "");
    const withIds = await getExport(port, "?projectIds=p1,p2,foreign-project");
    // identical core-only shape; the query param changes nothing
    assert.deepEqual(Object.keys(withIds.body).sort(), Object.keys(plain.body).sort());
    assert.equal("loglineHistory" in withIds.body, false);
    assert.equal("acceptedTwists" in withIds.body, false);
  });
});

test("[memory-export] unauthenticated returns an empty record (no data leak)", async () => {
  await withServer(async ({ port }) => {
    const { status, body } = await getExport(port);
    assert.equal(status, 200);
    assert.equal(body.userId, null);
    assert.equal(body.creativeMemory, null);
    assert.deepEqual(body.characters, []);
    assert.equal(body.habits, null);
    assert.equal("loglineHistory" in body, false);
  }, { userId: null });
});

test("[memory-export] returns the authenticated user's own persisted memory + characters", async () => {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "alice", characterName: "MARLO", source: "test" });
  await withServer(async ({ port }) => {
    const { status, body } = await getExport(port);
    assert.equal(status, 200);
    assert.equal(body.userId, "alice");
    assert.ok(body.creativeMemory !== undefined);
    assert.ok(Array.isArray(body.characters));
  }, { userId: "alice", store });
});

test("[memory-export] is user-scoped: user A's export never contains user B's data", async () => {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "alice", characterName: "ALICE_ONLY_CHAR", source: "test" });
  await store.recordCharacterMention({ userId: "bob", characterName: "BOB_SECRET_CHAR", source: "test" });
  await withServer(async ({ port }) => {
    const { body } = await getExport(port);
    assert.equal(body.userId, "alice");
    const blob = JSON.stringify(body);
    assert.ok(!blob.includes("BOB_SECRET_CHAR"), "user A export leaked user B character data");
  }, { userId: "alice", store });
});

test("[memory-export] exportedAt is an ISO-8601 timestamp", async () => {
  await withServer(async ({ port }) => {
    const { body } = await getExport(port);
    assert.match(body.exportedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(Number.isNaN(Date.parse(body.exportedAt)), false);
  });
});
