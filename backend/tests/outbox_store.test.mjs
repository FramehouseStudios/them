// T-outbox-store-smoke-test — direct tests for backend/lib/outbox_store.js.
//
// outbox_store is the scale-backplane outbox handler. It hands work
// off to a backplane (DB or in-memory) and includes retry logic with
// exponential backoff. This adds direct test coverage:
//
//   - configureOutboxStore guard
//   - buildOutboxActionKey contract (delegates to deps)
//   - computeOutboxRetryAt: exponential backoff bounded at 32× base
//   - enqueueActionOutbox: skipped when OUTBOX_ENABLED=false; pushes
//     to scaleBackplane.enqueueOutbox when enabled
//   - retryOutboxAction: dispatches by type (note_capture / email /
//     calendar) and returns the right ok/done/error shape
//   - processOutboxBatch: claims due items, applies updates,
//     reports counts
//   - processSingleOutboxItemById: looks up + retries
//   - runOutboxWorkerTick: respects OUTBOX_WORKER_ENABLED gate

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOutboxActionKey,
  computeOutboxRetryAt,
  configureOutboxStore,
  enqueueActionOutbox,
  processOutboxBatch,
  processSingleOutboxItemById,
  retryOutboxAction,
  runOutboxWorkerTick,
  waitForOutboxWorkerIdle,
} from "../lib/outbox_store.js";

function buildScaleBackplaneStub() {
  const calls = { enqueueOutbox: [], claimDueOutbox: [], updateOutbox: [], listOutbox: [] };
  let nextClaim = [];
  let updates = new Map();
  return {
    calls,
    setClaim(items) { nextClaim = items; },
    setList(items) { this._list = items; },
    setUpdate(id, result) { updates.set(id, result); },
    async enqueueOutbox(row) {
      calls.enqueueOutbox.push(row);
      return { ...row, duplicate: false };
    },
    async claimDueOutbox(limit) {
      calls.claimDueOutbox.push(limit);
      return nextClaim;
    },
    async updateOutbox(id, patch) {
      calls.updateOutbox.push({ id, patch });
      return { id, ...patch };
    },
    async listOutbox(args) {
      calls.listOutbox.push(args);
      return this._list || [];
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
    normalizeSnippet: (v, max) => {
      const s = String(v || "").trim();
      return s.length <= max ? s : s.slice(0, max);
    },
    captureLocalNote: async ({ noteText }) => ({ status: "saved", noteText }),
    scaleBackplane: buildScaleBackplaneStub(),
    ...overrides,
  };
}

// ---------- configure guard ----------

test("[outbox-store] enqueueActionOutbox throws when buildLocalActionSignature missing", async () => {
  // Module-scoped configured deps from a prior test may persist;
  // pass a config that has OUTBOX_ENABLED + normalizeLocalActionType
  // but is missing buildLocalActionSignature. The buildOutboxActionKey
  // path inside enqueueActionOutbox should throw.
  configureOutboxStore({
    OUTBOX_ENABLED: true,
    normalizeLocalActionType: (t) => String(t || "").toLowerCase(),
    randomUUID: () => "uuid_x",
    normalizeSnippet: (v) => String(v || ""),
    scaleBackplane: { async enqueueOutbox(row) { return row; } },
    // intentionally no buildLocalActionSignature
  });
  await assert.rejects(
    enqueueActionOutbox({ type: "note_capture", payload: {} }),
    /is not a function/,
  );
});

// ---------- buildOutboxActionKey ----------

test("[outbox-store] buildOutboxActionKey delegates to buildLocalActionSignature + normalizeLocalActionType", () => {
  configureOutboxStore(defaultDeps());
  const key = buildOutboxActionKey("Note_Capture", { foo: "bar" });
  assert.equal(key, 'outbox_note_capture::{"foo":"bar"}');
});

// ---------- computeOutboxRetryAt ----------

test("[outbox-store] computeOutboxRetryAt doubles delay per attempt", () => {
  configureOutboxStore(defaultDeps({ OUTBOX_RETRY_BASE_DELAY_MS: 1000 }));
  const t0 = Date.now();
  const r0 = computeOutboxRetryAt(0);
  assert.ok(r0 - t0 >= 1000 && r0 - t0 < 2000);
  const r2 = computeOutboxRetryAt(2);
  assert.ok(r2 - t0 >= 4000); // 2^2 = 4× base
  const r5 = computeOutboxRetryAt(5);
  assert.ok(r5 - t0 >= 32_000); // 2^5 = 32× base
});

test("[outbox-store] computeOutboxRetryAt caps multiplier at 32×", () => {
  configureOutboxStore(defaultDeps({ OUTBOX_RETRY_BASE_DELAY_MS: 1000 }));
  const t0 = Date.now();
  const r_huge = computeOutboxRetryAt(100); // 2^100 — would overflow
  // Cap at 32×.
  assert.ok(r_huge - t0 <= 32_000 + 100); // small allowance for elapsed time
});

// ---------- enqueueActionOutbox ----------

test("[outbox-store] enqueueActionOutbox returns null when OUTBOX_ENABLED=false", async () => {
  configureOutboxStore(defaultDeps({ OUTBOX_ENABLED: false }));
  const result = await enqueueActionOutbox({ type: "note_capture" });
  assert.equal(result, null);
});

test("[outbox-store] enqueueActionOutbox returns null for invalid type", async () => {
  configureOutboxStore(defaultDeps());
  const result = await enqueueActionOutbox({ type: "" });
  assert.equal(result, null);
  const result2 = await enqueueActionOutbox({ type: "none" });
  assert.equal(result2, null);
});

test("[outbox-store] enqueueActionOutbox pushes a row to scaleBackplane.enqueueOutbox", async () => {
  const backplane = buildScaleBackplaneStub();
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  await enqueueActionOutbox({
    type: "note_capture",
    payload: { noteText: "remember the milk" },
  });
  assert.equal(backplane.calls.enqueueOutbox.length, 1);
  const row = backplane.calls.enqueueOutbox[0];
  assert.equal(row.type, "note_capture");
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 0);
  assert.ok(row.id.startsWith("uuid_"));
});

