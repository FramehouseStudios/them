# First-page sign-in handoff — T1480 (2026-11-14)

## Problem and resulting behavior

The first physical-phone attempt exposed a silent first-use dead end. Onboarding marked the name complete before authentication, called `openStudio()`, then submitted Page work or started the microphone even when navigation had redirected to Account. Its error belonged to an onboarding overlay that had already disappeared. Signing in resumed navigation without retaining the requested action. Separately, Home hid Talk and its connection/error messages after six seconds. Voice to Scene did not retain an explicit first Page target; routing could depend on a local transcript that was not available before server transcription.

The scoped fix retains one immutable Page/Voice request until the authenticated workspace is ready. Cancelling Account keeps the editable input. A failed Page keeps the form and error above Studio; onboarding completes only after a nonempty page result. Voice to Scene retains its initial Page target across both voice transports until an authoritative editor-committed insertion, or explicit stop/close. Home controls and failure messages remain visible. The orb, palette and existing navigation/transport/auth implementations remain.

## Ownership and architecture

- `ScreenplayFirstPageOnboardingModel` owns the existing onboarding fields, pending request identity, progress/error and initial voice Page intent. It does not authenticate or dispatch work itself. Request snapshots preserve raw Unicode input; prompt rendering retains the prior prompt/fallback semantics.
- `ScreenplayFirstPageOnboardingView` extracts the existing form, retains its accessibility identifiers and disables editing during its pending action.
- `StudioTypedSubmissionScope` replaces an unread Root routing-state variable with one capability-owned invocation identity. Existing account generation plus a distinct invocation ID rejects stale partial/final UI application and stale cleanup, including identical-prompt stop/restart.
- Root propagates optional account-generation guards through typed dispatch, prompt/correction boundaries and deferred commit/annotation callers. These are UI/caller fences, not proof that every deeper API suspension is owner-bound.
- Canonical D009 versus freshly verified main `71c637d886a9edd6a183048cd2feea0d00bfb143`: Root −18, BackendMemoryAPI −80 inherited, other three files 0. No protected file grows. Backend and dependency sources are unchanged by T1480.

## Fresh proof and retained failures

Base is installed-source `38fe14d291115d4376493f71a884bc5c8e606660` plus the frozen scoped working tree. Native proofs hash-checked all 1,449 source inputs before/after; exact selected test identities were checked, not inferred from exit status.

- Signed focused iOS checkpoint on an erased task-owned iOS26.2 simulator, explicit Xcode26.3/17C529: **31 passed / 0 failed / 0 skipped**. Includes 16 first-page, 4 submission-owner and 11 existing workspace cases.
- Existing `test_first_run_onboarding_unlocks_companion`: **1 passed / 0 failed / 0 skipped**, normal signing and erased owned simulator. This workflow intentionally uses the existing stubbed generation and UI-test auth bypass. It proves form/editor wiring, **not** real signup, microphone, provider quality, playback or persistence.
- macOS scaffold: **BUILD SUCCEEDED**, same frozen source, existing local ad-hoc compile flags (`CODE_SIGN_STYLE=Manual`, `CODE_SIGN_IDENTITY=-`, empty `CODE_SIGN_ENTITLEMENTS`). No Mac runtime/install claim.
- Canonical D009 and `git diff --check`: pass. Source parse: pass. Native simulator observation confirmed readable persistent Talk controls and an offline connection message beside the preserved orb.
- Earlier focused checkpoint retained: **11 passed / 15 crashed / 0 skipped**. All crashes were the new synchronous isolated-model tests deallocating through ObjC XCTest; all 15 crash reports show a main-thread invalid-free SIGABRT. Converting only those test entry signatures to async retained every assertion; the later native checkpoint passed. The exact missing-task-context explanation remains an inference, rather than a proven compiler/runtime diagnosis.
- One intervening compile retained: exit65, **0 tests executed**, an unsupported `preferredTarget` argument on the context lookup. Corrected the call while retaining the explicit target on actual render/routing.
- First Mac command retained: exit65 before compilation because it omitted the established local ad-hoc/empty-entitlement flags. Corrected command passed; signing protections on iOS tests were not disabled.

