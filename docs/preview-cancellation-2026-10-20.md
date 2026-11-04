# T-1095 — preview cleanup and explicit Stop ownership

Branch `codex/T-1095-preview-cancel-ownership`, parent `f9235d54`.
Target: inactive preview cleanup leaves ordinary Page work alone; active preview
cancel restores its native baseline; explicit Stop/barge-in still interrupt.
Original heads, orb/Clementine, protected landing and production hold remain.

## Root failures and fixes

VERIFIED real bridge red: **0 passed / 1 failed / 0 skipped**.
`cancelStreamingVoiceTurnPreview` cancelled before checking preview activity,
replacing an unrelated page stream with cancellation. Moved the existing guard
before that operation. No new state, framework, schema or cancellation policy.
`/tmp/them-1095-preview-red.7ARBf0/v1-ui-smoke-local-1-99800.xcresult`.

The caller audit then found iPhone Studio Stop used a separate
`stopStudioTalkFlow`, not the existing full-stop owner. In standard voice mode,
the duplicate stopped playback and explicitly resumed microphone capture.
Actual signed simulator-button characterization **FAILED 0/1/0**:
`Stop resumed microphone capture instead of ending the session`.
`/tmp/them-1095-stop-red.TeppyK/stop-red.xcresult`.

Studio Stop now calls the same `stopCurrentInteraction` owner as Escape, with
explicit existing `cancelStream(reason: .cancel)` before preview cleanup.
Deleted the duplicate handler. Stop intentionally ends capture, narration and
Page work; restarting requires the existing Start/Talk action. This changes
the legacy resume behavior to match Stop, not a new microphone/provider path.

## Current proof and limits

- Signed focused **14/0/0**, actual summary read: four real-bridge/native-editor
  cancellation tests plus ten existing editor-binding checks. Inactive cleanup
  leaves a normal stream through its complete final request; queued final
  identity/text survive; active preview cancel restores exact UITextView and
  binding baseline; explicit cancel/barge-in preserve baseline and emit no
  late chunk. Erased task-owned Pro `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`,
  iOS26.2, signing on. This precedes final Stop-handler consolidation; the
  tested bridge/policy were unchanged by that caller-only follow-through.
  `/tmp/them-1095-preview-fixed.2YkQMW/v1-ui-smoke-local-1-584.xcresult`.
- Existing longer-audio Home writing workflow after the guard fix **1/0/0**:
  complete native scene, one marker, independently found authenticated saved
  version, full editor equality after relaunch (outer whitespace trimmed).
  `/tmp/them-1095-home-ui.9FvS3T/home-ui.xcresult`. Before final Stop consolidation;
  the no-Stop path was not rerun unchanged merely to increase counts.
- Final unchanged, formerly failing visible Studio Stop workflow **1/0/0**.
  `/tmp/them-1095-stop-fixed.MTRH43/stop-fixed.xcresult`: starts Home, synthetic
  raw audio reaches real authenticated local HTTP, first Page marker appears,
  tap actual `studio.compact.talk`, require Start label and empty pre-insert
  baseline, then ensure no late text or rearming. Same assertions/timeouts.
  STT1/chat2/TTS1 are synthetic counters, not live quality/cost measurements.
- Final shared-owner macOS scaffold build passes:
  `/tmp/them-1095-final-macos.5xQCvb/scaffold.log`. Build-only signing disabled;
  no iOS test disables signing. Earlier scaffold pass retained separately.
- D009 versus main `78b8c94f`: index33,557(-69), Studio17,421(-14),
  Root15,000(-112), bridge12,934(-18), memory10,865(0). Root shrank24 lines
  versus this task's parent; other god files unchanged. No line padding.
- Syntax/diff pass. No production Node handler changed. No paid provider,
  unchanged full backend/full unit rerun or new hosted-green claim. Existing
  actor/Sendable warnings remain. The CLI fixture only adds the named Stop
  selector; its default two Home cases and strict counts remain unchanged.

Both red runs are retained, not converted to green via assertion relaxation.
The local fixture uses frozen public backend source, no private environment,
synthetic ASR/chat/TTS and blocked external fetches. It is not real microphone
recognition, live reply quality, physical-iPhone proof or a shipping backend.

Not covered: physical audio, Stop before the first remote-render chunk,
populated-project Stop UI, paid cancellation/refund, in-flight account/project
changes, broader offline/conflict recovery and full integrated-main gates.
Original independent review and production-credentials hold still apply.

Next: T-1094 active-Studio refusal routing, then original #642 after refreshing
its actual head/body/follow-ups. #807 remains the canonical later shared STT
integration; do not create another transcription endpoint here.
