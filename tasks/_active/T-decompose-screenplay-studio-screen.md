---
id: T-decompose-screenplay-studio-screen
title: Decompose them/ScreenplayStudioScreen.swift (1.1 MB) into per-concern modules
owner: codex
status: ready
branch: -
pillar: ios
v1_pillar: infra
v1_effect: post-V1 infrastructure; the largest file in the codebase. Same problem as RootExperienceView at twice the size.
---

## Scope

Spec: `docs/specs/T-decompose-screenplay-studio-screen.md`.

Seven phased extractions: viewmodel, paper canvas, command palette,
inline editor, voice overlay, inspector tabs, fixer queue + toast.
Each phase gated by `npm run eval:studio` (39-step gauntlet).

## Done when

- `ScreenplayStudioScreen.swift` is < 250 KB.
- `npm run eval:studio` green at every phase.
- `T-ios-xcuitest-v1-smoke` (once landed) continues to pass.
