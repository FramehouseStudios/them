---
id: T109
title: Refresh V1 checklist after Phase 7 design and realtime decomposition
owner: codex
status: in-progress
branch: codex/T109-v1-status-refresh-after-decomp
pillar: infra
v1_pillar: infra
v1_effect: keeps docs/v1-definition.md aligned with merged decomposition work so the next product gaps are visible
---

## Scope

Update `docs/v1-definition.md` for V1 checklist items that are already true on
main: the Phase 7 talk design note landed before implementation, and realtime
route decomposition landed before Phase 7 talk work.

## Done When

- The talk Phase 7 design-note checklist item is marked complete.
- The realtime decomposition-before-talk checklist item is marked complete.
- `npm run v1:status` reflects the updated V1 count.

## Verification

- `npm run v1:status`
- `node scripts/build_tasks_md.mjs --write`
- `git diff --check`

Not run: iOS build/themTests or backend tests, because this is V1 status
documentation only.
