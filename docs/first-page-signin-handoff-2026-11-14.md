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

Save the scoped T1480 history normally. Next: close the canonical post-bootstrap account-identity boundary with captured owner/epoch checks, then finish the next physical attempt only when the human resumes and authorizes its bounded live calls. Preserve existing device data and the isolated backend state.
