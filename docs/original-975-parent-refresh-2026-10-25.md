# T-1144 — Preserve original-project recovery on the green parent

## Scope and history

VERIFIED local checkpoint `9890ef475ee1b3c716f0870d874a79336072f596` is a
preserving merge of combined recovery `01bbeda35f79ec177173093bb8ad28a3e52f2b56`
and original parent #974 `f4aca4aef0222fdb5829e41d583357fc08c82a34`.
Original #975 `80a2f66874691c9c3e126b1a5f5b2556019d5e9c` remains an ancestor.
The merge was conflict-free; neither original public branch was replaced.

This checkpoint retains original-project navigation/loaded-draft authority,
request-correlated interrupted delivery, captured deferred-save ownership and
late save-receipt fencing. Root causes and retained red evidence are recorded in:

- `original-project-recovery-2026-10-24.md`
- `recovery-plan-continuity-2026-10-24.md`
- `recovery-crash-boundary-2026-10-24.md`
- `deferred-page-save-owner-2026-10-24.md`
- `save-completion-context-2026-10-24.md`

Relative to the already-proven combined `01bbeda`, only TASKS, the parent's
report and the two Files-export readiness/diagnostic paths change. Production
Swift, unit tests, backend production/tests, scripts, Packages and workflows
are byte-identical to that checkpoint. The earlier full signed966/0/0 and
connected recovery results are historical source-identical evidence, not fresh
T1144 runs. New results below are recorded only after terminal proof.

## Verified parent and gate discipline

Original #974's exact-head run40175219157 is terminal SUCCESS. Its retained
backend log reports2964 pass/0 fail/4 skip. Production backend, backend tests,
scripts, Packages and workflows are unchanged here. The only backend-tree delta
is three additional allowed native recovery selectors in the existing UI runner;
its syntax check passes under Node20.20.2. The unchanged full backend suite is
inherited explicitly, not rerun for reassurance or called a new local result.

The first local D009 invocation had no local parent tracking reference and
printed null baselines despite exit0. It is NOT valid comparative proof. Fetching
the exact parent created `origin/codex/T-1125-talk-owner-fence` atf4aca4a; the
corrected gate reports real numeric baselines and delta0 for all five files:
index33475, Studio17299, Root14937, bridge12796, memory10463. No padding,
allow-growth or changed gate implementation. `git diff --check` passes.

## Current checkpoint proof

Signed combined units passed **966/0/0** through the canonical clean-simulator runner
on task-owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A, iOS26.2/Xcode26.3, separate
DerivedData `/private/tmp/them-1144-ios-dd`; result
`/private/tmp/them-1144-units.xcresult`. Process exit0 and the retained xcresult
positively report966 executed passes, zero failures/skips. The next UI launch was
initially rejected by the safety reviewer over possible native overlap; no UI
process or result was created. A fresh process check confirmed old xcodebuild
PID35722 and all native proof runners absent before the sequential UI launch.
Reserved export-evidence simulator
7F1A14C1-B379-4417-AFE9-331810CD9CD3 is not erased or reused.

The refreshed two native Files paths passed **2/0/0**, retained in
`/private/tmp/them-1144-export-readiness.xcresult`, process exit0 and positive
xcresult summary. Actual Save, cancel/re-export and no-resend assertions remain.
The run was unusually slow (1567s bundle interval;1004s test operation). The
received-reply case took16m while the other took28s. Its activity tree has a
926.266s gap between a first-match button query and XCTest's internal retry.
This identifies an observation/query stall, not its app/system root cause; do
not attribute it to a provider or claim acceptable latency from the pass.
Completed proof is preserved under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1144-20261025.ErqmHC/`.

New canonical three-case recovery passed **3/0/0**, process exit0 and strict
positive xcresult guard, on the same exact owned erased signed simulator:
`/private/tmp/them-1144-save-recovery/them-save-recovery-8blA28/recovery-ios.xcresult`.
It checks offline relaunch, actual401→successful refresh→fresh-bearer201, exact
complete saved text, one resulting server version, and conflict/relaunch/Keep
Mine cleanup. No product assertion or parked-copy criterion was relaxed here.
The auth case took15m versus21s conflict and18s ordinary reconnect. That delay
remains unclassified, not accepted as normal app performance. Current CUA confirms
the Mac is locked; manual unlock is requested, not bypassed. No further local GUI
proof will be launched merely to repeat that stalled observation environment.
New recovery bundle/log have distinct `save-recovery-current` names in the same
permanent archive, leaving earlier evidence intact.

VERIFIED source identity: direct `git diff --exit-code 839a3c1 HEAD -- them
themTests backend scripts Packages .github them.xcodeproj` is empty. Reuse the
already retained T1136 combined newer-writer/no-second-save recovery1/0/0,
before-save-admission recovery1/0/0, essential writer/export/relaunch1/0/0 and
Mac build0 as source-identical inherited proof, explicitly not new T1144 runs.
The entire UI-file diff is limited to two Files-readiness cases and their common
failure-diagnostic helper, positively checked separately here by Files2/0/0.
The recovery-plan cases and their assertions are unchanged. This avoids duplicate
unchanged suites; fresh required hosted checks still apply to any published head.
Deterministic intercepted providers prove transport/state/recovery, not live
microphone input, model relevance, external-file opening or physical-phone use.

## Publication and limits

No public975 advance, main merge, deployment, paid call or secret read is claimed
by this local merge. Original975 was verified remotely at80a2f66, base
`codex/T-1125-talk-owner-fence`, still draft. Only a normal descendant push after
the connected checkpoint may advance it; required fresh checks and independent
human review remain. Original638 is green but still requires human review;
original639's earlier9bb54ec/40185550749 and6ec372d/40190222594 reds are retained.
Its published correction965a507 now has backend/D009 and hosted writer success;
fresh40203301919 is still active in broader V1. Stop further publication until
that exact earlier gate clears. No red is waived by local966/0/0 or recovery3/0/0.

Production remains held. Exact intended-backend physical-iPhone journey and an
observed export opening outside THEM remain necessary for product completion.
Existing Swift actor-isolation warnings, out-of-window/legacy recovery limits,
unbound/precise rewrite recovery and universal crash/idempotency guarantees are
not silently converted into passes. Zora's backend lane is separate.
