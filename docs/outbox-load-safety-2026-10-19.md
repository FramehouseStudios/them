# T-1013 — Preserve queued writer input through load failure

## Target and binary criteria

On current T1011 parent6e9776ce, the canonical OfflineTalkOutbox sets
didLoad before attempting its manifest read and silently compactMaps decode
failures. A later successful write can discard existing queue records.
The next change must load transactionally, retry a failed read on the same
actor, refuse mutation of malformed storage, keep every manifest/blob byte,
and display an unavailable state instead of claiming the queue is empty.
Normal replay/deduplication/parking and user-account checks must remain.

## VERIFIED reproduction

Signed tests use actual temporary manifest/blob files and actual outbox
actors. A directory temporarily at the manifest path forces a real read
failure; this is not a physical-iPhone file-protection reproduction. Separate
malformed JSON and invalid UTF-8 cases verify no overwrite and same-actor
recovery after restoring only the synthetic valid manifest. No human data,
credentials, phone, paid provider or production storage is used.

Before correction: signed8 pass/2 fail/0 skip, native27034 terminal65,
`/tmp/them-1013-before.log` and completed bundle
`/tmp/them-1013-before/v1-ui-smoke-local-1-35801.xcresult`.
Actual summary read: first turn missing after enqueue; malformed storage
accepted a write instead of refusing it. Existing eight tests passed.

## Correction and proof pending

Read without treating every file-existence failure as a new empty queue;
only the actual Foundation no-such-file error permits fresh initialization.
Decode UTF-8 and every nonblank JSONL record before assigning entries or
didLoad. On error, retain original manifest/blobs, keep load retryable, and
surface a safe error without raw file content. Existing shared snapshot
status supplies Studio/Data Controls an unavailable message rather than
claiming no waiting work. No god-file/UI-view growth or new storage system.

Malformed data intentionally blocks all queue mutation, including parked
deletion, rather than dropping the bad record and rewriting the rest.
This is preservation, not automatic corruption repair. The same actor can
recover after storage becomes readable/valid again. Fresh signed/full/UI
proof remains pending; never attribute the previous parent's passes here.

## Remaining full objective

This does not solve initial nonqueued provider failures or make parked voice
turns usable on the page. Those still require a connected recovery design and
proof. A successful transport send alone must not be claimed as a restored
screenplay. Physical microphone, live model, full-feature craft and external
export-open remain unproven. Original #962 hosted gate stays live; no original
head or main is changed. Production hold remains in force.
