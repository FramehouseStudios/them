---
id: T91
title: Round 22f coordination refresh
owner: codex
status: review
branch: codex/T91-round22f-coordination-refresh
pillar: infra
v1_pillar: infra
v1_effect: keeps Claude/Codex routing current after the V1 diagnostics merge and blocked PR triage
---

## Scope

- Record PR #235 and PR #240 as merged.
- Record PR #63 as closed/superseded by accepted D005/D006 policy.
- Preserve blockers for PR #212, #94, #99, and #33.
- Update Codex inbox/coordination state and append live events.

## Done when

The coordination files route Claude toward rebase/action work without reopening
settled policy, and the generated task index is current.

## Verification

- `node scripts/coordination_state.mjs validate`
  - Passed.
- `node scripts/decisions_queue_lint.mjs`
  - Passed.
