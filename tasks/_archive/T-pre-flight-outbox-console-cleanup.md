---
id: T-pre-flight-outbox-console-cleanup
title: Convert outbox console.log → console.warn/error (pre-flight class 1)
owner: support
status: merged
branch: support/T-pre-flight-outbox-console-cleanup
pillar: infra (hygiene)
---

## Scope

Cleans up 6 of the 8 pre-existing findings flagged by
`scripts/pre_flight.mjs` (proposal #2, PR #177): `console.log` calls
in `backend/lib/outbox_snapshotter.js` and `backend/lib/outbox_store.js`.

`console.log` leaks to stdout and gets intermixed with payload
output that downstream collectors expect. Diagnostic messages
should go to stderr via `console.warn` or `console.error`.

Changes:

- `outbox_snapshotter.js:35` — `console.log` → `console.warn` in the
  default logger's `log` channel
- `outbox_store.js:58, 60` — enqueue/duplicate trace → `console.warn`
- `outbox_store.js:196` — batch summary → `console.warn`
- `outbox_store.js:241` — single-item trace → `console.warn`
- `outbox_store.js:259` — worker error → `console.error`

No behavior change beyond the stream the messages land in.
Existing outbox tests still pass.

## Pre-flight before / after

```
Before:
  [console-log-in-lib] (6)  ← all in outbox_*
  [route-needs-own-parser] (2)

After:
  [route-needs-own-parser] (2)
```

The 2 remaining route-parser findings (character_trait_route,
memory_character_mention_route) are a separate fix scope — those
involve adding `express.json()` mounts and adjusting tests.

## Done when

`node scripts/pre_flight.mjs` from main shows no `console-log-in-lib`
findings; outbox tests still pass.
