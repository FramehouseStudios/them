# Original #625 — Failed-generation billing on current main

## Problem and preserved fix

VERIFIED current rehearsal baseline through actual runTalkGenerate: two
injected provider calls, zero returned reply bytes, wallet commit callback123.
`/tmp/them-993-empty-draft-before.log` fails the non-empty-output assertion.
This was synthetic transport/callback evidence, not a live paid request.

Preserve original #625 head795f14fc8fe9c6caee7b6b3677476038414879f0, including
its later asked_repeat/continue_listening recovery fix. Normal merge
7f6159dd09a491b499216821d42320770f955ec9 has parents795f14fc and current
main deac1a6d54a65dbf5f849f0f35476ad4ff07e1f0. No conflicts. All seven
original files, implementation and follow-up commits were read. No squash,
replacement PR, original-history rewrite, main merge or production mutation.

The existing fix validates provider HTTP/JSON/content before proposing
usage, retains non-empty output when a quality-gate reply is empty, decodes
the production supplier envelope, and settles wallet reservations once on
response completion rather than blindly at generation. Failed/recovery,
disconnect and thrown-handler paths release holds.

Follow-up129d22c6dba10c4d76affaeb7ecc2e7593601586 changes only the real HTTP
tests: REQUIRE_USER_AUTH=true and anonymous project access must return401.
No new runtime billing implementation was invented. No caller-supplied ID
was accepted as authentication for this preservation proof.

## VERIFIED current local proof

- Original focused generation/supplier/lane/HTTP/lifecycle33/0/0, host Node26:
  `/tmp/them-993-focused.log`.
- Strengthened signed-in HTTP proof plus same focused set33/0/0, host Node26:
  `/tmp/them-993-auth-focused.log`.
- Full pinned Node20.20.2 backend2761 passed/0 failed/2 skipped, exit0,
  no external network, actual locked dependencies and disposable persistence:
  `/tmp/them-993-node20.log`. Both empty/prose preservation cases and all
  recovery/duplicate-lifecycle cases execute in this complete suite.
- Signed full iOS units624/0/0, exit0, exact erased owned simulator
 11CF5EFB-D8C3-4F19-8062-28AF37F27D93/iOS26.2:
  `/tmp/them-993-units/v1-ui-smoke-local-1-88711.xcresult`,
  `/tmp/them-993-units.log`; actual summary confirms counts/device.
  Unit run began on7f6159d; later129d22c changes a Node test only. All Swift,
  resources, package and project files remain byte-identical to that run
  and current main. No new writer UI/macOS run claimed for this billing head.
- D009 versus actual fetched main deac1a6d: all five deltas0; diff clean.
  The accepted historical33626 index count remains; the later product stack
  has not established33603 on main. Do not rewrite unrelated lines to fake it.
- Completed logs/bundle retained privately and bundle compared byte-identical:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-993-20261019.zUGV6v/`.
  Same-computer retention, not off-device backup.

## Adversarial scope, not a security certification

- Answered: rejected empty/prose replies preserve actual saved project,
  session history and wallet balance, including backend restart (JSON
  persistence). Transport-only stub asserts real production generation was
  reached. Authentication is enforced; anonymous project read is denied.
- Answered: HTTP200 asked_repeat/continue_listening release reservations;
  repeated finish/close events settle once, success commits actual usage,
  exceptions/disconnect events release. Disconnect is an adapter-event test,
  not a physical network interruption.
- Not covered: process-crash reconciliation of in-flight reservations,
  distributed wallet settlement, physical-phone durable save acknowledgement,
  live provider quality, purchase verification or production migration/restore.
  Current main dependency vulnerabilities and runtime-maintenance debt are
  separate, not fixed or certified by this billing patch.

## Exact files versus main

- TASKS.md
- backend/lib/clementine/page_lane_adapter.js
- backend/lib/clementine/short_film_lane.js
- backend/lib/talk_generate.js
- backend/tests/empty_generation_billing.test.mjs
- backend/tests/helpers/billing_provider_stub.mjs
- backend/tests/talk_empty_billing.integration.test.mjs
- docs/empty-generation-billing-proof.md (preserved original evidence)
- docs/billing-main-proof-2026-10-19.md

## Rollout hold and next step

Draft original #625 only. Fresh exact-head hosted Backend tests/Quality Gate/
D009 and independent non-author approval are required before any merge.
No direct main push, auto-merge, replacement PR, protection bypass or paid
model call. Production remains blocked by the human until App Store
credentials exist; accepted D011 is unchanged. Physical microphone, shipping
backend, live generated120-page screenplay and external-open export remain
unproven. Historical report instructions mentioning Claude are history only;
the human retired that workflow. Codex remains the implementation owner.

Next: publish/recheck the original PR head with preserving history, then
carry the proven billing correction into the product rehearsal without
dropping its editor/recovery/compatibility work.
Continue status: READY FOR CONTINUE.
