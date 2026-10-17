# T-966 — Preserve and connect original title-page support

Parent T-965/#948: `9dc5a6770affb69603cb4a4884aab5106c4e7b49`.
Branch: `codex/T-966-title-page-integration`.

## Original history

Preserving merge `31953a6cf6626d31815af8b556c18deca9686cfd` adds original
#613 head `4143d9c3a6196528a4d654b59addfb09cfdff62c` without conflicts,
squashing, rewriting or replacing its branch. Original codec, package tests,
PDF title page, body-only server pagination and editor-element inference remain.

## Integration seams

The newer local printed-page counter still paginated the complete document,
including title metadata. Reuse `FountainPaginationSource` from original #613
instead: paginate its body and map source lines back into the full document.
This connects the existing current-draft memo, overview and feature progress.
No second title parser or pagination engine is introduced.

The newer iPhone FDX request encoder also treated metadata as story action.
Reuse the original codec to send supported title, credit, authors, draft date
and contact fields separately from scenes. Explicit document title wins over a
stale project label; an absent author never becomes THEM or Clementine.

## Verification

- Package tests: 21 passed, zero failures; original codec and pagination tests
  included. `/tmp/them-966-package.log`.
- Signed iOS focused proof: 29 passed, zero failures or skips, erased task-owned
  iPhone17Pro/iOS26.2:
  `/tmp/them-966-title-integration.xcresult` and corresponding `.log`.
  Tests cover title-only zero story pages, title plus 120 printed story pages,
  exact mapped source ranges, PDF title/body separation, FDX metadata and prior
  printed-progress behavior. This is not full-length model generation proof.
- Connected authenticated iPhone writer/save/MD+FDX native-share/relaunch:
  1 passed, zero failures or skips; `/tmp/them-966-title-writer.xcresult`.
  Provider counters: STT0/chat0/TTS0. This regression uses a short story without
  title metadata, not a title-specific UI journey or real-model output.
- macOS scaffold Debug compilation exited0; `/tmp/them-966-macos.log`.
  Actor-isolation/Sendable and deprecated-API warnings remain; not a release
  or macOS UI proof.
- `git diff --check` and D009 pass. Against current origin/main, watched line
  deltas are index -69, Studio -34, Root -122, bridge -27, API -148.
- Backend source unchanged; no paid model calls, production deployment,
  physical-phone test or external opening of an exported file in this boundary.
  Private completed evidence retained under
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-966-20261016.uyGLtT/`.

## Separate main-safety lane

#770 landed through a normal protected merge at
`4d788975860a8704798c07fc3b1f9bec18eb3b30`; original branch preserved.
#906 current head `44518082e2b387a90fbd7817506f382f3b2d5a3c` has the human's
non-author approval. Hosted run38998648618 backend/D009 passed; iOS gate is
still running. Do not merge on approval alone or describe the earlier main
writer-export assertion failure as diagnosed. Original #904 owns subsequent
failure-artifact and runner improvements and must be preserved.

## Scoped files

Original merge: `Packages/ScreenplayStudio/Sources/ScreenplayStudio/`:
`FountainPaginationSource.swift`, `FountainTitlePageCodec.swift`,
`ScreenplayEditorElement.swift`; corresponding package tests
`FountainPaginationSourceTests.swift`, `FountainTitlePageCodecTests.swift`;
`them/ScreenplayLocalExport.swift`, `them/ScreenplayPrintService.swift`,
`them/ScreenplayStudioViewModel.swift`, `themTests/ScreenplayPrintServiceTests.swift`.

Reconciliation: `them/ScreenplayPageLayout.swift`,
`them/ScreenplayFDXRequestPayload.swift`,
`themTests/ScreenplayPageLayoutTests.swift`,
`themTests/ScreenplayFDXRequestPayloadTests.swift`, `TASKS.md`, this document.

## Not covered / next

macOS local FDX still uses its older serializer and needs a separate connected
title/body audit. iPhone codec/request coverage does not prove that path.
Full backend/full units and broader UI were not repeated for this Swift-focused
boundary. Those remain required at the integrated-main checkpoint. A 120-page
layout fixture does not establish a matching 121-page title-plus-body PDF.
Shipping DNS/backend identity, real speech/model quality, complete 120-page
generation, offline phone recovery and external file opening remain unproven.
