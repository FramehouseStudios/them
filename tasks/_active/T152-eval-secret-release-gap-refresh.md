---
id: T152
title: Refresh eval-secret and release-gap state
owner: codex
status: review
branch: codex/T152-clear-eval-secret-and-release-gap
pillar: infra
v1_pillar: ios
v1_effect: clears the stale human OpenAI-secret blocker and records the current release/manual-smoke blockers truthfully
---

## Scope

Update the V1 launch coordination state after the GitHub Actions
`OPENAI_API_KEY` secret was replaced and PR #33 reran. The secret is no longer
the blocker; the remaining #33 blocker is eval quality. Keep the release
preflight/manual smoke gap honest: real release values and signing identities
are still absent locally.

## Done When

- `TASKS.md`, `docs/coordination.json`, and agent handoff docs no longer call
  PR #33 a human OpenAI-secret blocker.
- Claude has the precise #33 eval-quality fix target, while Phase 6.1a remains
  the next backend lane after #33.
- Launch/release docs record the current release config and signing state
  without committing secrets.
- Coordination validation, strict pre-flight, release-config status, launch
  room, and diff checks pass.

## Verification

- `gh pr view 33 --json number,title,headRefName,labels,statusCheckRollup,url`
  showed only the `tier-3` label after Codex removed `needs-human`.
- `gh run rerun 25639774344` reran PR #33's eval gate after the human replaced
  the Actions secret.
- `gh run view 25639774344 --job 76427140588 --log` showed
  `OPENAI_API_KEY: ***`, proving the GitHub secret is now present.
- PR #33 still failed `eval:gate against Postgres` because
  `knowledge_art_history`, `knowledge_philosophy`, `knowledge_learning_science`,
  and `playful_banter_humor` missed case minima.
- `scripts/run_release_preflight.sh` failed before preflight because
  `them/Release.local.env` is missing.
- `scripts/appstore_preflight.sh` failed with `fail=3 warn=1`: missing
  Development Team, Release `BACKEND_URL`, and Release `APP_TOKEN`.
- `security find-identity -v -p codesigning` reported `0 valid identities
  found`.
- `node scripts/release_config_status.mjs` reported missing local release
  config without printing secrets.
- `cd backend && npm run v1:status` reported V1 at 20/25.
- `node scripts/agent_next.mjs --role=claude --no-events` now points Claude at
  PR #33's eval-quality repair before Phase 6.1a.
- `node scripts/v1_launch_room.mjs --role=claude` now names "Fix PR #33
  eval-quality failures" as Claude's launch option.
- `node scripts/v1_launch_room.mjs --role=codex` reports human-gated PRs:
  `none`, Launch Doctor `not_started`, release config missing, and preflight
  `fail=3 warn=1`.
- `node --test scripts/agent_next.test.mjs scripts/v1_launch_room.test.mjs
  scripts/release_config_status.test.mjs scripts/v1_launch_doctor_report.test.mjs
  scripts/coordination_state.test.mjs scripts/coordination_state_schema_check.test.mjs`
  passed 23/23.
- `node scripts/pre_flight.mjs --strict` passed.
- `node scripts/tasks_active_frontmatter_eval.mjs --strict` passed.
- `node scripts/coordination_state.mjs validate` passed.
- `git diff --check` passed.
