---
id: T-memory-quality-eval
title: Multi-turn creative-memory recall eval
owner: claude
status: review
branch: claude/T-memory-quality-eval
pillar: evals (layer-3-living)
---

## Scope

`run_creative_memory_eval.mjs` covers the single-turn cold-vs-seeded
prompt-construction path. This PR adds a deeper eval —
`run_memory_quality_eval.mjs` — that simulates a multi-turn session
and asserts the *recall* loop closes across turns:

- Turn 1 (cold) emits a prompt with no `<creative_memory>` block.
- Turn 2 (after recording a character) emits a prompt that mentions
  that character.
- Turn 3 (after a tone signal) emits a prompt carrying both the
  character and the tone.
- Turn 4 updates the character's voice trait; that trait surfaces in
  the assembled prompt.
- Turn 5 adds a second character; both are present in the prompt and
  the new tag flows through.
- Bonus scenarios: per-user isolation (no leak between userIds) and
  determinism (same state + input → same prompt string).

Deterministic, no LLM. Exits non-zero on any failure so the existing
eval-gate hooks can pick it up. Exposed via `npm run eval:memory-quality`.

## Done when

`backend/evals/run_memory_quality_eval.mjs` exits 0 with all checks
passing; `backend/package.json` exposes `npm run eval:memory-quality`;
`npm test` still green.
