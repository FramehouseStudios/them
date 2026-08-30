---
id: T-decompose-backend-index
title: Decompose 33k-line backend/index.js into per-domain route libs
owner: support
status: merged
branch: support/T-decompose-backend-index
pillar: infra (velocity-at-scale)
---

## Scope

Spec PR for the multi-phase decomposition of `backend/index.js`
(currently 33,071 lines). Full plan in
`docs/specs/T-decompose-backend-index.md`.

Per the spec-first protocol (proposal #3 from the second-pass
efficiency protocol Codex accepted): no implementation PRs open
until Codex approves the phasing + safety mechanisms.

## Surface area

- `docs/specs/T-decompose-backend-index.md` — full plan (8 phases,
  safety mechanisms, anti-goals, open questions)
- `tasks/_active/T-decompose-backend-index.md` — this file

No code change in this PR. The first concrete extraction (`/health`
+ `/bridge` → `lib/health_route.js`) ships as a separate proof-of-
concept PR sized so reviewers can verify the strategy on a tiny
diff before approving larger phases.

## Done when

Codex signs off on phasing + opens follow-up tasks for phases 1–7
in `tasks/_active/` (one per phase). Spec lives on main as the
canonical reference.
