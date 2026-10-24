# T-1122 — Durable Page settlement handoff, 2026-10-21

Integration follow-up: [T-1124, 2026-10-24](page-settlement-integration-2026-10-24.md)
preserves this history and both later source-only admission/completion fixes,
wires the canonical callback and records actual authenticated restart proof.
The unwired status below describes this original dated handoff, not T-1124.

## Checkpoint

VERIFIED on branch `codex/T-1122-durable-page-settlement`, based on
`d2532cf090efaf2ed2da5fdc87cc005cb9f7339a`. Runtime commit `051328b`; focused
proof commit `cf7caff`; adversarial boundary follow-up `31bd768`. The original
T-1118 worktree and branch were not changed.
No push, merge, deployment, native change, paid provider request or production
database operation occurred.

This is a bounded reliability capability, not a claim that T-1122 is integrated:
the Jarvis-owned `backend/index.js` callback below is still required for restart
reconciliation. The existing guard fails closed with retryable503 when it sees a
billed `prepared` response without that callback; it does not regenerate.

## Root cause and fix

The old Page path settled from `res.finish`. `wallet.commit()` returned success
after changing process memory, queued a mutable balance row, and swallowed the
storage rejection in the queue. The deterministic red result was reported0.2
turn settled and memory9.8, while durable and restarted balances stayed10.

The new boundary is:

1. Page reservations and budget top-ups remain provisional/process-local.
2. `commitSuccess` durably stores exact response bytes, headers and charge intent
   as `prepared`.
3. The Page adapter awaits `wallet.commitDurably` before idempotency completion.
4. A unique durable settlement receipt and balance debit occur atomically in one
   PostgreSQL CTE. Duplicate receipt keys return the already-applied result.
5. Only after settlement does the replay record become `completed`.
6. If the process stops or settlement fails, the next request reconciles the
   receipt and replays the exact prepared bytes; it never calls generation.

The adapter/JSON fallback uses receipt states `prepared → applying → completed`
and balance compare-and-swap. It can recover a stop before or after the balance
CAS without a second debit. An owner-scoped in-process lock prevents distinct
local receipts from confusing identical balance transitions. JSON persistence is
still explicitly single-process; clustered billing must use the dedicated
PostgreSQL backend.

Legacy balance writes now snapshot their row at enqueue time and retain the first
write error for `flush()`. This makes the reproduced failure observable, but the
accepted Page path no longer relies on that legacy queue. StoreKit crediting was
also converted from `BEGIN`/`COMMIT` through a pool-shaped query facade to one
atomic CTE, so a concurrent credit composes with the settlement row update.

The follow-up closes four observed boundaries:

- Page responses without a client idempotency key, or with replay disabled, now
  await a reservation-scoped durable receipt before success. Storage failure is
  propagated. Because that key is not stable across a new client request, this
  proves acknowledgement durability only—not retry deduplication or exact replay.
- A billed `prepared` record has `expiresAt:0` until reconciliation completes.
  It cannot disappear after five minutes and admit regeneration against an
  existing receipt. Completed records, and prepared records with no settlement,
  retain the configured bounded TTL. Unresolved billed records consume capacity
  until reconciled; capacity fails closed rather than deleting them.
- Pending admission and pending→prepared→completed publication use canonical
  persistence compare-and-swap. Two PostgreSQL-backed workers cannot both admit
  the same key, and a stale worker cannot overwrite a newer result state.
- Page wallet state distinguishes pending, released and committed. If `close`
  releases the provisional hold while the prepared write is awaiting, durable
  settlement throws `wallet_reservation_released`; completion is not published.
  The keyed prepared response remains available for later reconciliation.

## Required reserved integration hunk

Jarvis retained `backend/index.js`. Apply the following shape before mounting the
guard; do not create a second wallet store:

```diff
 // before createTalkIdempotencyGuard(...)
+let clementineWalletStore = null;

 const talkIdempotencyGuard = createTalkIdempotencyGuard({
   ...
+  reconcilePreparedIdempotency: async (_req, settlement) => {
+    if (!clementineWalletStore) {
+      const error = new Error("wallet settlement recovery is not initialized");
+      error.code = "wallet_settlement_unavailable";
+      throw error;
+    }
+    return clementineWalletStore.reconcileDurableSettlement(settlement);
+  },
 });

-const clementineWalletStore = createWalletStore({
+clementineWalletStore = createWalletStore({
   persistence: clementineWalletPersistence,
 });
```

The closure is deliberate: guard construction currently precedes wallet-store
construction, while requests are mounted only after the store is assigned and
hydrated. The callback must use the canonical store because it preserves any
other process-local holds when installing the reconciled durable balance.

