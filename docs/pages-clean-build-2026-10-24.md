# T-1127 — Clear the Pages-card hosted compile failure

## Actual failure, not an unchanged retry

VERIFIED: original draft #974 at `f10fd4103176c12277280780d9b55f0a0566bbcb`
failed Quality Gate in run
https://github.com/FramehouseStudios/them/actions/runs/40122604848 .
The signed unit step failed to compile, before any hosted iOS tests executed:
`ScreenplayStudioDraftPageTools.swift:167`, expression type-check timeout in the
large nested Page-card Button/conditional preview. Local947/0/0 from T1125 did
not overrule that failed clean hosted compile.

The same run's D009 passed. Its actual Node20.20.2 backend job reports
2967 total /2963 pass /0 fail /4 skip. These are that exact head's hosted numbers,
not fresh hosted results for the descendant compiler fix. No job was retried
unchanged and no required assertion/check was weakened.

## Fix and boundaries

Keep the same Page-card behavior but give the Swift compiler smaller opaque
View boundaries: card, content, heading and conditional preview. Colors and
selection traits have explicit concrete types. No AnyView/type erasure, renamed
identifiers, delayed rendering, disabled warnings, pagination changes or alternate
jump path. Selection still belongs to the navigator and uses its original handler.

Exact changed files in this follow-up:

- `them/ScreenplayStudioDraftPageTools.swift`
- `TASKS.md`
- `docs/pages-clean-build-2026-10-24.md`

All watched god files, backend source, owner-fence runtime and original ancestry
remain unchanged. No main merge, deployment, production secret or paid call.

## Local proof

VERIFIED with Xcode26.3/17C529:

- New DerivedData `/tmp/them-1127-clean-dd`, created2026-10-24 13:07:30 local.
  Complete signed `themTests`: **947 pass /0 fail /0 skip**,
  `/tmp/them-1127-clean-units.xcresult`. Normal signing; erased owned simulator
  `7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2.
- macOS scaffold build: exit0, `/tmp/them-1127-macos.log`. Build-only scaffold,
  not a signed macOS release/runtime claim.
- Signed Pages navigation UI: **1 pass /0 fail /0 skip**,
  `/tmp/them-1127-pages-ui.xcresult`;8 real pagination HTTP200 responses,
  intercepted provider counters STT0/chat0/TTS0. Exercises summary, density,
  navigation/card jumps and unchanged screenplay source through the real backend.
- D009 and `git diff --check`: pass; watched-file deltas against f10fd41 are zero.

Reproduction commands (from the task worktree; resource ownership required):

```sh
IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=7F1A14C1-B379-4417-AFE9-331810CD9CD3' \
  XCODEBUILD=/usr/bin/xcodebuild bash scripts/run_ios_unit_tests.sh -quiet \
  -derivedDataPath /tmp/them-1127-clean-dd \
  -resultBundlePath /tmp/them-1127-clean-units.xcresult
```

Do not overwrite/reuse existing result bundles or erase an unrelated simulator.
The existing UI helper runs
`test_pages_navigator_controls_jump_and_preserve_source` with an authenticated
task-owned backend, Node24.19.0 and intercepted provider transport.

### Appearance evidence

The full230-point inspector fixture was exported from parent T1125's signed bundle
and the new clean bundle. Both PNG files have exactly the same SHA256:
`8e549a267ee9cb0cc877b83b184994ca08c1fee89fac66e942f86b8b79065be9`.
The new render was visually inspected: summary, preview density, Previous/Next,
recalculation and both full-width cards remain readable; no single-letter vertical
labels. This establishes identity for that fixture, not every Dynamic Type/theme
or a real-phone screenshot.

Retained archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1127-20261024.MSRzSw/`.

## Preserved unfinished work / next

T1126 original-project navigation remains LOCAL ONLY on
`codex/T-1126-original-project-recovery` at
`00be9dc8ffc52b194dca699ce96cd9a83993b65e`, explicitly WIP. Its intermediate
destination run has1 pass/1 outline rollback failure while source was under
revision; it is not proof of the saved final WIP tree. No WIP enters #974.
Resume coherently after clearing this CI boundary, preserving both histories.

First recheck hosted checks on the updated #974 head; never claim the original
red result became green merely because local builds pass. Production/real-phone,
unbound/original-document continuity and precise rewrite recovery remain unproven.
