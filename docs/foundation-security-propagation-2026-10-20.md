# T-1074 — Preserve security main in original foundation #964

## Source and scope

VERIFIED original #964 is `81b05e44ab254cdd73e8d9d22d0d966cf6877e82`,
branch `codex/T-984-main-simulator-proof`, base main. Read its complete body
and current source. Its earlier owned worktree remains untouched.

Normal local merge `bb20ee71ebdb997800245d4d211132e53e07f544` has parents
that original head and independently reviewed security main
`78b8c94f43b4a11f18c2e61df556b9cd7370e735`. Only TASKS conflicts; retain both
histories. Executable source merges cleanly. All original commits remain.

Proof checkpoint `4f907cbf41ddf98b123bc0a5507045cdc067ab58`, tree
`31481d7c565a9146073ad5f85180e31e06fbeb9e`, adds only task metadata to that
merge. Security package/lock and both preserved security regressions equal
main byte-for-byte. All client, Swift package, Xcode project, runner and workflow files
equal original #964. No later #904/#919 product fix is silently imported.

This prevents future foundation updates from restoring vulnerable dependencies:
fresh installed/locked Multer2.4.0, fast-uri3.1.9, proxy-addr2.0.8.
No production image, secret, accepted decision or deployment setting changed.

## Exact fresh verification

- Fresh isolated tracked-source archive, Node20.20.2, `npm ci --ignore-scripts
  --no-audit --no-fund`: native exit0,136 packages. Installed versions equal
  the actual lock. Fresh registry audit:0 known vulnerabilities, native0.
  This is not a whole-app security certification. The existing jsrsasign
  maintenance warning remains; no unrelated crypto migration is claimed.
- Initial complete scripts run: **210 passed / 13 failed / 0 skipped**.
  Retain this red. The older proof-tools image lacks real Git, and a plain
  source archive cannot satisfy the tests that query their own HEAD.
  Git fixtures fail with ENOENT/null exit status, not an app assertion.
- Correct only the disposable verification environment: Alpine's signed
  package registry installs real Git into a proof-only image. Use a separate
  real isolated snapshot repository; its Git tree must equal the canonical
  source tree above before tests can run. No fake Git, changed assertion,
  restored secret or shipping-image change. Same source/dependencies then
  pass the full scripts suite **223/0/0**, native exit0, network disabled.
- Full backend with those freshly installed exact locked dependencies,
  Node20.20.2, external network disabled: **2752/0/2**, native exit0,
  118912.132971ms. Skips: real Postgres without DATABASE_URL and the conditional
  talk page-write preview/sync HTTP case. No host environment was copied.
- Full signed iOS units on erased task-owned375-point SE
  `E8998A6B-35B1-49E3-896C-861550849927`, iOS26.2/23C54: **624/0/0**, native0.
  `/tmp/them-1074-units/v1-ui-smoke-local-1-31833.xcresult`.
- Auth-required local typed writer/save/relaunch: **1/0/0**, producer exit0.
  `/tmp/them-1074-writer/io-them-studio-ios-writer-loop-37914.xcresult`.
  The unchanged older producer deletes its temporary bundle. An evidence-only
  external Xcode wrapper copies that completed result before deletion,
  preserving every native argument, assertion and exit status. Its temporary
  export artifact is not native Files/external-open or generation proof.
- Signed synthetic voice-fault test **1/0/0**.
  `/tmp/them-1074-voice/voice-network-fault-local-1-40435-ios.xcresult`.
- macOS scaffold build and combined voice runner finish with native exit0,
  `BUILD SUCCEEDED`. Existing compiler warnings remain; this is compilation,
  not new interactive macOS proof.
- D009 against actual security main78b8c94f: all five deltas0 (index33626,
  Studio17435, Root15112, bridge12952, memory10865). Human-approved early-stack
  index-count exception remains; no padding or waiver. Diff check passes.

## Policy / adversarial pass

The metadata-only `ready_for_review` event reruns a full gate on an unchanged
head. Existing merge-safety tests explicitly pin that trigger. DECIDED: do not
change that policy inside this security propagation; every required native
gate, strict base and independent review remains. Follow-up T-1075 must prove
safe event deduplication separately, without draft skips or dropped checks.

Answered: history/scope preservation, current security dependency retention,
exact lock installation, real-Git versus missing-tool failures, signed exact
simulator identity, and actual requested native case execution. Partial:
all upload-abort/resource-exhaustion paths and platform isolation warnings.

Not covered: previously red application recovery on this foundation boundary
is not rerun or called fixed here. Its client repairs remain in preserved
#904/#919. No fresh full V1 UI, production trust topology, physical microphone,
live provider, rewritten screenplay, all export formats or phone journey claim.
Native Files local proof remains separately attributed to original-preserving
T-1073, not merged into this foundation. No paid call or production action.

## Publication / next boundary

Only normally advance original #964 if its remote is still the inspected
ancestor, preserving its base and draft state. No replacement PR, squash,
force, direct main push, branch deletion or bypass. Require fresh exact-head
hosted checks and actual non-author approval before any protected merge.

Next: carry this current-main foundation into original #904, then #919 and
stopped #973 through actual bases, stopping on the first red. Preserve the
separate native Files checkpoint and original #590. Goal remains active;
production credential hold and real-phone proof remain unresolved.
