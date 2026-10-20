# T-1026 — Narrow recovery review, native sharing and the next red boundary

## Observed and fixed

VERIFIED on erased task-owned iPhone SE3 simulator
`E8998A6B-35B1-49E3-896C-861550849927`, iOS26.2, 375-point width:
the T-1025 review displays both complete fixture messages and its final scene
line. Its file-share action was a small blue text target against the bottom
edge. Make that label a themed minimum44-point action. Extract existing
conversation content from its scroll/navigation wrapper; the recovered review
now has one scroll view for context, messages and share actions, with its own
correct navigation title and identified Done/Delete controls.

Signed Debug build exit0 (`** BUILD SUCCEEDED **`):
`/tmp/them-994-xcodebuild -project them.xcodeproj -scheme them -configuration Debug -destination 'platform=iOS Simulator,id=E8998A6B-35B1-49E3-896C-861550849927' build`.
Log: `/tmp/them-1026-review-build.log`.
No new XCTest suite or paid model call for this layout edit.

## Actual manual journey and evidence limits

Seed only the fresh simulator's private storage with the synthetic fixture
under `/private/tmp/them-1026-ui.cjhwWv/`, plus repository `backend/test.wav`.
The app's test-only backend override points to unused localhost port63752;
there is no live provider/backend generation in this demonstration. No real
writer text, credentials, physical phone or human simulator was altered.

Using native UI controls: Data Controls → Review recovered reply → inspect full
transcript/scene → native file Share → Save to Files → On My iPhone → Files
Quick Look. The 80KB WAV opens outside THEM. Terminate the client, install the
updated signed build over it, relaunch preserving state, reopen the same result
and open the enlarged file Share action again. Complete text remains present.
No deletion or third-party transmission was performed. Native UI screenshots
were observed in this chat, not retained as screenshot files in the proof folder.

VERIFIED SHA256 of source and exported fixture:
`b9a50ffc9a1814b44c9cdfe3703bf88ee2c1cce646b5920e27b986144b95cc51`.
Export: simulator data `Containers/Shared/AppGroup/5D32FA21-DDF2-4DFD-B5AB-66308E584854/File Provider Storage/reply-0CBB617D-5149-4E73-A8E6-24179077F128.wav`,
outside THEM's private app container. This is not screenplay-file export proof.

Temporarily selected maximum accessibility text size in this owned simulator:
body text wraps by words. Full scroll-to-footer gesture verification was not
obtained through automation; do not count that as a pass. Restored original
`large` content size. Standard-size review/share and Done were observed.
Delete confirmation/final deletion and native text sharing were not exercised.

VERIFIED: D009 vs `f7ba3c40`, all five guarded files unchanged;
`git diff --check` passes. Build log/fixture saved under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1026-20261019.7PapK3/`.

## Integration stopped at actual failure

Original #962 remains `527c58d6`. Hosted run39357764973 is terminal failure:
backend and D009 pass; signed units, writer loop and V1 UI steps passed;
offline-save recovery is4 passed/1 failed/0 skipped. Voice-fault/macOS stages
were not reached, not passed.

Actual failure: `test_screenplay_save_outbox_survives_relaunch_and_reconnects_once`,
exact-one recovered server version assertion at V1SmokeUITests.swift:2184.
Two marker-bearing versions are shown: manual `version_8bcd949793894644` and
autosave `version_3953afa90568487b`, with different request IDs. Their printed
drafts appear identical, but byte identity/root cause need structured evidence.
Do not weaken the assertion or call this a harmless flake.

Full downloaded failure artifact:
`/private/tmp/them-962-39357764973.t2dWiq/` (artifact12237792891,
210184338 bytes); download handle38598 finished exit0. Log:
`/tmp/them-962-39357764973-failed.log`.
No rerun, original-head change, next-stack advance or main merge.
