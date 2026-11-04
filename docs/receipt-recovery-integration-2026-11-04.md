# Receipt and conflict-recovery integration — 2026-11-04

The in-progress preserving merge combines local parent `27852bc` with original PR #982 head `94b9d0adda8117fa1dce68bf77d9026b738db0de`. It is a local integration, not a merge into main. At this checkpoint #982 is open and draft, and its three hosted checks report success.

During relaunch, `@Published` project setters fired while `ScreenplayLiveDraftBridge` was still restoring owner-scoped state. Their observers wrote a new origin over the saved document identity before it was read. Initialization now suppresses persistence while account state is restored, then persists the fully restored context. This retains the document and account identity checks used for conflict resolution.

Evidence for the integrated working tree:

- Node 20.20.2 backend suite in an isolated local proof copy: 3,035 passed, 0 failed, 5 skipped; log `/private/tmp/them-t1261-backend-proof-r2-20261103.log`. Backend source files matched the integration tree after that run; excluded environment files and test-generated data were not compared.
- Signed iPhone simulator `themTests`, erased task-owned simulator: 1,448 passed, 0 failed, 0 skipped; `/private/tmp/them-t1261-full-startup-fix-20261104.xcresult`.
- Signed focused origin and outbox checks: 180 passed, 0 failed; `/private/tmp/them-t1261-origin-save-fix-20261104.xcresult`.
- Signed conflict/relaunch/keep-mine workflow against the local fault fixture: passed; `/private/tmp/them-t1261-conflict-ui-startup-fix-20261104.log`.
- Signed writer create/save/export/restore workflow against the local authenticated backend and synthetic provider: passed; `/private/tmp/them-t1261-writer-startup-fix-20261104.log`.
- macOS scaffold build: passed without signing; `/private/tmp/them-t1261-macos-startup-fix-20261104.log`. This is not a signed macOS release build.
- God-file D009 gate against `origin/main` and `git diff --cached --check`: passed.

Not covered: live model behavior, production deployment, physical iPhone speech or export outside THEM. The writer workflow uses synthetic responses and does not establish real-provider behavior. Independent human review and applicable hosted checks remain required for any main-branch merge.
