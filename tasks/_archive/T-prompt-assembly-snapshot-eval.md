---
id: T-prompt-assembly-snapshot-eval
title: Pin canonical buildModelPrompt block order
owner: claude
status: merged
branch: claude/T-prompt-assembly-snapshot-eval
pillar: evals (layer-2-craft)
---

## Scope

`buildModelPrompt()` concatenates labelled blocks in the canonical
order: `persona → <creative_memory> → <session> → <block_signal> →
userInput`. Several downstream concerns depend on that order
(model attention behavior, the prompt-regression baseline, iOS
prompt previews), but nothing pins it.

This eval runs `buildModelPrompt()` against a deterministic fixture
that exercises every block, then asserts the output equals a literal
expected string. A second check verifies the block tags appear in the
canonical order (defense in depth — catches structural drift even if
the literal string assertion is updated). Cold and memory-only
variants confirm optional blocks drop out cleanly.

Wired via `npm run eval:prompt-snapshot`. No LLM, no I/O.

## Done when

`backend/evals/run_prompt_assembly_snapshot_eval.mjs` exits 0;
`npm run eval:prompt-snapshot` works; `npm test` still green.
