---
id: T-archetype-engine-canon-eval
title: Pin canonical archetype set + per-entry shape
owner: support
status: merged
branch: support/T-archetype-engine-canon-eval
pillar: evals (contract stability)
---

## Scope

`backend/lib/archetype_engine.js` exports the frozen `ARCHETYPES`
map. iOS (T48) reads the labels and renders archetype tags. A
silent rename (`hero` → `protagonist`) or drop of any archetype
would regress every iOS consumer at once.

This eval pins:

- The full canonical label set:
  `hero, mentor, shadow, trickster, ally, herald, threshold_guardian, shapeshifter`
- `ARCHETYPES` is `Object.freeze`d.
- Every entry has: `traitKeywords`, `emotionalDefaults`, `tags`,
  `relationshipFragments`, `minSceneShare`, `weight`.
- `traitKeywords` / `emotionalDefaults` / `tags` are non-empty arrays.
- `minSceneShare` ∈ [0, 1]; `weight` is a positive finite number.
- Labels are lowercase snake_case; `tags` arrays have no duplicates.

Wired via `npm run eval:archetype-canon`.

## Done when

`backend/evals/run_archetype_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.
