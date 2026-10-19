# Exact simulator identity for required iPhone proof

## Verified failure

Original #961 head `cbb2d2fa68885902b866a0d13e81527024a87fb8`, run
`39285905264`, failed the integrated writer step in the lost-creation-reply
journey. XCTest could not type at `V1SmokeUITests.swift:565` because the
screenplay editor did not have keyboard focus. This failure is not claimed
fixed merely because a different local run passes.

The same failure log independently proves a runner identity bug:

- erased/booted: `B34C2F57-B98B-4C84-96E2-3170887BA2DB`;
- Xcode-selected: `E839A11B-51B4-4AD3-ACF4-A53B95B7C957`, iOS 26.5;
- invocation retained `platform=iOS Simulator,name=iPhone 17 Pro`.

The runner resolved the first matching name from simctl for erasure but let
Xcode resolve that name independently. Multiple installed runtimes invalidate
the claim that the tested device had been erased. Historic hosted passing
counts are not fresh-install evidence when this identity mismatch applies.
This does not invalidate local runs that explicitly selected their owned UDID.

## Root fix and boundaries

`resolve_ios_simulator.mjs` is the single inventory-to-destination seam for
the existing canonical shell runner. It reads simctl's available-device JSON,
validates ID/name/OS/architecture, and returns an exact-ID destination before
any shutdown/erase. Ambiguous explicit names, unavailable/unknown devices,
conflicting selectors and runtime mismatches fail closed before erasure.
All callers still use the same shell runner and signing path.
Appended destination/parallel overrides and signing-disable settings are
rejected before erasure, so caller arguments cannot undo that guarantee.

Automatic CI selection uses the newest installed iOS runtime and pins its
selected UDID. It must not hide the observed iOS 26.5 failure by silently
choosing an older runtime. Local selection still requires an explicit owned
device. No signing disable, test retries, weakened assertions, extra framework
or application behavior changes were added.

## Proof at this checkpoint

- Three new regressions failed before the change: wrong Xcode destination,
  ignored explicit OS, and erasure despite ambiguous explicit name. Original
  contract suite: 10 pass / 3 fail / 0 skip.
- Expanded runner plus voice-wrapper contracts: 20 pass / 0 fail / 0 skip.
  An intermediate run found three dependent fake tools returning no JSON;
  their inventories were updated, retaining the boot/iOS/macOS failure
  propagation assertions. No test was dropped.
- Node syntax, shell syntax and whitespace checks passed.
- All five god files are source-identical to the failed #961 head.
- First full pinned Node20 suite: 2,881 pass / 5 fail / 2 skip. All five
  failures were evidence-contract Apple-tool doubles returning no inventory
  JSON, so the stricter runner correctly refused to erase/run. Updated the
  doubles to provide the owned device; retained every failure/zero-test/bad-
  summary/artifact-retention assertion and added exact-destination checking.
  Focused evidence contracts: 6/0/0.
- Final full Node20.20.2 suite: **2,886 pass / 0 fail / 2 skip**; canonical
  runner/voice-wrapper contracts in that container: **20/0/0**. Network off.
- Full signed units through the repaired runner: **857/0/0** on erased owned
  simulator `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`. Actual xcresult summary
  confirms that exact device, iOS 26.2 build23C54.
- Real authenticated lost-reply/relaunch/retry journey: **1/0/0**. Retained
  xcresult also confirms the exact erased device. This does not establish
  causality for the hosted focus failure or prove iOS 26.5 behavior.
- Adversarial caller-override regression: 0 pass / 1 fail before the guard;
  final runner/voice contracts **21/0/0** after it. Both destination syntaxes,
  signing-disable flags and parallel overrides are rejected before erasure.
- Sealed executable tree (including that guard): pinned Node20 backend
  **2,886/0/2**, runner contracts **21/0/0**, full signed units **857/0/0**.
  Sealed unit xcresult again confirms the exact erased UDID. No Swift source
  changed. The lost-reply UI1/0/0 above preceded this final argument guard;
  hosted proof on the final head is still required.
- macOS scaffold compile: exit zero, existing warnings retained.

Hosted failure attachments were downloaded and inspected. Their recording
shows narrow empty-draft header wrapping/overlap, not a keyboard alert.
Portions already have original later-stack work: #693 (placeholder below
header), #743 (compact project header), #768 (clipped hint/blank page).
Preserve and review those original fixes; do not silently duplicate them or
assume they collectively solve the unanchored-project focus failure. Local
installed runtime inventory contains only iOS26.2, so no local26.5 proof exists.

Logs: `/tmp/them-983-runner-before.log`,
`/tmp/them-983-runner-final2.log`, `/tmp/them-983-node20.log`,
`/tmp/them-983-node20-final.log`, `/tmp/them-983-evidence-focused.log`,
`/tmp/them-983-creation.log`, `/tmp/them-983-units.log`,
`/tmp/them-983-unit-summary.json`, `/tmp/them-983-creation-summary.json`,
`/tmp/them-983-macos.log`. Retained UI artifacts are under
`/tmp/them-983-creation/them-studio-ios-writer-loop/`.
Sealed proof: `/tmp/them-983-sealed-node20.log`,
`/tmp/them-983-sealed-units.log`, `/tmp/them-983-sealed-unit-summary.json`.
Hosted artifact root: `/private/tmp/them-983-hosted.zwNhRI`; failed recording
frame: `/private/tmp/them-983-focus-failure.png`.

## Remaining work

### Hosted contract follow-up

Head980c001 run39297714806 stopped at the repository quality step, before any
signed iPhone step: the offline-save wrapper's Apple-tool double returned only
the old text listing. Its five-case suite had1 pass/4 failures because JSON
selection correctly refused an empty inventory. This suite was omitted from
the earlier selected local script checks; the gap is acknowledged, not a flake.

Updated only `scripts/run_screenplay_save_network_fault_smokes.test.mjs`:
provide an available owned simulator JSON record and assert Xcode receives its
exact erased ID instead of the original name. All five existing cases pass;
none removed, no runtime/Swift change. Ran every one of the35 script test files:
first limited-tool image216/12/0 (git absent), then complete task-local Node20
image with git/curl228/0/0. Metadata was mounted read-only, external network off.

Also ran the canonical PR-shaped offline `scripts/quality_gate.sh`: PASS with
RUN_SERVER=1, RUN_CANON=1, heuristic page craft and fresh craft completeness
enabled; live/provider-dependent gates disabled, disposable storage and
synthetic auth, no host .env or provider key, network off. This includes the
offline exemplar gate, not live model quality. Logs:
`/tmp/them-983-all-script-tests.log`,
`/tmp/them-983-all-script-tests-tools.log`,
`/tmp/them-983-offline-wrapper-fixed.log`,
`/tmp/them-983-canonical-offline-quality.log`.
Earlier sealed backend2886/0/2, signed857/0/0 and macOS evidence remain scoped
to identical application/executable sources, not claimed rerun for this
test-double-only correction. Fresh hosted full proof is still required.

Prove the updated head through required
hosted checks on the pinned newest runtime. If the keyboard-focus failure
persists, investigate it on its own evidence; do not claim this independent
runner defect explains every UI failure. Append to original #961 only after
local checks, preserving its original head/history, then propagate through
children with preserving merges. No main merge or protection bypass.

Production backend/physical microphone, generated 120-page screenplay and
external-open export remain unproven. No paid model call or production
configuration mutation was performed in this change.
