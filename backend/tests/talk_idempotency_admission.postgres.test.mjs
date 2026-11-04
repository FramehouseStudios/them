import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { createPostgresPersistence } from "../lib/persistence_postgres.js";
import { createScaleBackplane } from "../lib/scale_backplane.mjs";

function taskOwnedDatabaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const parsed = new URL(value);
  const localHosts = new Set(["127.0.0.1", "localhost", "host.docker.internal"]);
  if (!localHosts.has(parsed.hostname) || parsed.pathname !== "/t1122") {
    throw new Error("refusing PostgreSQL proof outside task-owned loopback database /t1122");
  }
  return value;
}

const databaseUrl = taskOwnedDatabaseUrl(process.env.T1122_DATABASE_URL);

test("[talk-idempotency/pg] one worker admits and stale preparation cannot overwrite", {
  skip: !databaseUrl && "T1122_DATABASE_URL is not configured",
}, async () => {
  const poolA = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  const poolB = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  const persistenceA = createPostgresPersistence({ pgClient: poolA });
  const persistenceB = createPostgresPersistence({ pgClient: poolB });
  const first = await createScaleBackplane({ persistence: persistenceA, logger: { log() {} } });
  const second = await createScaleBackplane({ persistence: persistenceB, logger: { log() {} } });
  await Promise.all([first.init(), second.init()]);
  const key = `user:t1122|${randomUUID()}`;
  try {
    const pending = { status: "pending", createdAt: 1, expiresAt: Date.now() + 60_000 };
    const admissions = await Promise.allSettled([
      first.setIdempotency(key, pending, 60_000, 10),
      second.setIdempotency(key, pending, 60_000, 10),
    ]);
    assert.equal(admissions.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(admissions.filter((result) => result.status === "rejected" &&
      result.reason?.code === "TALK_IDEMPOTENCY_CONFLICT").length, 1);

    const admitted = await first.getIdempotency(key);
    const prepared = { ...admitted, status: "prepared", body: Buffer.from("winner"), expiresAt: 0 };
    await first.compareAndSetIdempotency(key, admitted, prepared, 60_000);
    await assert.rejects(
      second.compareAndSetIdempotency(key, admitted, {
        ...admitted,
        status: "prepared",
        body: Buffer.from("stale loser"),
        expiresAt: 0,
      }, 60_000),
      (error) => error?.code === "TALK_IDEMPOTENCY_CONFLICT"
    );
    assert.deepEqual((await second.getIdempotency(key))?.body, Buffer.from("winner"));
  } finally {
    await persistenceA.delete({ domain: "talk_idempotency", key }).catch(() => {});
    await Promise.all([first.close(), second.close()]);
    await Promise.all([poolA.end(), poolB.end()]);
  }
});
