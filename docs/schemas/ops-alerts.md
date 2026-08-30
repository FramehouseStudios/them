# ops-alerts envelope schema

Canonical shape for `GET /ops/alerts`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/ops/alerts` | alerts envelope (200) |

## Schema version

No explicit `schemaVersion` in payload (current v1). Additive
fields stay at v1.

## Owner

- **Backend**: support agent. `backend/lib/ops_alerts_route.js`.
- **Consumer**: ops dashboards, support tooling, release checks.

## Access-control posture

**SAFE-PUBLIC**. Response contains alert codes, severities,
messages, safe detail counters, backend runtime counters, and
backplane status. It must not include user identifiers, tokens,
prompts, transcripts, screenplay text, scene excerpts, or provider
secrets.

## Fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | boolean | yes | constant `true` |
| `status` | string | yes | `"healthy"` when no alerts, `"alerting"` when alerts are active |
| `alerts` | array | yes | active alert objects |
| `runtime` | object | yes | same runtime status object used by `/ops/metrics` |
| `scale_backplane` | object | yes | backplane snapshot |

## Alert object

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `code` | string | yes | machine-readable alert code |
| `severity` | string | yes | `"warning"` / `"critical"` |
| `message` | string | yes | safe-public operator summary |
| `details` | object | no | optional safe-public counters/rates |

## Known alert codes

| Code | Severity | Notes |
| --- | --- | --- |
| `runtime_degraded` | warning | backend runtime status is degraded |
| `high_error_rate` | critical | talk error rate crossed threshold |
| `high_p95_latency` | warning | talk latency crossed threshold |
| `session_lock_pressure` | warning | session lock map pressure crossed threshold |
| `screenplay_page_write_regression` | warning / critical | Clementine page-write acceptance or guard/downgrade rates crossed quality thresholds |

### `screenplay_page_write_regression.details`

| Key | Type | Notes |
| --- | --- | --- |
| `page_requested_count` | int | page-target talk requests observed |
| `page_accepted_count` | int | page requests accepted as authoritative page text |
| `page_repaired_count` | int | accepted pages repaired into valid screenplay form |
| `page_downgraded_count` | int | page requests downgraded to voice pin |
| `guard_rejected_count` | int | invalid-format + non-screenplay guard rejections |
| `page_acceptance_rate` | number | rounded accepted / requested |
| `guard_rejection_rate` | number | rounded guard rejections / requested |
| `downgrade_rate` | number | rounded downgraded / requested |
| `reason` | string | machine-readable reason token |

## Sample response

```json
{
  "ok": true,
  "status": "alerting",
  "alerts": [
    {
      "code": "screenplay_page_write_regression",
      "severity": "warning",
      "message": "Screenplay page-write acceptance 0.625 across 8 page requests (low_page_acceptance).",
      "details": {
        "page_requested_count": 8,
        "page_accepted_count": 5,
        "page_repaired_count": 2,
        "page_downgraded_count": 3,
        "guard_rejected_count": 2,
        "page_acceptance_rate": 0.625,
        "guard_rejection_rate": 0.25,
        "downgrade_rate": 0.375,
        "reason": "low_page_acceptance"
      }
    }
  ],
  "runtime": {
    "status": "up",
    "reasons": [],
    "metrics": {
      "windowMs": 60000,
      "sampleCount": 12
    }
  },
  "scale_backplane": {
    "status": "noop",
    "outboxPending": 0
  }
}
```

## Compatibility rules

- Additive new keys are fine.
- Alert codes are additive.
- Existing alert codes and top-level keys must not be renamed without
  a v2 envelope.
- `details` must remain safe-public and machine-readable.

## Changelog

- 2026-06-09 — Doc created. Added
  `screenplay_page_write_regression` alert contract.
