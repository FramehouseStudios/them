# T-957 — Batched blank-save and recovery integration

Branch: `codex/T-957-blank-recovery-integration`.
Parent: T-956 `15cd7129f4261e693375ff55a6b99e3fab2cccab`.

DECIDED: combine the related recovery fixes before verification, rather than
repeat the complete backend/iOS/macOS matrix at every original PR boundary.
This follows the human's latest request. No main merge or replacement PR.

## Preserved original work

| Original | Original head | Preserving merge |
| --- | --- | --- |
| #928 hydration entry points | `342727757c2d7d1830835ca632cf4a25b5735e5e` | `9f3749df` |
| #929 guarded blank server saves | `5302f23bac8d124b9e5ac888dcc25f66b2228149` | `b0cebe28` |
| #930 durable writer deletion intent | `fc8157df2556e2ad04e2925f1ecb099328bb7152` | `c2a39d0e` |
| #931 blank snapshots / retained history | `9dde9be5f1c3e8f268587056b3136263442f0842` | `6e41dbbe` |

Read the original PR bodies, plus #729/#732/#838 for the history seam.
All heads remain ancestors; no squash or history rewrite.

## Root fixes and integration choices

- Independent project-detail hydration restores the owned durable writer copy
  first, then rechecks account/session/project before applying server content.
- A deliberate blank edit is distinct from absent text or empty generation.
  Require explicit intent, a current base, a request ID and stale-write rejection
  on the server. Client intent is scoped to the current account and project.
- Preserve intent through recovery, outbox, retries and actual save APIs;
  old manifests default off. Remote live adoption clears local deletion intent.
- Restore an actual empty history version, but reject unavailable text, foreign
  projects and missing IDs. Preserve current unsaved words before switching;
  keep the current server head as the save base. Failed snapshots keep labels.
- Missing history in a same-project metadata response no longer erases already
  loaded history; an explicit empty history array is still authoritative.
- Keep T-956's owned-outbox lookup, exact UTF-8 identity and suspended-auth/project
  race regression. Both test-file conflicts retain every original test.
- Keep asynchronous Xcode execution, draining backend pipes and authoritative
  result counts for every requested platform. The expected recovery count grows
  from two to four because the original blank-edit/snapshot journeys are added.

## Verification checkpoint

VERIFIED: pinned Node 20.20.2, external Docker networking disabled:
`node --test tests/screenplay_projects_routes.test.mjs tests/screenplay_cross_device_persistence.test.mjs`
— **73 passed, zero failed, zero skipped**, including actual authenticated backend
restart, exact blank/whitespace bytes, idempotency, stale conflicts and isolation.
Log: `/tmp/them-957-backend-focused.log`.

VERIFIED: recovery shell-runner contracts **5 passed, zero failed**;
evaluator syntax and `git diff --check` pass. D009 passes against origin/main;
all five protected-file line counts are unchanged from T-956 (verified against
`origin/codex/T-956-exact-recovery-integration` as well).

VERIFIED: signed focused recovery/outbox units **124 passed, zero failed,
zero skipped** on erased owned simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, normal signing enabled.
Log: `/tmp/them-957-focused.log`; result: `/tmp/them-957-focused.xcresult`.
Authoritative count read from xcresult, not inferred from a build exit code.

## Limits / next

VERIFIED: authenticated recovery UI on this combined tree **4 passed, zero
failed, zero skipped**: queued raw-text save, expired-auth/stale-conflict recovery,
intentional delete-all and blank snapshot. Both blank journeys verify offline
relaunch, reconnect, one new empty server version, retained original version and
online relaunch. The snapshot case also uses the real Saved Restore button.
DEBUG fixtures invoke real edit/save paths; this is not physical keyboard proof.
Artifacts:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-957-20261016.NkuOtz/recovery/`;
log `/tmp/them-957-recovery.log`. Evaluator validated authoritative xcresult counts.
Focused results and logs are retained beside the recovery directory at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-957-20261016.NkuOtz/`.
Full backend,
full units, writer/Home/full V1 and macOS have not been rerun for T-957.
T-956 results remain prior-tree evidence only. No live provider calls,
shipping configuration change, physical microphone proof or release claim.
The original stack is not merged into main; independent review remains required.

## Exact changed-file manifest versus T-956

```text
TASKS.md
backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs
backend/lib/screenplay_projects_routes.js
backend/tests/screenplay_cross_device_persistence.test.mjs
backend/tests/screenplay_projects_routes.test.mjs
docs/audits/blank-history-restore-2026-10-08.md
docs/audits/blank-writer-recovery-2026-10-08.md
docs/audits/intentional-blank-save-contract-2026-10-08.md
docs/blank-recovery-integration-2026-10-16.md
scripts/run_screenplay_save_network_fault_smokes.sh
them/BackendMemoryAPI.swift
them/ScreenplayDraftSaveOutbox.swift
them/ScreenplayStudioDraftToolsViews.swift
them/ScreenplayStudioPersistencePolicies.swift
them/ScreenplayStudioRecovery.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioViewModel.swift
themTests/ScreenplayDraftSaveOutboxTests.swift
themTests/ScreenplayStudioDraftRecoveryTests.swift
themTests/ScreenplayStudioDraftToolsPresentationTests.swift
themUITests/V1SmokeUITests.swift
```

## Session report / copy-and-paste briefing

Completed: preserved and integrated original #928–#931, including guarded
intentional blank saves, queued hydration, exact local deletion recovery and
blank history restore. Files: exact manifest above. Root issues: hydration
bypassing durable pending work; empty deletion mistaken for absent text;
metadata-only responses discarding loaded history; unsafe blank restore guards.

Verification: 73/73 pinned Node20 save/restart contracts, 124/124 signed focused
Swift recovery/outbox tests, 5/5 runner contracts, syntax/D009/diff pass.
The four authenticated recovery UI cases also pass, zero failures/skips.
No full-suite results are claimed for this new head.

GitHub: scoped rehearsal branch only; original heads retained, no main merge,
replacement PR or bypass. Original #766/#770 remain first in the eventual
protected main landing sequence. Next: finish the combined recovery checkpoint,
publish scoped evidence, then follow the actual #932/#933 base chain for the
existing writer observation / stale-conflict fixes. READY FOR CONTINUE.
