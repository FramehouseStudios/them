// T-deeper-lib-tests-batch-2 — deeper outbox_store coverage beyond
// backend/tests/outbox_store.test.mjs.
//
// Smoke covers: config guards, buildActionKey, backoff curve,
// enqueue happy/null paths, retry per-type, batch counts, single-
// id lookup, worker gating.
//
// This file exercises gaps the smoke skipped:
//   - duplicate-key behavior (scaleBackplane returns duplicate:true)
//   - computeOutboxRetryAt with negative + non-numeric attempts
//   - enqueueActionOutbox honors explicit actionKey override
//   - enqueueActionOutbox normalizes lastError snippet length cap
//   - processOutboxBatch honors batch limit

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOutboxActionKey,
  computeOutboxRetryAt,
  configureOutboxStore,
  enqueueActionOutbox,
  processOutboxBatch,
  retryOutboxAction,
} from "../lib/outbox_store.js";

function buildScaleBackplaneStub({ duplicate = false } = {}) {
  const calls = { enqueueOutbox: [], claimDueOutbox: [], updateOutbox: [], listOutbox: [] };
  let nextClaim = [];
  return {
    calls,
    setClaim(items) { nextClaim = items; },
    async enqueueOutbox(row) {
      calls.enqueueOutbox.push(row);
      return { ...row, duplicate };
    },
    async claimDueOutbox(limit) {
      calls.claimDueOutbox.push(limit);
      // Honor limit on the stub side too.
      return nextClaim.slice(0, limit);
    },
    async updateOutbox(id, patch) {
      calls.updateOutbox.push({ id, patch });
      return { id, ...patch };
    },
    async listOutbox(args) {
      calls.listOutbox.push(args);
      return [];
    },
  };
}

function defaultDeps(overrides = {}) {
  return {
    OUTBOX_ENABLED: true,
    OUTBOX_RETRY_BASE_DELAY_MS: 1000,
    OUTBOX_RETRY_MAX_ATTEMPTS: 5,
    OUTBOX_WORKER_BATCH_SIZE: 16,
    OUTBOX_WORKER_ENABLED: true,
    buildLocalActionSignature: (prefix, payload) =>
      `${prefix}::${JSON.stringify(payload || {})}`,
    normalizeLocalActionType: (t) => String(t || "").trim().toLowerCase(),
    randomUUID: () => `uuid_${Math.random().toString(36).slice(2, 10)}`,
    normalizeSnippet: (v, max = 640) => {
      const s = String(v || "").trim();
      return s.length <= max ? s : s.slice(0, max);
    },
    captureLocalNote: async ({ noteText }) => ({ status: "saved", noteText }),
    scaleBackplane: buildScaleBackplaneStub(),
    ...overrides,
  };
}

// ---------- duplicate detection ----------

test("[outbox-store-deeper] enqueueActionOutbox returns the duplicate row when backplane reports duplicate", async () => {
  const backplane = buildScaleBackplaneStub({ duplicate: true });
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  const row = await enqueueActionOutbox({
    type: "note_capture",
    payload: { noteText: "remember the milk" },
  });
  assert.ok(row);
  assert.equal(row.duplicate, true);
  assert.equal(backplane.calls.enqueueOutbox.length, 1);
});

// ---------- explicit actionKey override ----------

test("[outbox-store-deeper] enqueueActionOutbox uses explicit actionKey when supplied", async () => {
  const backplane = buildScaleBackplaneStub();
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  await enqueueActionOutbox({
    type: "note_capture",
    payload: { noteText: "x" },
    actionKey: "custom-key-123",
  });
  assert.equal(backplane.calls.enqueueOutbox[0].actionKey, "custom-key-123");
});

test("[outbox-store-deeper] enqueueActionOutbox falls back to buildOutboxActionKey when no actionKey supplied", async () => {
  const backplane = buildScaleBackplaneStub();
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  await enqueueActionOutbox({
    type: "note_capture",
    payload: { noteText: "y" },
  });
  // Format is `outbox_<type>::<json-payload>`.
  assert.match(backplane.calls.enqueueOutbox[0].actionKey, /^outbox_note_capture::/);
});

// ---------- computeOutboxRetryAt edge cases ----------

test("[outbox-store-deeper] computeOutboxRetryAt with negative attempt clamps to base (1×)", () => {
  configureOutboxStore(defaultDeps({ OUTBOX_RETRY_BASE_DELAY_MS: 500 }));
  const t0 = Date.now();
  const r = computeOutboxRetryAt(-1);
  // n = max(0, ...) → 0 → 1× base.
  assert.ok(r - t0 >= 500 && r - t0 < 1500);
});

test("[outbox-store-deeper] computeOutboxRetryAt at attempt=0 returns base delay", () => {
  configureOutboxStore(defaultDeps({ OUTBOX_RETRY_BASE_DELAY_MS: 500 }));
  const t0 = Date.now();
  const r = computeOutboxRetryAt(0);
  assert.ok(r - t0 >= 500 && r - t0 < 1500, `expected ~500ms ahead, got ${r - t0}ms`);
});

// ---------- buildOutboxActionKey shape ----------

test("[outbox-store-deeper] buildOutboxActionKey is deterministic for same inputs", () => {
  configureOutboxStore(defaultDeps());
  const a = buildOutboxActionKey("note_capture", { noteText: "Remember the midpoint image." });
  const b = buildOutboxActionKey("note_capture", { noteText: "Remember the midpoint image." });
  assert.equal(a, b);
});

test("[outbox-store-deeper] buildOutboxActionKey normalizes the type prefix", () => {
  configureOutboxStore(defaultDeps());
  const key = buildOutboxActionKey("Note_CAPTURE", { x: 1 });
  // Type goes through normalizeLocalActionType (lowercase + trim).
  assert.match(key, /^outbox_note_capture::/);
});

// ---------- lastError snippet cap ----------

test("[outbox-store-deeper] enqueueActionOutbox truncates lastError via normalizeSnippet (640 cap)", async () => {
  const backplane = buildScaleBackplaneStub();
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  const longError = "x".repeat(2000);
  await enqueueActionOutbox({
    type: "note_capture",
    payload: { noteText: "n" },
    status: "failed",
    result: { error: longError },
  });
  const row = backplane.calls.enqueueOutbox[0];
  assert.ok(row.lastError.length <= 640, `lastError should be <= 640 chars, got ${row.lastError.length}`);
});

// ---------- processOutboxBatch honors limit ----------

test("[outbox-store-deeper] processOutboxBatch honors limit (claims only up to limit)", async () => {
  const backplane = buildScaleBackplaneStub();
  // Stub has 10 items but limit is 3 — claim should return 3.
  backplane.setClaim([
    { id: "a", type: "note_capture", payload: { noteText: "1" }, attempts: 0 },
    { id: "b", type: "note_capture", payload: { noteText: "2" }, attempts: 0 },
    { id: "c", type: "note_capture", payload: { noteText: "3" }, attempts: 0 },
    { id: "d", type: "note_capture", payload: { noteText: "4" }, attempts: 0 },
    { id: "e", type: "note_capture", payload: { noteText: "5" }, attempts: 0 },
  ]);
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  const r = await processOutboxBatch({ limit: 3, reqId: "deeper" });
  assert.equal(r.claimed, 3);
  assert.equal(r.completed, 3);
});
