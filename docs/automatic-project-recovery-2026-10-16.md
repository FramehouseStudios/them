# T-962 — One durable first-project creation path

Branch `codex/T-962-automatic-creation-recovery`, parent
`5f8efdba2cf8cc550b70f32803c867fd2fa7342b` (T-961 / #944).

## Root cause and fix

Root's automatic restored-page promotion still used a legacy POST followed by
an independent version write. Unlike the explicit Studio creation path it had
no persisted request identity, trimmed the screenplay, and only checked user ID
after awaiting, not the session-intent generation. A lost reply could leave a
server project without a recoverable identity on the phone.

Route automatic promotion through the existing Studio creation/outbox owner.
Retain the exact raw draft, title, project UUID and phase before transport. A
pending or unreadable creation record blocks another automatic request; the
existing named Studio Retry resumes the same identity. Phase is optional in the
record so manifests from T-961 still decode and use the old default.

The temporary worker does not subscribe to the draft debounce, attach as the
live editor, change global project pointers, announce saved versions, or load
the outline. Root adopts its confirmed project/version only if the captured
user and session generation still match and no project was selected meanwhile.
If the live draft changed during the request, persist those newer exact words
with the confirmed base before adopting the pointer. Do not claim all words are
saved when only the older seed was acknowledged. Setup failure does not claim
local durability when writing the intent itself may have failed.

## Evidence

- VERIFIED D009 versus T-961: Root 15023 -> 15004; backend/index33557,
  Studio17405, bridge12925, BackendMemoryAPI10836 unchanged.
- VERIFIED signed creation/seed units: **24 passed / 0 failed / 0 skipped**,
  erased task-owned iPhone 17 Pro, iOS26.2. Authoritative bundle:
  `/tmp/them-962-creation-focused.xcresult` (87.624s test duration).
- VERIFIED authenticated Home -> complete editor scene -> saved backend version
  -> relaunch: **1 passed / 0 failed / 0 skipped**,
  `/tmp/them-962-home-voice.xcresult`. Provider fixture recorded 0 ASR,
  2 chat and 23 TTS calls, all mocked; this is confirmed-transcript transport
  and app wiring, not live speech/model quality. That existing UI assertion
  trims outer whitespace; exact outer whitespace/Unicode/CRLF is independently
  asserted byte-for-byte in the creation units, not claimed from this UI test.
- VERIFIED macOS scaffold Debug build succeeded with the existing local
  ad-hoc signing configuration; log `them-962-macos.log` retained below.
  This is compile proof, not macOS UI or release-signing proof.

Commands: `ONLY_TESTING=themTests/ScreenplayProjectCreationTrustTests bash
scripts/run_ios_unit_tests.sh` with the seed-policy selector and explicit owned
simulator; `ONLY_TESTING=themUITests/V1SmokeUITests/test_confirmed_home_voice_turn_opens_studio_writes_and_restores
node backend/evals/run_home_voice_handoff_ui_smoke.mjs`. Neither disabled test
signing. Each existing runner erased only simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93` before execution.

Private retained artifacts:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-962-20261016.ry6a2q/`.

The added tests call the real client and creation/outbox code using an isolated
URLProtocol transport, not paid generation. They cover a lost reply, process
reconstruction, exact decomposed Unicode/CRLF/outer whitespace, same UUID and
phase on retry, one saved version, unchanged live pointers, stale-session
rejection before mutation/request, and old record decoding.

Adversarial pass: lost reply, duplicate automatic request and old manifest are
answered by the added tests; account/selection changes during awaits retain
the canonical creation guards exercised by the existing creation tests.
Root's final pointer-adoption guard and suppression of worker live subscriptions
are source-reviewed; the units also assert unchanged shared project/version
pointers. A real-phone streaming interruption while automatic promotion is in
flight is not covered by this checkpoint and remains a real-world proof item.

## Limits

No integrated-main, real microphone/model, shipping-backend or physical-phone
claim. No backend production source changed; the preceding full Node20 result
belongs to T-961, not a rerun on this tree. Original PR heads and unmerged
integration history are retained. The separate #766/#770 landing gate is not
cleared by these local tests.

## Files changed

`them/CrossDeviceSyncPolicy.swift`, `them/RootExperienceView.swift`,
`them/ScreenplayStudioRecovery.swift`, `them/ScreenplayStudioViewModel.swift`,
`themTests/ScreenplayProjectCreationTrustTests.swift`, `TASKS.md`, and this file.
