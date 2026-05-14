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

Supplier reference is now passed through accessor + setter so
failover can rotate the live supplier without freezing it at
mount time:

```js
mountRealtimeClientSecretRoute(app, {
  getRealtimeSupplier: () => realtimeSupplier,
  setRealtimeSupplier: (s) => { realtimeSupplier = s; },
  ...
});
```

The stub-supplier lazy-loader stays in index.js (passed in as
`loadStubSupplier`) to avoid creating a circular import.

## V1 pillar / effect

- `V1 pillar: realtime`
- `V1 effect: closes prerequisite for "Realtime route
  decomposition lands before talk-pipeline Phase 7" — the heaviest
  realtime route now lives in its own testable lib.`

## Verification

- `node --test backend/tests/realtime_client_secret_route.test.mjs`
  → **11/11 pass** (CLIENT_SECRET_BODY_LIMIT, mount guards × 11
  deps, primary_ok, primary_fail_fallback_ok with supplier
  rotation pushback, primary_fail_fallback_fail, pinned_provider_fail,
  supplier_load_fail unknown_provider, invalid mint payload,
  live-supplier accessor pattern, Cache-Control: no-store).
- `node --check backend/index.js` passes.
- `backend/index.js` shrinks by 117 net lines (149 inline →
  32 mount call). index.js is now 32,460 lines.

## Done when

Inline `POST /realtime/client_secret` no longer in index.js; lib
file exists with tier-3 posture documented; 11/11 tests pass;
4-path failover behavior preserved; supplier rotation propagates
via `setRealtimeSupplier` accessor.

## Next phase

Phase 5b.2: extract `/realtime/studio_render` +
`/realtime/studio_render_stream`. Gated on this PR merging per
spec.
