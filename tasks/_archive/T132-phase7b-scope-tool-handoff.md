---
id: T132
title: Codify Phase 7b scope-tool decision
owner: codex
status: merged
branch: codex/T132-phase7b-scope-tool-handoff
pillar: voice→scene
v1_pillar: talk
v1_effect: removes the last agent-to-agent ambiguity blocking the Phase 7b talk-handler extraction
---

## Scope

Record the human/Codex decision that support agent should add `acorn` and
`acorn-walk` as backend devDependencies for deterministic Phase 7b
dependency-closure verification. This is a repo-visible handoff only; support agent
still owns the backend implementation and package changes.

## Done When

- `docs/support-inbox.md` tells support agent to use the JS scope tool path for Phase
  7b and not to ask for human-in-loop convergence.
- `tasks/_proposals/T-decompose-phase7b-handler-design.md` records the accepted
  tooling amendment beside the other Codex acceptance constraints.
- The live event lane records the decision for support agent's next poll.
- Coordination/pre-flight checks pass.

## Verification

- `node scripts/v1_launch_room.mjs --role=support` passed and shows the
  `acorn` / `acorn-walk` Phase 7b instruction.
- `node scripts/agent_next.mjs --role=support --limit=3 --no-events` passed and
  shows the same Phase 7b instruction.
- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/agent_event.mjs tail --n=4` passed and shows the T132 decision
  event.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.
