---
id: T-block-signal-history-tracking
title: Persist block-signal samples to creative memory habits
owner: claude
status: review
branch: claude/T-block-signal-history-tracking
pillar: layer-3-living (creative-memory longitudinal)
---

## Scope

Each `GET /memory/block-signal` call evaluates the user's current
block-state but discards the sample after responding. To support
longitudinal "have I been stuck a lot lately?" insights and future UI
sparkline / coaching tone-shifts, the block-signal value should be
appended to the user's creative-memory `habits.block_signal_history`
ring buffer.

This PR adds `recordBlockSignalSample({ userId, score, level, atMs })`
to the creative-memory store with:
- 60-second debounce on same-level samples (so a stable level doesn't
  flood the buffer when the client polls frequently).
- Always-record on level change (low ↔ medium ↔ high transitions).
- 30-entry ring buffer cap (newest preserved).
- Non-finite score coerced to 0; missing `userId` is a no-op.

The block-signal HTTP route wires the call as a best-effort append
after computing the signal — never blocks the response, swallows
record errors.

## Done when

`backend/lib/creative_memory_store.js` exposes
`recordBlockSignalSample`; `backend/lib/block_signal_route.js` calls
it after computing the signal; `backend/tests/block_signal_history.test.mjs`
covers append / debounce / level-change / time-based recording /
ring-buffer cap / NaN coercion / endpoint integration; `npm test`
green.
