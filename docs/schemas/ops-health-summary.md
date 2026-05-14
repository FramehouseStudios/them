# ops-health-summary envelope schema

Canonical shape for `GET /ops/health-summary`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/ops/health-summary` | health-summary envelope (200) |

## Schema version

`1` (explicit `schemaVersion: 1` in payload).

## Owner

- **Backend**: Claude. `backend/lib/ops_health_summary_route.js`.
- **Consumer**: uptime dashboards (polls every few seconds).

## Access-control posture

**SAFE-PUBLIC**. Status + uptime + node info + feature manifest;
no per-user content.

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
  }
}
```

## Compatibility rules

- Additive fine.
- `status` new values are additive (dashboards treat unknown
  values conservatively).
- `features` map: adding keys is additive; removing keys requires
  a deprecation cycle (dashboards may key off them).

## Changelog

- 2026-05-14 — Doc created.
