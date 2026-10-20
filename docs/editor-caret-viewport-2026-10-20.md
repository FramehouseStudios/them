# T-1053 — Typed words must remain visible on the paper

Owned codex/T-1053-editor-caret-viewport preserves original #625 d493c515
and T1052 diagnostic80f840c. Original #625 is now hosted green; do not
advance/restart that head for this separate investigation. Main unchanged.

## Observation and falsifiable contract

T1052's actual erased signed375-point SE/iOS26.2 focus case passes1/0/0;
its keepAlways screenshot shows page header/counters and disabled Save above
the keyboard, but no typed paper line. Exact marker is in the model. No
stray Send appears. Do not call this missing bytes or invent a toolbar fix.
Retained evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1052-20261020.NnI7Bq/`.

Studio's page is inside a SwiftUI outer vertical ScrollView. The editor is
also a native UITextView; its own scrollRangeToVisible only owns that inner
scroll surface. Manual delegate currently updates text/presentation/cursor
but does not explicitly reveal the caret through the outer paper viewport.
That is a hypothesis until actual geometry/callback characterization fails.

Use the existing IOSCursorInsertTextEditor.Coordinator and real UIKit views,
adapting the preserved T988 binding-test construction rather than a fake
editor protocol. Fixture uses actual caretRect/UIScrollView bounds with a
200-point outer viewport and an editor below its visible edge. It models
clipping, not a real keyboard. Invoke the actual manual delegate. The caret
must end within the parent bounds without losing the typed text. Separate
programmatic/inactive cases must not steal paper position.

VERIFIED before-run2 pass/1 fail/0 skip, native65, product unchanged:
`/tmp/them-1053-before/v1-ui-smoke-local-1-57840.xcresult`;
log `/tmp/them-1053-before.log`. Manual callback leaves actual nonempty
UIKit caret(212,327,2,13.5) outside parent bounds(0,0,375,200). Both
programmatic/inactive controls pass. This confirms the outer-scroll gap
in the fixture; actual keyboard after-proof still required. No fix yet.

Fresh original #904 a6a36260 hosted39419339905 failed V1 at
test_story_obligation_evidence_survives_studio_relaunch: activation point
invalid for studio.right-panel.them (Swift3047). That earlier required
integration red takes priority; preserve this diagnostic while inspecting
its actual artifact and #625's already-proven pinned-navigation repair.

Required next for this capability: if confirmed on the integrated UI, use one
small editor-viewport owner, preserve focus/text/formatting and let the outer
scroll bounds handle keyboard size. No fixed keyboard-height guess, new
Root/Studio state, notification-listener framework or voice auto-follow.
Keep non-editing/manual page browsing while Clementine writes intact.

Actual software-keyboard after screenshot and focused UI are still required;
unit geometry alone is not sufficient. No paid model calls, physical-phone,
production or whole-app completion claim. Existing orb/aesthetic preserved.
