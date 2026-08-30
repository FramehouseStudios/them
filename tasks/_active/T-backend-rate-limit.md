---
id: T-backend-rate-limit
title: Token-bucket rate limiter for auth, realtime mint, and default routes
owner: support
status: review
branch: support/backend-rate-limit-phase0
pillar: infra (enables all)
v1_pillar: infra
v1_effect: closes V1 production-readiness gap; today the backend has no global rate limiting beyond /talk, so a single misbehaving client can exhaust the OpenAI budget or DoS the single-instance deployment.
---

## Scope

Spec: `docs/specs/T-backend-rate-limit.md`. Phase 0 is the helper +
tests; subsequent phases wire it to `/auth/*`, `/realtime/call`, and
the default class.

## Progress

- Phase 0 DONE: `backend/lib/rate_limit.js` + 10 tests
  (`tests/rate_limit.test.mjs`) shipped. Token-bucket, route-class
  isolation, user-id-over-IP keying, LRU bound, production-ignores-bypass.
- Phase 1 (wire /auth/*), Phase 2 (/realtime/call), Phase 3 (default)
  pending.

## Done when

- `lib/rate_limit.js` exists, tested, with default budgets per route class. (done)
- /auth/signup returns 429 with `Retry-After` after 5 reqs/min/IP. (Phase 1)
- /realtime/call returns 429 after 20 reqs/min/user. (Phase 2)
- `NODE_ENV=test` honors `X-Test-Bypass-Rate-Limit`. (done in helper)
