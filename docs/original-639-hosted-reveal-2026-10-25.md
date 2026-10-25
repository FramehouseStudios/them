# T-1145 — Stop querying an already-selected panel's hit point

## Exact first failure

VERIFIED: original #639 at `9bb54ec04286eca11d8d384d44410a96481d1f33`,
base `claude/mentor-core-port`, failed hosted run40185550749. Backend/D009
jobs passed: backend2758/0/2 and signed units635/0/0 are confirmed in exact-job
logs. The required writer step passed its strict one-case guard before V1 failed.
Later voice-fault/macOS steps were skipped, not passes.

The retained iOS26.5/iPhone17Pro V1 xcresult reports **27 pass/1 fail/9 skip**.
Its sole failure is `test_story_obligation_evidence_survives_studio_relaunch`:
XCTest cannot determine hittability for `studio.right-panel.them` because its
activation point is invalid. The failing line is the helper's `isHittable`
query, not a missing persistence receipt or mismatched obligation text.

The final recording frame and native hierarchy positively show the tab already
selected and the exact expected result/evidence rendered in its open drawer.
The post-relaunch state snapshot also contains both strings. This is not proof
of lost story memory or permanently inaccessible product navigation.

Private retained artifact12597277405 (165,768,035 compressed bytes) is at
`/private/tmp/them-639-40185550749-artifacts.zip`; extracted failed bundle:
`/private/tmp/them-639-ci-40185550749.PkNxVV/Users/runner/work/_temp/them-v1-ui-smoke/v1-ui-smoke-40185550749-1-33215.xcresult`.
The inspected final frame and original hierarchy/recording are in that task-owned
directory. The log is `/private/tmp/them-639-40185550749-failed.log`.

## Reuse the existing smallest correction

DECIDED: reuse only the shared partner-content reveal hunk from existing
`04a993f8328124f90fbe3fa373f718ef527bc423`, rather than reimplement it or merge
the later cumulative branch. Attribution and its earlier independent navigation
work remain intact in `docs/parent-inspector-navigation-2026-10-20.md` at that
commit; those broader pinned-navigation changes are not silently included here.

The two duplicate memory/question helpers now share that exact existing owner:
after opening the drawer, return if the requested content is already present;
otherwise find the stable tab ID and check selected state before requesting
hittability or tapping. Keep the existing8-second deadline, user-visible route,
result/evidence/correction-control and relaunch assertions. No retry, sleep,
increased timeout, skipped test, changed expected text or injected success.

Only `themUITests/V1SmokeUITests.swift`, TASKS and this report change. Native
production, unit sources, backend, scripts, workflows, Packages and Xcode project
remain byte-identical to failed head9bb54ec. The earlier local635/0/0, Node20
2758/0/2, authenticated writer1/0/0 and Mac build are explicitly inherited
source-identical checkpoints, not newly rerun results or a waiver of hosted red.

## Current repair proof

Focused actual memory/relaunch, answer/skip and explicit provisional-selection
UI cases passed **3/0/0**, process exit0 and positive retained xcresult counts,
through the signed canonical clean runner on task-owned
91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A, local iOS26.2/Xcode26.3. Result:
`/private/tmp/them-1145-partner-reveal.xcresult`. All native proof processes are
terminal/absent. The original hosted red is the reproducer; no repeated local
pre-fix run was attempted just to obtain a matching26.5 framework failure.

Permanent archive for the original failed zip/logs, inspected screenshot and
hierarchy, corrected local bundle/log and proper-parent gate:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1145-20261025.11rxOn/`.
No fresh unchanged full unit/backend/writer/Mac rerun is claimed. The hosted
backend skips are the real-Postgres literal-prefix case without DATABASE_URL
and the existing opt-in Page response contract; neither is counted as a pass.

D009 compares actual fetched original638 parent0b56861: all five numeric deltas0;
index remains33626 under the human-approved pre-stack exception. Diff check
passes. The old missing-baseline gate behavior is not used as evidence.

No paid provider, live microphone, physical-phone, production, outside-file-open
or integrated-main readiness claim. A local26.2 pass cannot establish a26.5
hosted cure; advance the original draft once normally only after local proof,
then require fresh exact-head hosted checks and independent human review.
No force/squash/replacement PR, main merge or review/protection bypass.

## Next

Keep local975 checkpoint31b80dc and its966/0/0 plus Files2/0/0 evidence intact;
its publication is held while this earlier failure is repaired. Original638
still requires personal non-author review. Original639 must pass the new hosted
gate before further stack publication is treated as ready.
