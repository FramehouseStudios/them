# Dependency-security updates — 2026-09-30, follow-up 2026-10-06

Goal criteria 6/7/8. Parent #883 `24f4e88b`. Exact #782 commit `d1421fa5`
ported with `cherry-pick -x` as `28adf822`; its fast-uri lock entry is updated.
During independent review, the current production dependency audit also exposed
critical `proxy-addr@2.0.7`; this follow-up updates the lock to 2.0.8, the fix
within Express' existing semver range. Original PR and branch are preserved.
#766 → #770 still merge first.

VERIFIED: installed parent fast-uri 3.1.6 accepts an unclosed authority bracket
without a parse error; the saved assertion fails. Patched 3.1.8 reports an error.
Added malformed-host, percent-encoded-host and normal/IPv6 regressions alongside
the existing real craft-schema tests. Focused URI/craft proof: 29 passed, zero
failed. Production uses the library indirectly through AJV; no proof that THEM
exposes the vendor's precise SSRF/host-allowlist attack path is claimed.

Vendor advisories:
[unbalanced authority brackets](https://github.com/fastify/fast-uri/security/advisories/GHSA-58mr-gqgx-xq4g),
[encoded host normalization](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj).
The `proxy-addr` advisory affects versions below 2.0.8 when a trust subnet is
written as a short IPv4-mapped IPv6 prefix (for example `::ffff:10.0.0.0/8`):
that can trust every IPv4 address. The authoritative advisory documents the
precondition and recommends 2.0.8:
https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h.
The regression fails on 2.0.7 because that malformed prefix trusts unrelated
IPv4 addresses, then passes on locked 2.0.8; correct `/104` mapped and plain
IPv4 `/8` behavior also remain covered. Current app configuration uses numeric
`app.set("trust proxy", 1)`, not the vulnerable malformed CIDR, so this proves
the dependency defect and regression fix, not an active exploit path in THEM.

Current locked production audit (`npm audit --omit=dev`): zero findings across
all severities. This is a current registry result, not proof of absence of
every vulnerability, nor clearance of unchanged main's alerts.

Parent-relative god-file gate: all five tracked files +0; syntax/diff check pass.
Baseline full Node 20 backend before this follow-up: 2,813 passed, zero failed,
two skipped (2,815 total). Follow-up full backend on local Node 26.7.0: 2,814
passed, zero failed, two skipped (2,816 total); the environment's runtime does
not match the backend's Node 20 engine, so this is not a Node 20 re-proof.
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
