---
id: T-ops-health-summary-route
title: GET /ops/health-summary cheap uptime-dashboard endpoint
owner: claude
status: review
branch: claude/T-ops-health-summary-route
pillar: ops (observability)
---

## Scope

`/ops/metrics` already exposes the heavy state (recent talk samples,
backplane status, concurrency counters), but it's expensive to dump
and verbose. Uptime dashboards / external healthchecks want a small
cheap response on a tight poll cadence.

This PR adds `GET /ops/health-summary`:

```json
{
  "schemaVersion": 1,
  "status": "ok" | "degraded" | "error" | "unknown",
  "reasons": [...],
  "uptimeMs": 12345,
  "uptimeHuman": "3m 25s",
  "node": { "version": "v24.x.x", "platform": "darwin" },
  "features": {
    "creative_memory": true,
    "block_signal": true,
    "block_signal_history": true,
    "talk_pipeline": true,
    "screenplay_export_markdown": true
  }
}
```

The `features` map answers "is this deployment fully wired?" without
calling into any per-user state. `status`/`reasons` come from the
existing `deriveBackendRuntimeStatus()`. `Cache-Control: no-store` on
every response.

Helper module is pure (no I/O), so tests cover `humanizeMs`,
`normalizeFeatures`, error fallback, header behavior, uptime offset,
and the mount guard — 11 tests total.

## Done when

`GET /ops/health-summary` returns the envelope above; helper has
unit tests; `npm test` green.
