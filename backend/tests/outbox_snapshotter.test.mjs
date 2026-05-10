// T07a: tests for OutboxSnapshotter.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createOutboxSnapshotter,
  buildSnapshotPayload,
  OUTBOX_SNAPSHOT_DOMAIN,
  OUTBOX_SNAPSHOT_KEY_PREFIX,
} from "../lib/outbox_snapshotter.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-outbox-snap-"));
  return createJsonPersistence({ jsonRoot: root });
}

function makeMockBackplane(items) {
  return {
    async listOutbox({ status = "all", limit = 80 } = {}) {
      // Mock honors status filter for completeness.
      const filtered = status === "all"
        ? items
        : items.filter((i) => i.status === status);
      return filtered.slice(0, limit);
    },
  };
}

const SILENT_LOGGER = { log: () => {}, error: () => {} };

// ---------- buildSnapshotPayload ----------

test("buildSnapshotPayload counts statuses and caps sample at 25", () => {
  const items = [];
  for (let i = 0; i < 30; i += 1) items.push({ id: `p${i}`, status: "pending", type: "email" });
  for (let i = 0; i < 5; i += 1) items.push({ id: `c${i}`, status: "completed", type: "calendar" });
  for (let i = 0; i < 2; i += 1) items.push({ id: `f${i}`, status: "failed", type: "note" });
  items.push({ id: "weird", status: "limbo", type: "?" });

  const ts = Date.UTC(2026, 4, 9, 22, 20, 0);
  const payload = buildSnapshotPayload(items, ts);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.counts.total, 38);
  assert.equal(payload.counts.pending, 30);
  assert.equal(payload.counts.completed, 5);
  assert.equal(payload.counts.failed, 2);
  assert.equal(payload.counts.other, 1);
  assert.equal(payload.sample.length, 25);
  assert.equal(payload.takenAt, "2026-05-09T22:20:00.000Z");
});

// ---------- snapshotter end-to-end ----------

test("[T07a] takeSnapshotOnce writes a keyed snapshot via the adapter", async () => {
  const persistence = freshPersistence();
  const backplane = makeMockBackplane([
    { id: "p1", status: "pending", type: "email" },
    { id: "c1", status: "completed", type: "calendar" },
  ]);
  const snap = createOutboxSnapshotter({
    scaleBackplane: backplane,
    persistence,
    logger: SILENT_LOGGER,
  });
  const payload = await snap.takeSnapshotOnce(1746834000000);
  assert.equal(payload.counts.total, 2);

  const records = await persistence.list({
    domain: OUTBOX_SNAPSHOT_DOMAIN,
    prefix: OUTBOX_SNAPSHOT_KEY_PREFIX,
  });
  assert.equal(records.length, 1);
  assert.match(records[0].key, /^snapshot:/);
  assert.equal(records[0].value.counts.pending, 1);
  await persistence.close();
});

test("[T07a] keeps at most `keepLast` snapshots, prunes oldest first", async () => {
  const persistence = freshPersistence();
  const backplane = makeMockBackplane([{ id: "p1", status: "pending" }]);
  const snap = createOutboxSnapshotter({
    scaleBackplane: backplane,
    persistence,
    keepLast: 3,
    logger: SILENT_LOGGER,
  });
  // Take 5 snapshots at increasing timestamps.
  for (let i = 0; i < 5; i += 1) {
    await snap.takeSnapshotOnce(1_700_000_000_000 + i * 60_000);
  }
  const records = await persistence.list({
    domain: OUTBOX_SNAPSHOT_DOMAIN,
    prefix: OUTBOX_SNAPSHOT_KEY_PREFIX,
  });
  assert.equal(records.length, 3, `got ${records.length} keys`);
  // Newest 3 timestamps survive.
  const keys = records.map((r) => r.key).sort();
  assert.equal(keys[0], `snapshot:${new Date(1_700_000_120_000).toISOString()}`);
  assert.equal(keys[2], `snapshot:${new Date(1_700_000_240_000).toISOString()}`);
  await persistence.close();
});

test("[T07a] does not throw when scaleBackplane.listOutbox fails", async () => {
  const persistence = freshPersistence();
  const backplane = {
    async listOutbox() { throw new Error("scaleBackplane unavailable"); },
  };
  const errors = [];
  const snap = createOutboxSnapshotter({
    scaleBackplane: backplane,
    persistence,
    logger: { log: () => {}, error: (m) => errors.push(m) },
  });
  const result = await snap.takeSnapshotOnce(Date.now());
  assert.equal(result, null);
  assert.ok(errors.some((e) => e.includes("listOutbox failed")));
  await persistence.close();
});

test("[T07a] start/stop is safe to call multiple times", async () => {
  const persistence = freshPersistence();
  const backplane = makeMockBackplane([]);
  const snap = createOutboxSnapshotter({
    scaleBackplane: backplane,
    persistence,
    intervalMs: 60_000_000, // effectively never tick
    logger: SILENT_LOGGER,
  });
  snap.start();
  snap.start(); // idempotent
  await snap.stop();
  await snap.stop(); // idempotent
  await persistence.close();
});

test("[T07a] rejects construction when scaleBackplane lacks listOutbox", () => {
  assert.throws(
    () => createOutboxSnapshotter({
      scaleBackplane: {},
      persistence: freshPersistence(),
      logger: SILENT_LOGGER,
    }),
    /listOutbox/,
  );
});

test("[T07a] rejects construction when persistence is missing", () => {
  assert.throws(
    () => createOutboxSnapshotter({
      scaleBackplane: { listOutbox: async () => [] },
      persistence: null,
      logger: SILENT_LOGGER,
    }),
    /persistence/,
  );
});
