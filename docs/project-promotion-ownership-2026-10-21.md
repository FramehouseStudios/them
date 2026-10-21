# T-1105 — Keep delayed first-project saves with the page that requested them

October 21, 2026. Parent `7bdec3f196332cb082e6ea2ebfc6f24df71328c8`.
Branch `codex/T-1105-promotion-commit-ownership`.
Runtime/test checkpoint `b65a52f87fe253c83983824960afa945f1c5b6ac`.

## Reproduced failures and root fixes

VERIFIED: hold a real, authenticated local backend's successful project-create
response, edit the actual native page, then deliver that response. The original
Root flow submits one version containing the earlier draft. The corrected
reproduction failed **0 pass /1 fail /0 skip** on that exact stale submission.
This establishes a stale write attempt, not a claim of observed server-side text
replacement or a cross-account leak.

Root now captures the canonical `StudioActionDocumentContext` and rechecks it
before creating, after creation/before submitting the version, and before
applying binding/status/error results. The existing identity owner supplies user
and login-intent generation; document identity includes selected project and
exact UTF-8. Studio must remain open and the task must not be cancelled. A
nonempty saved version ID is required before binding. A stale task releases its
busy state without overwriting newer status. The existing eligibility rule was
extracted with this capability, not duplicated.

Removed promotion from planned merged text at synced playback start. The
authoritative committed-write observer and real restored-page hooks remain.
No new writer, auth framework, persistent store, provider, or dependency.

The positive journey then failed **0/1/0**: an empty initial project-list load
unconditionally hydrated an empty server draft and erased the unbound editor.
The new context check correctly refused to save that changed page. Fixed the
clearing at its model owner: no selection is not an empty saved version. Keep
an unbound page; detach text only when a previous project actually supplied it.
Explicitly loading an empty project still uses the existing hydration behavior.
No guard relaxation or fixture substitution to make this journey green.

## Verification, including failures and exact-source distinctions

- First proxy run **0/1/0** was invalid accounting: metadata upserts were counted
  as creations. Corrected the proof-only classifier before attributing the
  genuine stale-write reproduction above to the app. Proxy Node20.20.2 checks
  **2/0/0** cover held actual HTTP, unheld metadata updates, release, source-scoped
  version counting, and rejection of non-loopback targets. No production import.
- First broader signed native run **843 pass /1 fail /0 skip** found a new DEBUG
  diagnostic using a raw font outside design tokens. First repair then failed
  compilation because its typography import was missing (**0 tests executed**).
  Corrected both, without disabling either check or suppressing warnings.
- Corrected broader signed native run **844/0/0** on an erased task-owned
  iPhone17Pro/iOS26.2(23C54), `7F1A14C1-B379-4417-AFE9-331810CD9CD3`.
  This precedes the final empty-selection correction and its extra regression.
  Do not report an unrun final 845-test suite.
- Final signed focused `ScreenplayProjectPromotionTests` **2/0/0** covers exact
  context admission/rejection and unbound retention versus previous-project
  detachment. Policy checks cover cancellation, Studio closure, user/generation
  change, chosen project, expired/unauthenticated context, and changed bytes.
  They are not actual account-switch/bootstrap transport proof.
- Final authenticated native positive UI **1/0/0**: real Root promotion, writer
  title, one version with source `studio_first_turn_auto_create`, exact original
  text including CRLF/trailing space/decomposed accent, terminate/reopen without
  draft seed, same text/project/version and no duplicate project.
- Final authenticated native delayed-response UI **1/0/0**: actual editor change,
  held real creation reply, then observed Root task completion; no stale
  Root-source version submission; exact changed editor text retained. If the
  existing autosave independently binds the edited draft, verify that saved
  version's exact bytes too. Do not mistake legitimate metadata or autosave
  requests for the stale Root write. No arbitrary negative-only sleep as proof
  of Root completion; the DEBUG read-only `studio.promotion.phase` witnesses it.
