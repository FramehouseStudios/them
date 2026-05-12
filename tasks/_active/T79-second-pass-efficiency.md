---
id: T79
title: Codify second-pass agent efficiency protocol
owner: codex
status: in-progress
branch: codex/T79-second-pass-efficiency
pillar: infra (coordination)
---

## Scope

Turn Claude's second-pass efficiency proposal into durable repo behavior
without weakening D005, strict auto-merge, human-only policy gates, or the
no-direct-push-to-main rule.

## Done when

`docs/agent-throughput-protocol.md` records the adopt/modify/decline
matrix for the ten proposals; the protocol defines fast/heavy lanes,
spec-first parallel iOS/backend tracks, clearing-mode WIP, merge-train
cadence, and scratchpad boundaries; `agent_next` surfaces recent live events
from `docs/agent-events-*.jsonl`; optional structured blocker metadata is
documented and validated; and coordination/script tests pass.
