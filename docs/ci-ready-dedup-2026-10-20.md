# T-1075 — Do not repeat unchanged-head gates merely for readiness

## Measured problem

Original #909d3b6027e651588414c46cf1f2fccfd2511de8768 has two successful
quality runs:39400830397 created2026-10-20T09:27:42Z, completed10:14:23Z;
39491129919 created20:20:28Z, completed21:39:46Z. The PR timeline records
ready_for_review at20:20:24Z. The configured readiness trigger and four-second
timing support the inference that conversion caused the second run.
Both report the same source head; their retained run metadata exposes no base
SHAs, so exact virtual merge-tree equality is not asserted. Do not promise
that every future run will save this elapsed time.

## Smallest fix and unchanged protections

The workflow already runs full jobs for drafts. Remove only the extra
ready_for_review trigger; retain opened, synchronize and reopened. This is
GitHub's documented default pull-request activity set:
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request

No draft skip, job skip, fake success, check-result copying, relaxed timeout,
path filter, new action, token permission or alternate privileged event.
Every job/step remains byte-identical to parentfeb5f372. Main pushes, manual
entry and workflow_call remain unchanged. A new code head still triggers
the entire gate. A conflicting merge is not made safe by readiness; resolve
it normally, which updates the head and triggers fresh checks.

GitHub requires checks on the latest applicable commit/test-merge SHA:
https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
Existing strict up-to-date protection remains responsible for base changes;
an older head's results cannot replace proof of an updated integration.
Status-check age constraints and unexpected missing checks still require a
real qualifying run, never a fabricated pass or protection change.

Live branch-protection read before editing: God-file gate (D009), Backend
tests and Quality Gate required from GitHub Actions app15368; strict=true,
one approval, stale-approval dismissal=true, administrator enforcement=true.
None of those settings is modified. Relevant GitHub semantics:
https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## Verification boundary

Focused source-contract checks preserve every required job/native stage and
reject draft/action-based skip greens. An independent byte comparison must
prove all job bodies and all non-trigger workflow configuration unchanged.
No new native/provider run is necessary for this event-declaration-only edit.
The original save fix's local6/0/0 + writer1/0/0 proof stays attributed to
runtimefeb5f372; Swift/backend/package sources remain unchanged here.

VERIFIED: pinned Node20.20.2 focused checks **6/0/0**, native exit0,
48.662959ms. The separate byte comparison passed: replacing only the new
trigger/comment with the old event line reproduces the parent's entire
workflow exactly; job bodies are independently byte-equal. No native suite,
provider call or dependency installation was run for this change.

Fresh required hosted checks and non-author review still apply to the
resulting original #964 head. After a genuinely green exact-head gate and
human approval, normal ready-state conversion must leave that same proof
usable without starting another quality workflow. This actual platform
observation is pending; static checks alone do not establish it.

No main merge, auto-merge, production action or paid model call. Original
PR/base/history and every existing branch remain preserved.
