# tasks envelope schemas

Canonical request + response shapes for the two `/tasks/*`
routes — the task surface iOS uses to surface action-items and
let the user add/complete/reopen/delete them.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/tasks` | list envelope (200), 304 on If-None-Match hit |
| POST | `/tasks/update` | mutation envelope (200 on success, 400 on validation failure) |

Body limit on `/tasks/update`: `256kb`.

## Schema version

`1`. Both envelopes carry `schema_version` from
`buildReadStateMeta`.

## Owner

- **Backend**: support agent. Inline handlers in `backend/index.js`.
  Not in any current decomp phase.
- **iOS**: Codex. Powers the task list + add/complete UI.

## Access-control posture

**PER-USER**. Both routes resolve the memory record from the
request: list via `selectMemoryRecordForRead`, mutate via
`resolveWritableMemoryContext`. `X-Client-Token` session or token
alias is used when present, otherwise the normalized requester
IP. The inline handlers do not enforce an auth-only task gate
today.

## `GET /tasks` request

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `limit` | int | no | clamps via `parseQueryLimit(.., TASKS_LIST_DEFAULT_LIMIT, TASKS_MAX_STORED)` |
| `status` | string | no | one of `TASK_STATUS_FILTERS` (`"all" \| "open" \| "completed"`). Default `"all"`. |

`If-None-Match`: when it matches the current state-version etag,
server returns HTTP 304 with no body. `Cache-Control: no-store`
and read-state headers are set before the 304 is emitted.

## `GET /tasks` response (200)

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
  "status_filter": "all",
  "task_last_updated_at": 1715620920000,
  "total_count": 14,
  "open_count": 8,
  "completed_count": 6,
  "tasks": [ /* TaskPayload[] from buildTaskSnapshot */ ]
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| read-meta fields | various | yes | identical pattern to `memories-list.md` |
| `status_filter` | string | yes | echo of the resolved `status` query (or `"all"` default) |
| `task_last_updated_at` | int \| null | yes | epoch ms of most recent task mutation |
| `total_count` | int | yes | size of the full task set (NOT clipped by limit) |
| `open_count` | int | yes | tasks with status `open` |
| `completed_count` | int | yes | tasks with status `completed` |
| `tasks` | array | yes | task payloads, clipped by `limit` |

## `POST /tasks/update` request

```json
{
  "action": "add | complete | reopen | delete | clear_completed",
  "title": "Buy milk",
  "query": "<id-or-title>",
  "due_at": 1715620920000,
  "priority": "normal"
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `action` | string | no | one of `TASK_UPDATE_ACTIONS`; default `complete`. Unknown values clamp to `complete` via `parseOneOf`. |
| `title` | string | yes for `add` | clamped to 160 chars via `normalizeSnippet` (also accepts `text` fallback) |
| `query` | string | yes for `complete`/`reopen`/`delete` | task id or title; accepts `task_id` / `taskId` fallbacks; falls back to `title` if empty |
| `due_at` | int | no | epoch ms; accepts `dueAt` fallback |
| `priority` | string | no | normalized via `normalizeTaskPriority` (typically `low \| normal \| high`) |

`clear_completed` requires no extra fields.

## `POST /tasks/update` response

```json
{
  "ok": true,
  "action": "complete",
  "status": "completed",
  "message": null,
  "task": { /* TaskPayload */ },
  "removed_count": 0,
  "session_id": "sess_abc",
  "state_version": "v9",
  "last_turn_id": "turn_xyz",
  "last_updated_at": 1715620920000,
  "history_updated_at": 1715620920000,
  "memory_updated_at": 1715620920000,
  "backend_boot_id": "boot-id",
  "task_last_updated_at": 1715620920000,
  "total_count": 14,
  "open_count": 7,
  "completed_count": 7,
  "schema_version": 1,
  "backend_build": "build-id"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | bool | yes | `true` on 200, `false` on 400 |
| `action` | string | yes | echo of the parsed action |
| `status` | string | yes | per-action status verb (see table below) |
| `message` | string \| null | yes | on failure, short cause; null on success |
| `task` | object \| null | yes | the affected task payload (null for `clear_completed`) |
| `removed_count` | int | yes | only non-zero on `clear_completed` |
| read-meta fields | various | yes | post-mutation state |
| `task_last_updated_at` / `total_count` / `open_count` / `completed_count` | int | yes | refreshed snapshot |

## Read-state headers

Both routes set:
- `Cache-Control: no-store`
- Headers from `applyReadStateHeaders(res, readMeta)` on 200,
  400, and GET 304 responses.

### Status verbs per action

| `action` | success `status` | "no-op" `status` | failure `status` |
| --- | --- | --- | --- |
| `add` | `created` (or `duplicate` when equivalent task exists) | — | `failed` (missing title; HTTP 400) |
| `complete` | `completed` | `none` | — |
| `reopen` | `reopened` | `none` | — |
| `delete` | `deleted` | `none` | — |
| `clear_completed` | `cleared_completed` | `none` (zero removed) | — |

## Invariants

- `total_count` is the FULL task set; `tasks[]` is clipped by
  `limit`. Iterating `tasks` is not equivalent to iterating
  the full set.
- `open_count + completed_count` may not equal `total_count`
  exactly if the data model gains additional statuses; iOS
  should rely on the listed counts, not arithmetic.
- `task` field on the mutation response is the post-mutation
  state of the affected task (or null for `clear_completed`).
- `removed_count` is only meaningful for `clear_completed`;
  always 0 for other actions.
- `ok: false` ↔ HTTP 400 (only the `add` action with missing
  title produces this today).

## Compatibility rules

- iOS keys on `tasks[]`, `total_count`, `open_count`,
  `completed_count`, `state_version`, and the per-mutation
  `status` verb.
- Adding new optional fields is tolerated.
- Adding a new `action` value or new `status` verb is
  additive — iOS should treat unknown statuses as opaque
  and surface them as-is.
- Removing any of the documented fields requires a schema bump.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the two inline handlers + `buildTaskSnapshot` /
  `toTaskPayload` in `backend/index.js`.
