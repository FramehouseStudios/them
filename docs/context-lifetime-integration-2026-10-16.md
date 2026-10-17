# T-959 — Current project and client lifetime integration

Branch `codex/T-959-context-lifetime-integration`; parent T-958 `ace7bf1d`.
Goal items 1, 3, 5 and 6. Prior turn: progress (preserved, proved and published
#932–#935), not a wait or a completion claim for the whole app.

## Original history retained

| PR | Original head | Preserving merge |
| --- | --- | --- |
| #936 newest project load | `3a1449e5196396e84e559500de20199ff7c14aec` | `34bb613f` |
| #937 client teardown | `2d5cc7b495bda7fc5c9e99012c5665599c381691` | `d878af5f` |
| #938 collaboration scope | `b882184880bfc37c31b154d63decc5a26a9ce193` | `0908374e` |

Read original bodies/current heads, plus #854 project-memory and #910 loaded
sync boundaries before integration. No original head rewrite, squash, closure,
replacement PR, main merge or protection bypass.
Suspended-lookup seam regression committed separately as `af097d98`.

## Root corrections / merge decisions

- Newest selected-project load owns detail, outline, errors and queued recovery;
  account/project matching alone does not order two reads of the same project.
  Confirmed saves and Load Server invalidate older reads.
- Combine that generation guard with T-956's owned-outbox lookup, captured
  auth/entry-owner guards and injectable suspended-lookup regression seam.
  Do not replace either half in the merge conflict. Optional generation comes
  before the optional lookup, retaining existing trailing-closure test calls.
- Add a real-model seam regression: pause the old queue lookup, finish newer
  loads of the same project, then release the old entry. Assert exact UTF-8 page,
  current head/title and clean/no-conflict state remain. No paid provider or
  real network; reuse the existing canonical injected transport and client.
- Preserve the original explicit empty BackendClient deinit compatibility fix.
  Its original tests exercise 100 synchronous releases inside a task-local scope
  and caller-owned session reuse; no global client retention or session cancel.
- Collaboration responses own their collection, not project selection or draft
  history. Capture selection/auth/response generations, including A→B→A; reject
  mismatched project IDs. Serialize mutations, reject duplicate dispatch, and
  clear composer/forms only if exact submitted bytes still match.
- Keep all T-958 conflict authority, exact identity and T-957 blank-edit rules.

## Verification checkpoint

VERIFIED: runner contracts5/0/0; D009 versus T-958 and diff checks pass. All five
protected line counts unchanged: index33557, Studio17407, Root15024, bridge12925,
MemoryAPI10846. No backend production source or dependency manifest changed.

VERIFIED: signed focused ordering/teardown/collaboration/outbox/recovery/authority
tests **164 passed, zero failed/skipped**, on erased owned iOS26.2 simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, normal signing enabled.
Log `/tmp/them-959-focused.log`; bundle `/tmp/them-959-focused.xcresult`.
Authoritative xcresult summary confirms counts. No failed compile/runtime run
on this batch. Retained bundle/logs:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-959-20261016.9WgBbz/`.
VERIFIED: authenticated recovery UI **5 passed, zero failed/skipped**. The actual
auth-required local backend proves queued save, expired-auth/conflict/Keep Mine,
delete-all, blank snapshot/Saved Restore and fresh Load Server/relaunch.
Synthetic edit fixtures, fake provider key, Muse/embeddings disabled; this is not
live microphone/provider proof. Log `/tmp/them-959-recovery.log`; retained result
`recovery/them-save-recovery-Db9jhg/recovery-ios.xcresult`. The evaluator validates
the authoritative five-case xcresult summary. Fixture host Node26.7.0, not a
shipping Node20 backend-suite rerun; no backend production source changed.
Full suites/macOS are deferred to the combined integration checkpoint per the
human's reduced-repetition instruction, not removed as required landing gates.

## Residual risks / next

The collaboration operation UUID does not solve every use of shared `isSaving`.
Client guards are not server authorization proof or cross-device convergence.
No exhaustive database ordering, crash freedom, power-loss/reinstall durability,
120-page performance, physical microphone/provider, production-backend or
export/page-parity claim. Main is not integrated; #766 then #770 still require
independent review and required checks before main landing.

Next trust originals: #939 initial project creation, then #940 writer evidence
retention. Both bodies were read; neither is represented as integrated here.
Also inspected #941: its actual base is `codex/T-iphone-export-share` (#868),
not #940. Preserve that separate later product ancestry; do not merge it into
this earlier trust lane merely because its PR number follows #940.

Separately monitored T-956 hosted run38985891535 at15cd7129 advanced past the
required writer workflow into V1 UI during this pass. Backend and D009 succeeded;
the overall Quality Gate was still running. This is not hosted proof for T-959.

## Session report / exact changed files

Completed implementation: preserving #936–#938 integration and the suspended
queue/new-load seam regression. Root issues and scope above. Verification:
164 focused passes and authenticated UI5/0/0. Full matrices deliberately not
repeated at every original boundary; landing gates remain required.
GitHub: scoped branch only, no main mutation. Next: project-creation trust and
export handoff. READY FOR CONTINUE; full app goal remains active.

```text
TASKS.md
docs/audits/client-teardown-2026-10-08.md
docs/audits/collaboration-scope-2026-10-08.md
docs/audits/project-hydration-order-2026-10-08.md
docs/context-lifetime-integration-2026-10-16.md
them/BackendClient.swift
them/ScreenplayStudioViewModel.swift
themTests/BackendClientTeardownTests.swift
themTests/ScreenplayCollaborationScopeTests.swift
themTests/ScreenplayProjectHydrationOrderTests.swift
```
