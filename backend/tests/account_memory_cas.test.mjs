import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createAccountMemoryCAS } from "../lib/account_memory_cas.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function persistence() {
  return createJsonPersistence({
    jsonRoot: fs.mkdtempSync(path.join(os.tmpdir(), "io-them-account-memory-cas-")),
  });
}

function sanitizeMemory(value) {
  return JSON.parse(JSON.stringify(value && typeof value === "object" ? value : {}));
}

test("account memory CAS creates and restores the canonical account row", async () => {
  const adapter = persistence();
  const cached = [];
  const store = createAccountMemoryCAS({
    persistence: adapter,
    sanitizeMemory,
    cacheMemory: async (entry) => cached.push(entry),
  });
  const cold = await store.read({
    userId: "writer-1",
    fallbackMemory: { story: "Mara waits." },
  });
  assert.equal(cold.record, null);
  assert.equal(cold.memory.story, "Mara waits.");

  const committed = await store.commit({
    userId: "writer-1",
    expectedRecord: cold.record,
    memory: { story: "Mara goes back." },
    now: 4_000,
    clientTokenAliases: ["iphone"],
  });
  assert.equal(committed.ok, true);
  assert.equal(committed.memory.lastUpdatedAt, 4_000);
  assert.equal(cached.length, 1);

  const restored = await store.read({ userId: "writer-1" });
  assert.equal(restored.memory.story, "Mara goes back.");
});

test("independent account stores preserve one winner and return it to the loser", async () => {
  const jsonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-account-memory-race-"));
  const iphone = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory,
  });
  const mac = createAccountMemoryCAS({
    persistence: createJsonPersistence({ jsonRoot }),
    sanitizeMemory,
  });
  const seed = await iphone.read({
    userId: "writer-2",
    fallbackMemory: { plan: "Choose a ferry." },
  });
  const first = await iphone.commit({
    userId: "writer-2",
    expectedRecord: seed.record,
    memory: seed.memory,
    now: 5_000,
  });
  assert.equal(first.ok, true);

  const [iphoneRead, macRead] = await Promise.all([
    iphone.read({ userId: "writer-2" }),
    mac.read({ userId: "writer-2" }),
  ]);
  const results = await Promise.all([
    iphone.commit({
      userId: "writer-2",
      expectedRecord: iphoneRead.record,
      memory: { plan: "Return for Eli." },
      now: 6_000,
    }),
    mac.commit({
      userId: "writer-2",
      expectedRecord: macRead.record,
      memory: { plan: "Follow June." },
      now: 6_001,
    }),
  ]);
  const winner = results.find((item) => item.ok);
  const stale = results.find((item) => !item.ok);
  assert.ok(winner);
  assert.equal(stale.status, "stale_memory_state_version");
  assert.equal(stale.memory.plan, winner.memory.plan);
});

test("account memory CAS keeps revisions monotonic during a repair commit", async () => {
  const adapter = persistence();
  const store = createAccountMemoryCAS({ persistence: adapter, sanitizeMemory });
  const seed = await store.read({ userId: "writer-3", fallbackMemory: {} });
  const first = await store.commit({
    userId: "writer-3",
    expectedRecord: seed.record,
    memory: { story: "First" },
    now: 8_000,
  });
  const repaired = await store.commit({
    userId: "writer-3",
    expectedRecord: first.record,
    memory: { story: "Repaired" },
    now: 7_000,
  });
  assert.equal(repaired.ok, true);
  assert.equal(repaired.record.updatedAt, 8_001);
  assert.equal(repaired.memory.lastUpdatedAt, 8_001);
});

test("a local cache failure cannot turn a durable CAS winner into an API failure", async () => {
  const adapter = persistence();
  const errors = [];
  const store = createAccountMemoryCAS({
    persistence: adapter,
    sanitizeMemory,
    cacheMemory: async () => {
      throw new Error("local mirror unavailable");
    },
    logger: { error: (line) => errors.push(line) },
  });
  const result = await store.commit({
    userId: "writer-4",
    memory: { story: "Durable" },
    now: 9_000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.cacheSynchronized, false);
  assert.match(errors[0], /local cache sync failed/i);
  const restored = await store.read({ userId: "writer-4" });
  assert.equal(restored.memory.story, "Durable");
});
