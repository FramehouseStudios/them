# T-1172 — Accepted-turn restart recovery

October 26, 2026. Branch `codex/T-1172-durable-talk-replay`, worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-interrupted-talk-recovery`.
Parent `c073882264b3344d7c8ec0ac91ed31d826578463`.
Reproducerad961f9; durability/header3643a87; export safeguard
`56bd9772f70a494dcd1c9d7e0c84a057dde98b53`.
Realtime runtime `52b3703ea4e2d39e1e9e797e2e7a865a4977eaba`;
final transport assertion/gate sourcea9f7a56. This report/task update is the
forward checkpoint; runtime/native bytes are unchanged from the measured52b3703.
Goal active/incomplete. Original647, main and production held.

## 1. Completed locally

Reuse preserved T1118/T1121 through the existing shared persistence adapter:
canonical `talk_turns`/`talk_idempotency` domains, migration013, owner-scoped
metadata storage, bounded admission and completed-response persistence before
HTTP success. Await both metadata writes and all four completed-response writes
in the talk handler. Hydrate metadata after the authoritative auth startup
guard, preserving fail-closed startup. Async read failures return503
`turn_unavailable` rather than an unhandled Express4 rejection. Actual owner
scope plus public turn ID is the private storage key, avoiding cross-writer
`turn-1` collisions; preserve public IDs and older response contracts.

Canonical source:6385dcb capability, ec38b82 capacity follow-up, a6a3204 wiring
and owner/read-through fixes. Port only relevant files; do not import unrelated
historical voice/budget/native changes or overwrite the newer current queue.

The current default Node20 client exposed a separate real header overflow.
New `talk_response_headers.js` limits successful aggregate headers to8KiB,
including512byte reserve for automatically added fields. Keep small legacy
inline payloads; when necessary, omit whole screenplay/timing/text header fields
only if canonical metadata is advertised with a turn ID. Full scene text stays
in metadata, never truncated JSON. Optional rich hints may be omitted under
their existing optional contract. Preserve identity, action and security
headers; refuse an oversized response without recoverable metadata rather than
claim successful partial writing. The same owner handles inline JSON headers
and budgeting on each successful talk-response path. No raised client limit.

Raw export of new recovery domains exposed a synthetic session credential.
`accountExportPersistenceValue` now allowlists writer-owned turn content/audio
and excludes session/replay headers and unknown future fields. Existing
non-talk exports retain their shape. Private replay state is not mutated by
export sanitization.

Follow-up caller audit found `/realtime/turn_commit` still called the newly
async metadata function without awaiting it and omitted `userId`. Its actual
mounted handler now awaits storage, supplies canonical context/auth identity,
and returns503 `turn_metadata_write_failed` without private details on failure.
Memory may already have committed at that point: this is not an atomic memory+
metadata transaction or exactly-once realtime retry guarantee. No false201.

## 2. Exact changed files

Committed through56bd977:

- `TASKS.md`
- `backend/evals/probe_talk_restart_durability.mjs`
- `backend/index.js`
- `backend/lib/account_routes.js`
- `backend/lib/persistence_adapter.js`
- `backend/lib/scale_backplane.mjs`
- `backend/lib/talk_handler.js`
- `backend/lib/talk_pipeline.js`
- `backend/lib/talk_response_headers.js`
- `backend/lib/talk_state.js`
- `backend/lib/talk_turn_store.js`
- `backend/migrations/013_talk_result_durability.sql`
- `backend/tests/account_talk_export.test.mjs`
- `backend/tests/persistence_adapter.test.mjs`
- `backend/tests/talk_response_headers.test.mjs`
- `backend/tests/talk_result_persistence.test.mjs`
- `backend/tests/talk_state.test.mjs`
- `backend/tests/talk_turn_meta_contract.test.mjs`
- `backend/tests/talk_turn_meta_screenplay_length.test.mjs`
- `backend/tests/talk_turn_owner_storage.test.mjs`

Additional committed realtime and gate follow-up, plus this ledger:

- `backend/lib/realtime_turn_commit_route.js`
- `backend/tests/realtime_turn_metadata_durability.test.mjs`
- `backend/tests/talk.integration.test.mjs`
- `TASKS.md` current evidence/status update
- `docs/durable-talk-replay-2026-10-26.md`

No native source, dependency/lockfile, production setting or secret changed.

## 3. Actual failures and root evidence

- Default Node20 restart probe first failed `UND_ERR_HEADERS_OVERFLOW` before
  reading an accepted body. A separate bounded65KiB diagnostic parser measured
  headers17691,19773,20624,20626bytes; largest fields were6841byte screenplay
  output and5552byte cues. Diagnostic relaxation is not the product fix or
  default-client proof; only byte counts/names were printed, no header values.
- That diagnostic reached both restarts: metadata404, no replay header,
  changed turn ID and new STT1/chat2/TTS23 after each retry. Deterministic audio
  happened to match after regeneration, which is not replay proof. Wallet was
  not debited; unchanged balance does not prove duplicate-charge prevention.
- Export regression against frozen3643a87 runtime with the stronger current
  probe failed `New recovery exports exposed session authority.` Existing
  source snapshot was copied before modification; original red remains intact.
- Socket-free actual mounted realtime handler red **0/2/0** against56bd977:
  201 published while metadata promise was outstanding; recorded owner absent.
  The same cases pass after the follow-up; separate rejection case proves503.
- First combined full Node20 run at52b3703: **2910/1/2**. Its only failure
  required an inline dialogue timeline after the new transport policy deferred
  that complete field to canonical metadata. The updated contract fetches the
  actual turn, preserves every text/scene/anchor/timeline assertion, checks any
  inline JSON agrees with the full metadata and asserts aggregate headers fit
  the product budget. A missing or invalid canonical timeline still fails.
  Focused file7/0/1, then final full2911/0/2. Runtime was not changed to hide it.

## 4. Verified results and precise limits

At exact56bd977, existing in-flight command31664 finished exit0:

- Focused isolated Node20.20.2 **88 passed/0failed/0skipped**: persistence,
  state, owner collisions/read-through, expiry/capacity, response contract,
  full scene length, aggregate header policy and export credential filtering.
- Real local auth/accepted-talk/JSON restart journey: graceful and immediate
  SIGKILL after HTTP response restore same turn and identical15456audio bytes,
  replay header1, zero fresh STT/chat/TTS. Owner metadata200, other403 after
  graceful restart; original full1026byte scene restored exactly through both.
  Accepted/replay headers5298,5244,7325bytes, all<=8192 using default fetch.
  Own account export includes both domains; other account includes neither;
  exported recovery domains omit the synthetic client token.
- Billing explicitly unproven: initialDebitObserved=false, forced restart
  balance100. Reuse server budget/durable settlement work later; do not report
  this as charged-turn or multi-worker billing safety.

At committed realtime-inclusive52b3703 and final gate sourcea9f7a56:

- Actual mounted realtime handler with fixture memory dependencies and no
  listener: **3passed/0failed/0skipped**. New red/green use separate public
  source snapshots and local exact-lock dependencies, not a replacement route.
- Pure header/export checks **8/0/0**, current committed sources. These do not
  substitute for HTTP, native or PostgreSQL behavior.
- Full network-isolated Node20.20.2 **2911 passed/0failed/2skipped**,47suites.
  Retain the prior2910/1/2 separately. Skips are the real-Postgres prefix case
  without DATABASE_URL and the existing live-page-sync-gated integration case.
  The actual PostgreSQL prefix case passes separately **1/0/0**; do not change
  the full suite's reported skip count or claim the gated live case ran.
- All13 canonical migrations applied on the owned temporary PostgreSQL16
  fixture, including013; second run applied0/pending0. Real authenticated PG
  restart proof passes after graceful and immediate-SIGKILL restarts: owner200,
  other403 after graceful restart, replay1, same turn, exact15456audio bytes,
  complete1026byte scene, zero fresh STT/chat/TTS. JSON repeats on exact52b3703
  also pass. Accepted headers5298/5299bytes; replay5244 and7325bytes, <=8192.
- Signed erased queued reply -> metadata -> Play/Stop -> full append -> one
  matching version -> receipt removal -> exact full editor relaunch **1/0/0**,
  intercepted STT/chat/TTS1/2/23. Raw-audio Home -> page/save/one project/exact
  restore **1/0/0**, intercepted1/2/1. Normal signing, task-owned91693 only,
  serial frozen native proofs. No real microphone, audible/model-quality claim.
- Syntax and `git diff --check` pass.
- Canonical D009 vs fetched actualc073882: index33513->33494(-19),
  Studio17345, Root14933, bridge12788, MemoryAPI10463 unchanged. No padding or
  gate suppression. Six persistence/pipeline/migration runtime files byte-match
  preserveda6a3204; header/export/realtime corrections are explicit additions.

Native source/tests/project/Mac scaffold are byte-unchanged fromc073882. Do not
claim fresh signed unit or Mac runs: T1171 signed884/0/0 and Mac build remain
inherited. The affected runtime/header contract is freshly checked through both
signed UI workflows and full backend. Required fresh integrated-main units and
hosted checks remain future boundaries. No paid/shipping/physical-phone proof.

Permanent evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1172-20261026.IXtIpZ/`.
Retain distinct header/restart/export/realtime/full-suite reds, diagnostics,
focused/final logs, migrations, source snapshots and signed UI bundles. Temporary
`/private/tmp/them-1172.Obp8dK/` is not the only intended retained location.

