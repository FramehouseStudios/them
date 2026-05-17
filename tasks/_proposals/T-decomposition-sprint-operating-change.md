---
id: T-decomposition-sprint-operating-change
title: Decomposition sprint — operating-model change to land index.js 28k → ~5k
owner: claude
status: proposed
target_pr: this PR (proposal only; needs Codex/human acceptance)
pillar: infra (backend architecture)
v1_pillar: infra
v1_effect: infrastructure — makes the index.js shrink finish at branch-merge speed instead of stalling; not net-new app behavior
---

## Why this exists

`backend/index.js` is **28,274 lines** (was ~33k; Phase 7b merged the
3,562-line talk handler). The "shrink to ~5k" goal is real and is the
end-state of `docs/specs/T-decompose-backend-index.md` — but it is a
**campaign of ~15–25 bounded PRs**, not one change. A single large
reduction of the V1 voice-to-page backbone is unreviewable,
unmergeable, and is the exact failure mode `DECISIONS.md` D003 was
created to prevent.

This session produced direct evidence of the real bottleneck:

- 3 decomposition/data-control PRs merged (#335 Phase 7b, #212 auth
  routes, #94 core-only export). The wins were **merges and
  decisions**, not volume.
- Branches that aged were catastrophic: #212 was 158 commits behind,
  #94 was 359. Re-deriving cost more than the original work; the #94
  IDOR was only caught because the staleness forced a deep re-review.
- The "20 moves" loop generated breadth while the binding constraint
  was Codex review/merge throughput + serialized human-gate latency.

**The limiter is not Claude's ability to move lines. It is review
cadence, human-gate latency, and the rebase tax of long-lived
branches against a moving monolith.** Maximizing diff size makes
completion slower, not faster.

## Proposal

Adopt a bounded **decomposition sprint** with these rules, in force
only while the sprint is active:

1. **Monolith feature-freeze.** While the sprint runs,
   `backend/index.js` accepts **only** extraction PRs — no feature
   edits land in it. Phases then stack back-to-back without
   cross-conflicts. (Feature work continues elsewhere in `backend/`.)

2. **Small WIP, enforced.** ≤2 open Claude PRs at any time. No new
   decomposition phase opens until the prior one merges. Any branch
   that falls >10 commits behind `main` is **re-derived, not
   rebased** (proven cheaper this session on #212/#94).

3. **Fast-lane contract + Codex review SLA.** An extraction PR that
   follows the proven pattern — one phase, byte-identical body,
   `mount<X>(app, deps)` / factory, required-deps guard,
   acorn-closure-proven boundary, `pre_flight --strict` clean,
   focused tests + full `npm test` green — is fast-lane. Codex
   reviews/merges it within one batch cycle. Latency
   (`ready-for-review → merged`) is surfaced on the event lane so
   the real bottleneck stays visible.

4. **Deterministic closure as a gate.** `backend/tools/freevars.mjs`
   (the acorn lexical-scope tool built in 7b) runs in `pre_flight`
   for every extraction PR. Dep-boundary completeness is enforced
   mechanically, never hand-maintained or "convergence by tests".

5. **Batched human gates.** Human decisions (auth / privacy / secret
   / release-config) are cleared in one periodic gate-review session
   off `docs/memory-export-delete-decision-packet.md` and the
   decisions-queue — not N separate pings. The human is the scarcest
   resource; serialize their attention into one pass.

6. **V1-critical paths keep their human-smoke gate.** Talk-path
   extractions (7c and any handler-touching phase) still require the
   human voice-record-and-playback smoke before merge. The sprint
   speeds cadence; it does not weaken the V1 safety gate.

## Roadmap (28,274 → ~5,000)

Remaining bounded phases, each its own fast-lane PR:

- **Phase 7c** — STT/chat/TTS supplier glue → `lib/talk_supplier_glue.js`
  (~600 lines; design: the 7c design note must land first, like #314
  did for 7b).
- **Phase 6.1** — long-tail route group
  (`tasks/_proposals/T-decompose-phase6-1-long-tail-design.md`).
- **Remaining ~74 inline route handlers** → ~6–10 per-domain route
  libs (one domain per PR).
- **The ~14k-line talk-pipeline / helper clusters** → several
  phases (the bulk).
- **Phase 8 sweep** — residual wiring.

Honest framing: this is **relocation, not compression**. Total repo
LOC does not drop — logic moves out of the monolith into small,
tested, injectable libs. `index.js` ends as ~5k of imports, mount
calls, and config wiring. Behavior stays byte-identical at every
step. Anyone expecting 28k of logic to become 5k of logic is asking
for a rewrite of the V1 backbone — explicitly **out of scope**.

## What this proposal needs

Per AGENTS.md, Claude flags the decision; it does not author the ADR.
This note + the decisions-queue entry `D-decomposition-sprint`
request that **Codex propose a `DECISIONS.md` ADR and the human
accept** the sprint operating change. Until accepted, the safe
default is the status quo (ad-hoc per-phase cadence — slower,
conflict-heavy, but no protocol change).

## Done when

A `DECISIONS.md` ADR records the sprint operating change (or rejects
it), and — if accepted — the fast-lane contract + SLA + freeze are
referenced from `AGENTS.md` / `docs/agent-throughput-protocol.md`.
