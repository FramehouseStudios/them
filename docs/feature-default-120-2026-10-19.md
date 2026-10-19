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

VERIFIED backend focused60/0/0 on host Node26.7 after failing-first evidence
in `/tmp/them-1007-before.log`; corrected `/tmp/them-1007-focused.log`.
Signed Swift and pinned Node20 full results pending, not claimed here.

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
