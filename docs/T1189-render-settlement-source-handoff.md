# T1189 — render settlement and original native context

## Scope and status

- Base: `abeed0d69543a77b68204f7c2dda6d6958c2a0e8`.
- Branch/worktree: `codex/T-1189-render-settlement`, `/Users/halfmutantfilms/io.them-worktrees/codex-render-settlement`.
- Source-only helper lane. No network, provider, simulator, native build, push, PR, merge, or production action performed.
- VERIFIED source gap: normal JSON/SSE render results retained their accepted record, but did not return the original custody context needed by the existing native v4 mutation/save path. Existing automatic settlement expected voice playback evidence.

## Changes and integration contract

- `BackendRealtimeStudioRenderResult.delivery` is additive and defaults to `nil`; returned successful JSON/SSE results populate it after complete retained output and existing quality validation. Lookup failure remains an accepted, nonretryable result with custody retained.
- `BackendStudioRenderDeliveryReceipt` exposes `receipt`, `request`, and `writesToPage`. `await delivery.confirmPublishedPin()` is only for the owning UI after publishing a nonpage pin. The outbox rechecks current owner/backend, the original admission digest, actual stored JSON target, receipt ID, and completeness. A page cannot be relabeled as a pin.
- A render page retires through the canonical save path only with the original v4 native mutation and exact saved-page proof. No audio playback marker is created or required. Incomplete, rejected, or unsaved page custody remains held. Existing voice playback behavior remains unchanged.
- JSON `screenplay_project_id` now binds native preparation to the initiating request when nonempty. Original owner/backend/document and confirmed-save validation still apply; an ID alone grants no authority.
- `ingestVoiceTurn`, `commitStreamingVoiceTurn`, and `streamInsert` accept optional `livePageContext`, defaulting to `nil`. Context-bearing requests reach the existing native mutation gate with `requiresLivePageContext: true`. Atomic insertion avoids generating a different v4 intent for each legacy animated text prefix; SSE preview/final commit remains available. Legacy nil-context animation remains unchanged. Context deduplication includes the original admission ID.
- `saveInlineAppliedMemoryCorrection(_:isCurrent:)` rejects a stale lease before the API call and after its await, before reading/updating the latest applied memory. The late guard also requires the original memory, document, owner, and backend.
- Shared incoming-turn normalization moved into `ScreenplayIncomingVoiceTurn.swift`; Bridge shrank from 12,774 to 12,772 lines without changing the god-file limit.

Jarvis must forward `result.delivery.request` in the original verified document context through Root preview/commit and call explicit pin confirmation only after owned UI publication. Parent owns Root and BackendMemoryAPI; this lane did not modify either.

## Verification and limits

- VERIFIED: `git diff --check` passed.
- VERIFIED: `node scripts/check_god_files.mjs` passed versus the current local `origin/main` ref. Exact base comparison also passed: Bridge -2; all other four god files unchanged.
- Added ten render settlement/project-parser tests, four actual Bridge context/correction-lease tests, and delivery assertions to the existing JSON and SSE client fixtures. These cover exact save versus wrong bytes/project/document, initial promotion provenance, early-save/reopen ordering, page-to-pin bypass, explicit pin publication, owner/backend/receipt mismatch, incomplete/rejected custody, and stale document publication.
- Native compilation and test execution: UNRUN by this source-only lane. No passing Swift test count is claimed. The parent must compile and run these tests on the combined tree, then exercise real native save and UI publication paths.
- Live microphone, provider output, integrated main, production, and physical-phone behavior: NOT VERIFIED here.

## Next action

Preserve this local commit when integrating into the parent tree. Connect the Root lease/context seam, compile, run the focused Swift fixtures and required integrated checkpoints, and fix the first actual failure. Keep this helper frozen after handoff.
