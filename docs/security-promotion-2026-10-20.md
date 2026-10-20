# T-987 — Current security patch promotion

## Preserve the original, do not duplicate it

Original #909 stays the landing PR, base `main`, original head
`788e010735bfa3c786c94c9f17b7f2c9742ee702`. The existing clean task branch
`codex/T-987-security-main-proof` already preserves that head and current main
`deac1a6d54a65dbf5f849f0f35476ad4ff07e1f0` through merge `12666bf` and the
main proof baseline `54f700e`. Starting task tip `2c0b64c` is retained.
No replacement PR, squash or history rewrite.

**Scope correction:** reviewing the entire diff against actual main found
that this older proof branch also carries unmerged original #964 simulator
runner changes. Keep that branch and its proof intact, but do not promote
those unrelated hunks in the dependency PR. T-1042 will start from original
`788e0107`, normally merge actual main and carry these exact backend bytes.
The original #909 remains the landing PR; #964 is not silently bundled in it.

## New evidence changed the promotion decision

**VERIFIED:** today's backend production-dependency registry audit of the
unchanged candidate reported zero findings, exit0. However the maintainer's
[2026-10-19 security release](https://github.com/fastify/fast-uri/releases)
identifies four further issues in the candidate's `fast-uri`3.1.8, patched
within the same compatible major in3.1.9:

- [Encoded-scheme activation](https://github.com/fastify/fast-uri/security/advisories/GHSA-w74x-v6f9-j3xg).
- [Ambiguous host rewriting](https://github.com/fastify/fast-uri/security/advisories/GHSA-wjr9-j795-jxcr).
- [Relative-reference resolution changes](https://github.com/fastify/fast-uri/security/advisories/GHSA-xhq7-xmqj-769h).
- [Unescaped suffix-path colon](https://github.com/fastify/fast-uri/security/advisories/GHSA-333x-w4r6-6crp).

Zero registry findings did not establish absence of these newly disclosed
behaviors. This is not a claim that THEM's deployed routes expose every URI
operation or that a production exploit was demonstrated.

**Fix:** change only the existing lock entry's version, registry tarball and
integrity to3.1.9, using the exact registry integrity verified before install.
Keep AJV's existing dependency constraint, original Multer2.4.0/proxy-addr2.0.8
fixes and original proxy regression. No dependency override, framework,
application fallback, auth change or source-level URI workaround.

## Behavioral proof, not a version-string check

The new tests load the installed URI dependency through the actual AJV
resolver. They require malformed schemes/hosts to report errors, valid host
compatibility, relative normalize/resolve equivalence, and suffix output to
remain schemeless when its supplied serialization scheme is suppressed.
All inputs are synthetic reserved `.test` names; no outbound request occurs.

- Corrected before: **0 pass / 4 fail / 0 skip** on installed3.1.8, Node20.20.2,
  native exit1, networking disabled. All four are actual installed behavior.
- Initial patched focused run: **4 pass / 1 fail / 0 skip**, exit1, including
  the original proxy check. The suffix test incorrectly assumed a malformed
  string-normalization input must become escaped; that API preserves malformed
  inputs unchanged. Corrected the case to a valid component serialization with
  an omitted scheme, then confirmed that exact corrected case still fails
  before the patch. No security invariant was dropped to make it pass.
- Final focused: **5 pass / 0 fail / 0 skip**, native exit0; original proxy
  test plus the four corrected URI tests on the patched installed dependency.
- Fresh `npm ci --ignore-scripts --no-audit --no-fund`: exit0,136 packages.
- Before/after `npm audit --omit=dev --json`: exit0, zero reported findings;
  these are registry scans, not application-security certifications.
- Full frozen Node20 backend: **2744 pass / 0 fail / 2 skip**, native exit0,
  networking disabled (actual TAP duration74435.711785ms).
  Skips: real Postgres prefix-query test (no DATABASE_URL) and the conditional
  talk page-write HTTP preview/sync case. These skips are not live proof.
  This result belongs to the preparation tree; minimal T-1042 requires its
  own integrated-tree compatibility proof before promotion.

## Frozen source and isolation

Final backend/test source tree `0d8922c8d2c699db040e9cb56a8592f30f22224d`.
Full tracked-source archive only, without ignored `.env`, signing files or
Git metadata. Dependencies installed into that private archive, not another
session's worktree. Proof image `them-security-test-tools:node20` was directly
verified to run v20.20.2. Focused checks ran read-only with networking disabled;
the full suite also disables networking and uses a disposable container and
executable task-local `/tmp` for existing synthetic compiler fixtures.

Private evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-987-promotion-20261020.sMrUgy/`.
Retains audit-before/after JSON, installation log, both before cases, initial
patched failure, final focused result and final-source archive. No paid call.

## Adversarial review and limits

- Answered: installed parser/normalizer invariants and original mapped-IP
  trust-subnet regression, with ordinary valid inputs retained.
- Partial: the unchanged complete backend suite is the compatibility gate
  for existing schema/upload consumers. It does not prove exhaustive upload
  resource-exhaustion or abort handling; original #883 remains separate.
- Not covered: production proxy topology, deployment, live abuse or physical
  phone. No change to numeric trust-proxy configuration or auth boundaries.
- Residual: installation still warns that jsrsasign11.1.5 is unmaintained;
  replace only through verified actual signing/IAP contracts, not speculation.
  Node20 is retained for repository compatibility, not endorsed for production
  promotion; the separate maintained-runtime migration remains open.
- Client/application/UI source is byte-identical to the existing main proof
  baseline. No new iOS, UI or macOS result is claimed for this dependency-only
  change. Exact updated-head hosted gates and independent review are required.
- Production hold remains in place; main is not changed by local verification
  or a normal original-branch push. Writer/phone completion is not claimed.
