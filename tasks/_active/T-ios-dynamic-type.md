---
id: T-ios-dynamic-type
title: Make iPhone text follow Dynamic Type
owner: codex
status: ready
branch: codex/T-ios-dynamic-type
pillar: mobile-first
v1_pillar: ios
v1_effect: writers who use larger text sizes can read Talk, Studio chrome and sheets instead of getting fixed 9–15 pt text.
---

## Scope

- Found 2026-09-27 on the simulator: at the Accessibility Large text size the
  home screen, Studio chrome and sheets render exactly as at the default size.
- Every `IOThemTypography.UI` token is `Font.system(size:)`, which never
  scales, and screens also call `.system(size:)` directly (558 direct call
  sites against 383 token uses).
- Move the tokens to scaled sizes (text styles, or `UIFontMetrics` with a cap
  where fixed chrome cannot grow), then fix the layouts that break at the
  accessibility sizes: the home chip row, Studio top bar and element bar, the
  drawer rows, the right rail tabs and the save chips.
- Leave the screenplay page itself at its fixed Courier size; page geometry is
  the product, and the writer zooms the page instead.
- No visual change at the default text size.

## Done when

- At the default size, before/after screenshots of home, Studio (page, drawer,
  rail) and Profile match.
- At Accessibility Large, the same screens have no clipped or overlapping text
  and every control stays reachable.
- A unit test pins the token-to-text-style mapping, and signed `themTests` pass
  on an erased simulator.
