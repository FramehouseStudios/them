import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_OUTLINE_MUTATION_RECEIPTS,
  OUTLINE_MUTATION_HASH_VERSION,
  appendBoundedOutlineReceipt,
  buildOutlineMutationRequestHash,
  normalizeOutlineMutationReceipts,
  normalizeOutlineRevision,
  stableCanonicalJson,
} from "../lib/screenplay_outline_protocol.js";

test("[screenplay-outline-protocol] revisions accept only nonnegative safe integers", () => {
  assert.equal(normalizeOutlineRevision(7), 7);
  assert.equal(normalizeOutlineRevision("8"), 8);
  assert.equal(normalizeOutlineRevision(-1, 3), 3);
  assert.equal(normalizeOutlineRevision(1.5, "4"), 4);
  assert.equal(normalizeOutlineRevision(Number.MAX_SAFE_INTEGER + 1, -2), 0);
  assert.equal(normalizeOutlineRevision(null, 5), 5);
});

test("[screenplay-outline-protocol] canonical JSON sorts nested keys and preserves array order", () => {
  const first = {
    z: 1,
    nested: { beta: true, alpha: false },
    list: [{ y: 2, x: 1 }, "tail"],
  };
  const reorderedKeys = {
    list: [{ x: 1, y: 2 }, "tail"],
    nested: { alpha: false, beta: true },
    z: 1,
  };
  const reorderedArray = {
    ...reorderedKeys,
    list: ["tail", { x: 1, y: 2 }],
  };

  assert.equal(stableCanonicalJson(first), stableCanonicalJson(reorderedKeys));
  assert.notEqual(stableCanonicalJson(first), stableCanonicalJson(reorderedArray));
});

test("[screenplay-outline-protocol] request hash ignores transport metadata, preconditions, server times, and merge", () => {
  assert.equal(OUTLINE_MUTATION_HASH_VERSION, 1);
  const first = {
    client_request_id: "request-a",
    base_outline_revision: 4,
    outline_revision: 5,
    merge: true,
    acts: [{ id: "act-1", title: "Act One", created_at: 10, updatedAt: 20 }],
    scenes: [{ title: "Kitchen", id: "scene-1", updated_at: 30 }],
    beats: [{ label: "Reveal", id: "beat-1", createdAt: 40 }],
    title: "Feature",
    phase: "outline",
  };
  const sameIntent = {
    phase: "outline",
    title: "Feature",
    beats: [{ createdAt: 999, id: "beat-1", label: "Reveal" }],
    scenes: [{ updated_at: 998, id: "scene-1", title: "Kitchen" }],
    acts: [{ updatedAt: 997, title: "Act One", id: "act-1", created_at: 996 }],
    merge: false,
    clientRequestId: "request-b",
    expectedOutlineRevision: 100,
  };

  const requestHash = buildOutlineMutationRequestHash(first);
  assert.match(requestHash, /^[a-f0-9]{64}$/);
  assert.equal(requestHash, buildOutlineMutationRequestHash(sameIntent));
});

test("[screenplay-outline-protocol] request hash changes for semantic intent", () => {
  const base = {
    acts: [{ id: "act-1", title: "Act One" }],
    scenes: [
      { id: "scene-1", title: "Kitchen" },
      { id: "scene-2", title: "Street" },
    ],
    beats: [{ id: "beat-1", label: "Reveal", scene_id: "scene-1" }],
  };
  const hash = buildOutlineMutationRequestHash(base);

  assert.notEqual(hash, buildOutlineMutationRequestHash({
    ...base,
    scenes: [...base.scenes].reverse(),
  }));
  assert.notEqual(hash, buildOutlineMutationRequestHash({
    ...base,
    beats: [{ ...base.beats[0], scene_id: "scene-2" }],
  }));
  assert.notEqual(hash, buildOutlineMutationRequestHash({ ...base, title: "" }));
  assert.notEqual(hash, buildOutlineMutationRequestHash(base, { operation: "merge" }));
});

test("[screenplay-outline-protocol] receipt normalization handles legacy fields and deterministic dedupe", () => {
  const input = [
    {
      request_id: "request-b",
      request_hash: "HASH-B",
      committed_revision: "7",
    },
    {
      requestId: "request-a",
      requestHash: "hash-a-old",
      operation: " MERGE ",
      baseRevision: 2,
      committedRevision: 3,
      committedAt: 90,
    },
    {
      client_request_id: "request-a",
      request_hash: "HASH-A-NEW",
      base_revision: "6",
      committed_revision: "7",
      committed_at: "100",
    },
    { request_id: "", request_hash: "missing-id" },
    { request_id: "missing-hash" },
  ];
  const normalized = normalizeOutlineMutationReceipts(input);
  const reversed = normalizeOutlineMutationReceipts([...input].reverse());

  assert.deepEqual(normalized, reversed);
  assert.deepEqual(normalized, [
    {
      requestId: "request-a",
      hashVersion: 1,
      operation: "replace",
      requestHash: "hash-a-new",
      baseRevision: 6,
      committedRevision: 7,
      committedAt: 100,
    },
    {
      requestId: "request-b",
      hashVersion: 1,
      operation: "replace",
      requestHash: "hash-b",
      baseRevision: 0,
      committedRevision: 7,
      committedAt: 0,
    },
  ]);
});

test("[screenplay-outline-protocol] append replaces older duplicate and enforces receipt cap", () => {
  assert.equal(MAX_OUTLINE_MUTATION_RECEIPTS, 64);
  const receipts = Array.from({ length: MAX_OUTLINE_MUTATION_RECEIPTS + 8 }, (_, index) => ({
    requestId: `request-${String(index).padStart(3, "0")}`,
    requestHash: `hash-${index}`,
    baseRevision: Math.max(0, index - 1),
    committedRevision: index,
    committedAt: 1000 + index,
  }));
  const capped = normalizeOutlineMutationReceipts(receipts);

  assert.equal(capped.length, MAX_OUTLINE_MUTATION_RECEIPTS);
  assert.equal(capped[0].committedRevision, MAX_OUTLINE_MUTATION_RECEIPTS + 7);
  assert.equal(capped.at(-1).committedRevision, 8);

  const appended = appendBoundedOutlineReceipt(capped, {
    request_id: capped.at(-1).requestId,
    request_hash: "replacement-hash",
    committed_revision: 100,
    committed_at: 5000,
  });
  assert.equal(appended.length, MAX_OUTLINE_MUTATION_RECEIPTS);
  assert.deepEqual(appended[0], {
    requestId: capped.at(-1).requestId,
    hashVersion: 1,
    operation: "replace",
    requestHash: "replacement-hash",
    baseRevision: 0,
    committedRevision: 100,
    committedAt: 5000,
  });
  assert.equal(
    appended.filter((receipt) => receipt.requestId === capped.at(-1).requestId).length,
    1
  );
});

test("[screenplay-outline-protocol] receipt ordering uses locale-independent code units", () => {
  const composed = "request-é";
  const decomposed = "request-e\u0301";
  const input = [
    { requestId: composed, requestHash: "hash-composed", committedRevision: 4 },
    { requestId: decomposed, requestHash: "hash-decomposed", committedRevision: 4 },
  ];

  const forward = normalizeOutlineMutationReceipts(input);
  const reverse = normalizeOutlineMutationReceipts([...input].reverse());
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.map((receipt) => receipt.requestId), [decomposed, composed]);
});
