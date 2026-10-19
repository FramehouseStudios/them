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
