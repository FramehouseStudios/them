# Spec: T-backend-rate-limit

**Status**: implemented for the V1 launch lane.
**Owner**: claude (backend scope).
**V1 pillar**: infra (enables all)
**V1 effect**: closes a V1 production-readiness gap — today the
backend previously had no global rate limiting. A single misbehaving client (or
a malicious one) can exhaust the OpenAI budget or crash the
single-instance deployment.

## Problem

`backend/lib/talk_turn_rate_limit_route.js` rate-limits talk turn reads,
and the main `/talk` pipeline has its own guard. The V1 exposure lane now
also wires a shared limiter onto auth and paid-provider surfaces:
- `/auth/*` — anti-brute-force protection.
- `/realtime/client_secret`, `/realtime/call`, `/realtime/turn_commit`,
  `/realtime/studio_render`, `/realtime/studio_render_stream` — bounds
  realtime/provider cost.
- `/visual/context` — bounds visual-provider cost.

V1 will not survive even a curious user with a script.

## Scope

In:
- A reusable `lib/rate_limit.js` token-bucket limiter, in-memory,
  keyed by `(authenticated_user_id || ip, route_class)`.
- Per-route-class budgets (configurable via env), with sane defaults:
  - `auth`: 5 req / minute / ip (signup/login/password reset)
  - `realtime_mint`: 20 req / minute / user
  - `talk`: keep the existing helper, keyed by authenticated user when present
    and trusted Express `req.ip` otherwise
  - `default`: 120 req / minute / user
- 429 response with `Retry-After` header on limit.
- Exempt header for tests: `X-Test-Bypass-Rate-Limit` honored only
  when `NODE_ENV !== "production"`.

Out:
- Distributed rate-limiting (Redis-backed). V1 is single-instance; if
  scale-out happens, this becomes `T-rate-limit-redis-followup`.
- Global per-IP bans. Out of scope; the existing `applyAppMiddleware`
  already handles APP_TOKEN gating.

## Approach

Token-bucket per `(key, route_class)`:
- Bucket holds `N` tokens, refills at `N/window_ms` tokens per ms.
- Each request consumes 1 token; if bucket empty, 429.
- LRU bound on the bucket map (`RATE_LIMIT_MAX_KEYS`, default 50000).

API:
```js
const limiter = createRateLimiter({ buckets: { auth: {n:5, windowMs:60_000}, ... } });
app.post("/auth/signup", limiter.middleware("auth"), signupHandler);
```

`backend/index.js` sets `app.set("trust proxy", 1)`, and the shared limiter
uses Express `req.ip` rather than parsing raw `X-Forwarded-For` headers.

## Acceptance

- 5 successive POST /auth/signup from the same IP: first 5 return
  200/4xx; 6th returns 429 with `Retry-After: <seconds>`.
- After window expiry, next request succeeds.
- Unit tests for the bucket math (refill, drain, exhaustion, key
  isolation).
- Integration test wires limiter to a stub route and asserts the 429
  envelope shape.
- `NODE_ENV=test` honors `X-Test-Bypass-Rate-Limit: 1`.

## Risks

- A real user behind a NAT shares an IP with many users → false
  positives on auth limiter. Mitigation: keep auth limit generous
  (5/minute) and lean on user-id-keyed limits for everything else.
- In-memory state lost on restart → users get a "free" reset. For
  V1, this is acceptable; it just means the limiter is a politeness
  layer, not a security control.

## Implementation phases

1. **Phase 0**: `lib/rate_limit.js` + tests. No wiring.
2. **Phase 1**: Wire to `/auth/*` routes. Add integration test.
3. **Phase 2**: Wire to `/realtime/call`. Add integration test.
4. **Phase 3**: Wire to remaining routes via default bucket.

Phase 0 is a Claude-only PR (small, testable in isolation). Phases
1–3 can land in sequence or as a single follow-up PR once the
helper is reviewed.
