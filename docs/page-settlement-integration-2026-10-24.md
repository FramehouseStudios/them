# T-1124 — Durable Page settlement connected, 2026-10-24

## Identity and outcome

VERIFIED: branch `codex/T-1124-page-settlement-integration`, worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-mentor-current-parent`.
Parent `b2d95df6845fac04a13821b8e1cf5b8615703be8`.
Preparation `66168b9`; preserving merge
`dcc66e3e55ae6c2bf5f48bbc8fc9dd19936e61f6` retains the original T-1122
commits through `b4a94f6`, plus `0657c8e` and `3c37d94` from the source-only
follow-up. No squash, replacement PR, original-head rewrite or main merge.

The selected combined branch now connects prepared-result recovery to the
canonical wallet. This is not a claim that the full original PR stack is landed,
that all billing is exactly-once forever, or that the real phone journey works.

## Root causes and connected fixes

Earlier Page success settled on `res.finish`, mutated memory and queued balance
persistence. Errors could be swallowed by flush; a fresh wallet restored10 when
memory reported9.8. Merely awaiting that old flush could not repair the boundary.

The integrated sequence is durable pending admission → exact prepared response
and charge intent → unique durable settlement receipt plus debit → completed
replay → HTTP success. A restart reconciles a prepared result rather than calling
generation again. PostgreSQL uses one atomic statement for receipt/debit, and
separate atomic IAP credit composition. JSON uses recoverable CAS receipt states
under an explicit single-process limitation. Holds remain provisional/local.

Independent review found and corrected these additional failures before merge:

- Missing durable pending record silently returned without settlement.
- An older request could adopt a newly admitted same key.
- A late completion could replace already-accepted exact bytes.
- Close/release during prepared persistence could be mislabeled as settled.
- Disabled/unkeyed idempotency skipped awaited durability.
- Billed prepared records could expire into regeneration.

Admission UUIDs, canonical reads/CAS, immutable completed state, explicit wallet
disposition and durable unkeyed reservation receipts address those boundaries.
Unkeyed requests still cannot deduplicate a subsequent new request.

Jarvis's callback closes over the canonical wallet constant; it executes only
after hydration and route mounting, so it does not need a second nullable wallet.
Bootstrap selection/hydration is extracted into `wallet_bootstrap.js`; storage
failure now refuses startup instead of presenting an empty paid balance.

## Actual PostgreSQL failure and process-restart proof

`probe_talk_restart_durability.mjs` uses real local signup/JWT/session/project
requests, synthetic funds and intercepted STT/chat/TTS. Fault mode is restricted
to an explicitly supplied localhost database named t1124. Unique per-run SQL
triggers inject failure at the real storage boundaries. Source/key material is
synthetic; no production database or paid provider was contacted.

| Injected boundary | Initial HTTP | Receipt before restart | Retry after SIGKILL | Final receipts | Wallet after recovery |
|---|---:|---:|---|---:|---:|
| Before debit | 500 | 0 | original audio/turn, HTTP200 replay | 1 | 99.8 |
| After debit, before completed replay | 500 | 1 | original audio/turn, HTTP200 replay | 1 | 99.6 |

Both retries and second repeats make zero new STT/chat/TTS calls. Each recovered
body equals the prepared bytes; it is not a deterministic re-generation mistaken
for replay. The original client500 errors are retryable under the current Swift
5xx/non-quota policy. These are not successful acknowledgements or quota errors.

The same run then proves normal graceful restart and immediate post-success
SIGKILL: owner200/other403, replay header1, original turn and15,456audio bytes,
zero new providers and stable balances. Four accepted fixture generations leave
99.2 of the initial100turns, each80-output-token result settling0.2 exactly once
in these cases. This is measured case coverage, not an all-interleavings theorem.

## Integration verification

Frozen public source: `/tmp/them-1124-proof.FFWhue/source`, runtime at dcc66e3.
Exact-lock dependencies mounted read-only from
`/tmp/them-1074-node20.a8uypX/backend/node_modules`.
Both lock files have SHA256
`dec81f1c2d2fb1912f57668260efb2183212cf0d6d05a8d2314049e041c5501c`.

- Actual authenticated fault/graceful/SIGKILL restart probe: exit0 under
  **Node20.20.2**, sharing only the task fixture's network namespace.
- Full backend, external networking disabled: **2,963 pass / 0 fail / 4 skip**,
  2,967 tests total. Skips: opt-in wallet settlement PG proof, opt-in same-key
  admission PG proof, existing PG prefix-metacharacter live case, existing page
  preview/header case. The skips are not counted as passing.
- The first two skips separately executed on real PostgreSQL16 against a fresh
  owned t1122 database: **2 pass / 0 fail / 0 skip**. Covers12 concurrent same-key
  debits, trigger-forced rollback, credit/debit composition, concurrent admission
  and stale transition refusal. It does not cover the other two skipped cases.
- Full signed `themTests`: **934 pass / 0 fail / 0 skip**.
- Signed raw voice→formatted page→saved version→exact relaunch UI:
  **1 pass / 0 fail / 0 skip**, intercepted STT1/chat3/TTS1.
- Signed queued playback/append/save/exact-relaunch UI:
  **1 pass / 0 fail / 0 skip**, intercepted STT1/chat2/TTS23.
- macOS scaffold compile: exit0. No shipping macOS/App Store claim.
- Bootstrap/auth-startup focused checks: **4 pass / 0 fail / 0 skip** on host
  Node26.7.0. This is separate from the exact Node20 full suite.
- Syntax, `git diff --check` and D009: pass. Index33494→33475 against parent;
  other watched files unchanged. Native source is unchanged in this slice.

The signed runners erase only owned7F1A14C1-B379-4417-AFE9-331810CD9CD3,
iPhone17Pro/iOS26.2, and keep normal signing enabled. UI backends run on host
Node24.19.0 with real local auth/synthetic funding and intercepted providers.
These prove client/server/save contracts, not real speech or live model quality.

The first native attempt never launched Xcode because the historical temporary
`/tmp/them-994-xcodebuild` wrapper was gone; no test bundle/count was produced.
Use permanent `/usr/bin/xcodebuild` plus explicit task-owned DerivedData instead.
The UI runner now accepts `THEM_HOME_VOICE_DERIVED_DATA_PATH`, validates it as
absolute and forwards it as a normal argument. No signing gate is weakened.
This harness-only change and an explanatory index comment follow the frozen
backend snapshot; production runtime is otherwise unchanged. Existing native
concurrency/deprecation warnings remain; no Swift6/warning-free claim.

Proof archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1124-20261024.gxKyLq/`.
The original owned PostgreSQL container was identity/label checked and stopped
after all DB proofs completed. Only synthetic fixture data was removed.

