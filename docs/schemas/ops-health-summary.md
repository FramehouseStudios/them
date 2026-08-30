# ops-health-summary envelope schema

Canonical shape for `GET /ops/health-summary`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/ops/health-summary` | health-summary envelope (200) |

## Schema version

`1` (explicit `schemaVersion: 1` in payload).

## Owner

- **Backend**: support agent. `backend/lib/ops_health_summary_route.js`.
- **Consumer**: uptime dashboards (polls every few seconds).

## Access-control posture

**SAFE-PUBLIC**. Status + uptime + node info + feature manifest +
cheap subsystem quality signals; no per-user content.

## Fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes (`1`) | |
| `status` | string | yes | `"up"` / `"degraded"` / `"error"` / `"unknown"` |
| `reasons` | string[] | yes | machine-readable codes |
| `uptimeMs` | int | yes | process uptime |
| `uptimeHuman` | string | yes | e.g. `"3d 2h"` |
| `node.version` | string \| null | yes | `process.version` |
| `node.platform` | string \| null | yes | `process.platform` |
| `features` | object | yes | name → boolean map of optional subsystems mounted |
| `signals` | object | yes | name → safe-public subsystem health signal |

### `signals.screenplay_page_write`

Content-free quality signal derived from `metrics.screenplay` in
`/ops/metrics`. It is intended to catch regressions where Clementine
fails to return authoritative screenplay page text after enough page
requests have been observed.

| Key | Type | Notes |
| --- | --- | --- |
| `status` | string | `"ok"` / `"warning"` / `"critical"` |
| `reason` | string | machine-readable reason, e.g. `low_page_acceptance` |
| `sampleReady` | boolean | false until the minimum page-request count is reached |
| `minPageRequests` | int | request count required before warnings can fire |
| `pageRequestedCount` | int | observed page-target talk turns |
| `pageAcceptedCount` | int | page requests accepted as authoritative page text |
| `pageRepairedCount` | int | accepted pages repaired into valid screenplay form |
| `pageDowngradedCount` | int | page requests downgraded to voice pin |
| `guardRejectedCount` | int | invalid-format + non-screenplay guard rejections |
| `pageAcceptanceRate` | number | accepted / requested |
| `guardRejectionRate` | number | guard rejections / requested |
| `downgradeRate` | number | downgraded / requested |
| `repairRate` | number | repaired / accepted |

## Sample response

```json
{
  "schemaVersion": 1,
  "status": "up",
  "reasons": [],
  "uptimeMs": 1234567,
  "uptimeHuman": "20m",
  "node": { "version": "v20.11.0", "platform": "linux" },
  "features": {
    "creative_memory": true,
    "block_signal": true,
    "block_signal_history": true,
    "talk_pipeline": true,
    "screenplay_export_markdown": true,
    "screenplay_export_formats": true
  },
  "signals": {
    "screenplay_page_write": {
      "status": "ok",
      "reason": "healthy",
      "sampleReady": true,
      "minPageRequests": 6,
      "pageRequestedCount": 12,
      "pageAcceptedCount": 11,
      "pageRepairedCount": 2,
      "pageDowngradedCount": 1,
      "guardRejectedCount": 0,
      "pageAcceptanceRate": 0.9166666667,
      "guardRejectionRate": 0,
      "downgradeRate": 0.0833333333,
      "repairRate": 0.1818181818
    }
  }
}
```

## Compatibility rules

- Additive fine.
- `status` new values are additive (dashboards treat unknown
  values conservatively).
- `features` map: adding keys is additive; removing keys requires
  a deprecation cycle (dashboards may key off them).
- `signals` keys are additive. Signal values must remain
  safe-public counters, rates, and machine-readable reason strings.

## Changelog

- 2026-06-09 — Added `signals` and `screenplay_page_write` quality
  signal for Clementine page-write regressions.
- 2026-05-14 — Doc created.
