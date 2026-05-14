# ops-metrics envelope schema

Canonical response shape for `GET /ops/metrics`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/ops/metrics` | metrics envelope (200) |

## Schema version

No explicit `schemaVersion` in payload (current v1). Additive
fields stay at v1.

## Owner

- **Backend / envelope shape**: Claude.
  `backend/lib/ops_metrics_route.js` `mountOpsMetricsRoute`.
- **Consumer**: ops dashboards, support tooling. Not iOS-facing.

## Access-control posture

**SAFE-PUBLIC**. Response contains only system-level counters +
status + recent talk-pipeline samples. No per-user content. No
authentication required.

## Fields

| Key | Type | Required | Source | Notes |
| --- | --- | --- | --- | --- |
| `ok` | boolean | yes | constant `true` | |
| `status` | string | yes | `deriveBackendRuntimeStatus().status` | `"up"` / `"degraded"` / `"error"` |
| `reasons` | string[] | yes | `deriveBackendRuntimeStatus().reasons` | machine-readable codes |
| `talk_in_flight` | int | yes | `talkInFlight()` accessor | live counter |
| `talk_max_in_flight` | int | yes | `TALK_MAX_IN_FLIGHT` constant | concurrency cap |
| `session_locks` | int | yes | `talkInFlightBySessionSize()` accessor | live count |
| `idempotency_entries` | int | yes | `talkIdempotencyCacheSize()` accessor | live count |
| `scale_backplane` | object | yes | `scaleBackplaneStatus()` | backplane snapshot |
| `metrics_window_ms` | int | yes | `deriveBackendRuntimeStatus().metrics.windowMs` | sample window |
| `metrics` | object | yes | `deriveBackendRuntimeStatus().metrics` | aggregate stats over window |
| `recent` | array | yes | last min(32, n) `talkMetricsSamples` | per-sample objects |

## Recent-sample object shape

```json
{
  "at": 1700000000000,
  "status_code": 200,
  "total_ms": 1450,
  "stt_ms": 200,
  "llm_ms": 800,
  "tts_ms": 350,
  "stream_audio": 1,
  "chat_stream_used": 0,
  "talk_status": "ok",
  "lane": "live",
  "model": "gpt-4o-mini"
}
```

## Response headers

- `Cache-Control: no-store`
- `x-backend-status: <status>` (same value as `status` field)

## Compatibility rules

- Additive new keys are fine.
- Boolean flags in recent samples are emitted as 0/1, not
  true/false — iOS / dashboards already parse this way.
- Removing or renaming a key requires a v2 bump.

## Changelog

- 2026-05-14 — Doc created. Reflects PR #190's extraction shape.