- Extra Stop UI initially **0/1/0** reached the control after its 0.168-second
  audio fixture finished: Start talking, not Stop talking. That run did not
  establish the active-turn precondition. The proof runner now selects its
  existing measured7.704-second audio asset for this interruption case, without
  changing production timing or weakening assertions. Corrected actual Stop
  UI **1/0/0**: Home -> real raw-audio transport -> native page preview -> Stop
  ends capture and restores the empty baseline without late insertion/rearming.
  STT/chat/TTS fixture counts **1/2/1**; no real model or microphone claim. It
  does not inspect server project/version count and is not orphan-recovery proof.
- Final macOS scaffold compilation passed. Node syntax and `git diff --check`
  passed. D009 passes versus actual parent and cached main: Root14963 ->14961;
  other monitored files unchanged (index33557, Studio17337, bridge12934,
  MemoryAPI10845). Existing actor/Sendable warnings remain, not suppressed.
- Production backend code did not change in this task. Reuse T-1104's exact
  Node20 full **2900/0/2** for that unchanged runtime; the new proof-only test was
  run separately. Do not claim a current full2902-pass backend run. The native
  UI harness runs host Node24.19.0 with authenticated real local routes and
  intercepted providers; both promotion workflows made STT/chat/TTS **0/0/0**.
  The unchanged proxy source/test match the earlier Node20 frozen snapshot;
  the final runner-only audio selection was syntax checked and executed above.

## Limits and next root-cause targets

T-1107 is next, before original #648: `BackendMemoryAPI` project/version writes
await bootstrap before constructing current-identity headers. The version retry
can refresh and reconstruct them; response sync updates precede Root's callback.
The new callback checks do not establish transport isolation across these awaits.
Reproduce held bootstrap/401 refresh plus changed login intent at actual request
and sync boundaries, then extend canonical auth intent/lease owners. Do not
claim that pure context checks fix this unproven but concrete source risk.

T-1108 tracks separate metadata creation and initial-version creation: a crash
or rejected stale response may leave an empty project. Current happy-path proof
does not establish atomic/idempotent creation or orphan reconciliation. No
autonomous deletion or destructive cleanup was added.

No paid model calls, physical microphone/iPhone proof, real Postgres proof,
deployment, production/secret/domain change, protected-main bypass, or release
readiness claim. Orb, Clementine and existing visual identity remain unchanged.
T-1106 retains title-page/editor and saved-age presentation debt. The old
`header_text_committed` playback breadcrumb is not used as durable-commit proof.

GitHub readback: original #964 is OPEN/REVIEW_REQUIRED at
`5faa43d6c087813be926246be14f3425ad651880`; God-file gate, Backend tests and
Quality Gate are SUCCESS. Main remains
`78b8c94f43b4a11f18c2e61df556b9cd7370e735`. Approval is still human-only; this
task neither supplies a review nor merges anything.

## Exact changed files and evidence

- `backend/evals/promotion_delay_proxy.mjs`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `backend/tests/promotion_delay_proxy.test.mjs`
- `them/RootExperienceView.swift`
- `them/ScreenplayProjectPromotion.swift`
- `them/ScreenplayProjectPromotionDiagnostics.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/ScreenplayProjectPromotionTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md` and this report

Permanent proof: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1105-20261021.2WLp0I/`.
Retain actual failed/successful bundles and logs, public source snapshots and
runtime patch. Promotion UI frozen backend source:
`/tmp/them-1105-final-source.USR7GB/source`; final corrected Stop snapshot:
`/tmp/them-1105-current-source.4Pmkfv/source`. Native runner points at this task's
working tree. Later model/test correction and proof-only runner audio selection
separate the 844-test snapshot from final focused/UI/macOS proof. Private ignored environment files are never
included. This report is a code/evidence briefing, not a claim that THEM or the
larger integration goal is finished.
