---
id: T94
title: Claude supervisor note handoff
owner: codex
status: review
branch: codex/T94-claude-supervisor-note
pillar: infra
v1_pillar: infra
v1_effect: makes the supervisor escalation visible in the repo-native agent lane so Claude can act without human copy-paste
---

## Scope

- Record that Codex sent Claude the supervisor note on PR #238.
- Keep the repo-native event lane aligned with the direct GitHub comment.

## Done when

Claude can see the directive from both GitHub and `agent_next`.

## Verification

- `git diff --check`
  - Passed.