## Exact changed files against b2d95df

Runtime: `backend/index.js`, `backend/lib/clementine/wallet_bootstrap.js`,
`backend/lib/clementine/wallet.js`, `backend/lib/clementine/wallet_persistence.js`,
`backend/lib/clementine/page_lane_adapter.js`, `backend/lib/talk_state.js`,
`backend/lib/scale_backplane.mjs`, `backend/lib/persistence_adapter.js`,
`backend/migrations/014_wallet_talk_settlements.sql`.

Proof/harness: `backend/evals/probe_talk_restart_durability.mjs`,
`backend/evals/run_home_voice_handoff_ui_smoke.mjs`,
`backend/tests/clementine_wallet_bootstrap.test.mjs`,
`backend/tests/clementine_wallet_persistence.test.mjs`,
`backend/tests/clementine_wallet_settlement.postgres.test.mjs`,
`backend/tests/talk_idempotency_admission.postgres.test.mjs`,
`backend/tests/server_page_budget.test.mjs`, `backend/tests/talk_state.test.mjs`,
`backend/tests/talk_result_persistence.test.mjs`,
`backend/tests/persistence_adapter.test.mjs`.

Docs: `TASKS.md`, `docs/zora-page-settlement-handoff-2026-10-21.md` and this report.

## Remaining limits and next step

Prepared billed responses no longer time-expire, but completed replay still has
its configured bounded window. A permanent settlement ledger is not a permanent
audio archive. JSON multi-process billing is unsupported; different-key global
capacity admission is not transactional. Holds and pre-generation budgets are
not globally distributed. Dedicated wallet/IAP/settlement export/purge and
retention policy remain a product-owned follow-up. No claim of broad security,
all billing paths, full crash/power-loss coverage or production readiness.

Read-only external checks on2026-10-24: `api.them.io/healthz` returns302 away from
the API to `https://introvert.com/?domain=them.io`; no healthy shipping endpoint
was proven. The paired iPhone15Pro reports an unavailable device tunnel. No
credentials, deployment, DNS, phone installation or real microphone test changed.
Production remains held under the human's existing App Store-credentials decision.

Next: investigate actual native stable-key coverage; finish original-document,
unbound setup and precise queued-rewrite delivery; preserve/land original PRs
through actual bases/review/checks; then observe the real-phone journey against
the explicitly identified intended backend with fresh paid-proof permission.
Do not call THEM complete from this local checkpoint. READY FOR CONTINUE.
