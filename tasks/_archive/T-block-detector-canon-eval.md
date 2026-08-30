---
id: T-block-detector-canon-eval
title: Pin block-detector envelope + SIGNAL_WEIGHTS + level thresholds
owner: support
status: merged
branch: support/T-block-detector-canon-eval
pillar: evals (contract stability)
---

## Scope

`computeBlockSignal()` is the entry point for the block-signal
envelope read by iOS T35 (nudge surface) and T53 (sparkline).
Renaming a level (`medium` → `mid`) or dropping a `SIGNAL_WEIGHTS`
key would silently regress both surfaces.

This eval pins:

- `BLOCK_SIGNAL_SCHEMA_VERSION === 1`
- `SIGNAL_WEIGHTS` is `Object.freeze`d, has exactly the 4 canonical
  keys (`scene_completion_gap`, `attempt_completion_dropoff`,
  `short_turn_ratio`, `talk_turn_gap`), and the values sum to 1.0.
- `LEVEL_LOW_MAX` and `LEVEL_MEDIUM_MAX` are in (0, 1) with
  `LEVEL_LOW_MAX < LEVEL_MEDIUM_MAX`.
- `computeBlockSignal({ habits: {}, nowMs })` returns the canonical
  envelope with `schemaVersion`, `score` ∈ [0,1], `level` ∈
  {low, medium, high}, `signals[]`, `summary`, `habitsObserved`.
- `buildBlockCoachingBlockForPrompt` returns empty string for
  null/low input, non-empty with `writer-coaching-note` marker
  for medium/high.

Wired via `npm run eval:block-detector-canon`.

## Done when

`backend/evals/run_block_detector_canon_eval.mjs` exits 0 with all
checks passing; `npm test` still green.
