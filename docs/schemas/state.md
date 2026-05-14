# state envelope schema

Canonical response shape for `GET /state` — the combined state
snapshot iOS uses to refresh the entire UI (history + memories
deltas) in one round-trip.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/state` | combined-delta envelope (200) |

## Schema version

`1`. Envelope carries `schema_version` from `buildReadStateMeta`.

## Owner

- **Backend**: Claude. Inline handler in `backend/index.js`.
  Not currently in a decomp phase.
- **iOS**: Codex. The "refresh everything" surface — single
  call returns history threads, memory cards, and the full
  read-meta block.

## Access-control posture

**PER-USER**. Memory resolved via `selectMemoryRecordForRead`.
Same posture as `memories-list.md` and `history.md`.

## Query parameters

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `sinceVersion` | string | no | when matches the current `state_version`, returns the delta-no-change short-circuit envelope |
| `sinceTurnId` | string | no | parsed via `parseTurnIdToNumber`; filters history delta to `turn > sinceTurnNumber` |
| `historyLimit` | int | no | accepts camelCase + snake_case + `limit` fallback; `parseQueryLimit(.., 60, 240)` |
| `memoriesLimit` | int | no | accepts camelCase + snake_case; `parseQueryLimit(.., 24, 120)` |

## Response shape — delta-no-change

When `sinceVersion` matches current `state_version`:

```json
{
  "source": "ip",
  "source_ip": "10.0.0.1",
  "session_id": "sess_abc",
  "state_version": "v9",
  "last_updated_at": 1715620920000,
  "history_updated_at": 1715620920000,
  "memory_updated_at": 1715620920000,
  "last_turn_id": "turn_xyz",
  "schema_version": 1,
  "backend_build": "build-id",
  "backend_boot_id": "boot-id",
  "is_delta": true,
  "delta_no_change": true,
  "history_changed": false,
  "memory_changed": false,
  "since_version": "v9",
  "since_turn_id": "turn-42",
  "history_delta": [],
  "memories_delta": []
}
```

Both delta arrays are empty — iOS keeps prior list state.

## Response shape — full / partial delta

```json
{
  /* same read-meta fields */
  "is_delta": false,
  "delta_no_change": false,
  "history_changed": true,
  "memory_changed": true,
  "since_version": null,
  "since_turn_id": null,
  "history_delta": [ /* threads from buildConversationHistoryThreads */ ],
  "memories_delta": [ /* memory cards from buildMemoryCards */ ]
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| read-meta fields | various | yes | matches `memories-list.md` |
| `is_delta` | bool | yes | `true` when `sinceVersion` OR `sinceTurnId` was supplied |
| `delta_no_change` | bool | yes | `true` iff `sinceVersion === state_version` |
| `history_changed` | bool | yes | reflects whether `history_delta` differs from the prior version |
| `memory_changed` | bool | yes | reflects whether `memories_delta` differs |
| `since_version` | string \| null | yes | echo of supplied `sinceVersion` (null when not supplied) |
| `since_turn_id` | string \| null | yes | echo of `turn-<N>` derived from `sinceTurnId` |
| `history_delta` | array | yes | history threads; filtered to `> sinceTurnNumber` and clipped by `historyLimit` |
| `memories_delta` | array | yes | memory cards; clipped by `memoriesLimit` |

## Side effects

Like `GET /memories`, `GET /state` triggers a background
`maybeBackfillThemesFromHistory` and persists the updated
memory when the backfill applies. The visible response shape
is unchanged.

## Read-state headers

All responses set:
- `Cache-Control: no-store`
- All headers from `applyReadStateHeaders(res, readMeta)`.

## Invariants

- `history_delta` and `memories_delta` are EMPTY when
  `delta_no_change: true`.
- `historyLimit` and `memoriesLimit` accept three naming
  conventions each (camelCase, snake_case, and the generic
  `limit` for history); iOS may use whichever.
- `since_turn_id` echo is in the form `turn-<N>`.

## Compatibility rules

- iOS keys on `state_version`, `is_delta`, `delta_no_change`,
  `history_delta`, `memories_delta`.
- Adding new optional fields is tolerated.
- Removing any of the keys above requires a schema bump.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the inline `app.get("/state", ...)` handler in
  `backend/index.js`.
