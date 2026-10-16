# T-955 — Studio element controls

## Contract

DECIDED: use the human's four visual references for hierarchy, spacing and
quiet controls, not their red palette. Preserve THEM's peach/dark themes,
orb, Clementine and white screenplay paper. Extend the existing editor;
do not replace its document or formatting model.

Parent: `codex/T-954-reference-design-polish` at `290d2a46`.
Branch: `codex/T-955-studio-reference-polish`.
Original design ancestry (#901/#902) is preserved. The later centered-element
work at `7eded3e3` remains a separate original feature, not reimplemented here.

## Characterization before change

VERIFIED: a signed UI run on erased task-owned simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93` failed on the existing Scene control's
12.6667-point accessibility target (required minimum: 44 points).
Only observation accessibility identifiers were added before this run;
the existing visuals and handler were unchanged.

Evidence: `/tmp/them-955-targets-red.xcresult` and
`/tmp/them-955-targets-red.log`. Its screenshot was exported and visually
inspected: the original selector floats across the top of the paper and its
inactive labels are faint. Retain this failure; do not overwrite the bundle.

## Implementation

- Keep all six existing screenplay modes and the original mode/focus callbacks.
- Use semantic, scalable text and at least 44-point targets with a full hit shape.
- Give the selector its own position above the paper rather than a negative
  offset overlapping the paper header. Document margins/pagination are unchanged.
- Selected ink/fill are a paired canonical color role using THEM's existing
  accent; inactive labels use existing primary Studio chrome ink.
- Add explicit accessibility labels, hints and selected state; respect Reduce Motion.
- Spell out Parenthetical and Transition visibly; keep horizontal scrolling so
  labels never need to shrink or stack letter-by-letter on a narrow inspector.
- No backend, auth, persistence, raw draft normalization, parser or export change.

## Proof status

First implementation checkpoint: signed focused UI **1 passed / 0 failed**,
`/tmp/them-955-targets-v1.xcresult`. Its screenshot was inspected: readable
selected Action, no paper-header overlap, same peach background/white paper.
The subsequent source spells out the final two labels and adds large-text
coverage; this first checkpoint is not final-source proof.

VERIFIED: final signed run `/tmp/them-955-final.xcresult` and `.log` exits0:
**968 unit tests +4 UI tests =972 passed, 0 failed, 0 skipped**. Authoritative
xcresult summary agrees. Xcode26.3; iPhone17Pro/iOS26.2(23C54); normal signing;
the canonical T-953 runner erased only the explicit task-owned simulator.

The four UI workflows prove all six mode targets/selection, all six with
accessibility XXXL and dark theme, complete direct typing, and routing of the
real inspector tabs. The mode tests check both dimensions >=44 points,
accessibility names, reachability by scrolling and the selected trait after
each existing action. They do not claim editor/export semantic parity (#80).

All four final screenshots were actually inspected: peach, peach Transition
with keyboard, dark accessibility XXXL, and dark accessibility Transition with
keyboard. Labels remain horizontal/readable and the paper header is separate.
Large text intentionally scrolls horizontally, rather than reducing the font
to fit every control simultaneously. The white screenplay stays unchanged;
dark chrome and all existing screenplay/header styling outside this selector
are inherited, not redesigned here.

Runtime color-resolution tests verify4.5 minimum for selected and inactive
ink in both themes (including translucent panel compositing). No new RGB
palette was introduced. No Swift source changed during active Xcode builds.

Parent-relative D009 passes: Studio17408→17406; backend33491,
Root14693, bridge12584 and MemoryAPI10847 unchanged. `git diff --check` passes.
Backend is unchanged and `npm test` was not rerun for this UI-only branch.
macOS scaffold build passes, exit0: `/tmp/them-955-mac.log`, canonical
`scripts/desktop_preflight.sh` with `/tmp/them-955-mac-dd`. Unsigned build-only
configuration; all iPhone tests above were signed.

Retained bundles, logs and screenshots:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-955-20261016.36BN8R/`.
Readable previews are in `previews/`: Studio-Peach.png,
Studio-Dark-Accessibility-XXXL.png and Studio-Transition-Keyboard.png.

Not covered: physical phone, provider speech/reply, shipping backend, native
export outside the app, independent review and integrated-main landing.

## Exact file manifest versus T-954

```text
Packages/ScreenplayStudio/Sources/ScreenplayStudio/DesignSystem/IOThemColors.swift
Packages/ScreenplayStudio/Sources/ScreenplayStudio/DesignSystem/IOThemTypography.swift
TASKS.md
docs/studio-reference-polish-2026-10-16.md
them/ScreenplayStudioEditorChromeViews.swift
them/ScreenplayStudioScreen.swift
themTests/IOThemAppearanceTests.swift
themUITests/V1SmokeUITests.swift
```

## Copy-and-paste handoff / end-of-session report

Completed T-955 on `codex/T-955-studio-reference-polish`, preserving T-954 and
original #901/#902 ancestry. No original PR head changed, no replacement PR,
no main merge. The exact eight-file scope is listed above.

Root issues: the original selector exposed a12.7-point accessibility target,
used faint10.5-point fixed text, and floated across the paper header. It now
uses semantic scalable type,44×44 minimum targets, paired selected colors,
explicit accessible names/hints/state, visible Parenthetical/Transition labels,
and its own space above the unchanged screenplay paper. All six original
mode/focus callbacks remain. No backend/model/auth/persistence/parser change.

Proof: retained red baseline1failed; first focused checkpoint1passed; final
signed968units+4realStudioUI=972passed,0failed,0skipped on the erased owned
iPhone17Pro simulator. Final peach/dark/AXXXXL/keyboard screenshots inspected.
Mac scaffold build, parent-relative D009 and diff check pass. Backend not rerun
because unchanged; no phone, provider or export-parity claim.

Remaining design debt: surrounding Studio chrome/metadata and duplicate
current-element heading are inherited; this is not a whole-editor redesign.
Next: continue the original safety/product integration sequence and required
CI observation; keep later centered-element work intact. Main landing still
requires the real non-author review process, and shipping-domain/physical-phone
proof remains outside these UI results. READY FOR CONTINUE.
