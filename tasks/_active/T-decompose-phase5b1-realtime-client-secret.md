---
id: T-decompose-phase5b1-realtime-client-secret
title: Decompose backend/index.js — Phase 5b.1 (POST /realtime/client_secret)
owner: claude
status: review
branch: claude/T-decompose-phase5b1-realtime-client-secret
pillar: infra (backend architecture)
v1_pillar: realtime
v1_effect: closes prerequisite for "Realtime route decomposition lands before talk-pipeline Phase 7" (docs/v1-definition.md line 68) — extracts the heaviest realtime route into its own lib.
---

## Scope

First sub-phase of Phase 5b per #227's design note. Extracts the
supplier mint + failover state machine into `backend/lib/realtime_client_secret_route.js`.

Behavior is byte-identical with the inline handler. The 201
envelope, the 4 error paths, the fallback semantics (fallback,
fallback_reason, primary_supplier), and the canonical error codes
(`realtime_supplier_unavailable`, `realtime_supplier_request_failed`,
`realtime_supplier_response_invalid`, `supplier_fallback_failed`,
`realtime_supplier_unknown_provider`) all match the inline source.

Supplier reference is passed through an accessor function so the
route reads the current value at request start (and not a frozen
mount-time binding):

```js
mountRealtimeClientSecretRoute(app, {
  getRealtimeSupplier: () => realtimeSupplier,
  ...
});
```

Per-request failover rotation stays request-local. The route does
NOT call back into a setter to persist the rotated supplier — see
the "Review-blocker history" section below.

The stub-supplier lazy-loader stays in index.js (passed in as
`loadStubSupplier`) to avoid creating a circular import.

## V1 pillar / effect

- `V1 pillar: realtime`
- `V1 effect: closes prerequisite for "Realtime route
  decomposition lands before talk-pipeline Phase 7" — the heaviest
  realtime route now lives in its own testable lib.`

## Verification

- `node --test backend/tests/realtime_client_secret_route.test.mjs`
  → **12/12 pass**. The 4 happy/error mint paths, mount guards
  for 10 required deps (setRealtimeSupplier dropped), live-
  supplier accessor pattern, Cache-Control: no-store, **plus a
  new #238-regression test** that asserts the module-level
  supplier is NOT mutated by a fallback rotation.
- `node --check backend/index.js` passes.

## Done when

Inline `POST /realtime/client_secret` no longer in index.js; lib
file exists with tier-3 posture documented; 12/12 tests pass;
4-path failover behavior preserved request-locally; no module-
level supplier mutation from the extracted route.

## Review-blocker history (#238)

Codex blocked the initial extraction because the lib called
`setRealtimeSupplier(supplier)` at the end of the handler,
persisting failover rotation back to module-level state. The
original inline handler's `supplier` variable was a request-
local `let` — it never wrote rotation back. The setter call was
a real behavior change, not a byte-identical extraction.

**Fix in this revision:**
- Removed the `setRealtimeSupplier` dep + write-back from
  `backend/lib/realtime_client_secret_route.js`.
- Removed the corresponding dep from
  `backend/index.js`'s mount call.
- Updated the module header to document the constraint and
  reference this blocker.
- Removed the stale `setRealtimeSupplier` mock + assertion from
  the existing tests.
- Added a new regression test `#238 regression: failover rotation
  does not persist across requests` that closes over the live
  supplier in the test scope and asserts it is NOT replaced after
  a fallback. If a future change re-introduces a setter call,
  this test fails.

The route now matches the inline source line-by-line in supplier-
rotation scope.

## Next phase

Phase 5b.2: extract `/realtime/studio_render` +
`/realtime/studio_render_stream`. Gated on this PR merging per
spec.
