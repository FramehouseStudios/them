# T-965 — Feature progress counts printed screenplay pages

Parent T-964/#947 `1a49bb5c`. Branch `codex/T-965-printed-page-progress`.

## Root cause and change

Studio feature progression preferred a previously fetched inspector page array,
even after the writer changed the draft. Without that array it divided physical
source lines by55. Root's continuity builder also used raw lines/55. The Pages
overview already uses `ScreenplayPageLayout`: wrapped text, element widths,
spacing, and dialogue continuations. These paths disagreed about story position.

Use that existing printed-page owner for both live feature-count paths. Keep one
current-draft memo value inside the existing Studio model so repeated view reads
do not repaginate unchanged text. The memo never publishes or writes the draft,
does not trust delayed inspector pages, and invalidates on any raw text change.
The visible overview badge shares that memo instead of paginating the same
unchanged text a second time. Root uses the current bridge draft, not its coarse source-line count. No new
pagination rules, framework, target-length default, route, auth or provider call.

## Evidence and retained failures

- Signed before-fix regression:0 passed/1 failed/0 skipped. A single long action
  line was reported as1 page, while canonical printed layout measured3.
  `/tmp/them-965-progress-before.xcresult`.
- First after-fix run:35 passed/1 failed/0 skipped, not green. The new actor-
  isolated reference cache aborted during deallocation; the crash report points
  to `ScreenplayPrintedPageCountCache.__deallocating_deinit` through Swift task
  executor teardown. Replace that unnecessary reference lifetime with a simple
  model-owned memo value. Do not remove the regression or retry unchanged.
  `/tmp/them-965-progress-after.xcresult`, host crash
  `them-2026-10-16-200416.ips`.
- Corrected signed regression/layout/planner result:36 passed/0 failed/0 skipped,
  erased task-owned iPhone17Pro/iOS26.2,
  `/tmp/them-965-progress-after-v2.xcresult`.
- The fixture has6480 short action lines, measured at54 printed lines/page =120
  pages. It proves layout/counting at full length, NOT generated drama, a complete
  Hollywood screenplay, measured live-model quality, title-page handling or a
  120-page output from one request. Stale inspector, long wrap, repeat reads,
  shortening and blank deletion are checked against current draft text.
- Connected authenticated writer/printed-page-badge/real MD+FDX native-share/
  relaunch workflow:1 passed/0 failed/0 skipped,
  `/tmp/them-965-progress-writer.xcresult`; ASR0/chat0/TTS0. No paid model calls.
- macOS scaffold Debug build exited0, `/tmp/them-965-macos.log`; not macOS UI
  or release-signing proof. D009 passes versus T-964: Root14992 ->14990 (-2),
  other watched files unchanged. Diff check passes. Backend source is unchanged;
  no full backend/full units/full V1 suite repeated for this focused scope.

## Preserved work and remaining boundaries

Original #613 is still OPEN at `4143d9c3a6196528a4d654b59addfb09cfdff62c`,
base main, and is not an ancestor of this rehearsal tree. Its body was read:
it supplies lossless title metadata, body-only pagination and unnumbered PDF
title pages. Do not reimplement or discard that work; integrate/reconcile its
original head as a separate preserving boundary. This change keeps the canonical
layout seam so title/body policy can remain owned by that original capability.

The legacy `page_flip.js` counts scene headings as pages, but its live-paper
caller does not receive the script from current `talk_handler` source metadata,
and no Swift `livePaper` reader was found. Merely changing that helper would not
prove the iPhone progress path fixed. It is deliberately not substituted for the
actual live-path correction here. No claim of completing the 120-page goal.

## Newly verified main failure (promotion held)

Main52cef9 run38995445494 completed FAILURE. Backend and required units passed;
required writer loop failed at `V1SmokeUITests.swift:534`, "Markdown export did
not report its .md artifact." Broader UI/voice steps were skipped. The sole
uploaded artifact contains only the backend log, not the failed UI xcresult or
screenshots. This assertion proves the expected status text was not observed;
it does not establish whether export failed, the tap was swallowed, or status
was replaced. Do not label this a resolved flake or retry unchanged to green.

Approved #770 f20391df run38995605542 has passed backend, D009, required units
and required writer loop; broader UI is still running at this checkpoint.
Its pass is not a diagnosis of main's failure. No deployment or further main
merge was performed in this pass. Next highest priority is retained hosted
writer-failure evidence and root-cause reconciliation with the existing proof/
export follow-ups, before a release claim or promotion.

## Scoped files

Private passing/failing evidence and cache crash report:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-965-20261016.ueXEzF/`.

`TASKS.md`, this document, `them/ScreenplayPrintedPageCountCache.swift`,
`them/ScreenplayStudioViewModel.swift`, `them/RootExperienceView.swift`,
`them/ScreenplayStudioScreen+PagesOverview.swift`,
`themTests/ScreenplayFeaturePrintedProgressTests.swift`,
`themUITests/V1SmokeUITests.swift`.
