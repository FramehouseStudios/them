import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createScaleBackplane } from "../lib/scale_backplane.mjs";
import { createJsonPersistence } from "../lib/persistence_json.js";
import { createTalkTurnStore } from "../lib/talk_turn_store.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "them-talk-result-"));
  const persistence = createJsonPersistence({ jsonRoot: path.join(root, "persistence") });
  return { root, persistence };
}

test("completed idempotency response survives a backplane restart byte-for-byte", async () => {
  const { root, persistence } = fixture();
  const key = "user:writer-a|stable-request";
  const body = Buffer.from([0, 1, 2, 127, 128, 254, 255]);
  const record = {
    key: "stable-request",
    sessionKey: "token:rotated-later",
    status: "completed",
    statusCode: 200,
    headers: { "content-type": "audio/mpeg", "x-turn-id": "turn-7" },
    body,
    createdAt: Date.now(),
    completedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  const first = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await first.init();
  await first.setIdempotency(key, record, 60_000, 160);
  await first.close();

  const restartedPersistence = createJsonPersistence({ jsonRoot: path.join(root, "persistence") });
  const restarted = await createScaleBackplane({
    persistence: restartedPersistence,
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await restarted.init();
  const recovered = await restarted.getIdempotency(key);
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.statusCode, 200);
  assert.deepEqual(recovered.headers, record.headers);
  assert.ok(Buffer.isBuffer(recovered.body));
  assert.deepEqual(recovered.body, body);
  await restarted.close();
});

test("expired idempotency response is deleted instead of replayed", async () => {
  const { root, persistence } = fixture();
  const key = "user:writer-a|expired";
  await persistence.put({
    domain: "talk_idempotency",
    key,
    value: {
      status: "completed",
      body: { encoding: "base64", data: Buffer.from("old").toString("base64") },
      createdAt: Date.now() - 120_000,
      expiresAt: Date.now() - 60_000,
    },
  });
  const backplane = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await backplane.init();
  assert.equal(await backplane.getIdempotency(key), null);
  assert.equal(await persistence.get({ domain: "talk_idempotency", key }), null);
  await backplane.close();
});

test("capacity admission preserves an unexpired accepted result", async () => {
  const { root, persistence } = fixture();
  const backplane = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await backplane.init();
  const now = Date.now();
  const acceptedKey = "user:writer-a|accepted-a";
  await backplane.setIdempotency(acceptedKey, {
    status: "completed",
    body: Buffer.from("accepted-a"),
    createdAt: now,
    completedAt: now,
    expiresAt: now + 60_000,
  }, 60_000, 1);

  await assert.rejects(
    backplane.setIdempotency("user:writer-a|pending-b", {
      status: "pending",
      createdAt: now + 1,
      expiresAt: now + 60_000,
    }, 60_000, 1),
    (err) => err?.code === "TALK_IDEMPOTENCY_CAPACITY"
  );
  assert.equal((await backplane.getIdempotency(acceptedKey))?.status, "completed");
  assert.equal(await backplane.getIdempotency("user:writer-a|pending-b"), null);
  await backplane.close();
});

test("expired capacity is pruned so a new request can be admitted", async () => {
  const { root, persistence } = fixture();
  const backplane = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await backplane.init();
  const now = Date.now();
  await backplane.setIdempotency("user:writer-a|expired-a", {
    status: "completed",
    body: Buffer.from("expired"),
    createdAt: now - 120_000,
    completedAt: now - 120_000,
    expiresAt: now - 60_000,
  }, 60_000, 1);
  await backplane.setIdempotency("user:writer-a|pending-b", {
    status: "pending",
    createdAt: now,
    expiresAt: now + 60_000,
  }, 60_000, 1);

  assert.equal(await backplane.getIdempotency("user:writer-a|expired-a"), null);
  assert.equal((await backplane.getIdempotency("user:writer-a|pending-b"))?.status, "pending");
  await backplane.close();
});

test("existing pending record can complete at capacity and retain exact replay bytes", async () => {
  const { root, persistence } = fixture();
  const key = "user:writer-a|same-key";
  const now = Date.now();
  const body = Buffer.from([255, 0, 19, 128, 42]);
  const first = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await first.init();
  await first.setIdempotency(key, {
    status: "pending",
    createdAt: now,
    expiresAt: now + 60_000,
  }, 60_000, 1);
  await first.setIdempotency(key, {
    status: "completed",
    statusCode: 200,
    headers: { "content-type": "audio/mpeg" },
    body,
    createdAt: now,
    completedAt: now + 1,
    expiresAt: now + 60_000,
  }, 60_000, 1);
  await first.close();

  const restarted = await createScaleBackplane({
    persistence: createJsonPersistence({ jsonRoot: path.join(root, "persistence") }),
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await restarted.init();
  const replay = await restarted.getIdempotency(key);
  assert.equal(replay?.status, "completed");
  assert.deepEqual(replay?.body, body);
  await restarted.close();
});

test("same-key pending admission is atomic across backplane instances", async () => {
  const { root, persistence } = fixture();
  const first = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox-a.json"),
    logger: { log() {} },
  });
  const second = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox-b.json"),
    logger: { log() {} },
  });
  await Promise.all([first.init(), second.init()]);
  const key = "user:writer-a|one-admission";
  const record = { status: "pending", createdAt: Date.now(), expiresAt: Date.now() + 60_000 };
  const results = await Promise.allSettled([
    first.setIdempotency(key, record, 60_000, 10),
    second.setIdempotency(key, record, 60_000, 10),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" &&
    result.reason?.code === "TALK_IDEMPOTENCY_CONFLICT").length, 1);
  assert.equal((await first.getIdempotency(key))?.status, "pending");
  await Promise.all([first.close(), second.close()]);
});

