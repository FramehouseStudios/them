# T-954 — Reference-led THEM design polish

User direction: borrow the supplied references' hierarchy, spacing, simple
rows, translucent navigation and quiet screenplay treatment without replacing
THEM's established identity. This is a native UI refinement, not a new theme,
fake screen mockup or a claim that the full writing integration is complete.

## Preserved work and boundaries

- Isolated branch `codex/T-954-reference-design-polish`, based on complete
  original #902 `449f5fccb15c1e3f5f75eaa8aa887ccf773fe185`, including #901.
- Original peach/dark RGB values, orb, white screenplay paper, account logic,
  twelve hub destinations and the four approved tab names remain unchanged.
- No Root/Studio god-file changes, new UI shell, provider calls, backend
  changes, original-head rewrite, main merge or replacement PR.
- Preserving merge `33781edf` retains existing #893 `58c3ff33`: its two-line
  iPhone-only Pages modifier guard is needed for the Mac scaffold. Do not
  reimplement that existing fix. Other safety work in T-953 is kept separate.
- Landing remains bottom-up through the original product stack; this design
  branch is not permission to skip #766/#770 or required independent review.

## Native changes

- Centered editorial headings reuse the existing serif direction; semantic
  typography tokens scale hub headings and rows with Dynamic Type.
- Settings/Memories use divided rows instead of repeated rounded cards.
  Every original handler and accessibility identifier is retained.
- Bottom navigation keeps visible labels and selected-state feedback, with
  soft material over the existing shell palette. Reduce Transparency uses an
  opaque shell fill instead of blur. Touch targets remain at least44points.
- At accessibility sizes the bar uses two columns/two rows rather than
  truncating three names. Scroll content reserves the taller bar's clearance.
- Each hub gets its own scroll identity: switching from scrolled Settings to
  Memories opens the first row, not a stale offset in the middle of the list.
- Derived secondary ink uses the original text color at84% opacity. The
  initial78% produced calculated peach contrast4.25–4.42;84% gives4.84–5.05.
  A runtime color-resolution test checks4.5 minimum on all three backgrounds
  in both themes. No original RGB color value changed.

## Proof and retained failures

- First signed run: **966units passed**, UI **4passed/1failed**, zero skips.
  `/tmp/them-954-design.xcresult` and `.log`. Large-text UI reproduced the
  retained hub scroll offset; inspected screenshot shows Memories opening at
  Notes/Tasks. No assertion was removed and no unchanged-test retry used.
- Exported first-run screenshots were visually inspected: peach Settings,
  peach Memories, dark Settings and accessibility XXXL. The latter showed
  truncated tab names. Those screenshots are not final-source proof.
- Second signed run: **967units +5UI passed**, zero failures/skips;
  `/tmp/them-954-design-final.xcresult` and `.log`. Hub scroll regression and
  runtime contrast test passed. Visual review still found shortened Memories
  text in the two-column bar at accessibility XXXL; green assertions alone
  were insufficient. Reuse the icon-above-label layout at both sizes to give
  the full column width to each name.
- Final third source: **967units +5targeted UI passed**, zero failures/skips,
  exit0; `/tmp/them-954-design-v3.xcresult` and `.log`. Authoritative xcresult
  summary has972 total/passed. Final accessibility screenshot was inspected:
  Home, Studio, Memories and Settings all show their full names; Memories
  opens at its first row. Final peach Settings and unchanged dark Home/orb
  were also inspected. Code checkpoint `57892a5a`.
- Use the T-953 canonical runner with PROJECT pointing to this worktree,
  explicit task-owned simulator11CF5EFB-D8C3-4F19-8062-28AF37F27D93, normal
  signing and a fresh erase. Local Xcode26.3, iPhone17Pro/iOS26.2/23C54.
- D009 versus actual original parent `origin/codex/T-four-tabs` passes: all
  five counts unchanged. An initial command named the wrong parent and only
  reported absolute sizes; it is not used as parent-relative proof.
- macOS scaffold build passes on final source, exit0;
  `/tmp/them-954-mac-final.log`. Canonical unsigned build-only configuration;
  all iPhone tests are signed. Final diff check passes. Backend suite is not
  rerun for this UI-only branch; no backend source/dependency was changed.
- All three result bundles, logs, initial failing attachments and final images
  retained outside Git under
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-954-20261016.YywerJ/`.
  Human-readable final screenshots are in `previews/`: Settings-Peach.png,
  Memories-Peach.png, Settings-Dark.png, Memories-Accessibility-XXXL.png.

## Exact changed-file manifest versus #902

```text
Packages/ScreenplayStudio/Sources/ScreenplayStudio/DesignSystem/IOThemColors.swift
Packages/ScreenplayStudio/Sources/ScreenplayStudio/DesignSystem/IOThemSpacing.swift
Packages/ScreenplayStudio/Sources/ScreenplayStudio/DesignSystem/IOThemTypography.swift
TASKS.md
docs/reference-design-polish-2026-10-16.md
them/ThemHomeTabs.swift
them/ScreenplayStudioPagesOverviewView.swift
themTests/IOThemAppearanceTests.swift
themUITests/V1SmokeUITests.swift
```

## Remaining scope

This first visual pass covers the two hubs and shared bottom navigation.
Home's orb and Studio's editor/paper remain intact. Studio chrome/editor
refinement, physical-phone visual proof, all destination-specific workflows,
full V1 and release integration are not established by these focused UI tests.
The earlier recovery CI run belongs to T-953, not this later design ancestry;
do not transfer its badge or test counts between branches.

## Copy/paste handoff

T-954 refines original #902 without changing #901 peach/dark RGB values, the
orb, screenplay paper or route handlers. Flat divided hub rows, editorial
headings, soft material tabs and semantic font tokens are native SwiftUI.
An actual large-text failure exposed cross-hub scroll retention; identity now
resets correctly. Visual QA caught a truncated tab name despite green tests;
icon-above-label two-column accessibility navigation fixes it. Secondary ink
has tested4.5-minimum contrast across both themes. Final signed units967/0/0,
targeted UI5/0/0, final Mac scaffold and parent-relative D009/diff pass. Preserve
original #893 in merge33781edf. No main/original-head rewrite, replacement PR,
physical-device install or paid call. Next visual scope: Studio chrome, keeping
the page quiet and every editing action connected. Core recovery integration
still lives on T-953; its hosted run38980652174 is separate and remains pending.
