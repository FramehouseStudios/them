# T-1042 — Minimal original #909, current main, current URI fixes

## History and scope

Original #909 `788e010735bfa3c786c94c9f17b7f2c9742ee702` and actual main
`deac1a6d54a65dbf5f849f0f35476ad4ff07e1f0` are both parents of preserving
merge `c111f7116862236faa9b665ccdb4d9b465807ddd`; no conflicts. The original
dependency and proxy-regression commits remain intact.

The older T-987 proof branch also contains separate #964 runner changes.
It remains preserved at `a0abd56e593a25912755bd015a1e103069ede591`, but those
unrelated hunks are deliberately absent here. Against actual main, the whole
client, packages, project configuration, scripts and workflows are byte-identical.
No replacement PR, force push, squash, main merge or deployment.

## Root correction

Today's registry audit reported zero findings even before the new correction.
The maintainer's [2026-10-19 release](https://github.com/fastify/fast-uri/releases)
nevertheless identifies four more URI issues affecting the old locked3.1.8:
encoded scheme activation, ambiguous host rewriting, relative-reference
resolution changes, and unescaped suffix-path colons. Zero audit findings
are not evidence that newly disclosed behavior is safe.

Keep original Multer2.4.0/proxy-addr2.0.8 corrections; change only fast-uri's
three lock-entry fields to3.1.9 with verified registry integrity. No direct
dependency, override or application workaround. Tests resolve the same
installed URI dependency as AJV and preserve ordinary valid input behavior.

## Exact proof

- Frozen minimal source tree: `4531921b08b28feca927701f7a7ceaeb88d5f68e`.
- Entire backend byte-identical to the preserved preparation `a0abd56`.
  Corrected before on3.1.8:0 pass/4 fail/0 skip, native exit1. Patched focused
  URI + original proxy cases:5/0/0, native exit0, Node20.20.2/network disabled.
- Preparation's first patched result4/1/0 is retained: the suffix test assumed
  an unsupported malformed-string normalization outcome. Corrected to valid
  component serialization, then re-proved that corrected case failed before.
  No guard, assertion, timeout or existing test was removed to hide failure.
- Clean locked install:136 packages, exit0, lifecycle scripts disabled.
  Minimal tree reuses that exact installed dependency copy; package-lock
  compared identical. Before/after backend-only registry scans both returned
  zero reported findings/exit0; no new scan is claimed for the identical copy.
- Full minimal integrated-tree backend: **2744 pass / 0 fail / 2 skip**,
  native exit0,75026.319701ms, networking disabled. Skips: real Postgres
  prefix-query case (no DATABASE_URL) and conditional talk page-write HTTP
  preview/sync case. Preparation's separate2744/0/2 is not substituted for
  this integrated-tree result; no live database/provider proof is claimed.
- D009: all five deltas0 vs actual main (index33626, Studio17435, Root15112,
  bridge12952, memory10865). `git diff --check` and new-test syntax pass.
- No fresh signed iOS/UI/macOS result is attributed to this backend-only
  change. Client/application source equals main; fresh exact-head hosted checks
  and independent review are still required before merging.

## Evidence and adversarial limits

Private folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-987-promotion-20261020.sMrUgy/`.
`minimal-source-4531921b.tar` contains tracked source, not ignored secrets;
`minimal-backend-final.log` belongs to this exact minimal integration.
The older `backend-final.log` belongs to the separate preparation tree.
Both full runs use Node20.20.2 in disposable isolated containers, networking
disabled and executable task-local temporary storage for synthetic fixtures.

Answered: actual installed URI/proxy invariants, valid-input compatibility,
and preservation of the original dependency work. Partial: backend contract
coverage does not establish exhaustive upload resource/abort behavior.
Not covered: production exploitability, proxy topology, live model/phone or
deployed security. jsrsasign's maintenance warning and the maintained-runtime
migration remain separate debt. No paid model call or credential was used;
production remains held, and a normal branch push does not clear main alerts.
