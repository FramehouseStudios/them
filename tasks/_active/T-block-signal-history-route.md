---
id: T-block-signal-history-route
title: GET /memory/block-signal/history read endpoint
owner: claude
status: review
branch: claude/T-block-signal-history-route
pillar: layer-3-living (creative-memory surfaces)
---

## Scope

PR #103 (now merged) added `habits.block_signal_history` — a 30-entry
ring buffer of block-signal samples written on each
`GET /memory/block-signal` call. That endpoint also re-runs the
debounce + ring-buffer semantics on every poll, which is exactly
what a sparkline UI does *not* want.

This PR adds `GET /memory/block-signal/history`: a read-only
projection that returns the buffer plus a small summary envelope:

```json
{
  "schemaVersion": 1,
  "entries": [...],
  "counts": { "total": N, "byLevel": { "low": ..., "medium": ..., "high": ... } },
  "newestAt": ...,
  "oldestAt": ...
}
```

Pure read — does not append a sample. Unauthenticated → zero-state
envelope (matches the polling endpoint's posture).

## Done when

`GET /memory/block-signal/history` mounted in `backend/index.js`;
`backend/tests/block_signal_history_route.test.mjs` covers summarizer
+ endpoint integration + mount guards; `npm test` green.
