// Day 1–3 sprint rescue: the outbox store carries the owning userId on every
// row and fails closed on reads that do not name a user or explicitly opt
// into the cross-user operator view.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createScaleBackplane } from "../lib/scale_backplane.mjs";

async function freshBackplane() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-outbox-scope-"));
  return createScaleBackplane({
    outboxFilePath: path.join(dir, "outbox_store.json"),
    logger: { log() {}, error() {} },
  });
}

test("[outbox-scope] rows persist the owning userId and survive reload", async () => {
  const backplane = await freshBackplane();
  const row = await backplane.enqueueOutbox({ type: "note_capture", payload: { noteText: "hi" }, userId: " alice " });
  assert.equal(row.userId, "alice");
  const [listed] = await backplane.listOutbox({ userId: "alice" });
  assert.equal(listed.id, row.id);
  assert.equal(listed.userId, "alice");
});

test("[outbox-scope] listOutbox and claimDueOutbox fail closed without a userId or allowAllUsers", async () => {
  const backplane = await freshBackplane();
  await backplane.enqueueOutbox({ type: "note_capture", payload: {}, userId: "alice" });
  await assert.rejects(() => backplane.listOutbox({ status: "all", limit: 10 }), /requires userId or allowAllUsers/);
  await assert.rejects(() => backplane.claimDueOutbox(10), /requires userId or allowAllUsers/);
  await assert.rejects(() => backplane.claimDueOutbox(10, {}), /requires userId or allowAllUsers/);
});

test("[outbox-scope] a user only ever sees or claims their own rows", async () => {
  const backplane = await freshBackplane();
  const a = await backplane.enqueueOutbox({ type: "note_capture", payload: { noteText: "a" }, userId: "alice" });
  const b = await backplane.enqueueOutbox({ type: "note_capture", payload: { noteText: "b" }, userId: "bob" });
  const legacy = await backplane.enqueueOutbox({ type: "note_capture", payload: { noteText: "legacy" } });
  assert.equal(legacy.userId, "");

  const aliceRows = await backplane.listOutbox({ userId: "alice" });
  assert.deepEqual(aliceRows.map((r) => r.id), [a.id]);
  const bobRows = await backplane.listOutbox({ userId: "bob" });
  assert.deepEqual(bobRows.map((r) => r.id), [b.id]);
  const nobody = await backplane.listOutbox({ userId: "carol" });
  assert.deepEqual(nobody, []);

  const bobClaims = await backplane.claimDueOutbox(10, { userId: "bob" });
  assert.deepEqual(bobClaims.map((r) => r.id), [b.id]);
  // Claiming marks bob's row in-flight; alice's row is untouched.
  const aliceClaims = await backplane.claimDueOutbox({ limit: 10, userId: "alice" });
  assert.deepEqual(aliceClaims.map((r) => r.id), [a.id]);
});

test("[outbox-scope] the operator view opts in explicitly and still includes legacy unowned rows", async () => {
  const backplane = await freshBackplane();
  const a = await backplane.enqueueOutbox({ type: "note_capture", payload: {}, userId: "alice" });
  const legacy = await backplane.enqueueOutbox({ type: "note_capture", payload: {} });
  const all = await backplane.listOutbox({ allowAllUsers: true });
  assert.deepEqual(new Set(all.map((r) => r.id)), new Set([a.id, legacy.id]));
  const claimed = await backplane.claimDueOutbox(10, { allowAllUsers: true });
  assert.equal(claimed.length, 2);
  assert.equal(backplane.status().outboxItems, 2);
});
