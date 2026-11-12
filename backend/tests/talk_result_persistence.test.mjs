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


for (const snapshotMethod of ["get", "list"]) {
  for (const status of ["prepared", "completed"]) {
    test(`expiry custody: stale ${snapshotMethod} cleanup preserves ${status} replay`, async (t) => {
      const { root, persistence } = fixture();
      const key = "user:writer-a|expiry-race";
      const expired = {
        status: status === "prepared" ? "pending" : "completed",
        createdAt: 1,
        expiresAt: Date.now() - 1,
        ...(status === "completed" ? { body: Buffer.from([0, 255, 128, 19]) } : {}),
      };
      const accepted = {
        ...expired,
        status,
        body: Buffer.from([255, 0, 128, 42, 254]),
        expiresAt: status === "prepared" ? 0 : Date.now() + 60_000,
      };
      const writer = await createScaleBackplane({
        persistence,
        outboxFilePath: path.join(root, "writer-outbox.json"),
        logger: { log() {} },
      });
      let interleave = false;
      const reader = await createScaleBackplane({
        persistence: {
          ...persistence,
          async [snapshotMethod](input) {
            const snapshot = await persistence[snapshotMethod](input);
            if (interleave && input.domain === "talk_idempotency") {
              interleave = false;
              await writer.compareAndSetIdempotency(key, expired, accepted, 60_000);
            }
            return snapshot;
          },
        },
        outboxFilePath: path.join(root, "reader-outbox.json"),
        logger: { log() {} },
      });
      t.after(async () => {
        await Promise.all([reader.close(), writer.close()]);
        fs.rmSync(root, { recursive: true, force: true });
      });
      await Promise.all([reader.init(), writer.init()]);
      await writer.setIdempotency(key, expired, 60_000, 1);
      interleave = true;

      if (snapshotMethod === "get") {
        assert.deepEqual(await reader.getIdempotency(key), accepted);
      } else {
        await assert.rejects(
          reader.setIdempotency("user:writer-a|new-admission", {
            status: "pending", createdAt: 2, expiresAt: Date.now() + 60_000,
          }, 60_000, 1),
          (error) => error?.code === "TALK_IDEMPOTENCY_CAPACITY"
        );
        assert.equal(await reader.getIdempotency("user:writer-a|new-admission"), null);
      }
      const restarted = await createScaleBackplane({
        persistence: createJsonPersistence({ jsonRoot: path.join(root, "persistence") }),
        outboxFilePath: path.join(root, "restarted-outbox.json"),
        logger: { log() {} },
      });
      assert.deepEqual(await restarted.getIdempotency(key), accepted);
      await restarted.close();
    });
  }
}

for (const operation of ["read", "admission"]) {
  test(`expiry custody: ${operation} retains records without atomic deletion support`, async (t) => {
    const { root, persistence } = fixture();
    const key = "user:writer-a|legacy-expired";
    const expired = { status: "completed", body: { encoding: "base64", data: "/wCA" },
      createdAt: 1, expiresAt: Date.now() - 1 };
    await persistence.put({ domain: "talk_idempotency", key, value: expired });
    const backplane = await createScaleBackplane({
      persistence: { ...persistence, compareAndDelete: undefined },
      outboxFilePath: path.join(root, "outbox.json"),
      logger: { log() {} },
    });
    t.after(async () => {
      await backplane.close();
      fs.rmSync(root, { recursive: true, force: true });
    });
    await backplane.init();
    if (operation === "read") {
      assert.equal(await backplane.getIdempotency(key), null);
    } else {
      await assert.rejects(
        backplane.setIdempotency("user:writer-a|new-admission", {
          status: "pending", createdAt: 2, expiresAt: Date.now() + 60_000,
        }, 60_000, 1),
        (error) => error?.code === "TALK_IDEMPOTENCY_CAPACITY"
      );
    }
    assert.deepEqual(await persistence.get({ domain: "talk_idempotency", key }), expired);
  });
}


