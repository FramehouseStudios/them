# Spec: T-backend-openai-cost-cap

**Status**: post-V1 for dollar metering. V1 ships the simpler
`backend/lib/provider_budget.js` daily provider-usage guard.
**Owner**: claude.
**V1 pillar**: infra (enables all)
**V1 effect**: closes the V1 "one user with a script can burn the
whole OpenAI budget" gap. Rate limiting (`T-backend-rate-limit`)
caps request frequency; this caps dollar spend. The two are
complementary.

## Problem

The backend calls OpenAI on `/talk`, `/realtime/call`, and several
craft routes. The cost per call ranges from cents (text completion)
to dollars (realtime session minutes). V1 now has a daily provider
usage guard for the paid launch paths, but not full dollar metering,
billing reconciliation, or an ops cost dashboard.

## Current V1 Guard

`backend/lib/provider_budget.js` tracks daily usage per resolved identity,
route class, and UTC day. `backend/index.js` mounts it on:

- `/talk`
- `/realtime/client_secret`
- `/realtime/call`
- `/realtime/turn_commit`
- `/realtime/studio_render`
- `/realtime/studio_render_stream`
- `/visual/context`

The cap is configured with `PROVIDER_DAILY_BUDGET_LIMIT`. Capped requests
return a support-safe `429` envelope with `stage: "provider_budget"` and do
not echo transcripts, screenplay text, user IDs, memory, or provider secrets.

The full dollar-metering design below remains a post-V1 follow-up.

## Post-V1 Scope

In:
- `lib/cost_meter.js`: an in-memory counter keyed by
  `(YYYY-MM-DD, route_class)` tracking estimated dollars spent.
  Counters are read at request time and incremented on response.
- Env-driven caps:
  - `OPENAI_DAILY_USD_CAP` (default $50)
  - `OPENAI_PER_USER_DAILY_USD_CAP` (default $5)
  - `OPENAI_PER_USER_PER_HOUR_USD_CAP` (default $1)
- A small `estimateCost(model, usage)` helper that converts the
  `usage` object OpenAI returns into a dollar estimate using a
  bundled price table.
- On cap breach: log `[cost_cap_exceeded] daily=..., remaining=...`
  at level `warn`, refuse new OpenAI calls (return 402 or 503 to
  the client with `error: "cost_cap_exceeded"`).
- A `/ops/cost` endpoint exposing current-day spend per route_class.

Out:
- Real-time billing API integration. We estimate from token counts;
  reconciliation against the OpenAI dashboard happens manually.
- Per-org / per-team budgets. V1 is single-tenant per backend.

## Approach

Wrap the existing OpenAI call sites in a `withCostMeter(call)` helper
that:
1. Pre-checks: if any applicable cap is at or above limit, throw
   `CostCapExceededError`.
2. Awaits the underlying call.
3. On success, reads `response.usage` (or estimates from token
   counts), converts to USD using `OPENAI_PRICE_TABLE`, increments
   the daily counter.
4. On failure, no increment (we didn't pay for nothing).

## Acceptance

- Five successive talk calls within a minute that estimate above
  the per-hour cap return 402 instead of calling OpenAI.
- `/ops/cost` returns the current-day spend per route_class.
- Unit tests cover the meter math (rollover at midnight UTC, per-user
  vs global caps, refund on failure).
- Manual smoke: set caps low locally, exhaust them, confirm 402.

## Risks

- In-memory counter is lost on restart. V1 acceptable; an attacker
  restarting the process would have to also re-pay for prior usage
  before the cap snaps back. If this becomes a problem, persist the
  daily counter row.
- Estimate accuracy. OpenAI prices change; the price table will
  drift. Mitigation: store version + last-reviewed date in the
  price table; alert if version is older than 30 days.
- 402 vs 503. We pick 402 (Payment Required) because it semantically
  matches; clients should treat it as "stop retrying, ask the user."

## Out-of-scope follow-ups

- Persisted spend counter (Postgres).
- Real billing reconciliation (OpenAI billing API).
- Per-org budgets when multi-tenant lands.
