# T-1040 — Original database gate on the now-green save parent

Original #962856d7624 completed hosted39383769697 successfully: Backend,
Quality Gate and D009 all green. Filtered real hosted logs show backend2897
passed/0 failed/2 skipped and signed units870 executed/0 failures. This is
parent evidence, not newly executed local client proof. Main remainsdeac1a6d.

Prepare a no-ff preserving merge of T1028 head1ff16763 (original #9637459a8fa
plus T991 cleanup and prior verified parents) with exact green #962856d7624.
Only TASKS conflicted; retain both histories. The combined client, Swift
tests/UI tests, Packages, project, backend runtime/lib/index and manifests
are byte-identical to856d7624. No unchanged iOS/macOS repetition is claimed.
Newer product candidate T1039/#970 remains separate and preserved; this
original tooling boundary does not supersede it or change chosen page targets.

## Actual proof on frozen tree5f0042e35fcff7a9086140b6b7b89e203e7bc192

- Canonical real Docker gate exit0/PASS: Node20.20.2, PostgreSQL16.15, all12
  migrations, exact422201-byte/6600-line synthetic draft and one-line rewrite,
  actual backend/database restart with fresh files, retained authentication,
  cross-user denial and no duplicate replay. Cleanup precedes PASS, affecting
  only that invocation's UUID-owned fixtures. No production DSN/provider key.
- Focused safety10/0/0 under network-isolated Node20.20.2.
- First full harness mounted dependencies under /proof-deps, not a normal
  node_modules directory. Transitive body-parser resolution failed. Identify
  the exact container by its unique frozen-source mount and stop it (exit137);
  this is an aborted invalid harness, not a complete product-suite result.
- Corrected dependency copy into ordinary backend/node_modules: full pinned
  backend2907 passed/0 failed/2 skipped,2909 checks/47 suites. Skips remain
  ordinary live-Postgres-prefix and opt-in live-model response assertions;
  separate restart proof does not reclassify those skips as passes.
- Script run227 passed/4 failed/0 skipped. A direct spawn diagnostic confirmed
  EACCES on noexec /work tmpfs, despite Bash and executable bits being present.
  On executable isolated container storage, only the affected release-script
  file reran:13/0/0, exit0. Other218 cases passed in the initial run. Do not
  present these as a newly executed full231/0 run; no app/script was weakened.
- Offline mentor golden gate OK on the same source, external network disabled.
  These are exemplar scores, not live provider quality. The successful log is
  retained; the container-local JSON report was not copied before removal.
- D009 against fetched original parent: all five deltas0; whitespace/syntax
  checks pass. No runtime changes after the frozen tree, only this ledger/doc.

Logs: `/tmp/them-1040-postgres.log`, `/tmp/them-1040-node20.log` (aborted),
`/tmp/them-1040-node20-corrected.log`, `/tmp/them-1040-release-corrected.log`,
`/tmp/them-1040-parent-hosted-counts.txt`. Frozen archive excludes ignored
private files. Local Node24 orchestrates Docker; tested workers use20.20.2.

## Remaining boundary

Keep original #963 unchanged until the exact proven descendant is committed
and normally appended within authority; then require fresh hosted checks and
independent review. No squash, replacement PR, force, main merge or production
change. Historical original auth SIGABRT is retained in prior evidence, not
claimed fixed by a later pass. Production hold, live provider/physical-phone
journey, durable generated output and actual feature craft remain open.