function redisProtocolFixture() {
  const values = new Map();
  const evaluations = [];
  let afterSnapshot = null;
  let unconditionalDeletes = 0;
  const client = {
    on() {},
    async connect() {},
    async quit() {},
    async get(key) {
      const raw = values.get(key) ?? null;
      const advance = afterSnapshot;
      afterSnapshot = null;
      if (advance) await advance();
      return raw;
    },
    async set(key, raw, options = {}) {
      if (options.NX && values.has(key)) return null;
      values.set(key, raw);
      return "OK";
    },
    async del(key) {
      unconditionalDeletes += 1;
      return Number(values.delete(key));
    },
    async eval(script, options) {
      evaluations.push({ script, ...options });
      assert.equal(options.keys.length, 1);
      assert.equal(options.arguments.length, 1);
      const key = options.keys[0];
      if (values.get(key) !== options.arguments[0]) return 0;
      return Number(values.delete(key));
    },
  };
  return { client, values, evaluations,
    afterSnapshot(advance) { afterSnapshot = advance; },
    get unconditionalDeletes() { return unconditionalDeletes; } };
}

for (const atomicDeletion of [true, false]) {
  test(`expiry custody: Redis stale read preserves refreshed replay with atomic deletion ${atomicDeletion}`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "them-expiry-redis-"));
    const redis = redisProtocolFixture();
    if (!atomicDeletion) redis.client.eval = undefined;
    const makeBackplane = () => createScaleBackplane({
      redisUrl: "redis-fixture",
      redisClientFactory: () => redis.client,
      outboxFilePath: path.join(root, "outbox.json"),
      logger: { log() {} },
    });
    const reader = await makeBackplane();
    const writer = await makeBackplane();
    t.after(async () => {
      await Promise.all([reader.close(), writer.close()]);
      fs.rmSync(root, { recursive: true, force: true });
    });
    await Promise.all([reader.init(), writer.init()]);
    const key = "user:writer-a|redis-expiry";
    const redisKey = `them:talk:idemp:${key}`;
    const raw = '{ "body": {"encoding":"base64","data":"/wCA"}, "expiresAt": 1, "status": "completed", "createdAt": 1 }';
    redis.values.set(redisKey, raw);
    const accepted = { status: "completed", createdAt: 2,
      expiresAt: Date.now() + 60_000, body: Buffer.from([255, 0, 128, 42]) };
    redis.afterSnapshot(() => writer.setIdempotency(key, accepted, 60_000));

    assert.deepEqual(await reader.getIdempotency(key), accepted);
    assert.deepEqual(await writer.getIdempotency(key), accepted);
    assert.equal(redis.unconditionalDeletes, 0);
    assert.equal(redis.evaluations.length, atomicDeletion ? 1 : 0);
    if (atomicDeletion) assert.equal(redis.evaluations[0].arguments[0], raw);
  });

  test(`expiry custody: Redis ordinary expiration with atomic deletion ${atomicDeletion}`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "them-expiry-redis-"));
    const redis = redisProtocolFixture();
    if (!atomicDeletion) redis.client.eval = undefined;
    const backplane = await createScaleBackplane({
      redisUrl: "redis-fixture",
      redisClientFactory: () => redis.client,
      outboxFilePath: path.join(root, "outbox.json"),
      logger: { log() {} },
    });
    t.after(async () => {
      await backplane.close();
      fs.rmSync(root, { recursive: true, force: true });
    });
    await backplane.init();
    const key = "user:writer-a|redis-expired";
    const redisKey = `them:talk:idemp:${key}`;
    const raw = '{ "body": {"encoding":"base64","data":"/wCA"}, "expiresAt": 1, "status": "completed" }';
    redis.values.set(redisKey, raw);
    assert.equal(await backplane.getIdempotency(key), null);
    assert.equal(redis.values.has(redisKey), !atomicDeletion);
    assert.equal(redis.unconditionalDeletes, 0);
    assert.equal(redis.evaluations.length, atomicDeletion ? 1 : 0);
    if (atomicDeletion) assert.equal(redis.evaluations[0].arguments[0], raw);
  });
}
