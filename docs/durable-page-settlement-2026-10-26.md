# Durable Page settlement — 2026-10-26

## Scope and implementation

**VERIFIED:** scoped branch `codex/T-1175-durable-page-settlement`, based on
saved T1173 `b31c7daba8933f5dde3d512300e23477b3e2e700`. Integrates preserved
T1122 implementation `051328b` and boundary follow-up `31bd768`, with their
focused proof `cf7caff`. Original source remains preserved in Git history.
Current runtime is `909ec60`; subsequent report-only changes do not alter it.
No original PR head, main or production change; no paid model calls.

Two current-tree reds at `4982c19` reproduced the root cause: **0 passed /
2 failed / 0 skipped**. A successful in-memory debit swallowed the subsequent
storage rejection, and queued persistence closures read mutable balances at
execution time rather than their own immutable snapshots.

The canonical accepted Page sequence is now:

1. Authoritative voice/typed routing and server-owned budget admission remain
   in the existing T1173 Page/wallet adapter. Holds remain provisional.
2. Await durable publication of the exact accepted response and charge intent
   as an idempotency record in state `prepared`.
3. Await the canonical wallet's durable settlement. PostgreSQL writes a unique
   receipt and debit in one statement; retries return the existing receipt.
   The single-process JSON adapter uses prepared/applying/completed receipts
   and balance compare-and-swap for process-crash reconciliation.
4. Only then publish `completed` and acknowledge the response.
5. On retry, the startup-wired guard reconciles an existing prepared receipt
   and replays its exact bytes, without transcription/generation/TTS.

`backend/index.js` uses one deferred reference to the existing canonical wallet
because guard construction precedes wallet construction, while request mounting
and serving occur after wallet assignment/hydration. No second store is created.
The index line count remains **33494**.

Legacy writes now snapshot their row and expose the first failed write through
`flush()`. Provisional reserve/top-up/release no longer persist as a final debit.
Installing a reconciled balance accounts for other outstanding local holds.
The PostgreSQL IAP credit path uses a single credit-ledger/balance statement so
concurrent credit and settlement compose through the pool safely.

Prepared billed results have no automatic expiry until reconciled. Same-key
admission and pending/prepared/completed transitions use canonical persistence
CAS to reject a second worker or a stale completion. A close/release while
preparation is awaiting cannot publish a completed unpaid result. Requests
without a stable client key still await a reservation-scoped durable debit, but
do not gain cross-request exactly-once replay.

Adversarial review reproduced one additional current-tree failure: a second
late recovery completion could overwrite an already completed accepted reply.
Red source `b8f66f6`: **0 pass / 1 fail / 41 unselected skips**. Runtime
`909ec60` rejects that transition with
`TALK_IDEMPOTENCY_RESPONSE_COMPLETED`; the accepted bytes remain immutable.
Focused talk-state proof: **42 pass / 0 fail / 0 skip**.

## Verification and limits

All provider traffic is deterministic interception. A fixture reply or audio
sample does not establish live model quality, spoken microphone recognition,
phone interaction or shipping readiness.

| Source / check | Observed result |
| --- | --- |
| `db4bdfe` focused pinned Node20 | **134 pass / 0 fail / 0 skip** |
| `e0c2efa` actual authenticated JSON process-crash cases | **3 pass / 0 fail / 0 skip** |
| First full pinned Node20, before late-recovery fix | **2970 pass / 0 fail / 4 skip**, 47 suites |
| `909ec60` final full pinned Node20 | **2971 pass / 0 fail / 4 skip**, 47 suites |
| Actual isolated PostgreSQL16 concurrency/rollback/admission | **2 pass / 0 fail / 0 skip** |
| Actual authenticated PostgreSQL HTTP graceful/immediate-SIGKILL restart, final runtime | Passed, exact reply/scene, two durable receipts, no new provider calls |
| Signed raw-audio → page/save/relaunch, before late-recovery fix | **1 pass / 0 fail / 0 skip** |
| Final signed raw-audio → page/save/relaunch | **1 pass / 0 fail / 0 skip**, intercepted STT1/chat3/TTS1 |
| Final signed queued reply/playback/append/one-save/restore | **1 pass / 0 fail / 0 skip**, intercepted STT1/chat2/TTS23 |

The three JSON crash tests terminate only their own test backend, after durable
prepared response, after durable balance debit, and after durable completed
response respectively. A fresh backend/session retries twice: same public turn,
same exact response bytes, full canonical screenplay metadata, **one receipt**,
**100 → 99.8 Page turns**, zero new STT/chat/TTS. The injected fault module is
restricted to an explicit loopback test process, temporary JSON root and no
database URL. There is no shipping crash switch or provider fallback.

