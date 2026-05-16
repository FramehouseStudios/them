---
id: T132
title: Codify Phase 7b scope-tool decision
owner: codex
status: in-progress
branch: codex/T132-phase7b-scope-tool-handoff
pillar: voice→scene
v1_pillar: talk
v1_effect: removes the last agent-to-agent ambiguity blocking the Phase 7b talk-handler extraction
---

## Scope

Record the human/Codex decision that Claude should add `acorn` and
`acorn-walk` as backend devDependencies for deterministic Phase 7b
dependency-closure verification. This is a repo-visible handoff only; Claude
still owns the backend implementation and package changes.

## Done When

- `docs/claude-inbox.md` tells Claude to use the JS scope tool path for Phase
  7b and not to ask for human-in-loop convergence.
- `tasks/_proposals/T-decompose-phase7b-handler-design.md` records the accepted
  tooling amendment beside the other Codex acceptance constraints.
- The live event lane records the decision for Claude's next poll.
- Coordination/pre-flight checks pass.

## Verification

- Pending.
