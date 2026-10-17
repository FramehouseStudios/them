# T-958 — Preserve the writer's explicit recovery choice

Branch: `codex/T-958-conflict-authority-integration`.
Parent: T-957 `94f434682187082ede730d4b893be0a0fee5c866`.
Goal items 1 and 4: no lost/duplicated work; no false recovery controls.

The previous goal turn was progress: four original recovery fixes were
preserved, proved together and published. This pass continues the actual bases,
not PR-number assumptions, with batched focused verification per human direction.

## Original heads preserved

| PR | Original head | Preserving merge |
| --- | --- | --- |
| #932 typed native-editor observation | `bace7ae33b6009e954f5347ec85fb6a1310d780f` | `30acea40` |
| #933 stale-conflict hydration | `25231907d5ed308a620b22809429f043940d242a` | `2591bb47` |
| #934 fresh Load Server | `60e7ad1d2e77f56e48b07cf522a9e9772dcc624c` | `c3ad675a` |
| #935 save/conflict authority | `daecfa34c27eedecacb70df6f5b7ad9a113af41a` | `318f8640` |

Read every original PR body before changing its seam. No original branch is
rewritten, squashed, closed or replaced. No main merge or protection bypass.
Canonical test import correction: `0703e6c3` (one line).

## Root behavior and merge decisions

- An old base/detail response cannot clear or downgrade an observed conflict.
  Preserve known immutable version timestamps; do not order opaque version IDs.
- Load Server always fetches through the canonical authenticated project client.
  Require the actual active-head record and actual draft text (blank is valid,
  missing is not); never substitute an older history record. Recheck account,
  project, choice and exact UTF-8 editor bytes after suspension.
- Ordinary Save is not Keep Mine. Immutable requests capture conflict authority;
  delayed acknowledgements cannot dismiss a newer choice, rebase a pending edit
  through it or rewind an explicit Load Server. Actor admission fences prevent
  old asynchronous conflict copies from reviving a discarded generation.
- Keep T-956's owned outbox and captured session/project checks, T-957's explicit
  blank-edit intent and exact identity. No new persistence or network framework.
- UI conflict resolution keeps all Home handoff tests plus the original honest
  typed-editor observation correction. It does not turn a deterministic typed
  test into microphone proof or extend its ten-second content deadline.
- Recovery evaluator retains asynchronous pipe draining, bounded failure output
  and exact xcresult counts per requested platform. Require the new fifth real
  authenticated Load Server journey, not only the original four cases.
- TASKS conflicts retain both old proof/task records and the new task claim.

## Focused checkpoint

VERIFIED: recovery runner contracts **5 passed, zero failed/skipped**;
`node --check backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs`
and `git diff --check` pass. D009 against T-957: all protected line counts unchanged
(index 33,557; Studio 17,407; Root 15,024; bridge 12,925; MemoryAPI 10,846).
Log: `/tmp/them-958-runner.log`.

VERIFIED: signed focused recovery/outbox/save-authority units **138 passed**,
plus typed-editor and Load Server UI **2 passed**: **140 total, zero failed,
zero skipped**, on erased owned iOS 26.2 simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, normal signing enabled.
Log `/tmp/them-958-focused.log`; bundle `/tmp/them-958-focused.xcresult`.
Initial combined build failed before executing tests: the original authority
test file referenced the exact-text helper moved to ScreenplayStudio in T-956
without importing its canonical module. Added that import, not a duplicate
helper or weaker assertion. Retained failed log and bundle above; rerun uses
`/tmp/them-958-focused-v2.log` and `/tmp/them-958-focused-v2.xcresult`.
Authoritative xcresult summary confirms all 140. Initial failure, final bundle
and logs retained at `/Users/halfmutantfilms/io.them-worktrees/_proof/T-958-20261016.AAPK3m/`.
No source edits during active builds.

## Residual boundaries

Full backend, full units, full V1 and macOS are not repeated for each boundary.
There is no backend production source change in this batch. T-957's 73 Node20
save/restart checks and four recovery UI passes are prior-tree evidence only.
VERIFIED: the five-case authenticated recovery journey passed **5/0/0** on the
combined tree: queued save, expired-auth/stale-conflict/Keep Mine, delete-all,
blank snapshot/Saved Restore, fresh Load Server/relaunch. This uses the real
auth-required localhost backend with synthetic writer data and a fake provider
key, Muse and embeddings disabled. No paid provider call or real microphone.
Log `/tmp/them-958-recovery.log`; exact xcresult is under the retained proof
directory at `recovery/them-save-recovery-UuAbvR/recovery-ios.xcresult`.
The evaluator checked all five authoritative result cases, zero failures/skips.
The fresh-head UI can observe the new version by polling before the tap; the
separate real-action unit proves cached nonempty conflict text must still fetch.

Next original #936 adds same-project hydration request ordering; #937 adds the
reproducer-specific BackendClient synchronous teardown fix. Both PR bodies were
read; neither is represented as integrated here. Their original head/base chain
must remain intact. No claim of exhaustive async race freedom or crash freedom.

Production domain/hosting configuration, native microphone/provider output,
physical iPhone, reinstall, production Postgres, power-loss durability, 120-page
performance, print/export parity and integrated main remain unproven. Independent
review is still required; original #766 then #770 remain first for main landing.

The separately monitored T-956 hosted run `38985891535`, exact head `15cd7129`,
advanced beyond required units into the required integrated writer workflow
during this pass; backend and D009 jobs succeeded. Its overall Quality Gate was
still running. This is neither a new T-958 dispatch nor hosted proof of T-958.

## Exact changed files versus T-957

```text
TASKS.md
backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs
docs/audits/fresh-server-choice-2026-10-08.md
docs/audits/save-conflict-authority-2026-10-08.md
docs/audits/stale-conflict-hydration-2026-10-08.md
docs/audits/writer-loop-ui-gate-2026-10-08.md
docs/conflict-authority-integration-2026-10-16.md
scripts/run_screenplay_save_network_fault_smokes.sh
scripts/run_screenplay_save_network_fault_smokes.test.mjs
them/ScreenplayDraftSaveOutbox.swift
them/ScreenplayStudioRecovery.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioViewModel.swift
themTests/ScreenplayDraftSaveOutboxTests.swift
themTests/ScreenplaySaveConflictAuthorityTests.swift
themTests/ScreenplayStudioDraftRecoveryTests.swift
themUITests/V1SmokeUITests.swift
```

## Session report / handoff

Completed: preserving integration of #932–#935 on T-957, plus the canonical
ScreenplayStudio import required by the original new authority test file.
Files: exact manifest above. Root issues: stale hydration clearing conflict,
cached destructive server selection, and late saves overruling newer choices.
Verification: runner5/0/0, syntax/D009/diff pass; signed focused units138/0/0
plus visible UI2/0/0; authenticated recovery UI5/0/0. One combined checkpoint,
not a repeated full matrix per original PR. The failed compile proof is retained.
GitHub: scoped branch only; original heads preserved, main not merged or pushed.
Next: original #936 same-project hydration ordering, then #937 teardown; follow
the actual base chain. READY FOR CONTINUE; the full app goal is not complete.
