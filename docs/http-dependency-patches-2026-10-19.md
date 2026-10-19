# T-1001 — Patch network trust/URI dependencies without changing policy

VERIFIED dependency versions and upstream advisories on2026-10-19:

- proxy-addr2.0.7 →2.0.8: GHSA-jqcg-44mw-7w3h, GitHub alert16 critical.
  https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h
- fast-uri3.1.6 →3.1.8: GitHub alerts15/17/18, two high and one moderate.
  https://github.com/fastify/fast-uri/security/advisories/GHSA-58mr-gqgx-xq4g
  https://github.com/fastify/fast-uri/security/advisories/GHSA-qw65-cvwx-89v3
  https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj

Read the maintainer advisories and regression patches before writing cases.
Local pure dependency regression before patch:2 pass/5 fail/0 skip.
/tmp/them-1001-before.log. No requests to any exploit target were made.

Smallest correction: npm update proxy-addr fast-uri --package-lock-only
--ignore-scripts --no-audit --no-fund. Reviewed diff contains only those two
package entries and associated integrity/funding metadata. package.json and
application sources unchanged. npm ci installs both patched versions; npm ls
confirms Express and AJV consume them. No hand-written replacement parser.

VERIFIED focused host Node26:13/0/0 including all seven advisory/valid-input
controls and T999/T1000 authorization regressions. /tmp/them-1001-focused.log.
VERIFIED frozen runtimef6645b35 on Node20.20.2: backend2752 pass/0 fail/2
skip; scripts210 pass/0 fail/0 skip. /tmp/them-1001-node20.log. D009 all five
deltas0 and git diff --check pass. No new Swift/UI, paid call or deployment.

## Adversarial interpretation and remaining debt

- Answered: short IPv4-mapped and generic zero-leading IPv6 subnet no longer
  trust unrelated IPv4 clients; correct plain/mapped private subnets work.
- Answered: URI delimiter injection via port throws, malformed bracket hosts
  report an error, encoded uppercase host octets canonicalize consistently;
  valid HTTPS/IPv6 URIs retain meaning.
- Not established: direct exploitability in THEM. app currently uses numeric
  trust proxy1, not the advisory subnet. fast-uri is transitive through AJV,
  not a demonstrated product URL authorization boundary. Dependency exposure
  is verified; no claim that a production exploit was reproduced.
- Not covered: shipping proxy topology/CDN, new provider paths, production
  network probes or whole-system security certification.
- npm audit --omit=dev reports0 findings, but GitHub still lists eleven
  Multer1 alerts. Do not mistake an incomplete advisory database for safety.
  Separate next task: verify migration of actual multipart voice upload from
  Multer1.4.5-lts.2 to a patched2.x release, including malformed input,
  limits, aborted uploads, successful audio buffer and server survival.

## Exact files

Integration correction: original909788e0107 already carries these patched
versions in the product rehearsal (preserved by a4755332). Preserve that
original code/provenance; this main-based branch is supplemental regression
coverage, not a replacement of909. Its dependency delta becomes redundant
when909 is present. The combined rehearsal keeps the original lock exactly,
including Multer2.4; do not use this branch to overwrite original work.

- backend/package-lock.json
- backend/tests/http_dependency_security.test.mjs
- TASKS.md
- docs/http-dependency-patches-2026-10-19.md
