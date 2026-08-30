---
id: T-prompt-assembly-block-signal-cap-eval
title: Cap on <block_signal> block size under pathological inputs
owner: support
status: merged
branch: support/T-prompt-assembly-block-signal-cap-eval
pillar: evals (prompt-stability)
---

## Scope

`buildBlockCoachingBlockForPrompt(signal)` injects a `<block_signal>`
block into the assembled prompt for `medium`/`high` levels. Today
the structure caps at the literal lines we emit; only
`signal.summary` is a free-form pass-through. If a future change
sources `summary` from an unbounded place (model rationale, telemetry
trace), the block can blow up.

This eval asserts:

- `null` / `undefined` / `low` signals → empty block (happy-path
  prompt unchanged).
- `medium` / `high` with a normal summary → block < 500 chars.
- `medium` / `high` with a 10k pathological summary → block < 12k
  chars (the summary is the only growth surface; this caps it).
- Assembled prompts with a normal block_signal block stay under
  4k chars; with a pathological summary, still under 24k.

Wired via `npm run eval:block-signal-block-cap`.

## Done when

`backend/evals/run_block_signal_block_cap_eval.mjs` exits 0 with all
checks passing; `npm test` still green.
