# Original #995 — UI automation session isolation proof

Original head: `35cd28d70476d64bf60360f72a25a13464ea0098`.
Parent: original #996 at `2a83473e056ded607275c539faa17537a98940cc`.
Preserving merge/current test source: `d6251cff85bc0cf1788e1b381ff31d4a2fb493ab`.
Both original histories remain ancestors. The only own code diff is four added
lines and one removed line in `themUITests/V1SmokeUITests.swift`.

The direct-typing fixture now has a unique automation-session ID. Each queued
recovery fixture also has a unique ID, created once and reused across its three
launches, so a reset cannot consume another fixture's queue. No runtime code or
stored recovery contract changes in this child.

## Proof

Xcode26.3; erased task-owned iPhone17 Pro/iOS26.2 (23C54), simulator
`81F0FF38-9DAD-4011-907B-357DFADD094C`; normal signing enabled for tests.

| Check | Result |
| --- | --- |
| Signed complete direct-typing UI | 1 passed / 0 failed / 0 skipped |
| Signed authenticated reconnect, expired-auth and conflict/relaunch UI | 3 passed / 0 failed / 0 skipped |
| D009 vs actual parent #996; diff check | Passed; five zero deltas |

Explicit inherited proof, not unchanged reruns:

- `them`, `themTests`, `backend`, `scripts` and the Xcode project are byte-identical
  to proven parent #996. Signed units1559/0/0, writer1/0/0, three selected custody/
  superseded/conflict workflows1/0/0 each, and macOS compile passed there.
- Backend tree `2c40a5c3d1022c583462ad71014c0e173fed1ee8` is unchanged.
  Node20.20.2 full result3042/0/5 is inherited; four cases need dedicated
  PostgreSQL and one live case needs fresh paid-call approval.

The initial local D009 attempt failed closed because the actual parent's remote
tracking ref was absent. Fetching the published parent, then verifying its exact
object ID, established the comparison; all five monitored deltas are zero.
No source or gate assertion was changed to obtain that result.

The untracked dependency-cache symlink was prepared only after matching package
and lockfile hashes. It is not committed; no registry request was made.

## Artifacts and limits

- `/private/tmp/them-t1382-original-995-preserved-tdzc0920` — pre-merge file and hash.
- `/private/tmp/them-t1382-direct-typing.log` and `.xcresult`.
- `/private/tmp/them-t1382-direct-typing-summary.json`.
- `/private/tmp/them-t1382-queued-recovery.log` and
  `/private/tmp/them-t1382-queued-recovery-summary.json`.
- `/private/tmp/them-t1382-queued-recovery/them-save-recovery-LAdlDY/recovery-ios.xcresult`.

Authenticated recovery uses synthetic providers. No live-microphone, model-quality,
physical-phone or integrated-main proof is claimed. No paid call or deployment;
production remains held. Fresh hosted checks and independent human review remain
required on publication. Main is unchanged; #964 review is deferred.

Luna checked all387 open PRs across four GraphQL pages: this is the current
terminal leaf, with no open PR targeting its branch and no competing sibling
at the preceding #994/#996 boundaries. This is topology/source review, not human
approval. Preserve the chain; do not invent a numeric successor.