The separate PostgreSQL tests use only guarded localhost database `/t1122` in
a task-labelled, network-isolated container with tmpfs data and no published
host ports. Twelve simultaneous same-key settlements produce one debit; an
injected trigger failure rolls back both receipt and debit; concurrent credit
and debit yield **14.6 turns**; two independent workers admit one request and
reject stale preparation. All fourteen migrations apply, and a repeat run
reports **14 already applied / 0 pending / 0 applied**.

The authenticated PostgreSQL HTTP probe also exercises trusted ownership:
owner metadata read **200**, other account **403**, own-only export without
session-token leakage. After graceful restart and immediate SIGKILL after the
HTTP body, it replays identical **15456-byte** audio and the full **1026-byte**
scene, with zero new provider calls. Header sizes **5298 / 5244 / 7325 bytes**
remain within the existing normal-client budget. Two distinct accepted requests
settle **100 → 99.8 → 99.6**; replay adds no debit. Both durable receipts are
verified in the dedicated PostgreSQL wallet backend.

Full-suite skips remain explicit: opt-in real-Postgres prefix test, the gated
live Page-sync case, and the two T1122 Postgres cases without their opt-in URL.
The separately passing database proofs do not change the full-suite skip count.

Native app/unit/project source is unchanged from saved T1174 `977717e`; its
**886/0/0 signed units and successful macOS scaffold build** are inherited,
not new reruns. Essential UI uses the same owned erased simulator
`91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`, normal signing and genuine synthetic
auth/funding through canonical persistence. Only one Xcode run executes at once.

D009 against saved T1172: index **33494**, Studio **17345**, Root **14933**,
bridge **12788**, Memory API **10463**, all unchanged; pass. Node syntax and
`git diff --check`: pass.

Permanent evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1175-20261026.v9EiKu/`.
Preserves reds, focused/full logs, exact final xcresults/summaries, migration
and PostgreSQL observations, and SHA-256 manifest. All runners are terminal.
Database fixture full identity
`8161fee218d68ced92e2c8e8c6fa0aef86bff613a3a0b80970601d19366e5c57`,
name `them-t1175-postgres-proof`, label `them.task=T-1175`, is **exited**.
It was stopped after identity verification, not deleted. Only the task-created
dependency symlink was removed after native/backend runs finished.

GitHub publication of the prior T1173 checkpoint initially hit GraphQL quota.
An official read-only quota check later showed available capacity; the same
authorized checkpoint was posted through REST on original647:
https://github.com/FramehouseStudios/them/pull/647#issuecomment-6433720834.
No account switch, approval impersonation or review/check bypass occurred.

## Remaining risks and next work

- **Answered in the exercised boundaries:** accepted response before debit,
  debit before completion, duplicate settlement, storage rejection, retry after
  graceful/abrupt process stop, late recovery overwrite, close during prepared
  write, same-key worker admission, credit/debit composition, owner isolation.
- **Not covered:** machine power loss/filesystem durability beyond the existing
  JSON adapter contract. JSON mode remains single-process; production clustering
  requires PostgreSQL. No Redis-only atomic-settlement claim.
- **Not covered:** globally atomic capacity/headroom across distinct keys and
  multiple backend workers. Durable debit fails closed; local reservation
  headroom and bounded admission counts are not a distributed quota service.
- **Not covered:** unlimited replay retention. Completed replay and turn metadata
  keep their existing bounded retention; prepared charge intents do not expire,
  but very late recovery after public metadata expiry needs a separate custody
  audit. Do not claim all generated page text is retained forever.
- Financial receipt retention/export/deletion policy remains a separate audit
  with the existing wallet/IAP records. This change introduces no privacy copy
  or legal-retention decision and does not claim account-lifecycle compliance.
- Main integration, real iPhone story/rewrite/offline journey, actual native
  screenplay export opened outside THEM and the intended shipping backend are
  still unproven. Production remains held by the human's existing decision.

Next: preserve this proven checkpoint, audit the remaining accepted-page custody
boundary, and connect native screenplay export before advancing original647.

## Changed files

```text
TASKS.md
backend/index.js
backend/lib/clementine/page_lane_adapter.js
backend/lib/clementine/wallet.js
backend/lib/clementine/wallet_persistence.js
backend/lib/persistence_adapter.js
backend/lib/scale_backplane.mjs
backend/lib/talk_state.js
backend/migrations/014_wallet_talk_settlements.sql
backend/evals/probe_talk_restart_durability.mjs
backend/tests/wallet_write_acknowledgement.test.mjs
backend/tests/clementine_wallet_persistence.test.mjs
backend/tests/clementine_wallet_settlement.postgres.test.mjs
backend/tests/persistence_adapter.test.mjs
backend/tests/server_page_budget.test.mjs
backend/tests/talk_idempotency_admission.postgres.test.mjs
backend/tests/talk_result_persistence.test.mjs
backend/tests/talk_state.test.mjs
backend/tests/helpers/settlement_crash_fixture.mjs
backend/tests/talk_settlement_restart.integration.test.mjs
docs/durable-page-settlement-2026-10-26.md
```
