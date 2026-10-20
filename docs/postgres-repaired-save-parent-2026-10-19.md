# T-1028 — Prepare database durability on the repaired save parent

## Preserved original work

Human explicitly approved advancing original #962527c58d6 to exact proven
descendantf5e746c2146afd2050cad596d73f863961a72def. Normal non-force push
completed; original base/draft state preserved. Fresh hosted run39367137834
is active, not green. At the last snapshot Backend tests and D009 passed;
Quality Gate was in progress. Original #963 remains7459a8fa, maindeac1a6d.
No merge into main, replacement PR, squash, force or production change.

Local rehearsal only: normal preserving merge d131b44db4ccada59e5ff6480f83cb93130fabe0
has parents728df63e (T1008, original #963 plus T991 cleanup corrections) and
f5e746c2 (new original #962). Only TASKS conflicted; both task histories are
retained. Both original heads are ancestors. No original #963 advance until
its parent is green, this candidate is proven and exact authority is clear.

## Verification on frozen merge d131b44d

- App, Swift unit/UI tests, Packages, Xcode project, backend/index.js,
  backend/lib and package manifests are byte-identical to new parentf5e746c2.
  No new signed-client test run is claimed or necessary for tooling-only
  additions. Parent source1ffa52e3 proof: signed units869/0/0, recovery5/0/0,
  writer/export/relaunch1/0/0, creation-reply-loss1/0/0, voice1/0/0 and macOS
  build pass. These remain explicitly parent evidence, not newly run here.
- Pinned network-disabled Node20.20.2 focused safety10/0/0; scripts231/0/0;
  full backend2907 passed/0 failed/2 skipped, terminal exit0. Skips remain
  real-Postgres prefix query in the ordinary suite (DATABASE_URL absent) and
  opt-in live-model sync headers. The separate real restart scenario does
  not turn either skipped assertion into a pass. No paid model calls.
- Actual canonical Docker image gate completed exit0: Node20.20.2,
  PostgreSQL16.15, all12 migrations, production-mode synthetic signup/session/
  project/version routes. Exact422,201-byte/6,600-line fixture and one-line
  rewrite survive actual database/backend restart with fresh local files;
  prior auth/sign-in survives, cross-user reads denied, replay does not add
  a version. This is synthetic payload-scale storage proof, not a generated
  or craft/format-validated120-page screenplay.
- Cleanup runs before PASS and fails closed on incomplete cleanup. Only
  invocation-owned UUID fixtures are removed; borrowed resources untouched.
  The ten focused cases include permission failures and exact absent-worker
  handling. No host database, production credentials or paid keys consumed.
- D009 against fetched parentf5e746c2: all five deltas0; whitespace pass.

Private evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1028-20261019.UZUrmV/`.
Logs: `/tmp/them-1028-postgres.log`, `/tmp/them-1028-node20.log`.

## Exact incremental scope versus f5e746c2

The original database gate and cleanup work are preserved, not reimplemented:
`.github/workflows/quality-gate.yml`, `scripts/run_postgres_writer_gate.mjs`,
`backend/evals/postgres_writer_restart_scenario.mjs`,
`backend/tests/postgres_writer_gate.test.mjs`, TASKS, and retained original
database-proof documents. This document records the new combined boundary.
The required workflow gains the real database gate; no check is waived.

## Remaining limits

No fresh hosted child result, live model or physical-phone proof is implied.
Full hosted parent Quality Gate, then explicit original-child advancement and
fresh required child checks/review remain the integration path. The earlier
original #963 native auth SIGABRT is documented, not claimed fixed by this
tooling refresh. Production hold, intended backend/domain and real-phone
journey remain outstanding. Preserve orb, Clementine and flexible page length.

Branch `codex/T-1028-postgres-parent-refresh`; original heads preserved.
