---
id: T-block-signal-atms-zero-fix
title: Honor atMs=0 in recordBlockSignalSample (falsy-coerce bug)
owner: claude
status: review
branch: claude/T-block-signal-atms-zero-fix
pillar: bugfix (creative-memory)
---

## Scope

`recordBlockSignalSample({ atMs: 0 })` silently substituted `nowMs()`
because the store did `Number(atMs) || nowMs()` — `0` is falsy.
Surfaced by the side finding in PR #120
(T-block-signal-history-bounds-eval).

Switch to `Number.isFinite()` so:

- Valid finite timestamps (including 0) are honored verbatim.
- `NaN`, `"not a number"`, `undefined`, `null` cleanly fall back to
  `nowMs()`.

Two regression tests added to `tests/block_signal_history.test.mjs`:

- `atMs=0` is honored verbatim
- non-finite `atMs` (NaN, non-numeric string) falls back to a sane
  positive timestamp

## Done when

`Number.isFinite()` gate replaces the falsy coercion in
`recordBlockSignalSample`; both regression tests pass; `npm test`
green.
