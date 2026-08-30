---
id: T-backend-openai-cost-cap
title: OpenAI per-day / per-user / per-hour budget cap
owner: support
status: ready
branch: -
pillar: infra (enables all)
v1_pillar: infra
v1_effect: closes the 'one user with a script can burn the whole OpenAI budget' gap; complements T-backend-rate-limit by capping dollar spend, not just request frequency.
---

## Scope

Spec: `docs/specs/T-backend-openai-cost-cap.md`.

In-memory cost meter keyed by `(YYYY-MM-DD, route_class, user_id)`,
env-driven caps, `/ops/cost` endpoint, 402 response on cap breach.

## Done when

- 5 successive talk calls within a minute that estimate above the
  per-hour cap return 402 instead of calling OpenAI.
- `/ops/cost` returns the current-day spend per route_class.
- Unit tests cover meter math, rollover, refund-on-failure.
