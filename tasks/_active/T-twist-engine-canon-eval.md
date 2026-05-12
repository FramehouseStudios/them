---
id: T-twist-engine-canon-eval
title: Pin TWIST_LIBRARY framework set + per-twist field shape
owner: claude
status: review
branch: claude/T-twist-engine-canon-eval
pillar: evals (contract stability)
---

## Scope

`backend/lib/twist_engine.js` ships `TWIST_LIBRARY`: a frozen map
of `framework → beat → ordered list of twist seeds`. iOS T37 reads
these seeds and renders twist cards. Each twist `id` is documented
as "stable so iOS can dedupe / pin / dismiss" — silently renaming
or dropping an ID would drop every user's stored "pinned" /
"dismissed" state.

This eval probes every `(framework, beat)` pair via the public
`suggestTwists()` API and pins:

- Canonical framework set: `save-the-cat`, `three-act`,
  `story-circle`, `hero-journey`.
- Beats per framework match the on-main set.
- Every twist has `id`, `label`, `hook`, `severity`, `rationale`.
- `severity ∈ {low, medium, high}`.
- All 42 twist IDs are unique across the library.
- Unknown framework throws a typed error.

Wired via `npm run eval:twist-engine-canon`.

## Done when

`backend/evals/run_twist_engine_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.