test("[outbox-store] enqueueActionOutbox carries lastError on failed status", async () => {
  const backplane = buildScaleBackplaneStub();
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  await enqueueActionOutbox({
    type: "note_capture",
    payload: {},
    result: { error: "something went wrong" },
    status: "failed",
  });
  assert.equal(backplane.calls.enqueueOutbox[0].lastError, "something went wrong");
});

// ---------- retryOutboxAction ----------

test("[outbox-store] retryOutboxAction handles note_capture success", async () => {
  configureOutboxStore(defaultDeps());
  const r = await retryOutboxAction({ id: "i1", type: "note_capture", payload: { noteText: "hi" } });
  assert.equal(r.ok, true);
  assert.equal(r.done, true);
});

test("[outbox-store] retryOutboxAction fails note_capture with missing noteText", async () => {
  configureOutboxStore(defaultDeps());
  const r = await retryOutboxAction({ id: "i2", type: "note_capture", payload: {} });
  assert.equal(r.ok, false);
  assert.equal(r.done, true);
  assert.equal(r.error, "missing_note_text");
});

test("[outbox-store] abandoned productivity actions are terminal and unsupported", async () => {
  configureOutboxStore(defaultDeps());
  for (const type of ["email_compose", "calendar_compose"]) {
    const result = await retryOutboxAction({ id: `legacy_${type}`, type, payload: {} });
    assert.equal(result.ok, false);
    assert.equal(result.done, true);
    assert.equal(result.error, `unsupported_type:${type}`);
  }
});

test("[outbox-store] retryOutboxAction marks invalid type as terminal", async () => {
  configureOutboxStore(defaultDeps());
  const r = await retryOutboxAction({ id: "i6", type: "weird_thing", payload: {} });
  assert.equal(r.ok, false);
  assert.equal(r.done, true);
  assert.match(r.error, /unsupported_type/);
});

