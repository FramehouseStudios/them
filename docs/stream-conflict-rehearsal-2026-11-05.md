# Stream and conflict integration rehearsal — 2026-11-05

## Scope

Rehearsal source: `63940922661e9ddfc9d0f2874e94c098cd76981c` on `codex/T-1270-stream-conflict-integration`. This preserves the original #988 head and merges #987 through `3302f0a` without rewriting history. It is not main and is not a production release.

## Verified on this source tree

- Node 20.20.2 backend suite in a clean archive, container network disabled, with local environment files excluded: 3,042 passed, 0 failed, 5 skipped. Log: `/private/tmp/them-639-node20-proof.log`.
- Signed iPhone simulator unit bundle on an erased task-owned device: 1,481 passed, 0 failed, 0 skipped. Result: `/private/tmp/them-t1270-units-639.xcresult`.
- Signed authenticated local iPhone UI: project creation, save, export and relaunch, 1 passed; simulated provider. Result: `/tmp/them-home-voice-47046.xcresult`.
- Signed authenticated local iPhone UI: queued offline save, expired-auth recovery and stale-version conflict, 3 passed. Result: `/var/folders/27/kqhcss0n7t1dh_fj2wn98ynm0000gn/T/them-save-recovery-XqAs11/recovery-ios.xcresult`.
- Signed authenticated local iPhone UI: manual edit during an actual streamed synthetic page remains exact after late completion, save and relaunch, 1 passed. Result: `/tmp/them-home-voice-48490.xcresult`.
- Signed authenticated local iPhone UI: confirmed simulated voice handoff opens Studio, writes a page and restores it after relaunch, 1 passed. The fixture did not exercise microphone recognition or a live provider. Result: `/tmp/them-home-voice-49348.xcresult`.
- macOS scaffold build passed; god-file gate and diff check passed. Log: `/private/tmp/them-t1270-macos-639.log`.

## Holds and limits

The local model and speech providers are simulated. These runs do not prove real microphone input, model quality, export opening outside THEM, physical iPhone behavior, production configuration, or release readiness. #987 previously failed its hosted stale-version recovery check twice; the fixes and diagnostics are in its current branch, but the new hosted recovery result is still pending. #964 remains blocked on independent review. Do not merge ahead of failed or required checks, alter original PR history, or bypass branch protections.

## Receipt-protection integration

After preserve-merging #987's `afc6574` as integration commit `eed7b38`, the full signed iPhone simulator unit bundle passed **1,483 tests, 0 failures, 0 skips** on the erased task-owned simulator. Result: `/private/tmp/them-t1270-units-eed.xcresult`. This updates the unit evidence for that source tree; the other proofs above remain tied to `6394092` until rerun on the new source.
