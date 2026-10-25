# T-952 — Current-document Studio action safety

Advances goal1 (no duplicate writes), goal3 (fiction is not instruction), goal4
(real controls), goal6 (account/project isolation), goal7 (independent proof).
Not a production-ready voice-control or real-microphone claim.

## Provenance

- Parent T-951: `65006858`.
- Original #643 `86cc5b24`, both commits read; preserving merge `ab24901e`.
- Existing #879 `eaed4e61` read and preserved in merge `202c0670`.
  Only TASKS.md conflicted; retained both task ledgers. Original heads unchanged.
- No squash, replacement PR, main merge, deployment or paid provider calls.

## Reproduced problems and root corrections

- Signed duplicate-callback characterization: 9 pass, 1 fail, zero skip,
  `/tmp/them-952-actions-red.xcresult`. The same response handler called twice
  dispatched `save_revision` twice. Keep this failed bundle.
- Backend capability regression: 9 pass/2 fail before fix, then11/0. Explicit
  empty/unknown control arrays expanded to all controls; explicit empty draft
  was overridden by stale scene labels. Existing parser now fails closed for
  those explicit declarations while retaining absent-field compatibility.
- Fictional dialogue could infer a rewrite/save UI action on page-output turns.
  New regression fails before the lane correction (`page-actions-red.log`).
  The same production `studioControlsEnabled` decision now gates both prompt
  controls and reply execution; tags are still stripped when actions disabled.
- The existing dispatcher is extended, not replaced. Production Root supplies
  its bridge to capture authenticated user/session generation, project and
  exact UTF-8 draft bytes before the response. Re-check before opening Studio,
  during delayed mount, and before each notification. A switched account,
  project or changed draft cannot apply the old action to the new document.
- Metadata can dispatch actions only once per request wrapper. Exact duplicate
  actions collapse across tag/spoken sources; client caps accepted actions at4.
  Response metadata still forwards unchanged to the existing voice path.
- Delayed production delivery also checks actual Studio visibility; a refused
  opener does not deliver actions into an unmounted surface.
- Existing guarded undo already refuses when the committed draft no longer
  matches current text. No broad rollback implementation was substituted.

## Verification in progress

- Focused backend after final lane correction:12/0/0 on host.
- Initial full Node20 after capability correction, before lane correction:
  2,809/0/2; offline mentor gate pass. Final rerun pending; do not substitute it.
- Final signed units + inspector destinations are running, erased task-owned
  11CF5EFB-D8C3-4F19-8062-28AF37F27D93, normal signing.
- D009 versus T-951 passes: Studio17432->17411, MemoryAPI10865->10846,
  Root15024 unchanged, bridge12926 unchanged, index33557 unchanged.
- `git diff --check` passes. macOS scaffold build pending.

## Holds and next original work

- Existing #648 `210c5ef0` owns protected controls/coverage prompt blocks and
  reply-pipeline/inference repairs. Its body and relevant code were read, not
  duplicated or silently pulled across the intervening original product PRs.
  Current characterization: 46,655-character synthetic prompt ->6,200 chars;
  complete control block and tab-tag syntax both disappear. Thus this boundary
  is NOT proof that live Clementine reliably operates controls. Preserve and
  reconcile #648 as the original stack reaches it.
- Original #818 owns companion-tab aliases and automation dispatch. Retained,
  not reimplemented. #644 remains the next actual product base-chain boundary.
- No generic claim that every model commitment is authorized or completed.
  Negated/conditional/quoted narration, old-turn responses with identical
  document bytes, acknowledged mount delivery beyond the existing fixed delay,
  save/revision completion receipts, and precise rewrite targeting still need
  combined runtime/adversarial proof. The dispatcher count means accepted,
  not completed actions; no success receipt is inferred from that number.
- Server write authorization remains canonical and required; capabilities
  are control hints, not an identity/authorization boundary.
- No physical phone, shipping host, external export opening, two-device or
  full-session120-page performance claim. Preserve orb and Clementine.
- #766 then #770 still require genuine non-author approval before main lands.
