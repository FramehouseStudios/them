// T-creative-memory-delete-endpoint — unit + integration tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { mountCreativeMemoryDeleteRoute } from "../lib/creative_memory_delete_route.js";

function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-memdelete-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

// ---------- deleteMemoryForUser ----------

test("[memory-delete] deleteMemoryForUser removes a persisted record", async () => {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "u-1", characterName: "JUNE" });
  assert.equal(await store.hasMemoryForUser("u-1"), true);
  const r = await store.deleteMemoryForUser("u-1");
  assert.equal(r.ok, true);
  assert.equal(r.deleted, true);
  assert.equal(await store.hasMemoryForUser("u-1"), false);
});

test("[memory-delete] deleteMemoryForUser is idempotent on a missing record", async () => {
  const store = freshStore();
  const r = await store.deleteMemoryForUser("never-existed");
  assert.equal(r.ok, true);
  assert.equal(r.deleted, false);
});

test("[memory-delete] deleteMemoryForUser rejects empty/missing userId", async () => {
  const store = freshStore();
  assert.equal((await store.deleteMemoryForUser("")).ok, false);
  assert.equal((await store.deleteMemoryForUser(null)).ok, false);
  assert.equal((await store.deleteMemoryForUser(undefined)).ok, false);
});

test("[memory-delete] deleteMemoryForUser is scoped — other users untouched", async () => {
  const store = freshStore();
  await store.recordCharacterMention({ userId: "u-a", characterName: "JUNE" });
  await store.recordCharacterMention({ userId: "u-b", characterName: "MARCUS" });
  await store.deleteMemoryForUser("u-a");
  assert.equal(await store.hasMemoryForUser("u-a"), false);
  assert.equal(await store.hasMemoryForUser("u-b"), true);
});

// ---------- endpoint integration ----------

async function withTestServer(fn, { userId = "u-test" } = {}) {
  const store = freshStore();
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  }
  mountCreativeMemoryDeleteRoute(app, { creativeMemoryStore: store });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function del(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`, { method: "DELETE" });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[memory-delete] DELETE /memory/forget wipes the requesting user's record", async () => {
  await withTestServer(async ({ baseURL, store }) => {
    await store.recordCharacterMention({ userId: "u-test", characterName: "JUNE" });
    const r = await del(baseURL, "/memory/forget");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.deleted, true);
    assert.equal(r.body.userId, "u-test");
    assert.equal(await store.hasMemoryForUser("u-test"), false);
  });
});

test("[memory-delete] DELETE /memory/forget is idempotent on no record", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await del(baseURL, "/memory/forget");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.deleted, false);
  });
});

test("[memory-delete] DELETE /memory/forget unauthenticated returns 200 with deleted=false", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await del(baseURL, "/memory/forget");
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.deleted, false);
      assert.equal(r.body.reason, "missing_userId");
    },
    { userId: null },
  );
});

test("[memory-delete] response shape carries deletedAt timestamp", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await del(baseURL, "/memory/forget");
    assert.match(r.body.deletedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

test("[memory-delete] mountCreativeMemoryDeleteRoute requires creativeMemoryStore", () => {
  const app = express();
  assert.throws(() => mountCreativeMemoryDeleteRoute(app, {}));
});