test("prepared transitions use CAS and unresolved billed bytes do not expire", async () => {
  const { root, persistence } = fixture();
  const key = "user:writer-a|prepared-cas";
  const backplane = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await backplane.init();
  const pending = { status: "pending", createdAt: 1, expiresAt: Date.now() + 60_000 };
  await backplane.setIdempotency(key, pending, 60_000, 10);
  const prepared = {
    ...pending,
    status: "prepared",
    body: Buffer.from("exact unresolved bytes"),
    settlement: { settlementKey: key, ownerId: "writer-a", lane: "page",
      settledMilliturns: 200, actualOutputTokens: 80 },
    preparedAt: Date.now(),
    expiresAt: 0,
  };
  await backplane.compareAndSetIdempotency(key, pending, prepared, 60_000);
  assert.deepEqual((await backplane.getIdempotency(key))?.body, prepared.body);
  await backplane.close();

  const restarted = await createScaleBackplane({
    persistence: createJsonPersistence({ jsonRoot: path.join(root, "persistence") }),
    outboxFilePath: path.join(root, "outbox-restarted.json"),
    logger: { log() {} },
  });
  await restarted.init();
  const recovered = await restarted.getIdempotency(key);
  assert.equal(recovered?.status, "prepared");
  assert.equal(recovered?.expiresAt, 0);
  assert.deepEqual(recovered?.body, prepared.body);
  await restarted.close();
});

test("a stale worker cannot overwrite a newly admitted generation", async () => {
  const { root, persistence } = fixture();
  const key = "user:writer-a|stale-worker";
  const backplane = await createScaleBackplane({
    persistence,
    outboxFilePath: path.join(root, "outbox.json"),
    logger: { log() {} },
  });
  await backplane.init();
  const stale = { status: "pending", createdAt: 1, expiresAt: Date.now() + 60_000 };
  await backplane.setIdempotency(key, stale, 60_000, 10);
  await backplane.deleteIdempotency(key);
  const current = { status: "pending", createdAt: 2, expiresAt: Date.now() + 60_000 };
  await backplane.setIdempotency(key, current, 60_000, 10);
  await assert.rejects(
    backplane.compareAndSetIdempotency(key, stale, {
      ...stale,
      status: "prepared",
      body: Buffer.from("stale result"),
      expiresAt: 0,
    }, 60_000),
    (error) => error?.code === "TALK_IDEMPOTENCY_CONFLICT"
  );
  assert.deepEqual(await backplane.getIdempotency(key), current);
  await backplane.close();
});

test("turn metadata hydrates after restart and is not published before persistence", async () => {
  const { root, persistence } = fixture();
  const store = createTalkTurnStore({ persistence, ttlMs: 60_000, maxEntries: 4 });
  await store.hydrate();
  const entry = {
    turnId: "turn-9",
    userId: "writer-a",
    sessionId: "token:one",
    transcript: "exact input",
    reply: "exact reply",
    screenplayOutput: { target: "page", text: "INT. ROOM - NIGHT\n\nExact page." },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.put(entry);

  const restartedPersistence = createJsonPersistence({ jsonRoot: path.join(root, "persistence") });
  const restarted = createTalkTurnStore({
    persistence: restartedPersistence,
    ttlMs: 60_000,
    maxEntries: 4,
  });
  const hydrated = await restarted.hydrate();
  assert.equal(hydrated.hydrated, 1);
  assert.deepEqual(restarted.get("turn-9"), entry);

  const failingPersistence = {
    ...restartedPersistence,
    async put() { throw new Error("disk unavailable"); },
  };
  const failing = createTalkTurnStore({ persistence: failingPersistence });
  await failing.hydrate();
  await assert.rejects(
    failing.put({ ...entry, turnId: "turn-not-saved" }),
    /disk unavailable/
  );
  assert.equal(failing.get("turn-not-saved"), null);
});
