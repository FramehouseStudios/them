---
id: T116
title: Refresh support agent handoff after Phase 7b design acceptance
owner: codex
status: merged
branch: codex/T116-phase7b-design-accepted-refresh
pillar: infra
v1_pillar: talk
v1_effect: unblocks the Phase 7b talk-handler implementation with accepted constraints
---

## Scope

Record the Codex acceptance constraints directly in the Phase 7b proposal,
update `docs/support-inbox.md` so support agent's next backend move is implementation,
and emit a coordination event.

## Done When

- Phase 7b proposal contains the accepted Codex amendments.
- support agent inbox priority 1 is Phase 7b implementation, not another design note.
- `agent_next` shows Phase 7b implementation as support agent's next action.
- `TASKS.md` is regenerated.

## Verification

- `node scripts/build_tasks_md.mjs --write`
- `node scripts/agent_next.mjs --role=support --limit=5 --no-events`
- `node scripts/pre_flight.mjs --strict`
- `git diff --check`

Not run: iOS build/themTests or backend npm test, because this is
coordination/spec metadata only.
