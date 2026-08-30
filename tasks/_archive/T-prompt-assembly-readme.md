---
id: T-prompt-assembly-readme
title: README for backend/lib/prompt_assembly.js
owner: support
status: merged
branch: support/T-prompt-assembly-readme
pillar: docs (prompt-stability)
---

## Scope

`buildModelPrompt()` is the single load-bearing entry point for
every model-bound prompt. Today its canonical layout (block order,
field set, tag names) is documented only in the function's source
comments and pinned by a handful of evals (PR #105, #110, #112,
#141). New contributors have to read the source to know that the
order is load-bearing and which evals will fail loudly if it
changes.

This PR adds `backend/lib/prompt_assembly.README.md` co-located
with the source, covering:

- The canonical block order (literal layout).
- Each field's source-of-truth (creative_memory_store,
  block_detector).
- The full table of pinned invariants and which PR pins each.
- The change-the-layout checklist (update snapshot eval +
  this README + bump SCHEMA_VERSION if shape change).

Docs-only. No code change.

## Done when

`backend/lib/prompt_assembly.README.md` exists and accurately
describes the layout and pinned invariants of the current
`buildModelPrompt` on main.
