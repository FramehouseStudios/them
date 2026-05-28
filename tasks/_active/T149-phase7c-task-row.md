---
id: T149
title: Add Phase 7c implementation task row for Claude
owner: codex
status: review
branch: codex/T149-phase7c-task-row
pillar: infra
v1_pillar: talk
v1_effect: removes the protocol blocker between the merged Phase 7c design note and Claude's talk supplier-glue implementation
---

## Scope

Add the authoritative active-task row that lets Claude start the approved
Phase 7c talk supplier-glue implementation without waiting on another human
copy/paste handoff.

## Done When

- `tasks/_active/` contains a Claude-owned Phase 7c implementation row with
  exact branch, scope, constraints, and verification requirements.
- `TASKS.md` is regenerated so `agent_next` and task readers agree that Phase
  7c is ready for Claude.
- The live handoff/inbox remains pointed at Phase 7c and does not invite
  side quests while release secrets are human-blocked.
- Verification commands are recorded.

## Verification

- `node scripts/agent_next.mjs --role=claude --limit=5 --no-events` routes
  Claude to `T-decompose-phase7c-talk-supplier-glue` first.
- `node scripts/coordination_state.mjs validate` passed.
- `node --test scripts/tasks_active_frontmatter_eval.test.mjs` passed 2/2.
- `node scripts/tasks_active_frontmatter_eval.mjs --strict` passed.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.
