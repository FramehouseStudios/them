---
id: T-deeper-lib-tests-batch-3
title: Deeper tests for realtime_supplier_stub + talk_error_counter + talk_turn_stats
owner: support
status: merged
branch: support/T-deeper-batch-3
pillar: infra (test coverage)
v1_pillar: infra
v1_effect: closes the test gap on 3 realtime + talk libs that gate V1 surfaces — realtime_supplier_stub backs the failover ladder, talk_error_counter feeds /talk/errors, talk_turn_stats feeds /talk/turn/stats
---

## Scope

Ships **33 tests** across 3 libs.

### realtime_supplier_stub.test.mjs (14 tests) — NEW FILE

`backend/lib/realtime_supplier_stub.js` had no test file. This
closes the gap. The stub is wired into the realtime failover
ladder (#231 `v1_realtime_failover_smoke` exercises it
indirectly).

- Factory shape (kind="stub", buildSessionConfig +
  mintClientSecret functions).
- `buildSessionConfig` defaults + per-call overrides + instructions
  presence.
- `mintClientSecret` happy path envelope shape + unique values +
  constructor defaults.
- TTL clamping at min (30s), max (300s), null fallback (default).
- `simulateError` path with custom + default code/status.

### talk_error_counter_deeper.test.mjs (10 tests)

Extends `talk_error_counter.test.mjs` smoke:
- `since`-window filtering excludes pre-window events.
- `since`-window omits classes with zero in-window events.
- No-`since` returns lifetime totals.
- `errorRatePerHour` math (0 on empty + across observed window).
- `lastOccurrence` stamping is whatever the latest .set() wrote.
- Empty/null class normalizes to `"unknown"`.
- Class names are trimmed.
- `occurrences` ring honors `OCCURRENCE_RING_CAP_PER_CLASS`.
- Snapshot envelope includes schemaVersion + observedAtMs + sinceMs.

### talk_turn_stats_deeper.test.mjs (9 tests)

Extends `talk_turn_stats.test.mjs` smoke:
- `ageBuckets` partition turns across last5min / last1h /
  last24h / older boundaries.
- `newestCreatedAtMs` / `oldestCreatedAtMs` reflect extremes.
- `authoritativePageTextRate` + `syncReadyRate` math.
- Both rates are 0 on empty input.
- `audioDurationMs` defensively handles missing + negative.
- `uniqueUserCount` + `uniqueSessionCount` dedupe.
- `replyRoleCounts` split preview vs final.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the test gap on 3 realtime + talk libs that
  gate V1 surfaces. realtime_supplier_stub backs the failover
  ladder (#231 smoke). talk_error_counter feeds the /talk/errors
  ops surface. talk_turn_stats feeds the /talk/turn/stats ops
  surface.`

## Verification

```
node --test backend/tests/realtime_supplier_stub.test.mjs \
              backend/tests/talk_error_counter_deeper.test.mjs \
              backend/tests/talk_turn_stats_deeper.test.mjs
```

→ **33/33 pass** (14 + 10 + 9).

## Bug found (filed as followup)

While writing `talk_error_counter_deeper`, I discovered an actual
bug in `talk_error_counter.js`: `earliestStampedAt || now`
evaluates 0 as falsy and falls back to `now`, so when the first
event happens at time 0 the `errorRatePerHour` math collapses to
`1/3600 hour` and rate explodes. **Not fixed here** (this PR is
test-only); test uses nonzero baseline. Filed as `T-talk-error-
counter-zero-timestamp-bug` followup.

## Done when

3 test files ship + pass. 7/7 stateful libs + realtime stub now
covered.

## Followups (not in this PR)

- Fix the `earliestStampedAt || now` bug in
  `backend/lib/talk_error_counter.js`. Should use `??`, not `||`.
- Deeper tier for `fountain_export` + `talk_pipeline` (next
  batch).