## 5. GitHub and environment status

Scoped normal backup push only after local gates, preserving all original
heads. No replacement PR, force push, main merge or deployment. GitHub connector
unavailable, so use the authorized GitHub CLI fallback for exact PR state and
evidence. Refreshed647 is open/draft848e59d/basecoverage-follows-draft;648 is
open/draft210c5ef/baseproject-auto-title. Authoritative post-push refs and comment
receipt are recorded separately. Do not infer current hosted checks from these
local results. Keep original647 held for budget/settlement and remaining gaps.

An isolated PostgreSQL16 fixture was created before approval review failed:
name `them-t1172-postgres-proof`, task label `them.task=T-1172`, full container
ID `608de78795c29cf25572cb37cb96ad7f3144f4117342cfcb4079e38e915f8038`.
Internal network `them-t1172-pg-network`; temporary PG data. Initial inspection
showed no published port despite the requested loopback bind. Do not replace a
running fixture for a missing port: use its existing internal network namespace
with guardedlocalhost DB URL. After all probes/migration/prefix checks exited,
verify its full ID/task label, record migration names and stop that exact
container. Final inspected state **exited**. No container/network deletion or
production database access. Migration013 has not been deployed to production.

Automatic approval review rejected the database-readiness command with:
“Your workspace is out of credits. Add credits to continue.” It explicitly
reported a review failure, not an unsafe-action verdict; that command did not
execute. No retry through an alternate privileged path or weakened permissions.
Human was asked to resolve **Codex workspace** credits/billing; THEM/OpenAI API
credits are a different balance. Local audit found/fixed the missed realtime
caller while that command remained unavailable. On the later goal continuation,
one recheck of the original read-only readiness command through the **same**
mandatory approval path succeeded. Subsequent authorized commands completed;
no bypass or weaker permission route. This proves command access recovered,
not that anyone added credits or that the underlying billing cause is known.
The earlier request is no longer a blocker to this checkpoint.

## 6. Next exact actions

1. Save/hash final evidence and normally publish only scoped T1172. Verify
   refs; record evidence on original647. No replacement PR, squash, force push,
   direct main push, bypass or original advance. Keep original647 held.
2. Reuse preserved server-owned budget/durable settlement prerequisites and
   T1122 after reproducing their current failures. Multi-worker admission,
   pending-process death, expired retry and wallet/result atomicity remain open.
   Current replay defaults five minutes/160 admissions; metadata30minutes/4000.
   Same-process capacity admission is serialized, not a global worker lock.
   Bounded metadata pruning is not permanent conversation storage. A retained
   accepted response alone is not durable funded settlement.
3. Continue original/unbound context, retained first setup, overlap preservation
   and actual native screenplay export. Integrated-main and the explicitly
   identified real-phone/backend journey remain required; production hold stays.

## 7. Continue status

**READY FOR CONTINUE.** Goal active/incomplete. Approval access recovered;
continue the safe budget/settlement fix. Human non-author reviews, production
hold and actual real-phone/model journey remain separate gates. Never redefine
product completion around these deterministic local successes.
