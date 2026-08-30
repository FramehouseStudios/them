# talk-errors envelope schema

Canonical response shape for `GET /talk/errors` — the ops-facing
error-rate dashboard fed by `backend/lib/talk_error_counter.js`.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/talk/errors` | error-counts snapshot (see below) |

## Schema version

`1`. The envelope carries an explicit `schemaVersion` field.

## Owner

- **Backend**: support agent. Counter + envelope shape in
  `talk_error_counter.js`.
- **iOS**: not consumed by iOS — operator dashboard only.

## Access-control posture

**SAFE-PUBLIC**. Counts + class names only. No per-user content,
no request bodies, no user IDs, no prompts, no model output, no
IPs, no timestamps tied to a specific user. Posture established
in the module header of `talk_error_counter.js`.

## Query parameters

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `sinceMs` | int | no | epoch ms; when set, response only counts events with `timestamp >= sinceMs` |

## Response shape

```json
{
  "schemaVersion": 1,
  "total": 42,
  "counts": {
    "supplier_unavailable": 12,
    "supplier_timeout": 8,
    "mint_failed": 5,
    "recovery_invoked": 17
  },
  "lastOccurrence": {
    "supplier_unavailable": 1715620920000,
    "supplier_timeout": 1715620080000
  },
  "sinceMs": 1715520000000,
  "observedAtMs": 1715620920000,
  "errorRatePerHour": 12.5
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes | constant `1` |
| `total` | int | yes | total event count (across the window if `sinceMs` set) |
| `counts` | object | yes | map of error class → count |
| `lastOccurrence` | object | yes | map of error class → most recent epoch ms |
| `sinceMs` | int | yes | start of the reporting window; 0 when no events have been recorded yet |
| `observedAtMs` | int | yes | epoch ms when snapshot was taken |
| `errorRatePerHour` | number | yes | total / hours-observed, rounded to 2 decimals |

## Invariants

- `errorRatePerHour` uses `Math.max(1/3600, hoursElapsed)` to
  avoid divide-by-zero on first-observation reads.
- `counts` includes only classes with `>0` events in the window
  (no zero entries cluttering the dashboard).
- Class names are trimmed; empty/null normalizes to `"unknown"`.
- `occurrences` ring is bounded per class
  (`OCCURRENCE_RING_CAP_PER_CLASS = 2048`); lifetime totals stay
  unbounded.

## Compatibility rules

- New error classes are additive — operators tolerate unknown
  class names.
- New optional fields on the envelope are tolerated.
- Removing `schemaVersion`, `total`, or `counts` requires a
  coordinated dashboard update.

## Changelog

- v1 — initial documented shape.
