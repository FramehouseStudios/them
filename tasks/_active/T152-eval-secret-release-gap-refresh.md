---
id: T152
title: Refresh eval-secret and release-gap state
owner: codex
status: in-progress
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