// ---------- processOutboxBatch ----------

test("[outbox-store] processOutboxBatch returns zeros when OUTBOX_ENABLED=false", async () => {
  configureOutboxStore(defaultDeps({ OUTBOX_ENABLED: false }));
  const r = await processOutboxBatch({ limit: 10 });
  assert.deepEqual(r, { claimed: 0, completed: 0, failed: 0, retried: 0 });
});

test("[outbox-store] processOutboxBatch counts completed + failed + retried", async () => {
  const backplane = buildScaleBackplaneStub();
  backplane.setClaim([
    { id: "good", type: "note_capture", payload: { noteText: "ok" }, attempts: 0 },
    { id: "fail_term", type: "weird_type", payload: {}, attempts: 0 },
    { id: "fail_retry", type: "note_capture", payload: {}, attempts: 0 }, // missing_note_text, terminal too
  ]);
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  const r = await processOutboxBatch({ limit: 10, reqId: "test" });
  assert.equal(r.claimed, 3);
  assert.equal(r.completed, 1);
  // Both terminal failures (weird_type + missing_note_text) count as failed.
  assert.equal(r.failed, 2);
  assert.equal(r.retried, 0);
});

// ---------- processSingleOutboxItemById ----------

test("[outbox-store] processSingleOutboxItemById returns not_found for missing id", async () => {
  const backplane = buildScaleBackplaneStub();
  backplane.setList([]);
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  const r = await processSingleOutboxItemById("missing");
  assert.equal(r.ok, false);
  assert.equal(r.error, "not_found");
});

test("[outbox-store] processSingleOutboxItemById returns missing_id for empty input", async () => {
  configureOutboxStore(defaultDeps());
  const r = await processSingleOutboxItemById("");
  assert.equal(r.ok, false);
  assert.equal(r.error, "missing_id");
});

test("[outbox-store] processSingleOutboxItemById returns completed on successful retry", async () => {
  const backplane = buildScaleBackplaneStub();
  backplane.setList([
    { id: "target", type: "note_capture", payload: { noteText: "ok" }, attempts: 0 },
  ]);
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  const r = await processSingleOutboxItemById("target");
  assert.equal(r.ok, true);
  assert.equal(r.status, "completed");
});

// ---------- runOutboxWorkerTick ----------

test("[outbox-store] runOutboxWorkerTick is a no-op when OUTBOX_WORKER_ENABLED=false", async () => {
  const backplane = buildScaleBackplaneStub();
  configureOutboxStore(defaultDeps({
    OUTBOX_WORKER_ENABLED: false,
    scaleBackplane: backplane,
  }));
  await runOutboxWorkerTick();
  assert.equal(backplane.calls.claimDueOutbox.length, 0);
});

test("[outbox-store] runOutboxWorkerTick calls processOutboxBatch when enabled", async () => {
  const backplane = buildScaleBackplaneStub();
  backplane.setClaim([]);
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));
  await runOutboxWorkerTick();
  assert.equal(backplane.calls.claimDueOutbox.length, 1);
});

test("[outbox-store] concurrent worker ticks and shutdown waiter share the active batch", async () => {
  const backplane = buildScaleBackplaneStub();
  let releaseClaim;
  backplane.claimDueOutbox = async (limit) => {
    backplane.calls.claimDueOutbox.push(limit);
    return new Promise((resolve) => { releaseClaim = () => resolve([]); });
  };
  configureOutboxStore(defaultDeps({ scaleBackplane: backplane }));

  const first = runOutboxWorkerTick();
  await Promise.resolve();
  const second = runOutboxWorkerTick();
  const shutdownWait = waitForOutboxWorkerIdle();
  releaseClaim();

  await Promise.all([first, second, shutdownWait]);
  assert.equal(backplane.calls.claimDueOutbox.length, 1);
  assert.equal(await waitForOutboxWorkerIdle(), undefined);
});