After applying this hunk, run one full exact-lock backend suite and an actual
authenticated restart probe with intercepted providers. The restart probe should
force failure after durable `prepared`, retry the same owner/key, assert identical
bytes and zero new provider calls, one receipt, and balance10→9.8 exactly once.

## Verification

All focused tests ran in `them-foundation-proof-tools:node20` with the exact-lock
read-only dependencies from
`/tmp/them-t1118-node20-deps.jVOfVY/backend/node_modules`.

- Focused wallet/IAP/Page/replay/persistence suite: **118 pass / 0 fail / 0 skip**.
- Actual ephemeral PostgreSQL16 proofs: **2 pass / 0 fail / 0 skip**.
  It launched 12 same-key settlements concurrently and observed one debit;
  forced the receipt insert to raise from a trigger and observed no receipt or
  debit; ran credit and debit concurrently and observed the composed14.6 balance;
  then used two independent PostgreSQL pools/backplanes to prove one pending
  admission and rejection of a stale prepared transition. The task-owned
  containers were stopped and removed.
- Both opt-in PostgreSQL tests reject any URL whose host is not loopback or
  `host.docker.internal`, or whose database is not exactly `/t1122`. Trigger and
  function names are unique per run. An explicit non-local URL probe failed
  before connection with the expected refusal.
- Node syntax checks: pass for all changed runtime modules and the PostgreSQL
  proof.
- `git diff --check`: pass.
- D009 against `origin/main`: pass; all five watched god files shrink, and this
  branch does not edit them.

The PostgreSQL test is opt-in through `T1122_DATABASE_URL`; ordinary secret-free
runs report it skipped. No provider call is required.

## Adversarial result

- **Answered:** retry/duplicate delivery — unique receipt plus identity conflict
  rejection; memory, fake-SQL and actual-PostgreSQL proofs.
- **Answered:** stop before/after JSON balance CAS — applying receipt reconciles
  without a second debit.
- **Answered:** PostgreSQL partial statement failure — trigger-forced exception
  rolls back receipt and debit together.
- **Answered:** completion write failure after debit — prepared response remains;
  receipt retry is idempotent and completion/replay can resume.
- **Answered:** stale/alternate recovery response — a second handler completion
  cannot overwrite an existing prepared response.
- **Answered:** close/release during prepared persistence — completion is refused,
  no receipt/debit is fabricated, and keyed prepared recovery remains intact.
- **Answered:** same-key multiworker preparation — PostgreSQL CAS admits one
  worker and fences stale state transitions.
- **Answered:** owner isolation — settlement key is the trusted owner-scoped
  replay key, and existing cross-owner replay tests remain green.
- **Partially addressed:** timeout/offline/provider disappearance — billed prepared
  retries return503 while storage is unavailable and never regenerate; no client
  offline UX or physical-device flow was exercised here.
- **Partially addressed:** requests without a client idempotency key await their
  durable reservation-scoped receipt, but a later new request can regenerate and
  charge again. Cross-request exactly-once behavior requires a stable client key.
- **Not covered:** JSON multi-process safety. This is an explicit unsupported
  mode, not inferred distributed atomicity.
- **Not covered:** globally atomic capacity across different idempotency keys.
  Same-key admission is PostgreSQL-atomic; the bounded capacity count remains a
  same-process admission lock and may overshoot across workers.
- **Not covered:** production migration rollout/rollback, Redis behavior,
  physical power loss and storage-engine durability settings.
- **Pre-existing follow-up:** canonical account export/purge does not include the
  dedicated wallet balance, IAP or settlement tables. T-1122 adds no screenplay
  content to receipts, but wallet-ledger retention/deletion policy needs one
  product-owned resolution across all three tables.

## Files

Runtime: `backend/lib/clementine/wallet.js`,
`backend/lib/clementine/wallet_persistence.js`,
`backend/lib/clementine/page_lane_adapter.js`, `backend/lib/talk_state.js`,
`backend/lib/scale_backplane.mjs`, `backend/lib/persistence_adapter.js`, and
`backend/migrations/014_wallet_talk_settlements.sql`.

Proof: `backend/tests/clementine_wallet_persistence.test.mjs`,
`backend/tests/clementine_wallet_settlement.postgres.test.mjs`,
`backend/tests/talk_idempotency_admission.postgres.test.mjs`,
`backend/tests/server_page_budget.test.mjs`,
`backend/tests/talk_result_persistence.test.mjs`,
`backend/tests/talk_state.test.mjs`, and
`backend/tests/persistence_adapter.test.mjs`.

Next: preserve the runtime, proof and follow-up commits, apply the reserved
integration hunk, then run the single full backend and intercepted restart gates.
READY FOR CONTINUE.
