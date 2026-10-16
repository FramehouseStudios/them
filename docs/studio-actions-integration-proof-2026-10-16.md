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
- Voice undo now calls the existing guarded undo handler synchronously rather
  than queuing a bridge command that later reads whichever write is current.
  No second undo algorithm. The canonical committed-draft policy now permits
  rollback only for matching project and exact committed UTF-8 bytes; scratch
  documents remain supported. Added project, edit, CRLF and Unicode regressions.
- Removed the voice revision handler's unconditional "and saved" message after
  kicking off an asynchronous save. Existing save status/error/success handling
  remains the authority; a trigger is not durable-save evidence.

## Verification

- Focused backend after final lane correction:12/0/0 on host.
- Initial full Node20 after capability correction, before lane correction:
  2,809/0/2; offline mentor gate pass. Final Node20 after lane correction:
  **2,810/0/2**, offline mentor gate pass. Backend tree77373ab5 is unchanged by
  subsequent Swift-only undo/status corrections. Both runs had external
  networking disabled; skips are real PostgreSQL (no DATABASE_URL) and opt-in
  live page-response fixture (RUN_LIVE_PAGE_TESTS=0).
- Initial corrected signed suite:684 units + inspectorUI1 =685/0/0.
  An additional direct-typing selector was misspelled and selected no test;
  no typing proof is attributed to that run. The exact real selector
  test_studio_page_accepts_complete_direct_typing is on the final run after
  the synchronous-undo correction, with full units and inspector UI.
- Final signed source `dd2f3db8`: **685 units +2 UI =687 passed,0 failed,0
  skipped**. UI cases are exact direct typing and all six inspector tabs.
  Erased task-owned11CF5EFB-D8C3-4F19-8062-28AF37F27D93, normal signing,
  iPhone17Pro/iOS26.2/23C54. Not the complete V1 UI suite or live voice actions.
- D009 versus T-951 passes: Studio17432->17411, MemoryAPI10865->10846,
  Root15024 unchanged, bridge12926 unchanged, index33557 unchanged.
- `git diff --check` passes. Final undo/status-inclusive macOS scaffold build
  passes using its canonical unsigned build-only configuration. iOS tests are
  signed. Existing concurrency warnings remain.
- Both exact hosted-failure workflows pass locally **2/0/0**, signed after a
  separate owned-simulator erase. The newer local code/iOS26.2 result does not
  clear the older exact-head hosted failures or establish their root causes.
- Final authenticated Home transcript/raw-audio pair: **2/0/0**, signed after
  another owned-device erase, REQUIRE_USER_AUTH=1, existing deterministic
  loopback runner. Asserts complete native scene, marker once, exact server
  saved draft and exact restoration after relaunch. Synthetic providers only;
  aggregate fixture counters ASR2/chat6/TTS25 are retained, not live latency,
  metering or a fixed paid-call budget proof. #807 reconciliation still needed.
- Private durable red/green logs and bundles, including raw hosted evidence:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-952-20261016.GizScN/`.
  No test artifact or secret is committed/uploaded. Original temporary files
  retained; no failed bundle overwritten. Initial red checks are not retries
  disguised as proof; source corrections precede green verification.

Changed files versus T-951 (including the original preserved implementation):

```text
TASKS.md
backend/lib/studio_actions.js
backend/lib/talk_handler.js
backend/tests/studio_voice_actions.test.mjs
docs/audits/studio-actions-gate-2026-09-30.md
docs/studio-actions-integration-proof-2026-10-16.md
them/BackendClient.swift
them/BackendMemoryAPI.swift
them/BackendScreenplayPagination.swift
them/RootExperienceView.swift
them/ScreenplayStudioPersistencePolicies.swift
them/ScreenplayStudioScreen+StudioActions.swift
them/ScreenplayStudioScreen.swift
them/StudioActions.swift
themTests/DesignSystemGuardTests.swift
themTests/ScreenplayStudioDraftRecoveryTests.swift
themTests/StudioActionsTests.swift
```

## Hosted checkpoint (not the newer rehearsal head)

GitHub run38967156903 reports overall success for #942 exact head6e7138b1.
**That badge conceals failures.** Raw hosted log was downloaded and inspected:
required units657/0, required writer loop succeeds, but V1 smoke39 total,
11 skipped,1 failure (`test_profile_remembered_login_restores_through_keychain_relaunch_and_disables`:
"Save password did not restore from persisted state."). Network-fault command
also exits65 / TEST FAILED, naming `test_realtime_network_faults_resolve_exactly_once`.
Both steps have continue-on-error enabled. Neither is a green proof despite
their converted successful step conclusions. The fault runner still disables
iPhone signing and quiets diagnostics; the current failure's exact root cause
is not established from these logs alone.

Existing #904 head a27c75a8 owns the required/signed/diagnosable smoke repair
and data-recovery follow-ups. Its current full brief is retained at
`/tmp/them-904-current-body.txt`; preserve that work, do not introduce a parallel
CI patch. Investigating these two failures and that existing repair takes
priority over the next product boundary once this local checkpoint is saved.
This hosted run is not evidence for T-950/T-951/T-952. Main remains647e01fc
unchanged; #942 stays draft and must not be promoted on the green badge alone.

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
- Read-only shipping check today: `https://api.them.io/health` returns HTTP302,
  text/html, not the required backend JSON health proof. No redirect/deployment
  or credential changes were made, and no claim is made about its destination.
- Legacy writes with unknown project scope are held from rollback into a
  selected project, preserving current text; this can make old undo unavailable.
- #766 then #770 still require genuine non-author approval before main lands.

## Copy-and-paste handoff

T-952 preserved original#643/879; safety corrections2299191b and dd2f3db8 guard
current account/project/draft-byte execution, duplicate responses, mount
readiness, explicit unsupported capabilities and fictional page-output actions.
Voice undo uses the existing guarded handler synchronously; revision save no
longer claims success before its canonical save completes. Node20 backend2810/0/2,
signed units685/0/0, six targeted UI cases across three signed erased-device runs
all pass; macOS/offline golden/D009/diff pass. This is local/synthetic evidence,
not real-phone or complete voice-action proof. #648 and #807 remain required.
New priority: #942 hosted run38967156903 is falsely reassuring green: V1 smoke
39 total/11 skipped/1 failure, network fault TEST FAILED, both hidden by
continue-on-error. Preserve and re-prove existing#904; local signed replay2/0
does not clear hosted failures. Main unchanged; no main merge or deployment.
