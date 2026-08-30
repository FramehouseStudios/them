---
id: T-decompose-phase6-1-long-tail-design
title: Phase 6.1 design note — long-tail single-domain clusters
owner: support
status: proposed
target_pr: none yet (gating note; sub-phases open only after Codex accepts)
pillar: infra (backend architecture)
v1_pillar: infra
v1_effect: infrastructure for "Talk pipeline route decomposition has a design note before Phase 7 code" + final-sweep <500 line target
---

## Scope

After Phase 5b (5 realtime routes) and Phase 6 (6 memories routes)
land, the long-tail single-domain inline clusters remain. This
note proposes 5 sub-phases — one per cluster — to be opened
serially as the merge train clears.

This is a **design note**. No code opens until Codex signs off.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for "Talk pipeline route decomposition
  has a design note before Phase 7 code" — Phase 7 cannot land
  cleanly until the surrounding long-tail routes are out of
  index.js, otherwise Phase 7's diff includes incidental churn
  that obscures review. Also infrastructure for the final-sweep
  <500-line target in docs/specs/T-decompose-backend-index.md.`

## Audit (against current main after #224 lands)

| Prefix | Live | Method-guards | Target lib | Cluster size |
| --- | --- | --- | --- | --- |
| `/outbox` | 2 | 2 | `lib/outbox_routes.js` | ~80 lines |
| `/data` | 2 | 2 | `lib/data_routes.js` | ~90 lines |
| `/history` | 2 | 2 | `lib/history_routes.js` | ~75 lines |
| `/tasks` | 2 | 2 | `lib/tasks_routes.js` | ~70 lines |
| `/recap` | 2 | 2 | `lib/recap_routes.js` | ~65 lines |
| `/secretary` | 2 | 2 | `lib/secretary_routes.js` | ~70 lines |
| `/session` | 2 | 1 | `lib/session_routes.js` | ~50 lines |
| `/state` | 1 | 1 | `lib/state_route.js` | ~140 lines (single big handler) |
| `/linkedin` | 1 | 1 | `lib/linkedin_routes.js` | ~80 lines |

13 live routes total, ~720 lines of inline body to extract. Plus
9 method-guards in the same clusters.

`/screenplay/export` and `/visual/context` are deliberately not in
6.1 — they pair with Phase 5b.2 (studio_render) and Phase 6
respectively.

## Sub-phasing — 5 sub-PRs, sequential

Group small related clusters into one PR; keep the heavy
single-cluster ones standalone.

### Phase 6.1a — `/outbox/*` + `/data/*` + `/state`

Target: 3 small libs (`outbox_routes.js`, `data_routes.js`,
`state_route.js`). One PR; 5 routes; ~310 lines.

**Why grouped**: each is small. `/outbox` + `/outbox/retry` share
the scaleBackplane outbox helpers. `/data/history/clear` +
`/data/memory/clear` share the memory + history reset helpers.
`/state` is the heaviest single handler (~140 lines) but it has
minimal cross-cluster deps.

**V1 effect**: infrastructure for the final-sweep target.

### Phase 6.1b — `/history/*` + `/tasks/*` + `/recap/*`

Target: 3 small libs. One PR; 6 routes; ~210 lines.

**Why grouped**: all three are read-mostly with similar shape —
list + per-id endpoints over the persisted session memory's
sub-collections.

**V1 effect**: infrastructure.

### Phase 6.1c — `/session/*`

Target: `lib/session_routes.js`. One PR; 3 routes; ~50 lines.

**Why standalone**: the session routes touch session lifecycle
(create / read / end), which intersects with talk-pipeline state.
Keeping it separate lets Phase 7 reference its design without
amending it.

**V1 effect**: infrastructure for Phase 7 (the talk handler reads
session state).

### Phase 6.1d — `/secretary/*` + `/linkedin/*`

Target: 2 libs. One PR; 3 routes; ~150 lines.

**Why grouped**: both are LLM-backed analysis endpoints with very
similar shape — accept a long-form text payload, return a
structured summary. They share the OpenAI call helpers and the
prompt-truncation utilities.

**V1 effect**: infrastructure.

### Phase 6.1e — method-guards sweep

Target: `lib/method_not_allowed_routes.js`. One PR; ~50 method-guards.

**Why last**: after Phases 4 / 5a / 5b / 6 / 6.1a-d, most live
routes are out of index.js. The remaining method-guards
(`app.all("/...", methodNotAllowed("..."))`) are mechanical and
can be moved as a single sweep into one lib that exposes a
`mountMethodGuards(app, { methodNotAllowed, routes: [...] })`.

**V1 effect**: closes the audit gap; readies Phase 8 (final sweep
to <500 lines).

## Cross-cutting invariants every sub-phase preserves

1. **Mount order**: each sub-phase preserves the inline mount
   order. Express routes the first match.
2. **Body parser limits**: match inline exactly per route.
3. **Response envelopes**: zero shape change. Schema docs follow
   in separate PRs (`docs/schemas/`).
4. **Access-control posture**: documented in each lib's module
   header. `/outbox` is SAFE-PUBLIC (ops surface). `/state`,
   `/history`, `/memories`-overlap, `/session`, `/recap`,
   `/tasks` are PER-USER. `/secretary`, `/linkedin` are PER-USER
   (no privacy upgrade in this PR).
5. **No new endpoints**, no new env vars, no new auth gates.

## What Phase 6.1 does NOT do

- No behavior changes.
- No talk-pipeline coupling (Phase 7).
- No memory write semantics changes (Phase 6).
- No realtime route changes (Phase 5b).

## What we need from Codex before opening any sub-phase

1. **Sign-off on the 5-sub-phase grouping**. If Codex prefers
   different groupings (e.g. one PR per cluster), the note
   amends.
2. **Sign-off on the 6.1e method-guards sweep**. The
   `mountMethodGuards` interface is novel; if Codex prefers
   per-lib method-guards (mounted in each route lib), the note
   amends.
3. **Coordination**: 6.1 opens after Phase 5b + Phase 6 finish.
   Or with explicit Codex sign-off that sub-phases can interleave.

## Rollback plan

Each sub-phase is independently revertable.

## After this design note

If accepted, sub-phases open one at a time. Each carries a small
per-sub-phase task file with its narrow V1 effect line.
