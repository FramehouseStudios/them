---
id: T-talk-turn-rate-limit-helper
title: Pure token-bucket rate limiter for talk-turn reads
owner: claude
status: merged
branch: claude/T-talk-turn-rate-limit-helper
pillar: infra (talk pipeline)
---

## Scope

`GET /talk/turn/:turnId` is pinned as a contract (PR #125) but uses
a permissive read path: any caller can enumerate turn IDs at HTTP
throughput. We want a cheap per-key burst guard before a production
deploy.

This PR ships **the pure limiter only**, with no Express coupling.
A follow-up PR will mount it on the route once Codex reviews the
algorithm.

`backend/lib/talk_turn_rate_limit.js`:

- `createTalkTurnRateLimiter({ refillPerSec, capacity, capCacheEntries, nowFn })`
- Token bucket per key, refill rate R tokens/sec, capacity C.
- Deny with `{ allowed: false, reason: "rate_limited", retryAfterMs }`.
- LRU eviction at `capCacheEntries` (default 10,000) to bound memory.
- Missing/empty keys are rejected explicitly so unauthenticated traffic
  doesn't pool behind a single bucket.
- Deterministic with an injected `nowFn` so tests are fast and stable.

11 unit tests cover: first-call allowed, burst exhaustion, refill,
capacity cap, missing key, per-key isolation, LRU eviction, inspect/
reset, invalid config, determinism.

## Done when

`backend/lib/talk_turn_rate_limit.js` exports the factory; tests
green; `npm test` green. Mount happens in a follow-up PR.
