---
id: T-event-lane-claude-cadence
title: Catch up Claude's agent-events.jsonl cadence
owner: claude
status: review
branch: claude/T-event-lane-claude-cadence
pillar: infra (coordination)
---

## Scope

Round-19 audit of `docs/agent-events-2026-W20.jsonl` found that
**every one of the 30 events in the current week's lane is from
Codex.** Claude never used the lane despite #175 (T-agent-events-
jsonl-live-lane) being merged and the protocol expecting both
agents to use it.

This PR appends 5 catch-up events for Claude's contributions to the
round-19 + round-20 trains (PRs #204, #205, #206, #207, #208) so
the lane reflects actual work, not just Codex's merge cadence.

Going forward, Claude should run:

```
node scripts/agent_event.mjs append --by=claude --kind=pr_opened --pr=<N> --comment="..."
```

after every PR open. The same shell snippet pre-checked-into the
operating protocol. This PR is a one-off retro patch; the protocol
correction is the lasting fix.

## Done when

`docs/agent-events-2026-W20.jsonl` carries the 5 catch-up events
(PRs #204–#208) attributed to Claude.

## Followup

Add an explicit reminder line to `AGENTS.md` / coordination docs:
"After opening a PR, append to the event lane:
`node scripts/agent_event.mjs append --by=claude --kind=pr_opened --pr=N --comment=...`"
