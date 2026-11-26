# Original #923 preserving recovery-proof checkpoint — 2026-11-12

## Completed and files changed

Preserving merge `2da572ef9bdcbb8642470abf876b6cd21dca0f66` retains original
#923 `0ea0a2ed` (and its original `1f04f048`) plus updated original #919
`9b3d9f84`. No conflict, squash, replacement PR, main merge or history rewrite.

The entire original delta is retained verbatim in two test files:

- `backend/tests/studio_ios_writer_loop_contract_helpers.test.mjs`
- `scripts/run_screenplay_save_network_fault_smokes.test.mjs`

This checkpoint adds only TASKS and this proof document beyond that original
delta. No app, package, project, production backend or runner behavior changes.

## Root issue addressed

The production evaluator already enforces the two-case recovery result and
forwards one owned result-bundle path. Original #923's remaining tests protect
those existing seams: missing, partial, skipped, failed and extra test results
must not count as complete; a path containing spaces must be forwarded as one
exact argument. Existing single-test writer, signing and erasure checks remain.
This is proof-contract coverage, not another writer-data-loss fix.

## Verification and actual failure

Exact tracked snapshot:1414 regular files hash-verified. Node20.20.2 cached
container; external network disabled, source read-only, fake Apple tools only.

- Initial focused run: **13 passed /5 failed /0 skipped**,18total. All11 helper
  cases passed. Five runner cases failed before fake xcrun execution because
  my temporary container mount was noexec; `/proc/mounts` confirms it. This is
  a setup failure, not a native/app recovery failure.
- Corrected only the disposable tmpfs execution permission and reran only the
  affected runner file: **7 passed /0 failed /0 skipped**. No source, assertion
  or executable fake tool was weakened. The11 unchanged passing helpers were
  not repeated. These two results cover all18 cases; no fresh18/0 run is claimed.
- Node syntax and diff checks pass. D009: all five deltas0 against actual
  fetched original #919 `9b3d9f84`; index stays33,626 under accepted exception.
- Application, unit/UI, packages, project, production backend, scripts/runners
  and workflow source is byte-identical to9b except the two test files above.
  Parent proof is inherited: signed units714/0/0; V1 36/0/6; writer1/0/0;
  Mac compile0. No unchanged native/full-backend run was repeated for this
  test-only delta. Parent Node20 backend2758/0/2 is separately attributed.

V1 skips remain three cross-platform fixtures, separately proved integrated
writer, two-device live draft and writer-block rescue. Backend skips remain
real PostgreSQL without DATABASE_URL and explicit preview/sync. No skipped
case or synthetic/native-tool fixture proves physical-phone/live-provider use.

## GitHub status and limits

Normal fast-forward advancement of original #923 only; base remains original
#919. Fresh exact-head hosted checks and genuine non-author review are required
before landing. Main remains78b8c94f; no main push/merge or protection change.
Production hold remains. No paid model calls, credential handling, DNS,
production deployment, physical-phone or external-export-open claim.

Private evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1450-923-proof-contracts-20261112/`.
Luna independently verified the original delta/assertions and source identity;
Jarvis performed the preserving merge, corrected the container setup and ran
the focused checks. This is not independent human GitHub approval.

## Next active task and continue status

Inspect and preserve separate original #973 transport-security boundary.
Einstein verified its old hosted head has a concrete V1 failure: missing
pinned inspector tab,31/1/9. That old red result remains; no claim is made that
our parent fixes it without testing the combined head. Exercise the dedicated
talk redirect callback through the production delegate, not only the isolated
guard. Keep original PR/history and all unrelated work. READY FOR CONTINUE.
