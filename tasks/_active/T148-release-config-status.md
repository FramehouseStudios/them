---
id: T148
title: Add safe release config status command
owner: codex
status: review
branch: codex/T148-release-config-status
pillar: infra
v1_pillar: ios
v1_effect: shortens the release-preflight loop by showing missing/placeholder local release values before signed preflight
---

## Scope

Add a non-secret-printing status command for `them/Release.local.env` and wire
the V1 launch room to show whether the release config file exists, has safe
permissions, and contains real-looking values for the three launch blockers:
`DEVELOPMENT_TEAM_ID`, `BACKEND_URL`, and `APP_TOKEN`.

## Done When

- A script reports release local config status without sourcing or printing
  secret values.
- The V1 launch room includes the release local config state.
- Tests cover missing file, placeholders, localhost backend rejection, and
  present values.
- Verification commands are recorded.

## Verification

- `node --test scripts/release_config_status.test.mjs` passed 5/5.
- `node --test scripts/v1_launch_room.test.mjs` passed 5/5.
- `node scripts/release_config_status.mjs` passed and reports the current
  missing `them/Release.local.env` without printing secrets.
- `node scripts/v1_launch_room.mjs --role=human` passed and now includes the
  release local config status line.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.
