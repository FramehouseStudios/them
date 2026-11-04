# T1199 — readable Studio integrity actions

## Scope and cause

- Base: `09af1555e71ec7e8e4c4df025101624059205f0a`.
- Branch: `codex/T-1199-integrity-banner-layout`.
- Worktree: `/Users/halfmutantfilms/io.them-worktrees/codex-integrity-banner-layout`.
- VERIFIED from the parent's passed delayed-owner screenshots: the page integrity banner squeezed four action labels into narrow vertical columns. The summary and every action shared one forced horizontal row. The inspector warning header and issue actions used the same forced-row pattern.
- Evidence: `/private/tmp/them-1187-publication-proof/passed-delayed-attachments/32B255CD-7F6A-4D43-B7E6-EE6B5E6A506C.png` and `B23EA393-221C-4009-893F-2CB4C7D8AA3F.png` in that directory. These screenshots precede this fix.

## Implementation

- Page summary uses the available width above the actions.
- One file-local action composition reuses the existing `ViewThatFits(in: .horizontal)` approach: an intrinsic-width row, then two intrinsic-width rows for three/four actions, then a full-width column. Horizontal candidates cannot fit by squeezing labels; the column can wrap normally at large text sizes.
- Every action label and button has a minimum 44-point height. No action has a line limit, clipping, hidden state, or height cap.
- The inspector warning reuses this composition; its Move all action no longer competes with the summary header.
- Existing callbacks, orange treatments, typography, and inspector accessibility identifiers are preserved. No linter, request, mutation, or screenplay-content policy changed.
- New page button identifiers: `studio.page.integrity.review`, `studio.page.integrity.move-all`, `studio.page.integrity.move`, `studio.page.integrity.remove`. Existing `studio.page.integrity.banner` remains.

## Verification and remaining proof

- VERIFIED: `git diff --check` and `node scripts/check_god_files.mjs` pass. No god file changed.
- Native compilation, signed tests, simulator interaction, and post-fix screenshots: **UNRUN in this helper lane**, per bounded assignment. Source layout intent is not a visual or interaction claim.
- Parent must compile the combined tree, inspect the actual narrow banner and inspector, verify all visible action targets are readable/hittable, and invoke Review to prove its existing action still opens the intended issue. Preserve the parent's original delayed-owner publication proof.
- No model calls, network access, remote pushes, PR changes, main changes, parent checkout edits, or prior-lane edits were performed.

## Handoff

Source is limited to `them/ScreenplayStudioDraftToolsViews.swift` plus this report. After the local commit, this lane is frozen; parent owns integration and native proof.