Full backend/full iOS/recovery suites were not repeated for this app-only scoped checkpoint. The prior 725-unit and Node20 2783/0/2 checkpoints belong to their earlier exact sources, not fresh T1480 results. Required broader integration gates remain before any landing/readiness claim.

## Physical-phone facts and open gaps

VERIFIED: official Xcode27.2/27B52 resolved development services for the newer phone; Apple signature/Gatekeeper passed. The human completed developer sign-in and the updated Program agreement. Exact source38fe was signed for that selected device, installed and normally launched without erasing/uninstalling anything. Human-reported physical Safari health returned `ok:true`. An actual THEM screen was observed through USB preview.

FAILED: the human reported no relevant story reply or page writing. Normal signup201 occurred; provider metadata shows successful STT/TTS, an STT transport TypeError and `error_recovered/provider_unavailable`, and an aborted talk request. HTTP200/recovery audio does not establish successful story writing. Two approximately1200ms chat aborts may be optional asynchronous theme/quality calls; they do not establish a reply-generation timeout. No blanket timeout increase was made.

The human deferred the live session. The exact task/nonce development backend was stopped gracefully with exit0; persisted account/state/JWT were retained, and source/module/head immutability passed. No automated paid-model suite or wallet grant ran. Fresh authorization is required before another live session. Production remains held. T1480 is **not installed on the phone yet**.

Unresolved, with no silent completion claim:

1. Canonical API `commitRealtimeTurn`/`annotateTurnHistory` can suspend for bootstrap before reading current request identity, and publish actor sync/notifications before Root rejects a stale result. Root guards alone do not close that identity boundary or revoke a sent correct-owner commit.
2. Deferred evolution dispatch, prompt-builder internal retry and bridge correction have inner suspension/identity effects requiring canonical-owner review. The current checkpoint does not exercise account switching inside those actors.
3. The observed STT transport failure's root cause is unknown. Capture allowlisted transport-cause metadata on the next authorized attempt; do not diagnose a bad API key or raise deadlines from the existing evidence.
4. Retention here covers authentication cancellation and failed first-page actions. Durable restoration of an unsubmitted onboarding form after force-kill is not proven or newly implemented.
5. The integrated main, updated-client physical speech/reply/formatted-page/rewrite/save journey, offline relaunch/exact restore and export opened outside THEM remain unproved. Legacy branding/other preserved original PR work is not represented as completed here.

## GitHub and next task

Fresh read: main remains `71c637d8`; original #979 remains draft at `2ea20422`, four current hosted checks green, `REVIEW_REQUIRED`. Human review is deferred. No original head/base was replaced, no main merge/force-push/protection bypass/deployment occurred.

Save the scoped T1480 history normally. Next: close the canonical post-bootstrap account-identity boundary with the existing stable captured-owner checks, then finish the next physical attempt only when the human resumes and authorizes its bounded live calls. Preserve existing device data and the isolated backend state.

## Hosted design-guard correction — 2026-11-15

VERIFIED original #1000 head6573263d completed hosted745 unit cases with **744 passed / 1 failed / 0 skipped**. The failure was `DesignSystemGuardTests.testNewSwiftFilesDoNotBypassDesignSystemTokens`: the extracted form copied seven raw system-font declarations from the allowlisted legacy Root into a new file. Writer/V1/recovery/voice/Mac downstream steps were skipped after that red; they did not pass. Backend2783/0/2 and D009 passed on that exact head.

The correction adds three exact missing declarations to canonical `IOThemTypography.UI` (30pt semibold default,17pt regular default,16pt regular default) and uses those plus existing callout/bodyStrong/caption tokens. The new view imports ScreenplayStudio and replaces deprecated text-color aliases and exactly matching spacing/radius literals with existing canonical tokens. It does not change font size, weight, design, color/opacity, dimensional values, controls, actions or routing. Howard supplied a read-only exact-token review; Jarvis implemented it. The guard and its allowlist remain unchanged.

