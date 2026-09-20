# Clementine audit — in progress, 2026-09-19

Base: main `647e01fc`. Owner: Codex.

## Verified graph, not a completion claim

There are 90 top-level JavaScript files in `backend/lib/clementine`, including
its barrel `index.js` (89 excluding that barrel). Following static imports,
re-exports, literal dynamic imports and literal requires from `backend/index.js`
finds 37 reachable files and 53 unreachable files. No computed imports were
encountered in the reachable graph. Test/eval imports and disconnected cycles
do not count as production reachability. Reachability alone does not prove that
an exported function executes or that its feature is correctly wired.

Reproduce: `cd backend && node tools/check_clementine_imports.mjs`.
This strict audit currently exits 1. No allowlist masks the existing debt.
Scanner tests pass 3/3, including disconnected-cycle and computed-import cases.

The proposed per-file disposition is in [clementine-module-disposition.md](clementine-module-disposition.md):
37 keep, 8 wire/replace, 45 delete/replace (including the unused barrel).
These are recommendations, not completed cleanup. Before each removal, review
repository-wide consumers and update tests against the canonical replacement.
First cleanup: removed export_share.js and its four fabricated-link assertions;
repository-wide search found only three test consumers, no production callers.
Existing FDX serializer/HTTP-route and export-format tests remain the canonical
proof. Unrelated collaboration, commentary and Swift-file assertions remain.
This removes fake PDF/share availability, not an actual working export feature.
The deleted files remain recoverable from Git history.
The real repository guard is included in the normal backend test glob and now
fails on 52 remaining orphans (89 files remain, 37 reachable).
Focused result: 3 scanner tests pass, 1 repository guard fails as expected.
After cleanup, canonical export/retained-consumer/scanner checks: 45 pass.
Full backend on Node 24: 2,737 pass, 2 fail, 2 skip (2,741 total).
Failures: expected orphan guard and realtime_turn_commit_route memory-read-error
test, fetch UND_ERR_SOCKET. The realtime suite passes in isolation; this does
not erase the full-run failure or prove its root cause. Evidence:
/tmp/them-module-cleanup-backend.log and
/tmp/them-module-cleanup-turn-commit-isolated.log.
Live quality evaluation and iOS tests have not been rerun for this branch;
prior port results are not claimed as proof of this branch.

## Accepted execution order

When hosted checks are green: #620 → #621 → #622 → #623 → #624 → #625 → #626 → #597.
Rebase and re-prove each after its predecessor lands; retain human review.

Then: module inventory/guard PR; one identity decision (Clementine, THEM, no
Samantha) and rename with persisted-state migration; mentor #468, #469/#474,
#470, #472/#473; pages #471 with #613/page_flip reconciliation; voice actions
#475/#478 replacing inspector_ux; coverage #476/#479 replacing coverage.js.

## Non-blocking follow-ups — owner: Codex

| Follow-up | Required proof |
| --- | --- |
| #625 recovery statuses `asked_repeat` / `continue_listening` | Neither status settles a held wallet charge; real response-lifecycle regressions. |
| `knowledge_empathy_depth` 0.656 < 0.710 | Reproduce with a main control, identify prompt/scoring cause, retain the agreed quality floor. Predates #623 per reviewer evidence. |
| `realtime_turn_commit_route` 300-second hangs | Make provider/storage/time dependencies hermetic; repeated isolated and full runs finish within bounded deadlines. |

Hosted CI was last blocked before any job step by GitHub account billing.
Live provider evaluation awaits explicit external-data approval. Neither is
permission to bypass required checks or declare the phone workflow verified.
