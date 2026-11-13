# T1473 — preserve idle-session coalescing and real queue changes

## Source and scope

This task preserves original #621 head `0e5154fcead75f70e2ac26f972b29c02e714e1d9`
(`codex/T-session-churn-port`) as the first merge parent, with exact main
`71c637d886a9edd6a183048cd2feea0d00bfb143` as the second parent. The original
implementation commit `93c877e75f26c253e25c6de7653275e1d6395e5a` records its
cherry-pick from original #481 `4275c33a26a81b6a53fa4bf9fd1cd88e8172a52b`.
The preserving `--no-ff --no-commit` merge completed without conflicts; its
parent/index state and empty conflict-stage list were retained before edits.
No original branch history was rewritten. #620 is unrelated.

The original change suppresses repeated outbox publications during unchanged
idle drains. The current source correction also compares the existing
Equatable entries, because equal counts and one aggregate error do not imply
unchanged rows. For example, a duplicate-idempotency enqueue can change an
earlier row's error while the last row still supplies the same aggregate error.
Initial publication and actual entry/snapshot changes still notify. The
comparison retains value metadata already present in the actor; it does not
read, encode or log queued bodies, and adds no public snapshot field.

Studio's outbox observer now requests `force: true`, preserving main's refresh
from server truth for real queue events. Raw outbox replay does not invalidate
the session client's cache, so the original cached notification refresh could
re-adopt a resolved question or conceal one after a parked resolution. The
original additive `force` parameter/default remains, and other explicit event
callers remain unchanged. Coalescing removes idle publications at their source;
no new cache invalidator, event system or loading policy is added.

Existing replay account checks and queue persistence are unchanged. Root
account transitions still reset/close the Studio; initial observers explicitly
read their snapshots. This is not a new account-isolation implementation or
proof of every owner-switch path.

## Regression and current verification

The original `OfflineTalkOutboxTests` cases, including
`testIdleDrainPublishesTheSameSnapshotOnlyOnce` and its counter helper, are
byte-preserved. The new
`testEarlierEntryErrorChangePublishesWhenAggregateSnapshotIsUnchanged` uses
the real actor and NotificationCenter: it waits for both initial publications,
changes the earlier row through duplicate-idempotency enqueue, proves all
aggregate snapshot fields stay equal, and requires a fresh publication. The
snapshot-only original guard would suppress this final notification; that
counterfactual is source-derived until root executes it.

VERIFIED static preparation:

- `git diff --check` and `git diff --cached --check`: pass.
- Canonical `node scripts/check_god_files.mjs --json`, Node v26.7.0: pass against
  exact main71, with all five canonical god-file deltas zero and no allow-growth
  option. Because the shared `origin/main` was older, this used only a private
  temporary Git namespace whose `origin/main` points to exact main71; shared
  refs were unchanged.
- Source comparisons confirm every original test and the idle case/counter
  remain byte-identical, and the additive force/default and explicit callers
  are preserved. The obsolete cached-refresh comment was updated to describe
  the current real-event behavior.

No Swift build, native/unit execution, backend/npm/Docker run, provider call or
live performance measurement was performed in this preparation lane. Root owns
focused signed execution and review. This change does not establish a fix for
the separate authenticated freeze or the main71 Autosave failure.

The historical [original port proof](session-churn-port-proof.md) is preserved
as attribution: its reported 619-unit and 2,739-backend passes are not current
candidate proof. Its older workflow instructions are historical records.

## Root-owned next verification

Run the new case against the preserved snapshot-only guard to establish its
expected failure, then against this candidate. Also execute the unchanged
`testIdleDrainPublishesTheSameSnapshotOnlyOnce`,
`testQuestionResolutionSurvivesRelaunchAndSuppressesOnlyActiveQuestion`, and
`testQueuedWriteNeverCrossesIntoAnotherSignedInAccount`. Inspect the exact
current unit results rather than importing historical counts. Remaining live
POST/session cadence, pending-question UI and physical-phone claims are
unverified; publication and any broader proof remain root-owned.

Preparation receipts: `/private/tmp/them-t1473-idle-session-preservation/`.
