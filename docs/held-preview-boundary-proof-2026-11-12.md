# Held-copy preview boundary and action readiness — 2026-11-12

## Status

The original hosted held-preview failure remains unresolved. These changes add
an opt-in diagnostic and repair the separately proven stale-frame review tap.
They do not claim to repair Autosave or the held-preview callback.

Parent publication c7a4d230, run 43176422888, currently has successful backend,
D009, signed-unit and writer steps; V1 is still running. Backend log totals:
3,042 passed, 0 failed, 5 skipped. No unchanged hosted retry was started.

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

## Ownership and hold

HOWARD reconciled native frames/events; EINSTEIN reviewed callback guards
and probe safety read-only. Their reviews do not replace human approval.
Native proof uses synthetic fixture identity and loopback. No paid provider,
live microphone, physical-phone, integrated-main or shipping-backend claim.

#996 remains held. Children #995/#997 and original #626 integration remain
frozen. #964 human review is deferred. Main and production are unchanged;
the existing App Store-credential production hold remains.
