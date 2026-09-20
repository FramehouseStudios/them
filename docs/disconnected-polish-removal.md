# Disconnected polish removal

Base: main 647e01fc. Implements three DELETE dispositions from audit PR #627.

Repository-wide filename and exported-symbol searches found only three unit
test consumers and references within this three-module island. No production
route, Swift consumer, eval or operational entrypoint calls these exports.

Removed polish_pass.js, draft_notes.js and rewrite_notes.js plus their six
prototype-only tests. Git history preserves all removed files. Existing real
Fountain serializer, sanitizer, repair-plan and live-draft tests are untouched.

Reasons: polishDraft collapses repeated whitespace including Fountain blank
lines and mechanically turns running into runned. Its tests explicitly accepted
that output. Draft notes wrap this mutation and add predetermined ghost/scar
advice; rewrite notes default to a bedroom and fixed sequence/page assumptions.
These are not production screenplay polishing or project-aware mentor logic.

This removes disconnected implementations, not the requested mentor/rewrite
features. Those remain assigned to the #468/#473 mentor ports and canonical
revision-aware editing path. No live drafting behavior changes in this PR.

Graph count on this independent branch: 87 files including barrel, 37 reachable,
50 disconnected. Combined with #627's export removal: 49 remain; that combined
state has NOT been merged or claimed verified. No dummy imports or exemptions.

Verification: 77 focused canonical formatting/sanitizer/repair tests pass.
Full backend Node 24: 2,733 pass, zero failures, 2 skips (2,735 tests), 45.15s.
God-file gate and git diff --check pass; backend reference search is empty.
Logs: /tmp/them-polish-cleanup-focused.log and /tmp/them-polish-cleanup-backend.log.
iOS and live-provider evaluation were not rerun for this dead-code removal.
