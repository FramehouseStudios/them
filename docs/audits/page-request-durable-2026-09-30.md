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

## Implemented, awaiting stacked draft review

- Canonical persistence CAS owns authenticated user/session/request admission
  and early stops. Restart and second-store checks read persisted metadata.
- Duplicate admission fails closed before the provider handler.
- Storage failure does not acknowledge a stop or optimistically generate.
- Stored owner, session hash, request hash, schema and state are validated on
  both reads and transitions. Invalid records cannot authorize completion.
- Active handlers poll shared cancellation and abort when the stop is seen.
- Completion and stop compete through one owner-scoped CAS transition. Exactly
  one can win; a late stop gets `409 page_request_finalizing`, and both
  request-ID and reservation cancellation honor that fence. Missing completion
  hooks release the wallet hold rather than charging a durable Page request.
- Normal pages claim only after the page-quality checks; short-film pages claim
  after non-empty output survives their quality gate and before project mutation.
- Client auth/audio retries retain the original turn UUID and session namespace.
- Migration 013 creates metadata-only `page_requests`; account lifecycle uses
  the existing export/delete domain list. No script, transcript, raw session
  token or cancellation reason is persisted in this ledger.
- #625 retains non-empty beta output and releases holds for failed output,
  disconnects, exceptions and listening-recovery statuses.
- Successful `/talk` responses now await the existing optional Redis
  idempotency-cache write before the handler returns. Focused tests prove the
  await boundary. This only closes the race where the HTTP response could
  precede that shared-cache write; missing or failed Redis remains non-durable,
  and the existing replay TTL remains five minutes. It does not recover a
  completed Page from the owner-scoped request ledger or replace a completion
  receipt.

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
- Controlled real HTTP winner tests cover both stop-before-completion and
  completion-before-stop, wallet release/commit, a finalizing bulk stop, and
  completion-storage outage (`page-request-durable-atomic-focused-postgres.log`).
- Authenticated `/talk` integration tests exercise the real route and app
  handler with a deterministic subprocess provider at generation and TTS stages.
- Isolated PostgreSQL 16 tests use two independent Node processes. Forty
  alternating concurrent CAS races prove exactly one transition wins; a
  reconstructed worker cannot re-admit a stopped request
  (`page-request-durable-postgres.log`, 2/2). This used only the
  localhost-bound synthetic `them_page_settlement` database and test role.
- Latest complete backend: `cd backend && npm test` — 2,864 pass / 0 fail /
  2 skipped (2,866 tests).
- Current-head focused idempotency unit tests: 34/34; authenticated real `/talk`
  settlement winner handlers: 2/2. The full suite was run with local test-server
  binding enabled; an initial restricted-shell attempt produced environment
  `EPERM` failures and was not counted as product evidence.
- Complete signed iOS on the erased dedicated simulator: 684/684,
  `page-request-durable-units-complete.log` and matching `.xcresult`.
  The new finalizing-conflict client test is included.
- macOS scaffold build succeeds, `page-request-durable-macos.log`; existing
  Swift concurrency warnings remain unrelated.
- Parent-relative god-file gate passes: all five deltas zero; index.js 33,626
  under the human-approved priority-fix exception. All changed JavaScript files
  pass `node --check`; `git diff --check` passes.

## Remaining release-critical risks

1. The completed response is not durably replayable from the ledger. If a
   worker finishes a page but the client loses the response, retrying the same
   identity is rejected as already started. A stored, owner-scoped completion
   receipt is still needed for exact-once delivery across crashes and workers.
   The existing `GET /talk/turn/:turnId` recovery seam reads a process-local
   map with a 30-minute default TTL; it does not survive worker restart. The
   Page request UUID is created in memory and is not retained across app
   relaunch. A complete protocol needs a persisted client request identity,
   owner/project-scoped receipt retrieval, and an acknowledgement tied to a
   successfully saved project version.
   **HUMAN_INPUT_REQUIRED:** approval to persist exact generated page text in
   this recovery receipt until save confirmation or account/project deletion
   has been requested; this branch does not add that content retention yet.
2. Wallet reservations and their settlement reconciliation remain process
   local; this work prevents a cancelled turn from reaching the wallet commit,
   but does not make the wallet itself crash durable.
3. `page_requests` records are permanent metadata tombstones. No TTL is safe
   while record absence permits old request identities to be admitted again.
   The durable path also needs a bounded-write/retention policy before exposure
   to production traffic. Privacy retention is a human-owned release decision.
4. Headerless legacy clients retain the legacy process-local path. Production
   deployment has not run migration 013; account export/delete was verified
   against the real authenticated local JSON backend, not production Postgres.
5. No paid provider, physical phone, TestFlight or shipping-backend run was
   performed. #766/#770 still precede this stack and need an independent review.

Next: add durable owner-scoped completion receipts and define safe request
metadata retention before production readiness. Keep the PR stacked on #885;
the priority data-loss fixes #766/#770 still land first after independent
approval.

## Session checkpoint

This pass also integrated the atomic finalization work and its tests. The four
original #625 source commits were integrated locally as `53ac4051`,
`ce3b10ab`, `2f2c8bf6`, `349bd713`. The complete stack is verified locally,
and published as draft PR #886 stacked on #885. On current head `191b812f`,
hosted migration, image-build and god-file checks passed; hosted backend tests
and the required iOS unit quality gate are in progress. Studio V1 UI and
physical-device validation remain unrun for this branch.

Exact branch files relative to #885 (including preserved #625/#635 work):

- `TASKS.md`
- `backend/index.js`
- `backend/lib/account_routes.js`
- `backend/lib/clementine/page_abort.js`
- `backend/lib/clementine/page_request_ledger.js`
- `backend/lib/clementine/short_film_lane.js`
- `backend/lib/clementine/page_lane_adapter.js`
- `backend/lib/clementine/page_cancel.js`
- `backend/lib/clementine/page_multipass.js`
- `backend/lib/persistence_adapter.js`
- `backend/lib/talk_generate.js`
- `backend/lib/talk_handler.js`
- `backend/lib/talk_pipeline.js`
- `backend/migrations/013_page_request_admission.sql`
- `backend/tests/empty_generation_billing.test.mjs`
- `backend/tests/helpers/billing_provider_stub.mjs`
- `backend/tests/helpers/page_request_postgres_worker.mjs`
- `backend/tests/helpers/page_settlement_provider_stub.mjs`
- `backend/tests/page_request_handler_settlement.test.mjs`
- `backend/tests/talk_empty_billing.integration.test.mjs`
- `backend/tests/page_request_durable.test.mjs`
- `backend/tests/page_request_settlement.test.mjs`
- `backend/tests/postgres/page_request_settlement.test.mjs`
- `backend/tests/account_routes_wiring.test.mjs`
- `backend/tests/page_cancel_ownership.test.mjs`
- `backend/tests/persistence_adapter.test.mjs`
- `backend/tests/talk_handler_closure.test.mjs`
- `them/BackendClient.swift`
- `them/ClementinePageInterruptService.swift`
- `them/PageTalkLifecycle.swift`
- `themTests/BackendPageCancelClientTests.swift`
- `themTests/ClementinePageInterruptServiceTests.swift`
- `themTests/PageTalkLifecycleTests.swift`
- `docs/page-request-cancel-progress.md`
- `docs/empty-generation-billing-proof.md`
- `docs/audits/page-request-durable-2026-09-30.md`
