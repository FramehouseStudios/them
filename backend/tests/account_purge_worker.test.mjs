import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAccountPurgeWorker,
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
