# realtime-health envelope schema

Canonical shape for `GET /realtime/health`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/realtime/health` | realtime-health envelope (200) |

Query params:
- `deep=1` — run a live supplier probe and cache the result; without
  `deep=1` the response is the cheap shape probe.

## Schema version

`1` (explicit `schemaVersion: 1` field in payload).

## Owner

- **Backend**: Claude. `backend/lib/realtime_routes.js` (PR #215).
- **Consumer**: ops dashboards, iOS realtime debug surface.

## Access-control posture

**SAFE-PUBLIC**. Supplier shape + cached liveness — no per-user
content.

## Fields

### Shape mode (`mode: "shape"`)

| Key | Type | Required |
| --- | --- | --- |
| `schemaVersion` | int | yes (`1`) |
| `mode` | string | yes (`"shape"`) |
| `kind` | string \| null | yes |
| `healthy` | boolean | yes |
| `error` | string \| null | yes |
| `recordedAt` | string | yes (ISO-8601) |

### Live mode (`mode: "live"`)

| Key | Type | Required |
| --- | --- | --- |
| `schemaVersion` | int | yes (`1`) |
| `mode` | string | yes (`"live"`) |
| `cached` | boolean | yes |
| `kind` | string \| null | yes |
| `healthy` | boolean | yes |
| `error` | string \| null | yes |
| `latencyMs` | int | yes |
| `recordedAt` | string | yes (ISO-8601) |

## Sample response (shape)

```json
{ "schemaVersion": 1, "mode": "shape", "kind": "openai", "healthy": true, "error": null, "recordedAt": "2026-05-14T00:00:00.000Z" }
```

## Compatibility rules

- Additive fine.
- New `mode` values would be a v2 bump.

## Changelog

- 2026-05-14 — Doc created. Reflects PR #215 shape.
