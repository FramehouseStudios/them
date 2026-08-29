---
id: T146
title: Run V1 launch smoke and release preflight pass
owner: codex
status: review
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

- `scripts/run_release_preflight.sh` failed before preflight because
  `them/Release.local.env` is missing.
- At that historical run, `scripts/appstore_preflight.sh` failed with
  `fail=3 warn=1` for the then-unset Development Team, backend, and token
  inputs. The current contract fixes the hosted backend at
  `https://api.them.io` and names the remaining token secret
  `APP_TOKEN_RELEASE`.
- `cd backend && npm run eval:v1-smokes` passed all four deterministic V1
  smokes.
- `env TEST_SPAWN_BACKEND=1 node --test tests/talk.integration.test.mjs`
  passed 6/7 with one expected skip after local loopback binding was allowed.
- `node --test scripts/v1_manual_qa_checklist.test.mjs` passed 4/4.
- `node --test scripts/v1_launch_room.test.mjs` passed 5/5.
- `cd backend && npm run v1:status` reported 20/25.
- `node scripts/v1_launch_room.mjs --role=codex` and `--role=human` both
  reflected the updated launch state.
- `gh pr list --state open` showed only PR #33 open at the time. T152 later
  cleared the human-secret blocker and reclassified #33 as a Claude-owned
  eval-quality repair.
- `docs/v1-launch-doctor.latest.json/.md` was regenerated with truthful
  blocked manual-smoke evidence.
