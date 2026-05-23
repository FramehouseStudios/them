---
id: T-ios-offline-outbox
title: iOS client outbox for offline-tolerant talk turns
owner: codex
status: ready
branch: -
pillar: talk
v1_pillar: talk
v1_effect: closes V1 talk-pipeline pillar promise that the app 'keeps the turn useful when the backend is slow, rate-limited, or temporarily offline'; today turns drop silently.
---

## Scope

Spec: `docs/specs/T-ios-offline-outbox.md`.

Durable client-side outbox actor that queues failed `/talk` POSTs and
retries them on app foreground + `NWPathMonitor` recovery. Visible UI
state for queued turns. Backend already exposes `/outbox` and
`/outbox/retry`; this is the missing client piece.

## Done when

- Airplane-mode → record turn → reconnect → turn lands without
  user intervention.
- Kill app while queue non-empty → relaunch → queue intact and drains.
- 4xx (non-retryable) → entry transitions to `parked` and is
  user-visible / user-deletable.
- Unit tests cover the state machine + backoff schedule.
