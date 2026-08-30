---
id: T-decompose-phase1-ops-routes
title: Decompose backend/index.js — Phase 1 (/ops/metrics + /ops/alerts)
owner: support
status: merged
branch: support/T-decompose-phase1-ops-routes
pillar: infra (backend architecture)
---

## Scope

Phase 1 of the `backend/index.js` decomposition plan documented in
`docs/specs/T-decompose-backend-index.md` and approved in PR #181.
Phase 0 (`/health` + `/bridge`) landed in PR #183. This PR continues
the same pattern for the two `/ops/*` routes that remained inline.

Extracts the previously-inline handlers byte-identically:

- `/ops/metrics` → `backend/lib/ops_metrics_route.js`
- `/ops/alerts`  → `backend/lib/ops_alerts_route.js`

Each file exposes a `mount<X>Route(app, deps)` function. Live state
(`talkInFlight`, `talkInFlightBySession.size`,
`talkIdempotencyCache.size`, `talkMetricsSamples`, the scale
backplane status) is passed as **accessor functions** so the routes
read the current value at request time, not the value at mount time.
This is the pattern Phase 0 established with `/health`.

Both routes carry an explicit **safe-public** access-control posture
in the module header, matching `/ops/health-summary`, `/ops/routes`,
and the rest of the public ops surface.

## Verification

- `node --test backend/tests/ops_metrics_route.test.mjs`
  `backend/tests/ops_alerts_route.test.mjs` → **16/16 pass**.
- Required-deps guard tested: each missing dep throws at mount.
- Live-state accessor pattern tested: counters mutated between two
  requests reflect the new values without re-mounting.
- Safe-public posture tested: no-leakage scan for emails / Bearer /
  userId / deviceId / sessionId / prompt / completion / transcript
  / content / ipAddress.
- `node --check backend/index.js` passes.

`backend/index.js` shrinks by 22 net lines on this PR (44 deletions,
22 insertions for the two new mount calls). Plus 141 lines added
across the two new lib files.

## Done when

`/ops/metrics` and `/ops/alerts` are no longer inline in
`backend/index.js`; both lib files exist with mount + required-deps
guard + safe-public docs; both test files pass; the new mount calls
sit next to the other ops mount calls in `backend/index.js`; the
behavior is byte-identical with the previous inline handlers.

## Next phase

Phase 2 will extract the `/screenplay/*` project route cluster — the
largest single inline group in `backend/index.js`. Spec text already
in `docs/specs/T-decompose-backend-index.md`. Per the spec, max 1
decomposition PR in flight, so Phase 2 is gated on this PR landing.
