---
id: T99-fix-auth-expected-action
title: Fix truncated auth-route coordination expected action
owner: codex
status: in-progress
branch: codex/T99-fix-auth-expected-action
pillar: infra (coordination)
v1_pillar: infra
v1_effect: repairs the #212 auth-route blocker action so Claude sees the full instruction instead of a truncated token
---

## Scope

Repair the T98 coordination refresh typo where the shell truncated the
structured `expected_action` for PR #212 to just `Claude`.

## Done when

`docs/coordination.json` again gives Claude the full #212 expected action:
rebase on current main after #273, rerun backend auth tests, and keep
`do-not-merge`/tier-3 until human auth-route clearance.
