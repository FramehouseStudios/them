# T1180 — Queued Talk callbacks must respect Stop

## Contract

Base `e7c3901dc9d65e507eed54bb08c309d0e337e6cf` (published T1179).
Branch `codex/T-1180-stale-talk-delivery`, owned worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-interrupted-talk-recovery`.
Jarvis owns edits and proof; Zora provided bounded read-only source reviews.
Preserve original/main/production heads, accepted-response custody and the
existing StudioActionDispatcher response-forwarding contract. No paid calls.

DECIDED: reuse existing turn/submission identity for request callbacks and
existing playback identity for audio completion. Do not introduce a new task
manager, framework, product state or an exact-draft comparison that rejects
ordinary streamed insertion. Account/project ownership requires separate work
and is not claimed fixed here.

## Reproduced cause and correction

VERIFIED: Root's metadata, first-audio and text callbacks created unguarded
MainActor Tasks. Cancelling the origin request could not retract a callback
already queued by BackendClient. The original dispatcher predicate protected
actions but did not gate these later consumer Tasks.

The scheduling capability now belongs to existing StudioActionDispatcher's
`enqueueTalkDelivery`. It checks its own task cancellation and the originating
turn's current predicate at execution. Root captures its existing submission /
fingerprint / submission-time predicate once and passes it to action dispatch
and each of the three request callbacks. Removed the constant-true early
playback toggle and its dead guard. Metadata forwarding still occurs; stale
Root presentation work is rejected at the consumer boundary.

Playback has a longer lifetime than the HTTP request. Stop clears the existing
`activeTurnBasedLatencyTurnID` before cancelling audio. Both local playback
finish/remainder handlers reject a different or missing owner before touching
the clock, page completion, remainder audio or microphone. The redundant
conditional clear inside the already-guarded finish handler was simplified.
No new product state was added and Root's line count is unchanged.

## Evidence ledger

All native runs sign normally and erase only owned simulator
`91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A` (iPhone 17 Pro / iOS 26.2, 23C54).
Working artifacts: `/private/tmp/them-1180-proof/`.

- Characterization before gating retained the original unguarded Task
  semantics through the canonical seam: **1 pass / 3 failures / 0 skips**,
  `deferred-red.xcresult`. Actual deferred execution admitted stopped
  metadata/audio/text, old-turn audio, and a cancelled delivery Task. Current
  causal delivery control passed. No provider was used.
- Final signed units: **913 / 0 / 0**, `units-fixed.xcresult`. The full checkpoint
  includes all four regression cases and existing action-forwarding tests.
  One read-only summary permission review timed out; its single allowed retry
  succeeded. The completed unit tests were not rerun.
- Essential authenticated Stop UI: **1 / 0 / 0**, `stop-fixed.xcresult`.
  Actual cancellation HTTP200/cancelledtrue/dropped1/byReservationtrue;
  baseline empty, capture off and no late insert/rearm. Intercepted
  STT1/chat2/TTS23; no microphone/model-quality claim.
  Selected post-Stop DEBUG trace remains status `running` with interruption
  `cancel` and no playback-finished timestamp. This is a stale diagnostic
  snapshot, not evidence that the UI remained active: current UI assertions
  and authenticated server cancellation passed. Explicit cancellation trace
  finalization still needs correction; do not report the trace as success.
- Normal raw Home/save/relaunch UI: **1 / 0 / 0**, `raw-fixed.xcresult`.
  Complete synthetic scene, one project, a matching saved version and exact
  restored page. This does not assert exactly one saved version. Intercepted
  STT1/chat2/TTS23. Selected persisted observation confirms this run's playback
  started21:50:12Z, finished21:50:17Z, phase `completed`, status `ok`, no
  interruption. Normal completion after request delivery remains connected.
- macOS shared-source scaffold build: **exit 0**, `macos-fixed.log`.
- D009 passed against fetched exact published T1179; all five monitored
  files unchanged, including Root14931. No growth exemption used.
- `git diff --check` passed. Backend unchanged; T1178 Node20 full
  **2996 / 0 / 5** is inherited, not rerun. T1179 backend source is identical.

Native runner: `scripts/run_v1_ui_smoke.sh -quiet`, explicit owned destination,
owned `/private/tmp/them-1169.i0WAHZ/xcodebuild-owned` wrapper, unique result
bundles, `ONLY_TESTING=themTests/StudioTalkDeferredDeliveryTests` (red) or
`themTests` (final checkpoint). No `CODE_SIGNING_ALLOWED=NO` test invocation.

## Adversarial review / limits

Zora found no concrete regression in the final bounded source diff. Her review
confirmed that both successful audio entry paths assign the existing playback
ID before later driver completion Tasks run, and that waiting for the remainder
keeps the ID alive. Applying the request's submission predicate to playback
finishes would incorrectly reject normal audio after HTTP completion; this fix
does not do that. This is source review, not another test or human PR approval.

- Native helper regressions deterministically invalidate the lease before
  queued execution, and reject an explicitly cancelled helper Task.
- Independent Swift Tasks have no new global FIFO guarantee. The current-turn
  test checks causal ordering; it does not assume independent enqueue order.
- Root playback integration requires the final native UI checks. The four
  helper cases alone do not prove the Root consumer or physical microphone;
  final signed UI/recorded completion results above cover the local integration.
- **Next root bug:** account/session and project changes do not necessarily
  invalidate the submission predicate. Existing action document checks do not
  cover all metadata, audio and final-result publication. Audit and fence the
  actual live response owner without breaking intentional new-project handoff,
  refresh or accepted-response recovery. Do not claim project isolation from
  this Stop/new-turn fix.
- Source also has unconditional old-request cleanup of submission state;
  determine whether an old cancelled request can clear a replacement turn.
  That interleaving has not been reproduced here. Explicit Stop diagnostic
  finalization is unfinished, as the selected persisted observation records.
- Pre-header server ASR abort, cross-host cancellation, response-expiry custody
  and legacy/unkeyed delivery remain separate unfinished boundaries.
- Production stays held. A complete physical-iPhone journey against a named
  shipping backend, microphone input and live Clementine quality remain unproven.

## Files and continuation

```text
TASKS.md
docs/stale-talk-delivery-2026-10-27.md
them/RootExperienceView.swift
them/StudioActions.swift
themTests/StudioTalkDeferredDeliveryTests.swift
```

No original PR advance, main merge, replacement PR or agent approval. Human
independent review remains pending under the existing review-later instruction.
Fresh October27 review read: #964 has only a DISMISSED review; #638 has none.
Preserve a normal scoped backup only after the final evidence is read.

READY FOR CONTINUE. All proof jobs are terminal and the task-created dependency
link is removed. Full product goal remains active and incomplete.

## Preserved runtime proof

Runtime commit: `b986b53bf9c740dc3307b06c937c223ece4e8dca`.
Permanent local copy:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1180-20261027.nwkl1p9i`.
**4,368 hashed files / zero mismatches** include the four native result
bundles, logs, selected synthetic playback observations and five source files.
`SHA256SUMS` SHA-256:
`7bb711dea1cbb0750f3154d91ba01ac141bed4f840ad56bcb92b0f87ed8d3f36`.
Final documentation/publication receipt is supplementary to this fixed runtime
manifest. Publish only `codex/T-1180-stale-talk-delivery` normally; untouched
original PR checks and integrated main are not proven by this backup.

Zora's next-owner source audit identifies the existing auth-context policy
(user plus login-intent generation, including anonymous contexts) and origin
document ID/initial-project receipt as reusable seams. Empty unbound documents
currently lose their origin ID when empty persistence clears it; project ID
equality alone cannot fence two different empty documents. The next fix must
retain accepted replies under their initiating owner/document while preventing
stale publication; merely dropping them or queueing regeneration is incomplete.
Those races have not been reproduced in this task. Start with a suspended
response / project switch and an old-completion / replacement-turn control.
