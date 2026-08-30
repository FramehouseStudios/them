# recap envelope schema

Canonical response shape for `GET /recap` and `GET /recap/today` —
the daily-recap surface iOS uses for the "look back at your day"
view.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/recap` | recap envelope (200), 304 on If-None-Match hit |
| GET | `/recap/today` | shorthand alias of `/recap?window=today` |

Both share the same response shape. `/recap/today` exists as a
convenience so iOS can skip the query-param dance for the
common case.

## Schema version

`1`. Envelope carries `schema_version` derived from
`buildReadStateMeta`.

## Owner

- **Backend**: support agent. Inline handler in `backend/index.js`
  (route + `sendRecapResponse` helper). Not in any current
  decomp phase.
- **iOS**: Codex. Surfaces the daily recap UI.

## Access-control posture

**PER-USER**. Memory record resolved via
`selectMemoryRecordForRead`: `X-Client-Token` session or token
alias when present, otherwise the normalized requester IP. The
inline handler does not enforce an auth-only recap gate today.

## Query parameters

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `window` | string | no | recap window key (`today`, `yesterday`, etc.). Default `today`. The `/recap/today` route hardcodes this to `today` and ignores the query param. |

`If-None-Match` request header: when matches the current
state-version etag, server returns 304 with no body (same
cycle as `/memories`).

## Response shape (200)

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
  "window": "today",
  "window_label": "Today",
  "window_start_at": 1715592600000,
  "window_end_at": 1715620920000,
  "local_day": "2026-05-14",
  "generated_at": 1715620920000,
  "recap": "<short prose summary>",
  "highlights": [ /* array of highlight items */ ],
  "outcomes": [ /* array of outcome objects */ ],
  "next_actions": [ /* array of action items */ ],
  "open_tasks": [ /* array of task objects */ ],
  "completed_today": [ /* array of completed-today items */ ],
  "stats": { /* stats sub-envelope */ }
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `source` | string | yes | match `memories-list.md` |
| `source_ip` | string | yes | normalized requester IP |
| `session_id` | string | yes | from `buildReadStateMeta` |
| `state_version` | string | yes | for cache invalidation |
| `last_updated_at` | int \| null | yes | epoch ms |
| `history_updated_at` | int \| null | yes | epoch ms |
| `memory_updated_at` | int \| null | yes | epoch ms |
| `last_turn_id` | string \| null | yes | last committed turn id |
| `schema_version` | int | yes | `1` |
| `backend_build` | string | yes | from read meta |
| `backend_boot_id` | string | yes | from read meta |
| `window` | string | yes | echoed window key (`"today"`, etc.) |
| `window_label` | string | yes | human-readable label (e.g. `"Today"`) |
| `window_start_at` | int | yes | epoch ms — start of the window |
| `window_end_at` | int | yes | epoch ms — end of the window |
| `local_day` | string | yes | `YYYY-MM-DD` local date stamp |
| `generated_at` | int | yes | server-stamped epoch ms |
| `recap` | string | yes | prose summary of the window |
| `highlights` | array | yes | per-`buildDailyRecapPayload` shape |
| `outcomes` | array | yes | accomplishment-style outcomes |
| `next_actions` | array | yes | suggested next-step actions |
| `open_tasks` | array | yes | tasks still open in the window |
| `completed_today` | array | yes | tasks/items completed in-window |
| `stats` | object | yes | rollup (turns, themes touched, etc.) |

## Response shape (304)

When `If-None-Match` matches the current etag, server returns
HTTP 304 with no body. `Cache-Control: no-store` and the
read-state headers are already set before the 304 is emitted.

## Read-state headers

All responses (200 and 304) set:
- `Cache-Control: no-store`
- Headers from `applyReadStateHeaders(res, readMeta)` (same as
  the rest of the read surface).

## Invariants

- `/recap/today` ALWAYS uses `windowKey = "today"`. The query
  param is ignored on that path.
- The same `state_version` produced by the read-state pipeline
  appears in both the response body AND the headers — iOS can
  decide which to key on.
- `generated_at` is server-stamped (not request-supplied) to
  prevent clock-drift cache issues.
- `local_day` reflects the SERVER's local timezone interpretation
  of `generated_at`. If the user's device is in a different
  timezone, the day boundary may shift; iOS should treat
  `local_day` as informational, not authoritative.

## Compatibility rules

- iOS keys on `recap`, `highlights`, `outcomes`, `next_actions`,
  `window`, `state_version`.
- Adding new optional fields is tolerated.
- Removing `recap`, `state_version`, or any of the
  window-* fields requires a schema bump.
- New values for `window` (e.g. `"week"`, `"month"`) are
  additive — the route already accepts an arbitrary window
  key; the recap payload may add more shapes over time.

## V1 alignment

Not directly called out in `docs/v1-definition.md`'s checklist,
but feeds the broader "living companion" experience that V1's
memory + talk pillars depend on. The recap is read-only and
side-effect-free, which keeps it safe for frequent polling
from iOS.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  `sendRecapResponse` in `backend/index.js`.
