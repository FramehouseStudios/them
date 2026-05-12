---
id: T-trait-library-canon-eval
title: Pin canonical TRAIT_KEYWORDS + cap constants
owner: claude
status: review
branch: claude/T-trait-library-canon-eval
pillar: evals (contract stability)
---

## Scope

`backend/lib/trait_library.js` exports `TRAIT_KEYWORDS` — the
frozen list of trait labels that `extractTraits` matches against.
Adding or removing a keyword changes how every character record
gets re-classified next time their traits merge. iOS surfaces
these labels directly. A silent change would silently re-classify
the user's entire character roster.

This eval pins:

- `TRAIT_KEYWORDS` is `Object.freeze`d.
- The exact canonical 23-keyword set (snapshot of main).
- Every keyword is lowercase a-z only.
- The structural caps `TRAIT_SCHEMA_VERSION`, `VOCAB_MAX`,
  `KEYWORD_MAX`, `GOALS_MAX`, `RELATIONSHIPS_MAX` are positive
  integers (or `=== 1` for the version).
- `extractTraits({lines:[]})` returns the canonical envelope shape
  with `vocabulary`, `keywords`, `goals`, `relationships`,
  `speech_style` fields.

Wired via `npm run eval:trait-library-canon`.

## Done when

`backend/evals/run_trait_library_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.
