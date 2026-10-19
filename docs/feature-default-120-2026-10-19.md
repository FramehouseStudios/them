# T-1007 — 120 is the recommendation, not a quota

Human clarification on2026-10-19 is accepted as D017: recommend120 pages
with a complete first, second and third act; allow shorter/longer work.
Do not pad/truncate a screenplay, impose a length gate on export/save, or
describe the recommendation as a universal Hollywood rule. No existing
project target, draft, wallet, sign-in or production setting is migrated.

## Small coherent correction

Existing Swift `ScreenplayFeatureProgressionGuide.defaultTargetPages` and
backend `DEFAULT_FEATURE_TARGET_PAGES` become120. Quality fallback imports
the backend owner instead of retaining an independent110. Template ratios
remain proportional; their110 denominators are not default target lengths.

New varied-length tests found an independent existing rounding defect:
at180 pages, rounded first start=2, so page1 fell through to final Act III.
Other lengths had internal holes/backward jumps. Both existing range owners
now start each inclusive range immediately after the previous rounded end;
the first starts at1. Explicit110 maps stay unchanged. Tests walk every
page of60/90/110/120/150/180 targets and check three-act progression.
The quality checker also duplicated act thresholds: page14of60 was ActII
there but ActI in the feature map. Failing-first test reproduced this;
it now calls the actual map owner rather than retaining independent ratios.
Explicit act metadata still takes precedence. Final focused checks61/0/0.

VERIFIED backend focused60/0/0 on host Node26.7 after failing-first evidence
in `/tmp/them-1007-before.log`; corrected `/tmp/them-1007-focused.log`.
VERIFIED signed full units868/0/0 on erased owned Pro11CF/iOS26.2/23C54,
code signing enabled, native87761 exit0; completed xcresult summary read:
`/tmp/them-1007-units/v1-ui-smoke-local-1-23147.xcresult`.
Swift/project/test bytes unchanged after frozen5ecb5beb; later runtime
correction is backend quality only. Existing Swift6-concurrency warnings
remain; Debug unit success is not release certification.

First frozen5ecb5beb Node20.20.2 full backend2982/0/2, scripts238/0/0 and
offline golden OK, exit0. That result predates the quality-boundary sharing
correction. Final frozene92513db full run is separate: Node20.20.2,
backend2983/0/2, scripts238/0/0, offline golden OK, native72392 exit0,
`/tmp/them-1007-node20-final.log`. No provider network, no paid calls.
D009 actual T1003 all five deltas0; diff clean. Branch is saved to GitHub,
not main and not a replacement for an original target-setting PR.

## Preserved work and remaining scope

Original #84070ea6c47 adds the writer's target control; #861316abb4d adds
owner-scoped account persistence. Read both original changes; preserve them.
When they reach integration, reconcile their literal fallback110 with these
existing owners, without resetting chosen targets. This branch does not
skip their bases or pretend their features are already on main. Existing
mentor/framework110-page examples are explicitly examples, not targets;
feature map has precedence when present. Spoken total-length extraction
and target-setting still need one coherent UI/account/request path.

This change does not prove actual provider-generated feature quality,
physical microphone, live writing/rewrite, printing or external file open.
It is not a release or deployment. Orb/Clementine/aesthetic unchanged.

## Exact changed-file inventory

- DECISIONS.md — human-accepted D017.
- TASKS.md — task scope and proof status.
- backend/lib/feature_screenplay_map.js — default and contiguous ranges.
- backend/lib/screenplay_page_quality.js — shared default and act lookup.
- backend/tests/feature_screenplay_map.test.mjs — varied-length page walk.
- backend/tests/screenplay_page_quality.test.mjs — real quality/map parity.
- them/ScreenplayFeaturePlanning.swift — Swift default and range correction.
- themTests/ScreenplayStudioDraftRecoveryTests.swift — actual Swift guide checks.
- docs/feature-default-120-2026-10-19.md — this evidence inventory.
