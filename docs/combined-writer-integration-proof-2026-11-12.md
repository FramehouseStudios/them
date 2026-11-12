# Combined writer integration proof — 2026-11-12

## Combined candidate

Private preserving merge002bb1c4 joins published recovery backup2b34edf7 with
prepared original #997 d3536442, including original #995/#996 session/owned-copy
helpers. All original ancestors remain intact. App/units/Packages/Xcode trees are
exactf143; production backend lib/index/ops/dependencies exact2b/46d; UI-test tree
exact993. This combines the work locally without claiming it has landed on main.

## Causal harness fix

Commit4386d5f8 changes only the writer eval and its existing evidence tests.
The writer runner used spawnSync while its backend's stdout/stderr used pipes.
The blocked parent could not drain those pipes while Xcode awaited backend work.
A fixture-only injected loopback route writes2MiB to each pipe and waits for drain.
The original runner caused the fake native HTTP request to time out at3seconds
(exit76): focused0pass/1fail/6name-filter skips. The asynchronous runner completed
that same request in398ms; focused evidence/helpers18/0/0, Node20, network none.
Three earlier container/setup failures are retained as setup failures, not causal
results. This does not establish the cause of prior hosted/app freezes.

The fix reuses the recovery runner's async spawn pattern, streams native output
and retains bounded diagnostic tails. Native summary validation, actual bundles,
exact-device erasure, timeouts and assertions remain intact. No retries, shipping
endpoint, auth bypass, dependency or god-file changes.

## Current proof

- Actual signed writer workflow at4386: **1 passed / 0 failed / 0 skipped**.
  The native summary confirms task-owned81F0FF38-9DAD-4011-907B-357DFADD094C,
  iPhone17Pro/iOS26.2(23C54), normal signing and canonical erase/boot. Local
  auth-required backend and isolated stores; responses synthetic. Page creation,
  acknowledged save, export-byte checks and relaunch restore passed. Opening
  the file outside THEM and live speech/model quality were not observed.
- Preserving merge6b90c350 adds only original #995's latest proof documentation
  to4386. Full Node20.20.2 at6b: **3121 passed / 0 failed / 5 skipped**,
  3126 total,0cancelled, network disabled. All1706 tracked hashes unchanged.
- The full run's four absent-PostgreSQL-URL cases remain skipped there; the
  existing preview-header case is also skipped. Earlier actualPG4/0/0 and real
  PG/Redis/HTTP/ledger proof remain unchanged-production-component evidence,
  not a new actual-store run at6b.
- Current UI-test tree has separate signed T1404 direct typing1/0/0 and
  reconnect/real-auth-refresh/conflict-relaunch3/0/0. That harness used the older
  identical-contract backend; these are component results, not repeated6b UI.
- App/unit tree is exactf143 with earlier1566/0/0 signed units and macOS compile.
  Those unchanged broad suites were not repeated for eval/test-only changes.
- Canonical D009 against genuine published #99790362d4f: all five deltas0;
  diff/source/ancestry checks pass. Existing compiler warnings remain.

Permanent raw logs, frozen-source manifest and native bundle:
`_proof/T-1411-combined-writer-20261112/proof.json`.

## Trust and integration boundary

**Answered for tested conditions:** log backpressure no longer blocks the runner's
backend; native zero/skipped/failure summaries still fail; original artifact and
config ownership remain tested. Existing actual-store receipt/ledger scenarios
are unchanged code. **Partially covered:** full user journey remains synthetic;
no fresh device-owner-auth, real microphone, paid model, intended production or
external Files-open proof. **Uncertain:** prior unrelated hosted failure causes.

Original #979c508 now passes all three required hosted checks. Original #996896
still awaits its final hosted gate at this record; original #995E91 and #9979036
remain published unchanged. Prepared #9955c5062cd includes fresh native proof;
its advancement waits for the actual parent gate. No current open PR targets
#997's branch (exact-base REST list verified12:40:33UTC); future fixes need a
reviewable dependent path, not a replacement of original PRs.

This is a local/recovery-branch rehearsal, not main or deployment. #964's genuine
review remains deferred by the human. Keep all required protections and the
production/App Store-credentials hold. No paid model calls; do not call THEM
complete before integrated gates and the identified-backend physical-phone
journey are observed.
