# block-signal envelope schema

Canonical shapes for the `/memory/block-signal*` endpoints.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/memory/block-signal` | current block-signal snapshot for the requesting user |
| GET | `/memory/block-signal/history` | history-projection envelope |

## Schema version

`1` (no explicit field today; iOS keys off field set).

## Owner

- **Backend**: Claude. `backend/lib/block_signal_route.js` +
  `backend/lib/block_signal_history_route.js`.
- **Consumer**: iOS memory surface; sparkline UI.

## Access-control posture

**PER-USER**. Block signal carries the writer's coaching state.

## Snapshot envelope (`GET /memory/block-signal`)

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | boolean | yes | |
| `level` | string | yes | one of `"ok"`, `"low"`, `"medium"`, `"high"` |
| `actionable` | boolean | yes | true when `level` is `"medium"` or `"high"` |
| `recommendation` | string | yes | non-empty coaching text |
| `score` | number \| null | yes | 0-1; null when no recent turns |
| `evidence` | object | yes | per-signal contributions |
| `lastSampleAt` | int \| null | yes | epoch ms |

## History envelope (`GET /memory/block-signal/history`)

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | boolean | yes | |
| `samples` | array | yes | per-sample objects |
| `count` | int | yes | `samples.length` |
| `range` | object | yes | `{ fromMs, toMs }` |

### Sample object

| Key | Type | Notes |
| --- | --- | --- |
| `atMs` | int | epoch ms |
| `level` | string | matches snapshot levels |
| `score` | number | 0-1 |
| `evidence` | object | optional |

## Compatibility rules

- `level` adding new values is additive (iOS treats unknown values
  as `"ok"`); removing values bumps to v2.
- `evidence` shape is unversioned today; adding keys is additive.
- `samples` array shape: adding sample fields is additive.

## Changelog

- 2026-05-14 — Doc created.
