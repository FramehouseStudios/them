---
id: T-talk-turn-rate-limit-route
title: Optional rate-limit middleware on GET /talk/turn/:turnId
owner: claude
status: review
branch: claude/T-talk-turn-rate-limit-route
pillar: infra (talk pipeline)
---

## Scope

PR #154 shipped the pure token-bucket limiter. This PR mounts it
on `GET /talk/turn/:turnId` as an **opt-in** middleware via a new
`turnReadRateLimiter` option on `mountTalkPipelineRoutes`. Omitting
the option preserves current behavior verbatim.

Behavior when supplied:

- Each request keys via `turnReadRateLimitKey(req)`:
  - `user:<userId>` if `req.user.id` / `req.authUser.id` / `req.userId`
    is set;
  - else `ip:<req.ip>` (falling back to `socket.remoteAddress`).
- Limiter's `attempt(key)` is checked before any other validation.
  Denied → 429 with `{ error: "rate_limited", retry_after_ms }`
  plus `Cache-Control: no-store` and `Retry-After` (seconds) headers.
- The limiter wins over `invalid_turn_id` / `turn_not_found` /
  `forbidden` — a hammering attacker can't peek at error classes
  past their quota.

5 integration tests cover: omitted limiter, available tokens,
burst exhaustion → 429, no-store on denied, and the
limit-runs-first ordering.

## Done when

`mountTalkPipelineRoutes` accepts `turnReadRateLimiter`;
production `index.js` mount is unchanged (no limiter wired) until
the human / Codex decides on production thresholds; tests pass;
`npm test` green.
