---
id: T93
title: Round 22h coordination refresh
owner: codex
status: in-progress
branch: codex/T93-round22h-coordination-refresh
pillar: infra
v1_pillar: infra
v1_effect: records the schema-doc batch blocker so Claude can fix docs drift without human relay
---

## Scope

- Record PR #245 as blocked because the new outbox schema doc does not match
  the live `backend/lib/outbox_store.js` record shape.
- Append the live review-blocker event and refresh generated task state.

## Done when

`agent_next` points Claude at the schema-doc drift fix alongside #238/#243.

## Verification

- Not run yet.
