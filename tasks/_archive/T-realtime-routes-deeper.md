---
id: T-realtime-routes-deeper
title: Deeper integration tests for mountRealtimeRoutes
owner: support
status: merged
branch: support/T-realtime-routes-deeper
pillar: infra (test coverage)
v1_pillar: realtime
v1_effect: extends realtime_routes coverage with the edge cases the smoke skipped — V1 line 68 prerequisite stability
---

## Scope

Ships `backend/tests/realtime_routes_deeper.test.mjs` — 9
deeper tests beyond the existing 8 smoke tests.

### Targets

- **Shape mode edge cases**:
  - `healthy: false` propagation when probe says so.
  - Null supplier (none configured) still returns 200 with the
    canonical shape.
  - `recordedAt` is always present and ISO-8601-with-ms.
- **Deep mode edge cases**:
  - Unhealthy live probe + error envelope.
  - `probeSupplierLive` receives a positive `timeoutMs` option.
- **Cache rotation**:
  - Cache is keyed on supplier identity; rotating to a new
    supplier MISSES the cache; rotating back HITS.
- **Bridge HTML**:
  - `Content-Type: text/html` returned.
  - Body is exactly what `renderRealtimeBridgeHtml` returns
    (test injects a marker string).
- **Safe-public posture invariant**:
  - Even when the supplier carries extra fields (token, email)
    none leak into the response body.

## V1 pillar / effect

- `V1 pillar: realtime`
- `V1 effect: extends realtime_routes coverage with edge cases
  the smoke skipped. V1 line 68 ("Realtime route decomposition
  lands before talk-pipeline Phase 7") needs the read-only
  /realtime/health and /bridge surfaces to stay stable through
  the Phase 5b decomp chain.`

## Verification

```
node --test backend/tests/realtime_routes.test.mjs backend/tests/realtime_routes_deeper.test.mjs
```

→ 8 smoke + 9 deeper = 17/17 pass.

## Done when

`realtime_routes_deeper.test.mjs` ships and passes alongside the
existing smoke.
