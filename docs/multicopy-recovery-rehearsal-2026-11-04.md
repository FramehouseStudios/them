# Multiple-copy recovery rehearsal — 2026-11-04

This preserving merge combines `8c2d87b` with original #986 head `6453169ea9b80fb363e253b386c7a4cf3c964f1e`. It retains the newer durable persistence and exact-copy recovery guards, all original multiple-copy UI and ambiguity tests, and #986's monotonic test-server deadline. Identical recovery methods that Git auto-merged twice were reconciled to the existing durable implementation. Neither original PR nor main is modified by this rehearsal.

- Signed full iPhone `themTests`, erased task-owned simulator: 1,461 passed, 0 failed, 0 skipped; `/private/tmp/them-t1267-full-20261104.xcresult`.
- Signed focused recovery/outbox tests: 307 passed, 0 failed; `/private/tmp/them-t1267-focused-20261104.xcresult`.
- Signed multiple-copy recovery UI tests, local synthetic fixtures: 2 passed, 0 failed, 0 skipped; `/private/tmp/them-t1267-recovery-ui-20261104/v1-ui-smoke-local-1-40669.xcresult`.
- Offline Node 20.20.2 full backend: 3,042 passed, 0 failed, 5 skipped; `/private/tmp/them-t1267-backend-full-20261104.log`.
- macOS scaffold unsigned build, D009 and staged `git diff --check`: passed.

This does not prove physical-iPhone, live-model, production or outside-app export behavior. Original PR sequencing, hosted checks and independent review remain required.

Additional local evidence on the same source tree:

- Synthetic raw-audio Home handoff into a saved and restored screenplay: 1 passed, 0 failed, 0 skipped; `/private/tmp/them-t1267-raw-audio-20261104.xcresult`.
- Synthetic retained talk replacement, save and relaunch: 1 passed, 0 failed, 0 skipped; `/private/tmp/them-t1267-replacement-20261104.xcresult`.

Both intercepted the provider and do not establish real microphone capture, response quality, real speech playback or physical-device behavior. No paid calls were made.
