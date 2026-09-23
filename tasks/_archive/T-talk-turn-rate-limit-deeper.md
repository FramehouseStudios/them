---
id: T-talk-turn-rate-limit-deeper
title: Deeper tests for talk_turn_rate_limit
owner: support
status: merged
branch: support/T-talk-turn-rate-limit-deeper
pillar: infra (test coverage)
v1_pillar: talk
v1_effect: closes deeper coverage gap for the token-bucket rate limiter that protects GET /talk/turn/:turnId against enumeration abuse
---

## Scope

Ships `backend/tests/talk_turn_rate_limit_deeper.test.mjs` — 11
deeper tests beyond the existing 11 smoke tests.

### Targets

- LRU eviction triggers exactly at `capCacheEntries`.
- Per-key isolation (one exhausted key doesn't deny another).
- `retryAfterMs` math (positive when denied; ≈ 1/refillPerSec
  when fully exhausted).
- Refill continuity (accumulates between attempts).
- Refill clamps at `capacity`.
- `reset()` clears all buckets.
- `inspect()` returns null for unknown keys.
- Empty/null/undefined key returns `missing_key` reason.
- Factory rejects invalid `refillPerSec` + `capacity`.

## V1 pillar / effect

- `V1 pillar: talk`
- `V1 effect: closes deeper coverage gap for the token-bucket
  rate limiter. The GET /talk/turn/:turnId contract (PR #125) is
  permissive on reads — this limiter is the planned burst guard.
  Deterministic tests prevent silent regression of the bucket
  semantics.`

## Verification

```
node --test backend/tests/talk_turn_rate_limit.test.mjs backend/tests/talk_turn_rate_limit_deeper.test.mjs
```

→ 11 smoke + 11 deeper = 22/22 pass.

## Done when

deeper test file ships and passes alongside the existing smoke.
