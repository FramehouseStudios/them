# T-985 — Recovery proof must not turn skips into success

## Verified failure and root correction

Parent: T-984 `54f700eab285365be0dd9798a31ba99029de2bbd` / draft #964.
Owned branch: `codex/T-985-recovery-proof-truth`.

Main's old harness started a random backend port while XCTest read31337.
Actual results were0 pass/0 fail/2 skip on each platform, but quiet output
contained no skip lines and its regex allowed a success exit/message.
That was false-green verification, not successful writer recovery.

Reuse the existing #904 port correction (`ce772ce15e21a3452bd5554a976c42229c26861f`)
and the rehearsal's canonical async/result-summary implementation rather
than creating a second protocol. Adapt only main's existing two-test count;
do not pull the later five-case product features into this helper change.
Normal simulator signing and exact owned-device erasure stay required.

The harness now uses unique retained iPhone/macOS result bundles, keeps the
Node event loop available to drain its owned backend's output, and requires
the actual summary to contain exactly2 passes (1 for an explicit selection),
0 failures and0 skips per platform. Missing/malformed/zero/skipped results
and Xcode failures cannot print the harness success message. Synthetic auth,
disposable storage and disabled provider paths are retained. No live model
call, production credential or Swift runtime change in this correction.

## Proof of the correction

- Before: both skip regressions fail (0 pass/2 fail;6 cases filtered out).
- After: new executable evidence contracts8/0/0 plus existing helper
  contracts6/0/0; combined14/0/0 on Node20.20.2, external network off.
- Full script suite223/0/0; full backend2747 pass/0 fail/2 skip on Node20.20.2.
- Syntax, whitespace and D009 pass; all five watched files source-unchanged.
- Logs: `/tmp/them-985-before.log`, `/tmp/them-985-focused.log`,
  `/tmp/them-985-full-node20.log`.

## Actual writer recovery is still red, not certified by those contracts

The direct authenticated fixed-port run of parent T-984 executed both real
iPhone cases:0 pass/2 fail/0 skip, exit65. Initial queue setup was not
established; one case also timed out on the editor-ready handshake. This
does not demonstrate a relaunch loss or establish its root cause. Bundle:
`/tmp/them-984-offline-connected/iphone.xcresult`; log:
`/tmp/them-984-offline-connected.log`. Evidence posted on #964:
https://github.com/FramehouseStudios/them/pull/964#issuecomment-6274243108.

The corrected harness is running the same application now; retain its real
outcome separately. Existing original #904 contains deterministic fault
injection and queued-draft-before-hydration protection in `48be1836`.
Next: preserve and re-prove that original PR, not silently recreate or discard
its application fix. Its current original head is `a27c75a85309e8557163b009baf6e1573d403a0d`.

Earlier signed624 units, typed writer UI1/0/0 and macOS compile evidence on
T-984 cover identical application source, not a rerun on this harness commit.
Production/physical-phone speech, generation, exact-word offline recovery,
external-open export and the120-page screenplay remain unproven.

## Publication checkpoint — 2026-10-20

VERIFIED: main is still `deac1a6d`; original #964 is still `54f700ea`
before publication. The only executable changes after that PR are the
existing T-985 harness/helper/contracts; no Swift, production backend,
dependencies, provider routing or model prompt changed. Publish this
descendant to the same original draft by normal fast-forward, not a
replacement PR or a main merge. Fresh exact-head hosted checks and an
independent review remain required. The older hosted green on #964 does
not establish offline recovery: that workflow does not run this scenario.

Fresh scoped verification: Node20.20.2, network disabled, synthetic auth,
14 passed / 0 failed / 0 skipped. Log:
`/tmp/them-1044-recovery-focused.log`. The first container invocation did
not start (exit125: missing mountpoint beneath a read-only source mount).
Created that directory in the disposable archive, then the same checks
completed with exit0. Node syntax, shell syntax, whitespace and D009 pass;
all five watched source files have delta0 against main.

The previously recorded full backend2747/0/2 and scripts223/0/0 are
retained historical proof of the identical executable tree, not fresh
runs today. No fresh Xcode, live provider or physical-phone run is claimed.

The existing original-PR rehearsals are also preserved: #904's combined
recovery tree executed both cases2/0/0 but its broader typing UI was red;
the later #919 rehearsal corrected an independently reproduced live-Binding
snapshot defect and passed full V1 UI28/0/9 and recovery2/0/0. Those app
changes are not silently imported into this harness-only main boundary.
Their original remote heads still require preserving updates and fresh
hosted proof. A truthful rejected recovery run is not a working app.
