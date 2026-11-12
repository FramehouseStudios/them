# Held-copy preview boundary and action readiness — 2026-11-12

## Status

The original hosted held-preview failure remains unresolved. These changes add
an opt-in diagnostic and repair the separately proven stale-frame review tap.
They do not claim to repair Autosave or the held-preview callback.

Parent publication c7a4d230, run 43176422888, completed successfully with all
three required checks green. Final retained log checkpoint:
- Backend: 3,042 passed, 0 failed, 5 skipped.
- Signed units: 1,559 executed, 0 failures; no skips reported.
- Writer: required strict summary gate passed for 1 test, 0 failures/skips.
- V1: 39 passed, 0 failed, 36 skipped (75 total).
- Dedicated recovery: strict summary gate passed for 3 tests, 0 failures/skips.
- Voice-fault: 1 test, 0 failures/skips.
- macOS scaffold build and D009: passed.

Writer/recovery counts are enforced by the successful summary contracts.
V1 skips remain uncovered by that invocation. The writer's earlier helper
could interpret an unknown AX value as Off, so its pass does not establish
that native transition. The stronger follow-up below closes that proof hole.

Final 4,904,522-byte job log is retained privately beside the failure evidence
as c7-hosted-final.log, SHA256:
7796c33d5b86a80c6cf32f9cfdf07b315385beb5e7b370546ab6ca056f98e291.
No failure artifact was uploaded by this successful workflow. Original red
evidence remains retained; a diagnostic-only green is not an Autosave fix.

## Exact failures preserved

Run 43170334977 at 90362d4f contains:
- Signed units: 1,566 passed, 0 failed, 0 skipped.
- Writer: 1 passed, 0 failed, 0 skipped.
- V1: 37 passed, 2 failed, 36 skipped.
- Dedicated recovery and voice/macOS steps: skipped after V1 failed.

Both failures are original tests already present in #996. The later #997
primary-origin resolver is not used by these fixture launches: they explicitly
request the UI-test override http://127.0.0.1:9, which precedes it.

The complete native archive is retained at:
 /Users/halfmutantfilms/io.them-worktrees/_proof/T-1385-997-hosted-v1-20261111/quality-gate-failure-logs.zip
SHA256: 951778753c96676dc192336f64f5139ff379bb75dce6d5207e3d790080f3ff35.

## Real action-readiness repair

The conflict-custody test waited only for Review Local Copies to exist.
Pre-synthesis session line 23742 records current activation point
(122, 277.8333) against old synthesis frame (32, 143.70001856, 180, 34.3333).
XCTest injected at the old center, (122, 160.8667). Event-time video confirms
the actual button frame was (32, 260.667, 180, 34.333): about 117 points below.

The original test now uses its existing stable-frame and hittability helpers
before the same single tap. Each new readiness check has a 5-second ceiling.
Existing sheet/content deadlines and assertions remain unchanged. No second
tap, coordinate hard-code, scope bypass or debug-state mutation is added.

This same owned repair was first saved on the descendant source in 10bb3ee8
and verified with two local cases. Only its test hunk is carried down to the
earlier owner here; no descendant merge, original-head rewrite or child
advance occurs. The earlier local commits remain preserved.

Focused signed verification on this owner: 1 passed, 0 failed, 0 skipped.
Bundle: /private/tmp/them-t1386-conflict-review-readiness.xcresult
Xcode 26.3, iOS 26.2, erased root-owned simulator, normal signing.

## Missing held-preview boundary

The held-copy preview tap in the failed run had correct, stable event-time
geometry: (126.3333, 330.6667), inside (32, 301.667, 188.667, 58). No retained
scope-rejection message establishes why its sheet did not appear.

The existing DEBUG + UIKit + --ui-testing + explicit environment-flag probe
now records typed phases: callback; token confirmed/rejected; onAppear; and
token invalidation by project, document, identity or context. Only phases
and process-local model-owner hashes are added. No screenplay text, labels,
credentials, token values, IDs or request payloads are captured.

Existing confirmation guards, awaited custody read, token assignment and
sheet binding remain intact. Metadata is bounded to the existing 32-record
buffer; recording does not publish state or write UserDefaults. Two
noninteractive 1px AX surfaces cover the banner and sheet so either path
can retain the same metadata. Missing AX metadata is attached as unavailable,
not turned into a new product assertion.

Only the held-preview fixture enables the added observation. The original
5-second review condition/message remains; failure now returns immediately,
preventing later misleading attempts after XCTest suppresses input.

## Probe validation and limits

One signed local held-preview case passed: 1 passed, 0 failed, 0 skipped.
Erased root-owned iPhone 17 Pro, iOS 26.2, Xcode 26.3, normal signing.
The retained attachment contains 6 records, including 2 touch receipts and
callback -> tokenConfirmed -> appeared on one observed model owner.
This validates observation on a successful local path, not the hosted cause.

Bundle: /private/tmp/them-t1386-held-preview-probe.xcresult
Metadata summary: /private/tmp/them-t1386-held-preview-metadata-summary.json
Attachments: /private/tmp/them-t1386-held-preview-attachments/manifest.json

