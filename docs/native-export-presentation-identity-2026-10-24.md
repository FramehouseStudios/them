# T-1132 — Keep each native Files presenter bound to its export

## Evidence and cause boundary

VERIFIED: original #974 head `7428be7` run `40160014884` is terminal red.
Signed units, D009 and Node20 backend2964/0/4 passed. The writer workflow failed
0/1/0 at `V1SmokeUITests.swift:1409`: second Files export not presented after
cancelling the first. Subsequent broad UI/offline recovery/voice/Mac steps were
skipped, not successful. The separate #975 run `40160039304` passed its writer
step and was still in broad UI at the last observation; that does not waive this
parent's red result.

The retained native screenshot shows the real Browse picker and leading X.
After cancellation the failure hierarchy shows Studio again, not a hidden picker,
with the coordinator's actual error: "Finish or cancel the current export before
starting another." The old "Choose where to save ..." message remains. Thus the
coordinator retained an unsettled request after native dismissal. This is not just
an assertion about the private filename field.

ASSUMPTION / diagnosis: the reusable `fileExporter` could retain a callback
capturing the Studio modifier's nil/previous request ID. We have not instrumented
the failed hosted callback's exact argument, so do not call that capture stack
directly observed. Its optional callback identity/lifetime was nevertheless a
real source-level gap: no export exists when the reusable modifier is first made.
Reading the latest global ID at callback time would instead let an old picker
settle a new export and is deliberately not the fix.

## Small canonical fix

Runtime `3b4d45475b7e2249392b740d7985210eed5728c0`, on original
`codex/T-1125-talk-owner-fence`, descendant of `7428be7`:

- Make the existing native presenter a private background child created only
  after an immutable nonoptional request ID and exact artifact are available.
- Give that child the request's identity, not the whole Studio/editor. Do not
  recreate Studio or change its aesthetic/navigation/editor state.
- Scope the Files presentation binding to that request. Old binding writes,
  cancellation and completion cannot close or settle a newer export.
- Preserve the distinction between lowering the presentation binding and the
  actual Save/Cancel callback. Do not clear the request early and lose Save.
- Keep canonical auth/project context checks and exact artifact bytes. No
  dismissal sleeps, test assertion weakening, new export service or fallback save.

Only runtime file: `them/ScreenplayStudioExportSupport.swift`.
Regression: `themTests/ScreenplayStudioExportSupportTests.swift`.
All five watched god files, backend runtime and native UI test source are
unchanged from the failing head.

## Verification

VERIFIED, Xcode26.3 / iOS26.2, erased task-owned signed simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`:

- Focused export suite **19 pass /0 fail /0 skip**.
  `/tmp/them-1132-export-focused.xcresult`.
- Unchanged required writer workflow **1/0/0**: authenticated local project,
  real save, first Files presentation/cancel, second presentation/native Save,
  same saved marker/version and exact relaunch. Canonical runner reports `ok`:
  `writer-loop-6040e4eb-a152-4cc3-ade9-006fb8582f07.xcresult`.
  The supplied `THEM_UITEST_WRITER_LOOP_RESULT_BUNDLE_PATH` variable is not a
  supported override and was ignored; the runner chose the above UUID path.
  No extra run was made for that bookkeeping mistake.
- Complete signed `themTests`: **948/0/0**,
  `/tmp/them-1132-full-units.xcresult`.
- `MAC_DESKTOP_ACTION=build bash scripts/desktop_preflight.sh`: exit0,
  macOS scaffold BUILD SUCCEEDED. This is build-only, not an unsigned iOS test.
- Canonical D009 vs existing `origin/main` and `git diff --check`: pass.
  Direct parent diff confirms no watched file changed.
- Backend, scripts and Packages byte-unchanged from `7428be7`; exact hosted
  Node20 parent suite2964/0/4 is inherited evidence, NOT a new local backend run.

No new provider/model calls or production changes. Local UI Node24.19.0 drives
deterministic local HTTP; no physical microphone/live-quality claim.

Permanent local archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1132-20261024.94kM99/`.
Contains native bundles/logs plus the original 100,694,123-byte hosted failure ZIP
(3,404 member paths validated against traversal/absolute/symlink entries before
extraction). Archive code was not executed.

## Adversarial review and remaining proof

- Answered locally: stale completion/cancel/binding cannot settle a newer export;
  auth/project changes invalidate pending work; no saved claim before actual
  completion; native cancellation permits another export without modifying draft.
- Not yet answered: changed-head hosted iOS26.5 confirmation of the reported
  lifecycle failure. Publish a normal descendant and require fresh checks, not
  an unchanged retry or a waiver of the old red run.
- Not covered: external file opening/independent exported-byte observation,
  physical phone, intended shipping deployment and live Clementine quality.

T-1130 recovery work is preserved separately in local `389de8c` (runtime
`aa8cc35`), not silently folded into #974. Its focused9/0/0 and interrupted
two-project recovery UI1/0/0 are local evidence only; full units/normal recovery/
Mac remain pending there. Bring this parent fix forward by preserving merge
after publishing, then complete that combined proof. Production hold and all
required independent-review/main protections remain unchanged.
