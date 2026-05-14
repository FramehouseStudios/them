---
id: T104
title: Refresh coordination after schema-only PR cleanup
owner: codex
status: in-progress
branch: codex/T104-schema-pr-cleanup-refresh
pillar: infra
v1_pillar: infra
v1_effect: records out-of-lane schema PR closures and keeps Claude focused on Phase 6 memories
---

## Scope

Refresh coordination after Codex closed out-of-lane schema-doc-only PRs and
merged the corrected Phase 7a talk-guard design note.

## Done When

- `docs/coordination.json` marks #287/#289/#291/#292/#294 closed and #293
  merged.
- `docs/codex-inbox.md` and `docs/codex-claude-live-handoff.md` record the
  cleanup.
- `docs/claude-inbox.md` still points Claude at Phase 6 memories as the next
  implementation task.
- Verification commands and intentionally skipped iOS checks are recorded.
