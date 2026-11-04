# T1181 — Only the owning voice request can clear shared request state

## Contract and baseline

Base: published `1fbdd4336360768b9ff2a92af09c0cebbac61ba9`.
Branch: `codex/T-1181-owning-talk-cleanup`, worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-interrupted-talk-recovery`.
Jarvis owns edits/native resources; Zora supplied read-only ownership/custody
audit. No paid calls, production changes, original PR advance or main merge.

This fixes a prerequisite in the wider live-response ownership repair, not the
whole response custody/publication boundary. Account/project switches and
mixed voice/typed ownership remain explicit next work; the full goal stays
active and incomplete.

## Cause and intended correction

VERIFIED from source: `sendUtterance` unconditionally clears the shared
`inFlightTalkTask`, submitting flag and bridge lifecycle callback in `defer`.
An old cancelled or suspended voice request can therefore clear the state of a
replacement voice request that has already claimed its fingerprint/time.

Reuse that existing logical identity through one local `ownsTalkRequest`
predicate. Shared finalization belongs in existing StudioActionDispatcher's
`finishTalkRequest`; local debug-task cancellation stays unconditional.
Duplicate rejection has not suspended or claimed a new timestamp, so it keeps
its synchronous early-return cleanup. A cancelled operation is rejected before
any request-state setup. Group the three admission assignments together.

Fingerprint construction remains byte-equivalent: original WAV bytes followed
by the trimmed override's UTF-8 bytes; appending empty UTF-8 adds no bytes.
Accepted-fingerprint duplicate-window semantics remain anchored to admission.
No new product state or framework is introduced. Root is one line smaller.

## Evidence ledger

Working artifacts: `/private/tmp/them-1181-proof/`.
Owned signed native simulator: `91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`,
iPhone17Pro, iOS26.2 (23C54), erased before every proof run.

- Suspended-completion characterization: **2 pass / 2 failures / 0 skips**,
  `cleanup-red.xcresult`. Suspended and cancelled old completion both detached
  the replacement task marker, submitting flag and lifecycle callback.
  Current-owner and synchronous duplicate-return controls passed.
  Uses the real finalization seam, holding an old Task until replacement state
  is installed, with current-owner and pre-admission controls.
- Final signed units: **917 / 0 / 0**, `units-fixed.xcresult`, including all
  four cleanup regressions and existing action/deferred-delivery cases.
  macOS scaffold build **exit0**, `macos-fixed.log`.
- Authenticated Stop UI **1 / 0 / 0**, `stop-fixed.xcresult`: actual
  HTTP200/cancelledtrue/dropped1/byReservationtrue, empty baseline restored,
  capture off, no late insert/rearm. Intercepted STT1/chat2/TTS23, no paid calls.
- Ordinary raw Home/full-page/save/exact-relaunch UI **1 / 0 / 0**,
  `raw-fixed.xcresult`: complete synthetic scene, one project, matching saved
  version and exact restored text. This does not claim exactly one saved
  version. Intercepted STT1/chat2/TTS23, not physical microphone/model proof.
- D009 passed against fetched exact T1180; Root14931→14930, all other monitored
  files unchanged. The first intermediate check found Root+1; grouping the
  related admission writes into one tuple assignment retained all three
  state updates. No growth exemption or guard removal used.
- `git diff --check` passed. Backend remains unchanged. Full Node20
  **2996 / 0 / 5** is inherited T1178 proof, not a new run.

## Wider ownership/custody work — not fixed here

Zora's read-only audit found that final live responses publish after awaits
without rechecking initiating account/document ownership. A guard that merely
drops accepted work is insufficient. Canonical existing outbox mechanisms can
retain exact responses, but ordinary `enqueue` creates automatically-sendable
pending work and cannot serve as live acceptance admission.

The next contract must include trusted owner/origin/request capture, parked
never-auto-send live admission, atomic received-response write before owner or
publication checks, retained metadata, and actual delivery settlement. Avoid
current-user authorization on an old owner's metadata lookup. Reuse received
blob reconciliation after index failure. Full body-write failure cannot promise
crash-durable exact response bytes; retain parked request evidence and surface
the limitation without regeneration. Audio over the existing32MiB cap is omitted
and must never be called fully retained. Repeated completion must preserve
existing page-delivery/metadata evidence rather than overwrite it.

Root's voice fingerprint/time does not itself identify a replacement typed
submission or a new account/document. Those paths require the broader owner
contract, not a claim that this voice-finalization fix covers every interaction.
Empty/unbound document identity and stale Stop DEBUG status also remain open.
Physical-phone/shipping-backend journey and live model quality are unproven.

Zora found no concrete regression in this bounded source diff: the byte
construction and duplicate window are preserved; current callers guard
admission, and no suspension occurs before the duplicate decision/claim.
Already-cancelled entry does not claim shared state. This is source review;
the four native cases exercise the actual finalization seam, not a full Root
account/project race. Stale catch/result mutations remain outside this fix.

## Exact files

```text
TASKS.md
docs/talk-request-cleanup-2026-10-27.md
them/RootExperienceView.swift
them/StudioActions.swift
themTests/StudioTalkRequestCleanupTests.swift
```

Keep original/main/production held. Publish only a scoped normal backup after
proof. A source review is not a human approval or runtime reproduction.

All proof jobs are terminal; task-created dependency link removed. GitHub
review read still shows only a DISMISSED review on #964 and none on #638.
The human chose to review later; no approval was requested or submitted by an
agent. READY FOR CONTINUE; full product goal remains active and incomplete.

## Preserved runtime receipt

Runtime commit: `0ce5a30f494c3ff11d0b28d8c163a38dd27ff5fa`.
Permanent local proof:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1181-20261027.djihoy6m`.
**4,386 hashed files / zero mismatches** cover four native result bundles,
logs and five source files. `SHA256SUMS` SHA-256:
`d2c5557cf380f3abf280bbc697ad5d803f50f162ed559dfade126919436ba9b1`.
Final documentation/publication receipt supplements this fixed runtime proof.
Normal backup target is `codex/T-1181-owning-talk-cleanup`; original PR checks
and integrated main are not established by that publication.
