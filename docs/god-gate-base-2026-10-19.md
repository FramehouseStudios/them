# T-1004 — Missing comparison data is not a green architecture gate

VERIFIED while building T1003: explicitly requested local origin/T994 was
absent. The old checker printed absolute counts, exited0 and said Pass, with
no baseline comparisons. Fetching the real198ab3f0 proved all five actual
deltas0, but did not fix the checker. This task fixes that root defect.

Failing-first real temporary Git repositories:1 pass/6 fail;
/tmp/them-1004-before.log. Corrected host Node26 focused7/0/0;
/tmp/them-1004-focused.log. Fixtures create their own commits/remote refs
without touching the real worktree, GitHub, credentials or other sessions.

Require a resolvable baseline commit and readable baseline data for every
present protected file. A supplied missing base cannot fall back silently to
main; absence of both default bases also fails closed. --allow-growth waives
only measured growth, never missing evidence. JSON preserves existing fields
and adds comparisonError; unverified rows are labeled accordingly. Human
output explains how to fetch/fix the baseline instead of printing Pass.
Measured growth with an explicit waiver still exits0 but is labeled growth
allowed, not falsely claimed no-growth. The canonical five-file list and
comparison/counting rules are unchanged. Missing current files retain the
existing deletion/strangler posture; no new source-file cap is introduced.

Full pinned Node20 script/backend proof pending. Actual main-based D009,
syntax and git diff --check pass. No application/backend/Swift source change;
no new local signed UI run or physical/model-quality claim from this task.

## Adversarial scope

- Answered: explicit wrong base, absent default base and unreadable per-file
  baseline fail, including when allow-growth is specified. Ordinary available
  base comparisons pass; real growth still fails unless explicitly waived.
- Answered: text never says Pass for failed comparison, JSON says failedtrue.
- Not covered: compromised Git tooling, forged remote history, broader branch
  protection/audit policy or release readiness. Existing live T1003 native
  proof continues independently; this task does not restart or certify it.
- Independent review and exact-head hosted checks required; no main merge,
  protection bypass, production change or paid provider call.

## Exact files

- scripts/check_god_files.mjs
- scripts/check_god_files.test.mjs
- TASKS.md
- docs/god-gate-base-2026-10-19.md
