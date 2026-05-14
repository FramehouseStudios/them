---
id: T71
title: Add agent throughput protocol and next-action CLI
owner: codex
status: merged
branch: codex/T71-agent-throughput
pillar: infra (enables all)
---

## Scope

Reduce coordination drag between Codex, Claude, and the human by
codifying the working-speed rules and adding a repo-native next-action
command.

This task adds:

- A concise throughput protocol: WIP limits, merge-train batching,
  blocker-first rule, and ready-for-iOS label semantics.
- A script that prints the next top Codex and Claude actions from
  `docs/coordination.json`.
- Handoff updates so both agents can self-start from the repo instead
  of relying on human copy/paste.

## Done when

The protocol is documented, `AGENTS.md` points to it, the CLI can print
top Codex/Claude actions and JSON output, tests cover prioritization,
and the new flow is referenced from the handoff docs.
