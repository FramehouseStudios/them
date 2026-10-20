# T-1019 — Replayed conversation commit delivery

## Problem and fix

VERIFIED by source inspection: OfflineTalkOutbox removed successful `/talk`
requests without feeding their response headers through the canonical
BackendMemoryAPI commit barrier. Existing History observers therefore missed
the authoritative refresh signal from this path.

The outbox now records those headers only after queue removal is durable.
Failed acknowledgement persistence retains the request without announcing a
completed turn. Other endpoints do not publish conversation commits. Missing
turn headers still produce no invented event. Raw replay text is not inserted
into an arbitrary open screenplay project.

The existing asynchronous notification helper moves to
`them/BackendNotificationDelivery.swift`; it remains the single delivery path.
Turn notifications queued before an account switch are dropped when the
sampled owner differs at delivery. The replay parser also checks the expected
owner before changing sync state. This is not proof of atomic isolation across
every asynchronous cache/history operation.

## Focused proof

VERIFIED: signed Debug test on erased task-owned iPhone 17 Pro simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2 (23C54):

- `OfflineTalkOutboxTests/testSuccessfulTalkReplayRefreshesConversationOnlyAfterDurableAcknowledgement`
- 1 passed, 0 failed, 0 skipped; runner exit 0.
- Synthetic transport response and filesystem failure, not a provider call.
- Wrong-owner response rejected; failed local ack leaves sync unchanged;
  explicit retry keeps original bytes/key; event observes an empty persisted
  queue and no injected raw user message; canonical sync records the turn.

Command: `IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=11CF5EFB-D8C3-4F19-8062-28AF37F27D93' ONLY_TESTING=themTests/OfflineTalkOutboxTests/testSuccessfulTalkReplayRefreshesConversationOnlyAfterDurableAcknowledgement ARTIFACT_DIR=/tmp/them-1019-replay-sync XCODEBUILD=/tmp/them-994-xcodebuild scripts/run_v1_ui_smoke.sh`

Bundle: `/tmp/them-1019-replay-sync/v1-ui-smoke-local-1-63339.xcresult`.
Log: `/tmp/them-1019-replay-sync.log`.
The first sandboxed summary read was denied permission to write Xcode's
TestReport cache; an authorized read of the same bundle confirmed 1/0/0.
No test rerun was needed.

VERIFIED: D009 against exact parent `562f01469b4d310b3036d8c0ad2b11db9df4b6f5`
via `GITHUB_BASE_REF=codex/T-1017-outbox-ack-durability node scripts/check_god_files.mjs`:
BackendMemoryAPI 10,716 to 10,700; all four other guarded files unchanged.
`git diff --check` passes.

## Limits and next step

No new broad backend/unit/UI suite, macOS build, paid calls or physical-phone
proof. Existing History consumers were inspected, not observed rendering this
recovery end to end. Foreground reply/audio and screenplay application remain
unproven; this change only reconnects authoritative history notification.
The existing short-lived server idempotency policy is unchanged.

GitHub #962 is a separate integration boundary: approved normal fast-forward
to `527c58d60f46d940da66484287a3fbbb51d56b8b` completed. Run `39357764973`
has green Backend tests and D009; Quality Gate was still running when checked.
No main merge, force push, original-head replacement or review bypass.
