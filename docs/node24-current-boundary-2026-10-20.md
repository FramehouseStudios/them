# T-1043 — Preserve and refresh original Node 24 migration

## Original work and actual dependency

Original #602 `6be04ea003f6201ea23b8c8031684477b4499925` is preserved as a
parent of normal merge `7921da3b7088852b8c796f245ab47950edb064f0`; the other
parent is original #909's verified security boundary
`d3b6027e651588414c46cf1f2fccfd2511de8768`, which preserves current main
`deac1a6d54a65dbf5f849f0f35476ad4ff07e1f0`.

The old #596 baseline changes are already present on main. The actual delta
against #909 contains no Swift, package, UI-test or script changes; useful
original work is preserved, not skipped or reimplemented. Retain #909's
Multer2.4.0/proxy-addr2.0.8/fast-uri3.1.9 corrections in the runtime proof.

**Decision:** stack original #602 on #909 to keep this delta runtime-only.
Landing remains #909 to main first, then retarget/re-prove/review #602 against
main. Do not merge #602 into the parent feature branch or bypass protections.
No replacement PR, force push, main push, squash or deployment.

## Concrete runtime correction

[Node's official schedule](https://nodejs.org/en/about/previous-releases)
lists Node20 as EOL and24 as LTS. The official release index and
[24.22.0 release](https://nodejs.org/en/blog/release/v24.22.0) identify the
current LTS patch, released2026-10-14. Refresh the original24.20.0 migration
to24.22.0 rather than calling the old proof current.

- Keep `backend/.node-version` as CI's owner and all seven original setup-node
  call sites reading it. Keep the existing `>=24 <25` package engine contract.
- Pin both production Docker stages to the verified official multi-platform
  index digest `sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f`.
  Metadata contains amd64 and arm64 manifests; only arm64 execution is proven here.
- Correct the original alignment test: derive expected Docker tags from
  `runtimeVersion`, instead of hardcoding24.20.0 independently of the purported
  canonical version file. No new runtime framework/configuration system.

## Frozen source and actual checks

Frozen source tree `ca7f99d45d34bb48caa685adc97f1d35d9ac52f5`; subsequent
ledger/proof changes are documentation only. Tracked-source archive excludes
ignored environment/signing files and Git metadata.

- Full backend on exact Node24.22.0 Alpine: **2746 pass / 0 fail / 2 skip**,
  native exit0,66773.670405ms; provider networking disabled. The original
  runtime tests and all preserved dependency regressions are included.
- The two skips remain the real-Postgres prefix-query case without DATABASE_URL
  and the conditional talk page-write HTTP preview/sync case. No live database,
  provider, voice or writer-output proof is inferred from them.
- Production Docker image build: native exit0. Actual built image
  `sha256:886b557d2807dfb70259f592000d3a4f6653b5415ce998c77430643f4cfece0c`:
  Node24.22.0, arm64, user`them`/UID100, tini entrypoint, acorn/acorn-walk absent,
  no baked `/app/.env`. Build's production-dependency audit reported0 findings;
  this is not a whole-image/application-security certificate.
- Actual isolated image HTTP: explicit **development mode**, user auth required,
  no published ports or external networking, synthetic disposable stores.
  `/healthz`200 with persistence`ok`, `/api/version`200 with expected schema/build,
  signed-out `/screenplay/projects`401. SIGTERM through tini completed with
  exit0/OOM=false. Complete server log/exit record retained; owned container removed.
- Separate default **production-mode** bootstrap without credentials: native
  exit1, expected `Refusing to boot` missing-config error before stores open.
  App Store and other private inputs were not fabricated. The production hold
  is intact; development HTTP success is not production readiness.
- Original runtime source checks2/0/0 and all six workflow YAML syntax checks
  passed. No active explicit Node20 runtime selector remained in the checked
  workflows/scripts/Docker/setup surfaces; Render selects the same Dockerfile.
- Initial full script attempt inside the test image: **197 pass / 13 fail /
  0 skip**. The image has no Git and the source archive has no repository history.
  Git-init/HEAD/ignore-status checks failed there; no product assertion was waived.
- Corrected script proof: **210 pass / 0 fail / 0 skip**, native exit0,
  25119.4415ms on official native macOS arm64 Node24.22.0 in the real isolated
  worktree. Its tarball matched the official HTTPS SHASUMS256 entry before
  execution; no global Node installation changed. Actual Git/history remained
  available, no history was synthesized, and no script/test assertion changed.
  Real provider/release credentials were removed from this command's environment;
  the worktree has no local backend `.env`. The failed container run is retained.
- D009 initially lacked its unfetched parent ref and could only print absolute
  counts; that is not comparison proof. Fetched exact #909, then verified all
  five deltas0 (index33626, Studio17435, Root15112, bridge12952, memory10865).
  Whitespace checks pass. No CODE_SIGNING_ALLOWED=NO test invocation.

## Evidence, boundaries, next gate

Private folder:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1043-20261020.v82rk6/`.
Retains immutable source tar, official image metadata, test-only tools image
recipe, HTTP probe/server/exit evidence and official native-runtime distribution
verification. Temporary logs `/tmp/them-1043-{image-build,tools-build,install,
backend,scripts,runtime-http,production-hold}.log` belong to this pass.

Test-only compiler/Bash tools do not enter the production image. No personal
phone, production credentials or paid model calls. No fresh SwiftUI/unit/UI/
macOS result is claimed for unchanged client source. Exact-head hosted required
checks and independent review still gate landing. Remaining gaps include actual
production topology, amd64 execution, live provider and physical-iPhone proof;
this migration is not completion of THEM.
