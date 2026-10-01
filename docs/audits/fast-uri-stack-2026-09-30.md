# Remaining dependency-security update — 2026-09-30

Goal criteria 6/7/8. Parent #883 `24f4e88b`. Exact #782 commit `d1421fa5`
ported with `cherry-pick -x` as `28adf822`; only its three lockfile lines change
the dependency. Original PR and branch preserved. #766 → #770 still merge first.

VERIFIED: installed parent fast-uri 3.1.6 accepts an unclosed authority bracket
without a parse error; the saved assertion fails. Patched 3.1.8 reports an error.
Added malformed-host, percent-encoded-host and normal/IPv6 regressions alongside
the existing real craft-schema tests. Focused URI/craft proof: 29 passed, zero
failed. Production uses the library indirectly through AJV; no proof that THEM
exposes the vendor's precise SSRF/host-allowlist attack path is claimed.

Vendor advisories:
[unbalanced authority brackets](https://github.com/fastify/fast-uri/security/advisories/GHSA-58mr-gqgx-xq4g),
[encoded host normalization](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj).
Current locked production audit (`npm audit --omit=dev --json`): zero findings
across all severity levels. This is a current registry result, not proof of
absence of every vulnerability, nor clearance of unchanged main's alerts.

Parent-relative god-file gate: all five tracked files +0; syntax/diff check pass.
Full Node 20 backend: 2,813 passed, zero failed, two skipped (2,815 total).
Signed full iOS units on erased dedicated E37CE808: 666 passed, zero failed.
No production application or Swift source changes, new auth pattern, secret,
provider call, deployment or original branch rewrite. Early index remains the
approved 33,626; later product stack establishes exact 33,603.

Artifacts: `/Users/halfmutantfilms/io.them-worktrees/_proof/branch-audit-20260930/`
with `fast-uri-stack-` prefix: install/repro/focused/backend/units logs,
units xcresult and audit JSON. A first repro-log write was denied by the
sandbox before execution; the scoped authorized run then recorded the actual
failed assertion. No failed proof is hidden as a successful command.

Not covered: physical mic, production provider/configuration, full V1 UI,
recorded ten-page writer loop, deployment, complete account/data isolation,
or release readiness. Human review and required hosted gates remain separate.
