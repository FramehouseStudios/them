---
id: T-block-signal-history-bounds-eval
title: Pathological-input guard on the block-signal history buffer
owner: claude
status: review
branch: claude/T-block-signal-history-bounds-eval
pillar: evals (layer-3-living)
---

## Scope

PR #103 covers happy-path semantics of `recordBlockSignalSample` (ring
buffer, debounce, NaN coercion). This eval pounds the buffer with
pathological inputs:

- 1,000 alternating low/medium/high samples — ring buffer must still
  cap at 30 and preserve newest.
- 500 same-level polls inside the 60s window — debounce must hold;
  exactly 1 entry recorded.
- Boundary: delta=59,999ms blocks; delta=60,000ms releases.
- Missing / empty / undefined userId is a no-op (no record created).
- `NaN`, `+Infinity`, `-Infinity` scores all coerce to 0.
- Pounding userA does not leak into userB's buffer.

Wired via `npm run eval:block-signal-history-bounds`. No LLM, no I/O.

## Side finding

The boundary tests revealed that `recordBlockSignalSample({ atMs: 0 })`
silently substitutes `nowMs()` because the store does
`Number(atMs) || nowMs()` — `0` is falsy. Not fixed in this PR (out of
scope for an eval) but worth a follow-up that uses `Number.isFinite()`
explicitly. The eval works around the gotcha by anchoring fixtures at
`atMs=1000` instead of `0`.

## Done when

`backend/evals/run_block_signal_history_bounds_eval.mjs` exits 0 with
all checks passing; `npm run eval:block-signal-history-bounds` works;
`npm test` still green.
