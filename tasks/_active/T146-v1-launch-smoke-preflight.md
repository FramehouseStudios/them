---
id: T146
title: Run V1 launch smoke and release preflight pass
owner: codex
status: in-progress
branch: codex/T146-v1-launch-smoke-preflight
pillar: infra
v1_pillar: ios
v1_effect: attempts the real Launch Doctor/manual smoke/release-preflight lane and records exact pass/fail evidence for remaining V1 blockers
---

## Scope

Run the current V1 launch room path: release config check, release preflight,
manual-smoke/Launch Doctor evidence capture, and Claude handoff for any
concrete backend failure.

## Done When

- The release local config state is audited.
- `scripts/run_release_preflight.sh` has been run or is blocked with exact
  evidence.
- Launch Doctor docs are current for the smoke attempt.
- Claude's next action is concrete and does not invite net-new backend work.
- Verification commands are recorded.

## Verification

- Pending.
