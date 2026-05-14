---
id: T112
title: Mark existing talk diagnostics and memory summary V1 surfaces complete
owner: codex
status: in-progress
branch: codex/T112-v1-diagnostics-memory-status-refresh
pillar: living companion
v1_pillar: ios
v1_effect: closes existing V1 checklist items for talk diagnostics visibility and memory summary refresh state
---

## Scope

Refresh `docs/v1-definition.md` for two already-shipped app surfaces:

- Talk diagnostics are visible from Report a Problem via `TalkDiagnosticsSheet`
  in `RootExperienceView`, backed by `/talk/stats` and `/talk/errors`.
- Memory shape summary + refresh state are visible in `DataControlsScreen`,
  backed by `/memory/stats`.

## Done When

- The V1 talk diagnostics checklist item is marked complete.
- The V1 memory summary/refresh checklist item is marked complete.
- `npm run v1:status` reflects the updated count.

## Verification

- `npm run v1:status`
- `node scripts/build_tasks_md.mjs --write`
- `git diff --check`

Existing code evidence:

- `them/RootExperienceView.swift` presents `TalkDiagnosticsSheet`.
- `them/TalkDiagnosticsSheet.swift` renders stats, errors, refresh state, and
  safe-public posture.
- `them/DataControlsScreen.swift` renders memory shape summary and refresh time.
- `themTests/BackendTalkDiagnosticsTests.swift` covers `/talk/stats`,
  `/talk/errors`, and `/memory/stats` decoding.

Not run: iOS build/themTests, because this only updates V1 status for already
merged and tested surfaces.