Fresh signed focused proof on an erased owned iOS26.2 simulator, explicit Xcode26.3/17C529: **3 passed / 0 failed / 0 skipped**, all three existing DesignSystemGuard cases. All1,450 frozen source inputs and exact test identities were checked. A reverse token substitution restores the original view byte-for-byte; removing only the three additive token declarations restores the previous typography owner byte-for-byte. This establishes source-level style equivalence, not a pixel/Dynamic Type/physical-phone claim. D009 versus exact PR parent38fe and diff check pass; no protected file changed in this follow-up.

The previous31-case/UI1/Mac proofs are inherited from657 for their unchanged behavior; those workflows and the backend were not repeated locally. Fresh hosted integration gates are required on the new descendant. Old failed results/logs are preserved. Main/reviews/production and the unresolved API authority, STT and real-phone gaps remain unchanged.

## Authenticated recovery navigation correction — 2026-11-15

VERIFIED hosted original #1000 at9f14169a, run43723094867: signed units **745 passed / 0 failed / 0 skipped**; integrated writer **1/0/0**; V1 **33 passed / 0 failed / 9 skipped**; Node20.20.2 backend **2783/0/2**; D009 passed. The separate authenticated recovery phase executed **1 passed / 1 failed / 0 skipped**. Ordinary recovery failed before sign-in at the Home Account navigation guard; the stale-conflict case passed. Subsequent voice-fault/macOS steps were skipped. Fixture-dependent V1 skips are not substitute recovery proof.

The helper queried `app.scrollViews["home.surface"]`, although that identifier belongs to the outer Home ZStack. The actual horizontal navigation ScrollView had no own identifier. The retained xcresult activities show the missing ScrollView query; the error message conflated rail absence with Account absence. Persistent Home chrome exposed this container assumption; the source mismatch and failing selector are verified, while the exact SwiftUI accessibility-classification change is not independently established.

The two-line correction assigns `home.navigation` to the actual rail and targets it from the existing normal-login helper. It preserves outer `home.surface`, all42 UI test identities and every other byte of both source files. Swipes, full-frame visibility, hittability, login, Keychain persistence, forced refresh, exact writer text, version sets, one-save/idempotency, conflict choice and relaunch assertions are unchanged. No auth bypass, retry-for-green or assertion weakening was added. D009 versus exact parent38fe passes: Root now -17, all other protected files0; the inherited API -80 versus main remains separate.

Fresh focused proof: **2 passed / 0 failed / 0 skipped**, normal signing on erased task-owned iOS26.2 simulator, explicit Xcode26.3/17C529; local authenticated fixture Node24.19.0. The ordinary case used normal email sign-in and remembered Keychain session, with observed login200 -> save401 -> refresh200 -> successful version replay201. Aggregate201 counts also include fixture seeds and the separate conflict case. All1,450 source inputs, proof controls and3,303 copied dependency entries were unchanged; exact case identities and backendPID/nonce/auth boundary verified. The created module copy was moved intact to private proof storage after terminal exit0. Known external Node attempts0; no real provider/model calls. The official failed artifact's SHA-256 was checked before extraction; red results remain preserved.

No unchanged local full-unit/backend/writer/V1/Mac suites were repeated for this identifier-only correction. New descendant hosted gates remain required. Zora supplied read-only diagnosis; Einstein independently checked landing/protection state and canonical owner policy; Jarvis implemented and ran proof. Luna, Howard and Alfred were idle in this pass; no independent meeting or human approval is implied.

The next API fix must reuse the existing stable `ScreenplayStudioAuthContext` semantics: userID plus sessionIntentGeneration captured atomically with request identity. A successful same-owner refresh advances sessionEpoch, so epoch/token equality alone is unsuitable. Validate after bootstrap and response, build headers from the validated snapshot, and fence delayed notifications at delivery. This is a reviewed next action, **not implemented or proven here**. Physical-phone and production holds remain; current endpoint probe reports Render health200 but api.them.io/healthz302 to a parking redirect. No DNS, environment or deployment changes occurred. The phone still has38fe and its failed live story journey has not been retested.
