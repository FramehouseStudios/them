# Durable writing-turn admission — in progress

Goal criteria: 1 (no duplicate work), 4 (recoverable controls), 6 (isolation),
7 (proof). This branch is not ready for release or merge.

## Preserved source work

Base: #885, commit `59740a892c936e1a4872fd884ec1e582c485de3a`.
#635's implementation commits `7ca3afcd`, `e135b8eb`, `17e1a0f9` and
#625's billing commits `ce8f501a`, `3a1c04bd`, `f5f84d6f`, `795f14fc`
are reused with cherry-pick provenance. Original PRs and remote branches
are unchanged. Integration conflicts preserve both durable cancellation
checks and non-empty-output / response-lifecycle wallet settlement.

The new integration branch is `codex/T-page-request-durable`; it deliberately
does not reuse #635's remote branch name.

## Implemented, not shipping

- Canonical persistence CAS owns authenticated user/session/request admission
  and early stops. Restart and second-store checks read persisted metadata.
- Duplicate admission fails closed before the provider handler.
- Storage failure does not acknowledge a stop or optimistically generate.
- Stored owner, session hash, request hash, schema and state are validated on
  both reads and transitions. Invalid records cannot authorize completion.
- Active handlers poll shared cancellation and abort when the stop is seen.
- Client auth/audio retries retain the original turn UUID and session namespace.
- Migration 013 creates metadata-only `page_requests`; account lifecycle uses
  the existing export/delete domain list. No script, transcript, raw session
  token or cancellation reason is persisted in this ledger.
- #625 retains non-empty beta output and releases holds for failed output,
  disconnects, exceptions and listening-recovery statuses.

## Evidence

Logs live under `/Users/halfmutantfilms/io.them-worktrees/_proof/branch-audit-20260930/`.

- Frozen pre-durable baseline at `23f9fed8`: 5 tests, 1 pass / 4 failures
  (`page-request-durable-baseline-red.log`). The earlier similarly named
  `page-request-durable-red.log` ran after editing and is NOT red proof.
- Initial combined cancellation/billing/persistence: 68/68.
- Foreign/corrupt-record regression before its fix: 5 pass / 1 failure.
- Combined suite after record validation: 69/69.
- Real HTTP restart, shared-store, active abort, duplicate, isolation, outage
  and invalid-record suite: 7/7 (`page-request-durable-cross-store.log`).
  JSON adapter, two stores in one process; not a PostgreSQL multi-worker proof.
- Architecture and real generation stage (stop before/after injected provider):
  31/31 (`page-request-durable-closure-focused.log`). No live model calls.
- Initial full backend: 2,853 pass / 1 fail / 2 skip. The architecture assertion
  still required the old synchronous function name. Its replacement proves the
  awaited wrapper calls the existing abort gate; behavior tests also cover it.
- Signed erased iOS focused: 14/14. A nonexistent `PageCancelClientTests`
  selector selected no tests; do not claim that class was covered by this run.
- Full backend after the gate fix: 2,857 pass / 0 fail / 2 skip, 2,859 tests
  (`page-request-durable-backend-after-gate-fix.log`). No failure retried away;
  the original failing architecture assertion is preserved in its first log.
- Full signed erased iOS: 683/683, zero failures
  (`page-request-durable-units-full.log` and matching `.xcresult`). Includes all
  six `BackendPageCancelClientTests`; the focused selector omission is closed.
- Parent-relative god-file gate passes: all five deltas zero; index.js 33,626
  under the human-approved priority-fix exception. `git diff --check` passes.

## Remaining release-critical risks

1. A read-before-settlement gate is not an atomic stop-versus-settlement fence.
   Close that race before publication as ready; an acknowledged stop must not
   later bill or publish the same turn through another worker.
2. Real isolated PostgreSQL concurrency, production migration and account
   export/delete integration remain unproved. No production DB was accessed.
3. Wallet reservations remain process-local; crash reconciliation and durable
   generation/save receipts are separate unfinished work, not fixed here.
4. No TTL or eviction is safe while absence permits admission. Retention and
   bounded authenticated admission need a documented policy, not silent expiry.
5. Headerless legacy clients retain the legacy path; no restart-safe guarantee
   is made for them. Paid-provider abort, physical phone and shipping backend
   verification are unperformed. No credits, deployment, merge or approval bypass.

Next: atomic stop/settlement ordering with a controlled production-path race
test, then complete backend/iOS/UI/macOS and persistence/recovery proof before
opening a held draft on #885. #766 and #770 still land first after independent
approval; this integration does not authorize bypassing that requirement.

## Session checkpoint

This pass also changed `TASKS.md`, the ledger validation implementation,
`empty_generation_billing.test.mjs`, `page_request_durable.test.mjs` and
`talk_handler_closure.test.mjs`. The four original #625 source commits were
integrated locally as `53ac4051`, `ce3b10ab`, `2f2c8bf6`, `349bd713`.
No branch was pushed and no new PR opened. Full Studio UI, macOS scaffold,
real PostgreSQL and physical-device validation remain unrun for this branch.

Exact files changed in this session (including the preserved #625 port):

- `TASKS.md`
- `backend/lib/clementine/page_request_ledger.js`
- `backend/lib/clementine/short_film_lane.js`
- `backend/lib/clementine/page_lane_adapter.js`
- `backend/lib/talk_generate.js`
- `backend/tests/empty_generation_billing.test.mjs`
- `backend/tests/helpers/billing_provider_stub.mjs`
- `backend/tests/talk_empty_billing.integration.test.mjs`
- `backend/tests/page_request_durable.test.mjs`
- `backend/tests/talk_handler_closure.test.mjs`
- `docs/empty-generation-billing-proof.md`
- `docs/audits/page-request-durable-2026-09-30.md`
