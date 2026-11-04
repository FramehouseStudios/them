# Accepted screenplay metadata recovery — 2026-10-26

## Result and scope

**VERIFIED:** an accepted reply could survive as a durable prepared/billed audio
response while its separate screenplay metadata expired. On retry the server
returned the same audio and one settled charge, but `/talk/turn/:id` returned
404. Three actual authenticated crash/restart cases reproduced this; the three
ordinary restart controls passed. Expiration was induced on only the isolated
fixture's persisted public metadata; this was not a 30-minute wall-clock run.

**VERIFIED:** newly admitted idempotent replies retain their available sanitized
turn metadata in the same durable response envelope. Before settlement/replay succeeds, the existing turn
store restores that exact accepted content if it has expired or been evicted.
This is delivery custody inside the existing envelope, not another store or
generation. Public metadata still has bounded retention. Legacy replies without
a snapshot keep their old behavior; missing historical text is not invented.

The adversarial pass also reproduced an independent cleanup race: an old store
instance's expiration pass deleted metadata another instance had freshly
restored. Conditional deletion now checks the exact stored snapshot atomically
through the canonical JSON/PostgreSQL adapters. A stale cache cannot delete a
newer canonical publication. Explicit user deletion keeps its existing behavior.

## Implementation

- `talk_handler` captures the return value from the existing sanitized metadata
  writer. `talk_state` deep-copies it into the prepared reply before any durable
  wallet settlement. Prepared and completed replay await metadata restoration.
- Restoration checks trusted owner/session scope, public turn ID and accepted
  content. Conflicting publications and failed writes cannot publish the cached
  audio as success or trigger another generation/charge. Compare-and-swap
  handles competing restoration attempts; conflicting data is kept.
- `talk_turn_store` remains the metadata owner. JSON and PostgreSQL gain one
  canonical `compareAndDelete` primitive for snapshot-aware retention cleanup.
- One request-owner resolver serves public metadata reads and replay restoration.
  Authenticated ownership survives token rotation; session-only legacy metadata
  stays bound to its original session.
- Account export includes the writer-owned snapshot through the existing
  allowlist, excluding nested session authority and unknown private fields.
  Existing owner-scoped purge domains already include the response envelope.
- Public response/metadata field names, client code, provider routing, wallet
  pricing, migration files and retention defaults are unchanged. No paid calls,
  new dependencies, parallel persistence system or production changes.

Parent: `182fd3bd6b1037c5bb4f133fbadfce048084e5e9`. Initial red `b3960f4`, metadata
repair `3366dba`, stale-prune red `ebbf968`, final runtime
`a4868d4a07c334394f6a4f540c3eb162eb8859a2`.

## Proof

- Authenticated crash/restart red: **3 passed / 3 failed / 0 skipped**. The
  expired cases failed with 404 after replay and one durable 0.2-Page debit.
- Final crash/restart cases: **6/0/0**. Prepared, debited and completed boundaries
  each pass with and without expired metadata; exact audio replayed twice, full
  accepted screenplay restored, one receipt, balance 100 → 99.8, zero new
  provider calls after restart. Expired cases additionally prove other-owner
  403 and account export without the private client token.
- Stale-cleanup red: **7/1/0**, then covered by the final focused **102/0/0**.
  An earlier focused run had two test-authoring failures from checking a
  mixed-case header key in the lowercase response stub; corrected without
  changing runtime behavior. All logs are retained.
- Full pinned Node **20.20.2**, frozen final runtime, network-disabled proof
  container: **2,987 passed / 0 failed / 5 skipped**, 2,992 tests, 47 suites.
  Four skips were inherited gated PostgreSQL/live-page cases. The fifth was the
  new task-owned PostgreSQL case without its explicit database variable.
- Separate actual PostgreSQL16 proof: **1/0/0**. Conditional deletion preserves a
  newer publication, stale-worker cleanup preserves restored content, eight
  concurrent restorations converge, and another owner is denied. All 14
  migrations applied; repeat status had 14 applied / 0 pending. Only isolated
  database `t1177` was used, network `none`, no host ports or production inputs.
  This is actual SQL proof, not a full authenticated HTTP/PostgreSQL restart run.
- Signed queued-reply iPhone UI **1/0/0** and normal raw-audio transport UI
  **1/0/0** against the updated backend. Both include page application/save and
  relaunch restoration. Provider calls were intercepted: queued STT1/chat2/TTS23;
  raw STT1/chat3/TTS1. These are not live microphone/model/voice-quality proofs.
- Task-owned simulator `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A` erased before each
  signed UI run. No other simulator or physical phone touched.
- App/unit/UI/project source bytes are unchanged from T1176. Its signed units
  **901/0/0** and successful macOS build are inherited evidence, not rerun here.
- D009 passes against the exact saved parent: index33494, Studio17340,
  Root14933, bridge12788, MemoryAPI10463, all unchanged. Syntax/diff checks pass.

The full-suite container initially failed before process launch because the
read-only archive lacked two empty nested mount destinations. Those setup
errors were retained and both mountpoints added. The same container then ran
the full suite once; no executed failure was retried away.

Permanent local evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1177-20261026.0fu6adxt/`.
1,286 files, zero hash mismatches; manifest SHA-256
`c69190234fd10ea6e4fe98ba87bc5a879389577a53835ab358dd82549c15de92`.
Full-test container exited0. The identity-checked PostgreSQL fixture was stopped;
borrowed dependency link removed. No active proof process remains.

## Limits and next work

- This fixes recovery while its durable reply envelope remains available. The
  existing completed-response TTL is five minutes by default; recovery after
  that envelope also expires is not established. Audit that separately before
  claiming indefinite or fully acknowledged delivery custody.
- Requests without an idempotency key retain their legacy bounded metadata
  behavior; this does not create durable response replay for unkeyed requests.
- Existing public metadata sanitization/length limits remain; this pass does not
  prove arbitrarily long single-batch output or remove the 32k text ceiling.
- JSON persistence remains single-process. Real SQL conditional operations were
  tested, but a multi-host deployment or arbitrary power-loss durability was not.
- Conflicting accepted content fails closed; the repair does not resolve a
  same-owner public turn-number collision by silently replacing either scene.
- Review wallet/Page-cancel request ownership before advancing the integration
  boundary. That is a follow-up audit, not a newly proven exploit in this report.
- The external Grok audit remains unreadable and has not been endorsed. These
  fixes come from independently reproduced current-code failures.
- Original647/main/production remain held. Next: audit remaining delivery-window
  and authorization boundaries, continue original PR integration through its
  actual bases/checks/reviews, then prove the intended-backend physical-iPhone
  journey. The overall goal is incomplete; production hold remains.

Changed files: `backend/index.js`; `backend/lib/{account_routes.js,
persistence_adapter.js,persistence_json.js,persistence_postgres.js,talk_handler.js,
talk_state.js,talk_turn_store.js}`; `backend/tests/{account_talk_export.test.mjs,
persistence_adapter.test.mjs,talk_metadata_custody.postgres.test.mjs,
talk_replay_metadata_custody.test.mjs,talk_settlement_restart.integration.test.mjs,
talk_state.test.mjs}`; `TASKS.md`; this report.
