# Original #979 restored-memory proof precondition

## Exact failing boundary

VERIFIED: Original #979 head `0f594829d7c1be796cdcfebd2655a8ca87416ed0`
retains original security work and selected #964 base
`eaa94d0b07ce527d67e3ddb8ec9d5ef0a95bbbd8`. Hosted run
[43205082418](https://github.com/FramehouseStudios/them/actions/runs/43205082418),
Quality job `131138109522`, tested GitHub merge ref
`ca20b402c0b6322372e890d0a2c59598d8682e72`.
Backend and D009 succeeded. Signed units executed 633 with zero failures.
The integrated writer step succeeded; its producer requires exactly one
passed native test and zero failures/skips. Only the failing V1 bundle was
extracted for this investigation; no writer or unit bundle was re-extracted.
V1 had **27 passed / 1 failed / 9 skipped**, 37 total. Voice-fault and macOS
steps were skipped after that failure. They are not fresh passes.

The sole V1 failure was
`V1SmokeUITests/test_story_obligation_evidence_survives_studio_relaunch()`
at original `themUITests/V1SmokeUITests.swift:2979`:

> Failed to determine hittability of "studio.right-panel.them" Button:
> Activation point invalid and no suggested hit points based on element frame

VERIFIED: Native activities show initial result/evidence/correction checks
succeeded, then an actual termination and second launch. The second restore
snapshot passed before the inspector opened. The helper then requested native
hittability before checking whether the tab was already selected. Its loop had
checked for the requested card only before opening the drawer.

At the attached failure hierarchy, the Them tab was already Selected with
frame `{{166.9, 173.5}, {105, 49}}`; the drawer was
`{{39.3, 100}, {360, 774}}` inside a `402 x 874` window. The expected obligation
result, evidence and correction control were present. There is no evidence of
lost obligation state in this failure. The exact transient native activation
calculation is unknown; the final attached frame is valid, so an offscreen or
zero-frame cause is not established. No runtime/layout fix is justified here.

Current runner logs resolve, erase/boot and test the same
`FCC5F673-7BEC-4A7D-8F2A-4DC35E2668EC` simulator; the V1 native summary agrees
(iPhone 17 Pro, iOS 26.5, build 23F77). This differs from the older retained
fcb launch failure and does not explain that failure's latency cause.

## Smallest proof repair

DECIDED for this scoped task: identify Them by `studio.right-panel.them`.
Before and after opening the drawer, return when semantic selection and the
requested memory card establish the target state. For actual necessary
navigation, check that the tab is not selected and has a non-empty frame before
asking native hittability and using the existing tap. Keep the existing
eight-second total deadline, loop cadence and outcome assertions. No coordinate
bypass, extra tap/retry, timeout increase, provider call or runtime change.

The existing relaunch test also requires the semantic Them tab to remain
selected after the helper returns. The snapshot and rendered-result assertions
remain in place; initial evidence/correction assertions are unchanged. The
adjacent pending-question helper has the same ordering and remains a bounded
follow-up; it is unchanged because it is outside this reproduced case. App, backend, packages, scripts and workflows remain exact
`0f594829`; only this UI-test helper/case and this proof document change.

## Evidence custody and checks

VERIFIED: Artifact `13942045181`, `quality-gate-failure-logs`, is 126,755,469 bytes.
SHA-256: `54025bed6bf3ccd43ebae22924240aa1123bc40282502c6aa4ea476203490251`.
Only `v1-ui-smoke-43205082418-1-29639.xcresult` was extracted (1,509 entries,
125,431,353 uncompressed bytes). Private local evidence directory:
`/tmp/them-t1402-security-hosted-red`; `findings.json` SHA-256:
`2fed043af268ab46d4169353bd5ac8c7cb15918dfbe7f3b4ab9401251a48f5d6`.
The archive remains unmodified. No temporary download URL or secret is recorded
in this document.

VERIFIED: Hosted backend job `131138109632` used Node 20.20.2 / npm 10.8.2:
2,752 passed / 0 failed / 2 skipped, 2,754 total. The skipped cases are not
passes. V1's nine skips were missing dedicated restore/recovery fixtures,
cross-platform fixtures, writer-loop backend port, two-device fixture and
writer-block fixture. The writer journey ran in its separate successful step.

VERIFIED local preparation checks: `xcrun swiftc -frontend -parse` exited zero
for the modified V1 source; `git diff --check` passed. Original `0f594829` is
preserved as the parent. All five D009-monitored files are byte-identical to
`0f594829` (manual identity check, not a new canonical gate run). Runtime,
package, backend, unit-test, script, workflow and Xcode-project trees are exact
`0f594829`; only the scoped UI-test file and this document differ.

PENDING: Jarvis owns the exact signed, erased task-owned iPhone workflow below;
no native/backend/container test is run by this preparation:

```text
themUITests/V1SmokeUITests/test_story_obligation_evidence_survives_studio_relaunch
```

No unchanged retry, main merge, PR mutation or publication is authorized by
this checkpoint. #964's human review remains deferred; production is held.
This proves neither live-model quality nor physical-phone behavior, external
export opening or integrated-main readiness.
