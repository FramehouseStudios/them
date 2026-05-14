# memory-stats envelope schema

Canonical shape for `GET /memory/stats`.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/memory/stats` | memory-stats envelope (200) |

## Schema version

`1` (explicit `schemaVersion: 1`).

## Owner

- **Backend**: Claude. `backend/lib/creative_memory_stats_route.js`.
- **Consumer**: iOS plain-language memory summary (V1 line 53).

## Access-control posture

**SAFE-PUBLIC**. Aggregate counts only; no per-user content keys
or content text are included.

## Fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes (`1`) | |
| `userCount` | int | yes | distinct users with creative memory |
| `characterCount` | int | yes | total character mentions across all users |
| `themeCount` | int | yes | total active themes across all users |
| `historyDepth` | object | yes | `{ p50, p95, max }` of turns recorded per user |
| `lastUpdatedAt` | int \| null | yes | most recent memory write |

## Sample response

```json
{
  "schemaVersion": 1,
  "userCount": 142,
  "characterCount": 318,
  "themeCount": 540,
  "historyDepth": { "p50": 18, "p95": 92, "max": 360 },
  "lastUpdatedAt": 1700000000000
}
```

## Compatibility rules

- Additive fine.
- No per-user keys must EVER appear in this envelope (safe-public
  posture). Adding any key that could carry user-derived data
  flips the posture to per-user + tier-3, which would need a new
  endpoint.

## Changelog

- 2026-05-14 — Doc created.
