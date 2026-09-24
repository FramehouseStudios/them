---
id: T-decompose-root-experience-view
title: Decompose them/RootExperienceView.swift (529 KB) into per-concern modules
owner: codex
status: in-progress
branch: claude/root-experience-phase0-visual-context
pillar: ios
v1_pillar: infra
v1_effect: post-V1 infrastructure; today every iOS regression touches this 529 KB file. Splitting it makes review safe and unblocks parallel iOS work.
---

## Scope

Spec: `docs/specs/T-decompose-root-experience-view.md`.

Phased, byte-identical extraction following the backend Phase 0–N
pattern. Six phases planned: viewmodel, onboarding, companion
presence, screenplay shell, modal sheets, residual.

## Done when

- `RootExperienceView.swift` is < 100 KB.
- Each phase landed as its own PR, byte-identical, with a
  pre/post view-hierarchy screenshot pair.
- No regression in `themTests` or V1 manual smoke.

## Progress

- 2026-09-23, phase 0 slice (PR stacked on #664): the visual-context
  capture cluster (`ClementineVisualContextEnvelope`,
  `ClementineCapturedVisualContext`, `ClementineVisualContextCaptureError`,
  `ClementineVisualContextCapture`, 207 lines, macOS-only inside
  `#if os(macOS)`) and `ScreenplayRestoredLiveDraftProjectPromotionPolicy`
  (18 lines) moved verbatim into `them/RootExperience/`. RootExperienceView
  15,112 → 14,783 lines. Proof: text diff of the moved blocks against the
  original lines, god-file gate, signed `themTests` on an erased simulator.
  The spec's Phase 0 (`RootExperienceViewModel` state carriers) is not
  started; owner stays Codex.
