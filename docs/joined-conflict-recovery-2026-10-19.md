# Joined conflict restoration and voice recovery — T-1034

## Preserved integration

Runtime merge `9cd9334dd79bce35d3b2522b7907d3c96298f3c2` preserves both
parents: complete-result retrieval `0b3d97b983a90526f77cd9c10d4e169f65135d41`
and parked-conflict restoration `856d76243ae53b34e3e24f0150ceaf9373495c3d`.
Only TASKS.md conflicted; both task histories were retained. No runtime
conflict resolution, squash, replacement PR or original-head change occurred.
D017 remains byte-identical to the integration parent.

The joined client now combines the owned, complete recovered-page read/share
path with restoration of an unresolved save choice after relaunch. The latter
uses the retained original base rather than mistaking a newer cached version
for the writer's explicit Keep Mine or Load Server choice. It preserves newer
local text and never treats reopening the app as permission to post a version.

## Evidence reuse, not an invented new backend run

`git diff --exit-code 0b3d97b9 HEAD -- backend scripts .github DECISIONS.md`
passes on the runtime merge. Exact subtree identity:

- backend: `8c8cba3fe64e4b04c5a0e78d97c760ac1fe2a126` on T-1032 and this merge.
- scripts: `fe9a04457c85c1c4541dc52d9fbed64cf5db18bd` unchanged.
- .github: `f2bd03c7776ca04c4b4e06ef3c27ab4ccd3dba02` unchanged.

The applicable earlier T-1032 run used Node20.20.2, with external network
disabled: backend2998 passed /0 failed /2 skipped (3000 checks,47 suites),
scripts238/0/0, offline mentor gate OK. Its log was reread; this is reused
byte-identical-source evidence, not a newly executed test on this merge.
The skips are the ordinary-suite live Postgres prefix check without a
DATABASE_URL and the opt-in live page-write provider response proof.

## Fresh combined-client proof

Signed full units: **897 passed /0 failed /0 skipped**, native exit0. Actual
xcresult summary read; erased owned Pro/iOS26.2(23C54), signing enabled.
Result: `/tmp/them-1034-full-units/v1-ui-smoke-local-1-93370.xcresult`.
The completed bundle was cloned and byte-compared under the private directory
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1034-20261019.Eo422F/`.
Existing concurrency warnings remain; this is not a warning-free build claim.

Unchanged signed save-recovery UI: **5 passed /0 failed /0 skipped**. Actual
summary read and completed bundle cloned/compared privately. Includes actual
relaunch/Keep Mine with exactly one saved server version, offline reconnect,
expired auth, delete-all, blank snapshot and explicit fresh server selection.
Result: `/tmp/them-1034-recovery/them-save-recovery-HEeYqA/recovery-ios.xcresult`.
Auth-required loopback fixture, dummy provider key; host Node24.19.0 drives
this UI fixture and is not misreported as the pinned backend-suite runtime.

Connected deterministic-provider writer/save/native export/relaunch UI:
**1 passed /0 failed /0 skipped**. Actual signed summary read; completed bundle
cloned and compared. Result:
`/tmp/them-1034-writer/them-studio-ios-writer-loop/run-JECcun/writer-loop.xcresult`.
This check is not microphone/live-model proof or a fresh external-Files
observation; the earlier T-1032 native Files observation remains separately
scoped in its own record.

Final macOS scaffold **BUILD SUCCEEDED**; the serialized recovery → writer →
macOS command ended with native exit0. This is a build, not a macOS UI run.
Runtime source stayed frozen at the merge throughout all checks; only task
and proof documentation changed afterward. Logs: `/tmp/them-1034-full-units.log`,
`/tmp/them-1034-recovery.log`, `/tmp/them-1034-writer.log`,
`/tmp/them-1034-macos.log`.
D009 against fetched origin/codex/T-1032-recovered-page-retrieval passes with
all five protected deltas0. Whitespace check passes.

## Boundaries

Original #962 is already at the human-approved `f5e746c2`, whose hosted gate
39367137834 is red. Its exact writer marker and parked save survive, but the
conflict controls do not restore. Do not call that proven text loss, a flake,
or resolved on hosted iOS26.5 until a new approved head passes there. The
present approval of527c58d6→f5e746c2 is not approval of a later head.

The first-project parked-seed retry uses a separate creation/save lane and
still needs its own pending-choice investigation. Complete recovered output
remains bounded by the server cache TTL/restart/eviction; guarded application
to an original unsaved draft and durable server receipts remain unfinished.
No paid model calls, real microphone/TTS proof, physical-phone install, main
merge, production configuration change or release-completion claim occurred.

Final remote check: #962 stillf5e746c2, #963 still7459a8fa, #653 still8f5f4f2f;
main stilldeac1a6d54a65dbf5f849f0f35476ad4ff07e1f0. This work does not move
any of those heads. Save the joined rehearsal on its scoped branch, not a
replacement PR. Fresh original-head approval and hosted checks remain required.

Adversarial review: original parked-base identity and newer dirty UTF-8 text
are jointly covered by the two-order regression in the full signed run; no
automatic post before choice is asserted there. The unchanged recovery UI
checks the actual Keep Mine action and exactly-one version, not a substitute
test handler. Ownership/project/generation and active-save guards remain in
the canonical restore handler. Existing ordinary server-selection, auth and
conflict authority checks remain in the full signed bundle. The first-project
parked-seed branch is not covered by these claims. No assertion, timeout or
retry was relaxed to obtain a pass. No fresh voice-fault, broad V1 UI, real
PostgreSQL restart or macOS UI run was performed for this Swift-only join.

Runtime files changed by the merge: them/ScreenplayStudioViewModel.swift and
themTests/ScreenplaySaveConflictAuthorityTests.swift. Documentation: TASKS.md,
docs/parked-conflict-choice-restore-2026-10-19.md and this record.
