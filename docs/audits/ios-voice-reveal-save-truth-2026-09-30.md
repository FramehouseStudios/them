# iOS synchronized voice-reveal save boundary — 2026-09-30

## Finding

The iOS text-view coordinator streams `voiceRevealPrepare` and
`voiceRevealUpdate` through the insertion-progress path. It updates the bound
screenplay text as the spoken reply is revealed. The Studio's existing
`isStreamingDraftPreviewActive` gate was only driven by text previews, so the
debounced draft handler could treat a partial prefix as a normal save. The
authoritative committed-write event already provides the correct full-page save
boundary.

## Change

- Reused the active synchronized-insert plan to drive the existing Studio
  streaming gate, without adding another parallel lifecycle flag.
- The state begins before the first visible reveal and ends when the reveal
  completes or is cancelled. Only the editor's full committed-write event
  initiates the existing server save.
- While the gate is active, debounce persists the exact non-empty text to the
  selected project's local recovery store; the bridge-text observer also
  snapshots the reveal as soon as it is published. Both paths return without
  creating a server version.
- The existing committed-write path remains the primary full-page save; if its
  UI callback is delayed, the regular debounce can only see the full finalized
  text, never a reveal prefix.

## Verification

- Focused signed iPhone Simulator test:
  `ScreenplayStudioDraftRecoveryTests/testSyncedVoiceRevealBlocksAutosaveAndKeepsAProjectScopedRecoveryCopy` — 1 passed, 0 failed, iPhone 17 Pro / iOS 26.2, erased before the run.
- Full signed unit suite on an erased iPhone 17 Pro / iOS 26.2: 619 passed,
  0 failed, 0 skipped.
- Deterministic voice-to-page UI smoke: 1 passed, 0 failed.
- Authenticated local-backend iPhone writer-loop smoke: passed its harness
  assertion for one test; the run created a project, saved, exported, and
  restored after relaunch (`studio-ios-writer-loop-contract-smoke: ok`).
- Backend suite: 2,739 passed, 0 failed, 2 skipped.
- God-file gate and `git diff --check` pass; each of the five protected files
  has zero line-count delta vs `origin/main`.
- Physical-device voice-to-save flow and crash/interruption recovery UI remain
  unverified.

## Boundary

This creates a local, project-scoped recovery snapshot during the reveal. It
does not survive uninstall and is not cross-device durable. Those guarantees
require the pending server-side Page request recovery/receipt decision and
implementation; this change does not claim otherwise. A local snapshot is only
made recoverable if the existing launch recovery flow surfaces it.
