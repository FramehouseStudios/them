# Cleared-page save rehearsal — 2026-11-04

This isolated preserving merge combines integration parent `2215407` and original PR #985 head `e8e8778561629f2649753a61a222a8adb3a888e9`. It is a sibling rehearsal; it does not merge #983 or #984, change their PRs, or merge to main.

The conflict resolution retains exact-byte manual-edit tracking, the existing conflict-decision guard and previously admitted save ownership, while preserving #985's explicit, server-guarded empty-draft save and its tests. Original histories remain as parents.

- Node 20.20.2 full backend suite in an isolated offline copy: 3,038 passed, 0 failed, 5 skipped; `/private/tmp/them-t1264-backend-full-20261104.log`.
- Signed full iPhone simulator `themTests` on an erased task-owned device: 1,454 passed, 0 failed, 0 skipped; `/private/tmp/them-t1264-full-20261104.xcresult`.
- Signed focused recovery, outbox, identity and receipt checks: 372 passed, 0 failed; `/private/tmp/them-t1264-focused-20261104.xcresult`.
- Signed authenticated local fixture: intentionally cleared page saved and restored after relaunch; `/private/tmp/them-t1264-clear-ui-20261104.log`.
- Signed local fixture: conflicted save restored the decision after relaunch and resolved; `/private/tmp/them-t1264-conflict-ui-20261104.log`.
- macOS scaffold unsigned build, D009 god-file gate, and staged `git diff --check`: passed.

These are local and synthetic proofs. They do not establish live-provider, production, physical-device, or outside-app export behavior. Original #983's hosted checks and the independent review and integration ordering still apply.
