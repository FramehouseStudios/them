# Single Send rehearsal — 2026-11-04

This preserving merge combines recovery rehearsal `9a472a2` with Howard's original branch `17030b8410585bf7b6a73e863f64007faa0a58c5`. It keeps the two original owner-scoped evaluation-helper commits beneath Howard's Send change. The UI-test merge retains the existing typing and keyboard checks and Howard's single-Send test. It does not merge any PR into main.

Proof on the combined tree:

- Signed iPhone single-Send UI check on an erased task-owned simulator: 1 passed, 0 failed, 0 skipped; `/private/tmp/them-t1266-send-ui-20261104/v1-ui-smoke-local-1-36541.xcresult`.
- Signed full iPhone `themTests`: 1,456 passed, 0 failed, 0 skipped; `/private/tmp/them-t1266-full-20261104.xcresult`.
- Offline Node 20.20.2 full backend suite: 3,041 passed, 0 failed, 5 skipped; `/private/tmp/them-t1266-backend-full-20261104.log`.
- macOS scaffold unsigned build, D009 and `git diff --cached --check`: passed.

This is local rehearsal evidence; it does not prove production, live-model or physical-iPhone behavior. Original PR ordering, hosted gates and independent review remain required.