The onAppear phase does not prove completed native presentation/hittability.
Owner hashes identify models, not SwiftUI presentation-state storage.
Invalidation before token assignment is not recorded. A full buffer can
evict older evidence. Probe AX/modifier wrappers can perturb timing, so a
diagnostic-only green result is not a runtime repair.

The later addition of the separate conflict-review readiness guard does not
change the held-preview function or production runtime.

macOS inert-path build passed:
 /private/tmp/them-t1386-held-preview-mac.log
D009 against actual #994 parent a45824a2 passed: Studio -3 lines,
the other four zero. Final diff check passed.
The initial pre-gate identity check rejected stale local tracking ref
a3b172c6. Remote #994 was verified at a45824a2 and that exact branch was
fetched normally before the comparison. No gate was weakened.
No unchanged full unit/backend run is claimed for this diagnostic follow-up.

## Stronger Autosave transition proof

Final trust review found a separate test defect: the old Bool helper mapped
all missing/unrecognized accessibility values to false. An expected-Off wait
could therefore pass without observing Off. Its repeated tap also could not
prove that the writer's first action worked.

The helper now returns Bool? and accepts only native 1/0, true/false or on/off.
Unknown stays nil and cannot equal observed Off. Initial On and hittability
are required; one tap is sent; the expected known state must then appear.
The second tap is removed. The existing overall state-wait budget is retained
(the prior quarter and three-quarter waits total the same supplied timeout).
No product control state or assertion is weakened.

Signed local strict writer: 1 passed, 0 failed, 0 skipped, erased root-owned
iPhone 17 Pro/iOS 26.2, Xcode 26.3, normal signing. It completed create, native
typing, manual save, generated page, export and relaunch. Providers were
synthetic: ASR 0, mocked chat 1, TTS 0. Its retained 15-record trace contains
12 touch receipts and exactly one accepted true-to-false binding write.

Bundle: /private/tmp/them-t1388-known-autosave-writer.xcresult
Trace summary: /private/tmp/them-t1388-known-autosave-metadata-summary.json
EINSTEIN reviewed optional-state equality and unchanged timing read-only.
This is a new focused check after a meaningful contract change; no unchanged
broad unit/backend/macOS rerun. App source is unchanged from 07d4d3fe, whose
macOS inert-path compile passed. Fresh hosted checks are required.

This closes the false-green proof path. The original Autosave event-loss
cause remains unexplained. Do not generalize the separately observed
117-point stale-frame review miss to that switch.

## Ownership and hold

HOWARD reconciled native frames/events; EINSTEIN reviewed callback guards
and probe safety read-only. Their reviews do not replace human approval.
Native proof uses synthetic fixture identity and loopback. No paid provider,
live microphone, physical-phone, integrated-main or shipping-backend claim.

#996 remains held. Children #995/#997 and original #626 integration remain
frozen. #964 human review is deferred. Main and production are unchanged;
the existing App Store-credential production hold remains.

Separate unfinished-input durability gap remains open as #998; no restore implementation is claimed.

## Offscreen drawer activation precondition

A separate retained failure on original #422 at69af6fab established an unsafe
test precondition shared by the later centralized helper: querying native
hittability before determining whether a fully-visible target is offscreen.
XCTest aborted at Co-writer (y1144–1188) outside the allowed drawer108–850.
Archive SHA256:
feaaa52883e27b63379bdb7cadc4aa998594fbaf0d10714f3e90382495a0944f.
Exact failure and correction:
https://github.com/FramehouseStudios/them/blob/6a5010eeede3d5edb482287d548f66fd0a9da366/docs/onboarding-drawer-visibility-proof-2026-11-12.md

This local follow-up starts at54175841 and moves only the centralized
fullyVisible frame check before optional hittability. It preserves the actual
studioDrawerContentViewport owner, target-relative pans, frame-only callers,
margins, swipe bounds, selection/reuse/page/cleanup assertions, strict Autosave
helper and diagnostics. Default partial-visibility behavior is unchanged.
No old branch's helper is copied wholesale into the newer integration.

VERIFIED: signed focused Creative Partner workflow1 passed/0 failed/0 skipped,
on exact erased81F0FF38-9DAD-4011-907B-357DFADD094C,
iPhone17 Pro/iOS26.2(23C54), Xcode26.3, normal signing.
Bundle: /private/tmp/them-t1392-creative-partner.xcresult.
Actual native summary: /private/tmp/them-t1392-creative-partner-summary.json.
All three mode selections/summaries and Reuse/To Page/cleanup assertions pass.
Swift parse, diff and D009 versus actual994a45824a2 pass; Studio-3/others0
is inherited runtime credit, not a new extraction.
No unchanged local broad backend/unit/macOS run is repeated for this UI-only
correction.

This demonstrates the changed helper's positive workflow, not a reproduced
failure on54175841 or an explanation of the original Autosave/held-preview
event miss. The old541 hosted run is left intact until terminal; any new
publication must preserve it and require fresh exact-head gates.
No paid model, physical phone, production or integrated-main proof is claimed.
