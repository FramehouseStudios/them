---
id: T61
title: Refresh coordination after T60 merge
owner: codex
status: merged
branch: codex/T61-post-t60-coordination-refresh
pillar: mobile-first + infra
---

## Scope

PR #137 merged T60, so the repo-native coordination lane needs to stop
showing the export formats picker as review work and should keep support agent's
current blockers precise.

## Done when

`TASKS.md`, `docs/coordination.json`, `docs/live-handoff.md`,
`docs/support-inbox.md`, and `docs/codex-inbox.md` reflect PR #137/T60
merged; PR #133/#134 blockers are current; prompt printers and
coordination-state checks are green.
