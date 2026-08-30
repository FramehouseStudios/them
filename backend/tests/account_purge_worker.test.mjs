import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAccountPurgeWorker,
  listPersistenceRowsPaginated,
  purgePersistenceRowsForUser,
} from "../lib/account_purge_worker.js";

test("[account-purge] persistence purge deletes only rows owned by the target user", async () => {
  const rows = new Map([
    ["creative_memory", new Map([
      ["writer-a", { userId: "writer-a" }],
      ["writer-b", { userId: "writer-b" }],
    ])],
    ["screenplay", new Map([
      ["writer-a:project-1", { ownerUserId: "writer-a" }],
      ["writer-b:project-2", { ownerUserId: "writer-b" }],
    ])],
  ]);
  const persistence = {
    list: async ({ domain }) => [...rows.get(domain).entries()].map(([key, value]) => ({ key, value })),
    delete: async ({ domain, key }) => rows.get(domain).delete(key),
  };

  const result = await purgePersistenceRowsForUser({
    persistence,
    userId: "writer-a",
    domains: ["creative_memory", "screenplay"],
    rowBelongsToUser: (row, userId) => (
      row.key.startsWith(`${userId}:`) || row.value.userId === userId
    ),
  });

  assert.equal(result.deletedRows, 2);
  assert.deepEqual([...rows.get("creative_memory").keys()], ["writer-b"]);
  assert.deepEqual([...rows.get("screenplay").keys()], ["writer-b:project-2"]);
});

test("[account-export] paginated listing includes owned rows beyond the first page", async () => {
  const sourceRows = [
    { key: "a", value: { userId: "writer-a" } },
    { key: "b", value: { userId: "writer-b" } },
    { key: "c", value: { userId: "writer-a" } },
    { key: "d", value: { userId: "writer-b" } },
    { key: "e", value: { userId: "writer-a" } },
  ];
  const cursors = [];
  const persistence = {
    async list({ afterKey, limit }) {
      cursors.push(afterKey);
      return sourceRows
        .filter((row) => !afterKey || row.key > afterKey)
        .slice(0, limit);
    },
  };

  const rows = await listPersistenceRowsPaginated({
    persistence,
    domain: "screenplay",
    pageLimit: 2,
    includeRow: (row) => row.value.userId === "writer-a",
  });

  assert.deepEqual(rows.map((row) => row.key), ["a", "c", "e"]);
  assert.deepEqual(cursors, ["", "b", "d"]);
});

test("[account-purge] persistence purge deletes owned rows beyond the first page", async () => {
  const domainRows = new Map([
    ["a", { userId: "writer-a" }],
    ["b", { userId: "writer-b" }],
    ["c", { userId: "writer-a" }],
    ["d", { userId: "writer-b" }],
    ["e", { userId: "writer-a" }],
  ]);
  const cursors = [];
  const persistence = {
    async list({ afterKey, limit }) {
      cursors.push(afterKey);
      return [...domainRows.entries()]
        .filter(([key]) => !afterKey || key > afterKey)
        .slice(0, limit)
        .map(([key, value]) => ({ key, value }));
    },
    async delete({ key }) {
      domainRows.delete(key);
    },
  };

  const result = await purgePersistenceRowsForUser({
    persistence,
    userId: "writer-a",
    domains: ["screenplay"],
    pageLimit: 2,
    rowBelongsToUser: (row, userId) => row.value.userId === userId,
  });

  assert.deepEqual(result, {
    deletedRows: 3,
    deletedByDomain: { screenplay: 3 },
  });
  assert.deepEqual([...domainRows.keys()], ["b", "d"]);
  assert.deepEqual(cursors, ["", "b", "d", "", "d"]);
});

test("[account-purge] repeated pagination pages fail closed before deleting rows", async () => {
  let deleteCalls = 0;
  const persistence = {
    async list() {
      return [
        { key: "a", value: { userId: "writer-a" } },
        { key: "b", value: { userId: "writer-a" } },
      ];
    },
    async delete() {
      deleteCalls += 1;
    },
  };

  await assert.rejects(
    purgePersistenceRowsForUser({
      persistence,
      userId: "writer-a",
      domains: ["screenplay"],
      pageLimit: 2,
      rowBelongsToUser: () => true,
    }),
    /repeated key/
  );
  assert.equal(deleteCalls, 0);
});

test("[account-purge] repeats a domain sweep when a row arrives after the first scan", async () => {
  const rows = new Map([["first", { userId: "writer-a" }]]);
  let listCalls = 0;
  const persistence = {
    async list() {
      listCalls += 1;
      const snapshot = [...rows].map(([key, value]) => ({ key, value }));
      if (listCalls === 1) rows.set("second", { userId: "writer-a" });
      return snapshot;
    },
    async delete({ key }) {
      rows.delete(key);
    },
  };

  const result = await purgePersistenceRowsForUser({
    persistence,
    userId: "writer-a",
    domains: ["creative_memory"],
    rowBelongsToUser: (row, userId) => row.value.userId === userId,
  });

  assert.equal(result.deletedRows, 2);
  assert.equal(listCalls, 3);
  assert.equal(rows.size, 0);
});

test("[account-purge] finalizes only accounts whose data purge succeeds", async () => {
  const purged = [];
  const finalized = [];
  const errors = [];
  const worker = createAccountPurgeWorker({
    lifecycleStore: {
      listDueForHardDelete: async () => ["writer-a", "writer-b"],
      finalizeHardDelete: async (userId) => finalized.push(userId),
    },
    purgeUserData: async (userId) => {
      purged.push(userId);
      if (userId === "writer-b") throw new Error("database unavailable");
    },
    logger: { error: (message) => errors.push(message) },
  });

  const summary = await worker.runOnce();

  assert.deepEqual(purged, ["writer-a", "writer-b"]);
  assert.deepEqual(finalized, ["writer-a"]);
  assert.deepEqual(summary, {
    due: 2,
    purged: 1,
    failed: 1,
    userIds: ["writer-a"],
  });
  assert.match(errors[0], /writer-b/);
});

test("[account-purge] concurrent ticks share one active sweep", async () => {
  let listCalls = 0;
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  const worker = createAccountPurgeWorker({
    lifecycleStore: {
      listDueForHardDelete: async () => {
        listCalls += 1;
        await blocker;
        return [];
      },
      finalizeHardDelete: async () => {},
    },
    purgeUserData: async () => {},
  });

  const first = worker.runOnce();
  const second = worker.runOnce();
  release();
  assert.deepEqual(await first, await second);
  assert.equal(listCalls, 1);
});
