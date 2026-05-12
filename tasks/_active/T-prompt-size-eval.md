---
id: T-prompt-size-eval
title: Char-budget guard on assembled model prompts
owner: claude
status: review
branch: claude/T-prompt-size-eval
pillar: evals (layer-2-craft)
---

## Scope

Pins explicit upper bounds on the character length of prompts
produced by `buildModelPrompt()`, in three regimes:

- cold user (no memory)               <  2,000 chars
- light user (1 character + tone)     <  4,000 chars
- heavy user (50 characters + tone +
  habits + session ctx + coaching)    < 12,000 chars

Today these budgets are honored implicitly via `serializeCharacters`'s
top-8 cap. If a future change removes the cap, expands per-character
serialization, or introduces an unbounded section, this eval fails and
forces an explicit decision rather than silent token-budget creep.

Includes determinism checks (same store + input → same prompt size).
No LLM; deterministic and fast.

## Done when

`backend/evals/run_prompt_size_eval.mjs` exits 0 with all checks
passing; `npm run eval:prompt-size` works; `npm test` still green.
