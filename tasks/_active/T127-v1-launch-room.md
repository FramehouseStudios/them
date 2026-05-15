---
id: T127
title: Add V1 launch-room command
owner: codex
status: in-progress
branch: codex/T127-v1-launch-room
pillar: mobile-first
v1_pillar: infra
v1_effect: gives Codex, Claude, and the human one fast command for current V1 options and ownership
---

## Scope

Convert the six-week execution plan into repo-native coordination: one command
that prints current V1 status, owner-specific next actions, and the smallest
set of human decisions/options that unblock launch.

## Done When

- `scripts/v1_launch_room.mjs` prints role-specific launch options.
- Tests cover JSON and role-specific output.
- `docs/v1-six-week-launch-plan.md` records the operating plan.
- Claude's inbox points Claude at the launch-room command before starting work.
- `TASKS.md` is regenerated.

## Verification

- Pending.
