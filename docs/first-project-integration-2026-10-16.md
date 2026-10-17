# T-960 — Exact first-project creation and retained writer evidence

Branch `codex/T-960-first-project-integration`; parent T-959 `8436d50e`.
Goal items 1, 4, 6 and 7. Previous turn was progress: context/lifetime fixes
published with signed focused and real local recovery proof.

## Preserved originals

| PR | Original head | Preserving merge |
| --- | --- | --- |
| #939 project creation trust | `08a0b1089d6fb12a6eda35a923df9aead3e07375` | `7fa0d98b` |
| #940 writer evidence retention | `9f64c97103c2a852a8d44da419804adda3b63145` | `490a8409` |

Read both PR bodies/current heads plus original #702 seed policy, #647 title
policy and #672 sign-in deferral. No original rewrite, squash, closure,
replacement PR or main merge. #941 export is a separate later product branch
based on #868, not the numeric next dependency of #940.

## Connected behavior and conflict resolutions

- Preserve raw first-scene UTF-8 bytes; selected projects never seed a new one.
  Creation reserves the existing save lane, captures auth/selection ownership,
  preserves old dirty recovery and uses the canonical durable first-version save.
  New typing and title input survive awaited results; duplicate taps do not
  dispatch another in-process creation. Only an interrupted inflight seed may
  become retryable; parked/discarded copies cannot be revived.
- Keep T-953 asynchronous writer evaluation and continuous pipe draining to
  avoid stalling the owned backend. Keep original #940 private unique run
  directories, diagnostic output before validation, and retained xcresults for
  success/failure/zero/malformed summary. Remove only the generated configuration.
- Preserve existing ARTIFACT_DIR override and canonical RUNNER_TEMP upload path;
  generated restore configuration is inside the private run directory, mode0600.
  Pin both roots inside the harness fixture, not inherited caller directories.
- Keep both existing and new hosted artifact globs so earlier evidence layouts
  remain collectable. No new framework, retry or relaxed passing-count policy.

## Newly uncovered creation boundary

Initial combined existing focused checks passed91/0/0. Source review then found
the guard still admitted a selected project when loaded-draft identity was
empty. The prior regression covered a different loaded ID, not never-loaded
context. VERIFIED: the new real-model case failed one test/six assertions:
one create request was sent, selection changed, and displayed bytes/title/dirty
state were cleared. Later assertions describe consequences of the same missing
guard, not six independent defects. Retain the red before correction; this is
synthetic transport evidence, not observed production writer-data loss.

Require loaded-draft ID to equal selected-project ID. A genuinely live-only
draft still passes because both are empty; a selected-but-never-loaded project
does not. Valid selected-project fixtures now explicitly hydrate their draft,
instead of representing the unloaded state accidentally. No assertion weakened.
Fix and regression committed separately: `b2d08b40`.

## Checkpoint

VERIFIED: six real-evaluator evidence cases pass under pinned Node20.20.2 with
Docker external networking disabled, `/tmp/them-960-evidence-node20.log`.
Runner/helper checks22/0/0, `/tmp/them-960-runner.log`. Evaluator syntax, D009
versus T-959 and whitespace checks pass. All protected counts unchanged.
No backend production source or dependency manifest changed.

Initial signed focused91/0/0: `/tmp/them-960-focused.xcresult` and `.log`.
New single-case boundary run: `/tmp/them-960-unloaded-red.xcresult` and `.log`.
VERIFIED final corrected focused **92 passed, zero failed/skipped**:
`/tmp/them-960-focused-v2.xcresult` and `.log`; authoritative summary inspected.
All signed runs erase only owned iOS26.2 simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, normal signing enabled.
Retained proof root:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-960-20261016.7xuajs/`.
No source edits during active xcodebuild. Pending runs are not passes.
VERIFIED: authenticated writer **1 passed, zero failed/skipped**: create, type,
save, Markdown export status and exact relaunch restore. Evaluator asserts the
authoritative single-case summary; retained actual bundle:
`writer/them-studio-ios-writer-loop/run-A69RFE/writer-loop.xcresult`.
Private run mode0700 and generated restore configuration removal checked.
VERIFIED: authenticated recovery **5 passed, zero failed/skipped**, including
offline/relaunch/reconnect, auth/conflict/Keep Mine, delete-all, blank snapshot
and fresh Load Server/relaunch. Evaluator validates authoritative counts; bundle
`recovery/them-save-recovery-6bDNNS/recovery-ios.xcresult` under the proof root.
These use synthetic data on an auth-required localhost backend (host Node26.7.0),
not a live model or the intended shipping host.
Logs: `/tmp/them-960-writer.log`, `/tmp/them-960-recovery.log`.
Retained writer artifacts use `writer/them-studio-ios-writer-loop/run-*/` and
recovery uses `recovery/`, under the proof root. No native sharing or external
file-open claim: this writer case currently checks Markdown export status.

## Remaining gaps / next

Durable creation identity after ambiguous POST/relaunch and server activation
ordering remain open. Existing API accepts project_id but the current creation
call omits it; the server generates a new ID on every missing-ID request.
Stable retry identity must not overwrite later metadata or become an account
boundary by itself. This batch does not claim those interleavings solved.
Shared isSaving ownership, pending-seed reselect, unsynced uninstall, shipping
backend, real microphone/provider, production database, print/export parity and
120-page responsiveness are also unproven. Full matrices/macOS deferred, not
removed as required integrated-main gates. No paid model calls or production edits.

## Session report / exact files

Implementation: preserved #939/#940 above the context-safe rehearsal, retained
async evaluation and isolated evidence roots, corrected the reproduced unloaded
ownership guard. Root fixes and proof above; exact files below. Verification:
final focused92/0/0, writer1/0/0, recovery5/0/0, evidence harness6/0/0,
runner/helpers22/0/0, syntax/D009/diff pass. Initial91-pass tree, new failed case
and final corrected artifacts all retained.
GitHub: scoped branch only, originals/main preserved. Next: durable creation
retry after ambiguous POST/relaunch, then original product/export dependencies
and a combined full checkpoint. READY FOR CONTINUE; whole app goal remains active,
not release-complete. Separately monitored T-956 hosted run38985891535 (15cd7129)
has backend/D009 green and Quality Gate still running V1 at last observation;
not hosted proof for this new tree and not a reason to restart that run.

```text
.github/workflows/quality-gate.yml
TASKS.md
backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs
backend/tests/studio_ios_writer_loop_evidence_contract.test.mjs
docs/audits/project-creation-trust-2026-10-08.md
docs/audits/writer-evidence-retention-2026-10-08.md
docs/first-project-integration-2026-10-16.md
them/ScreenplayDraftSaveOutbox.swift
them/ScreenplayStudioViewModel.swift
them/StudioNewProjectSeedPolicy.swift
themTests/ScreenplayDraftSaveOutboxTests.swift
themTests/ScreenplayProjectCreationTrustTests.swift
themTests/StudioNewProjectSeedPolicyTests.swift
```
