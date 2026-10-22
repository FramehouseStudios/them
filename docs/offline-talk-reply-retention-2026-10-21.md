# T-1116 — Accepted reply retention prerequisite

Parent `16b2c84cafb84151e1155759f79d4da65415586b`.
Branch `codex/T-1116-offline-reply-handoff`.
Runtime `9ac8c30c21c92703a1ee01bd4c0634d888a2cfc2`.
Local integration work; not main, production or physical-phone proof.

## Status: T-1116 remains active

VERIFIED: the pre-fix outbox discarded an HTTP200 reply before any writer
presentation acknowledgement. The signed red reproduction failed 0/1/0 after
relaunch. Transport was intercepted; actual outbox and filesystem were used.

This checkpoint fixes that storage boundary, not the complete delivery journey.
Do not count a retained/exported response as a spoken reply, inserted page,
acknowledged screenplay save, or restored screenplay. Root/Studio delivery is
still pending. No paid providers were called. Preserve Clementine and the orb.

## Implementation

- Reuse the existing atomic, protected outbox body record, now with version2
  `received` state and a response receipt. HTTP success no longer deletes a talk
  result or makes it eligible for another automatic generation.
- Keep original request identity/bytes and accepted response bytes together.
  Validate response identity, status, finite product-header allowlist and digest.
  Do not store response cookies, session IDs, authorization or unknown headers.
- Recover `received` from the durable body if updating its JSONL index fails.
  Migrate legacy raw request files without changing their original request ID.
  Preserve account/backend scope, including late responses after account change.
- An exact receipt acknowledgement settles a result; exporting does not.
  No production UI consumer calls that acknowledgement yet. Future callers must
  establish durable writer delivery before settling it.
- Data Controls says `Reply received`, exposes an honest export label and warns
  that explicit deletion of held turns also deletes any retained replies.
  It offers no fake Play/Apply action and no resend action for received results.

## Verification

- Focused signed suites: **36 passed / 0 failed / 0 skipped**.
- Full signed themTests: **922 / 0 / 0** on erased task-owned simulator
  `7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2.
- Cases include exact reply/audio retention after relaunch, stable duplicate
  enqueue identity, no automatic resend, wrong-account refusal, legacy migration,
  stale receipt refusal, corrupt response rejection, failed index update and
  failed settled-file unlink. Empty successful question-resolution responses
  retain their prior non-talk settlement behavior.
- macOS scaffold build: exit0. Existing concurrency/deprecation warnings remain.
- Fresh isolated Node20.20.2 source-dependent contracts: **7 / 0 / 0**.
  Runtime backend/dependencies are unchanged, so inherited full backend
  **2912 / 0 / 2** is not presented as a new full-suite run.
- D009 against exact parent16b2c84: all five deltas0; index33538,
  Studio17337, Root14937, bridge12860, MemoryAPI10463. Diff checks pass.
- Authenticated writer/create/save/native Files export/relaunch UI: **1/0/0**,
  intercepted chat1/STT0/TTS0. Existing loop still works; this is not live-model
  quality or the new queued-reply page-delivery proof.
- Actual recovery UI: **2/0/0**. Received state survives app relaunch, has an
  `Export received reply` action, no recovered-request resend action, and remains
  held after export. Existing request export/cancel/confirmed-deletion also
  passes. Both use explicit DEBUG fixtures, loopback port9 and no access token.
- Independently read the actual Files-provider export before any further erase:
  738bytes, SHA256
  `0bcd401b592f11da8c9cb1533d40e6e6f9a9a136204d4781efbf2d761daae1a7`.
  Original CRLF/tab/trailing-whitespace request and received22byte synthetic
  response match exactly. Header metadata contains no session credential;
  `body_omitted=false`. The request-only export is307bytes, SHA256
  `30d32cfc7dd4e1fc4869c937ba2619b43fe7b06bd93578c89d03ea45f98b6b20`.
- Visually opened that738byte JSON in Files/Quick Look outside THEM on the owned
  simulator at approximately18:36 local. This is a recovery-result export, not
  a formatted screenplay or production artifact. Also observed an already-open
  synthetic writer-loop Markdown export in the separate compatibility SE
  simulator without changing its data or claiming it came from this run.
- Final tracked-code snapshot: `/tmp/them-1116-final-source.Lcbnmm/source`.
  Signed result bundles/logs and synthetic exports are retained at
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1116-20261021.1IEbLq/`.

## Local server diagnostic — narrowly interpreted

`backend/evals/probe_offline_talk_persistence.mjs` uses actual local auth,
talk and storage with external providers intercepted, never production/.env.
The corrected run used host Node24.19.0 and a real audio fixture, with screenplay
target/page metadata. In each bound/unbound case: HTTP200, `responded`, 672
response bytes, one intercepted STT/chat/TTS call each. Turn metadata answered
200 before restart and404 after restart of the same data directory.

Neither response was an authoritative page (`authoritative=false`); unbound
projects stayed0, bound projects/versions stayed1. This establishes no durable
turn-metadata guarantee for these observed responses. It does **not** prove an
authoritative screenplay page was lost, nor cover every page-generation path.
That bound/unbound authoritative-page investigation remains part of T-1116.

The initial diagnostic used a shorter audio fixture and omitted diagnostic
fields; its log is retained separately. Its temporary source snapshot was
overwritten for the corrected diagnostic, so it is not immutable first-run
source evidence. The final tracked-source snapshot is separate and frozen.

## Compatibility, limits and adversarial audit

Current builds read old raw requests/version1 records and new version2 receipts.
Old builds do not understand `received`; do not downgrade a device with held
results without exporting them through this build and preserving its files.
There is no downgrade conversion/import or promise of old-client recovery.

Response audio up to32MiB is retained verbatim. Larger bodies retain allowed
metadata, original byte count and an explicit omission warning, not audio.
No full-result guarantee is claimed for oversized responses, truncated headers
or metadata available only from the backend's volatile turn lookup.

Answered at this boundary: accepted-result relaunch, exact original request,
duplicate enqueue, no resend, late-owner response isolation, legacy migration,
digest mismatch, explicit deletion, stale ack and interrupted index commit.
Partially addressed: storage failure after server acceptance. The request is
held instead of retried, but complete disk failure cannot guarantee durable
response storage. Power-loss/fsync, large-record IO latency and physical-device
file protection remain unmeasured; track IO under T-1115. Not covered: canonical
result decoding, reply playback, project/document-safe insertion, durable page
delivery acknowledgement, real microphone/model quality, main or production.

## Next implementation target

Extract/reuse canonical `BackendTalkResult` decoding without generation retry;
deliver held replies through the existing Clementine/page/save flow. Bind to
the original owner/backend/project/document, preserve newer writer edits, and
prove saved/restored words before acknowledging delivery. T-1116 stays active
until that authenticated queued-turn journey is observed end to end.
