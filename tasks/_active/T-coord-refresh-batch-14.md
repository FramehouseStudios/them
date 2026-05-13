---
id: T-coord-refresh-batch-14
title: Coord refresh — round 18 (track #192, #193, #194)
owner: claude
status: review
branch: claude/T-coord-refresh-batch-14
pillar: infra (coordination)
---

## Scope

Small batched coordination refresh covering the 3 PRs opened in this
session:

- #192 T-decompose-phase2a-screenplay-projects-reads (merged)
- #193 T-route-local-parsers (in review)
- #194 T-decompose-spec-update (in review)

Updates `docs/coordination.json` and `docs/codex-inbox.md` so Codex
sees these PRs as ready for tier-1 review.

## Done when

`node scripts/coordination_state.mjs validate` returns OK; #193 and
#194 show `status: review`; #192 shows `status: merged`; the inbox
"Current Open Claude PRs" table lists #193 and #194 as actionable.
