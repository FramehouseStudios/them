---
id: T-talk-error-counter-zero-fix
title: Fix talk_error_counter falsy-zero bug in errorRatePerHour math
owner: claude
status: review
branch: claude/T-talk-error-counter-zero-fix
pillar: infra (bug fix)
v1_pillar: infra
v1_effect: corrects errorRatePerHour when the first event arrives at time=0 — the rate was off by 3600× (collapsed to the 1-second-minimum hours window) due to `earliestStampedAt || now` treating 0 as falsy
---

## Scope

Two-character fix in `backend/lib/talk_error_counter.js`: change
`earliestStampedAt || now` to `earliestStampedAt ?? now` (and the
same for `earliestStampedAt || 0` in the `sinceMs` field).

Plus a regression test under
`backend/tests/talk_error_counter_zero_timestamp.test.mjs` that
verifies the rate-per-hour math is sane for an event series
starting at `now=0`.

## Bug found via

Writing `T-deeper-lib-tests-batch-3` (#254) — the
`errorRatePerHour` test with events starting at time=0 produced
21600 instead of ~6. Root cause traced to:

```js
const observationStartMs = since !== null && Number.isFinite(since)
  ? since
  : (earliestStampedAt || now);
```

`earliestStampedAt = 0` (legitimate first event at epoch 0 or via
test fixture). `0 || now` evaluates to `now` because 0 is falsy.
Then `(now - observationStartMs) = 0`, the `Math.max(1/3600, …)`
floor kicks in, and the rate is `total / (1/3600) = total × 3600`.

## Fix

Use nullish-coalescing (`??`) so `0` is preserved:

```js
const observationStartMs = since !== null && Number.isFinite(since)
  ? since
  : (earliestStampedAt ?? now);
```

Same change for `sinceMs: ... (earliestStampedAt ?? 0)` for
consistency (the existing `|| 0` happened to be correct by
accident there).

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: corrects errorRatePerHour when the first event
  arrives at time=0. The ops dashboard for /talk/errors keys on
  this rate; a 3600× overstatement on the first event would have
  triggered a false alarm.`

## Verification

- New test: `backend/tests/talk_error_counter_zero_timestamp.test.mjs`
  pins the rate at ~6/hour for 6 events over 1 hour starting at
  t=0. Before fix: rate=21600. After fix: rate=6.
- Existing 16 smoke tests in
  `backend/tests/talk_error_counter.test.mjs` still pass.
- Total: 18/18 pass.

## Done when

Fix + regression test ship together. The 10 deeper tests in #254
remain green (test was written against the pre-fix behavior using
a nonzero baseline, so it stays passing after the fix).
