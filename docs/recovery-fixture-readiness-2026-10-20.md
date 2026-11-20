# T-1080 — Offline edit injection must wait for the real seeded page

## New authoritative failure

Original #91998bad16f97cb3c85126fac134144464c2e9ded8c, hosted39511926607,
Quality job118934804104: terminal failure. Signed units682/0/0 and full V1
UI32/0/9 passed; recovery1/1/0. Voice/macOS were skipped after the red.
Native recovery artifact12307533842 is retained with the complete log.

This failure is not the prior setup timeout. The stale-conflict story reaches
Keep Mine and creates one local server version, but its actual draft is only
the SAVE-CONFLICT marker. The unchanged final full-text assertion at
V1SmokeUITests.swift2099 correctly rejects it: the seeded35-character scene
plus separator should precede the marker. No claim the whole queue was lost.

## Root setup gap and minimal correction

The DEBUG injection helper admitted an edit when a project summary existed
and generic loading was false. Neither proves that the matching page was
hydrated. It can append the marker to an empty pre-hydration editor. Both
initial UI checks accepted marker presence without the seeded page, so the
invalid premise survived until final exact-text verification.

Reuse the readiness portion of preserved original #962856d7624's helper:
selected model ID and loaded-draft ID must match the nonempty selection;
existing loading/save-idle guards remain. Cancellation aborts injection.
The existing40x250ms budget is unchanged; no arbitrary delay increase,
retry loop, fake response or forced expected draft. Later blank-page intent
branches are not imported. The edit is inside the existing DEBUG-only helper,
not a new shipping behavior fix or a claim all real user editing is proven.

Both affected UI stories now require correct selected/loaded project, full
expected short-fixture tail and exact character count before terminating or
creating a competing version. The original final full server-draft assertion,
one-version/idempotency, auth-refresh and relaunch checks remain intact.

## Verification boundary

VERIFIED: the two affected stories passed **2/0/0**, native producer exit0,
signed on the erased owned
375-point SE E8998A6B/iOS26.2, against the auth-required local fixture with
dummy providers and matching locked dependencies. No paid call, full local
backend/unit/V1/macOS repeat or physical-device action. Hosted machine is
iOS26.5; local success cannot alone close the hosted failure.

Actual local bundle:
`/tmp/them-1080-recovery/them-save-recovery-YtjLhq/recovery-ios.xcresult`.
The earlier failed hosted bundle is
`/tmp/them-1080-editor-red-artifacts/Users/runner/work/_temp/them-save-recovery-5AvDZl/recovery-ios.xcresult`.
Both complete bundles, full log and exact failed source are retained privately;
no new failing-before local run or real-phone/provider success is claimed.

D009 against actual parent #904d36d4e64: all five deltas0, index33626,
Studio17431, Root15112, bridge12929, memory10865. Diff check passed.
No main merge, child propagation, replacement PR, force/squash or deployment.
Production hold and live/physical complete journey remain outstanding.
