# memories-export envelope schema

Canonical response shape for `GET /memories/export` — the
full memory dump iOS surfaces as a one-click data export. Last
of the `/memories/*` cluster; siblings: `memories-list.md`
(read) and `memories-mutate.md` (write).

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/memories/export` | 200 export envelope (always); no error path documented today |

## Schema version

`1`. The envelope carries `schema_version` derived from
`buildReadStateMeta`. The embedded `export_json` payload does
not carry a separate schema-version field today.

## Owner

- **Backend**: Claude. Inline handler in `backend/index.js`
  (Phase 6 extraction queued per #228 design note).
- **iOS**: Codex. Triggers when the user taps "Export my
  memory" and saves the resulting JSON.

## Access-control posture

**PER-USER**. The route requires trusted authenticated identity
before resolving memory. Scope matches `memories-list.md`:
auth user scope or auth-bound session only. Caller-supplied
`X-User-Id` and unauthenticated IP ownership are not accepted.
Unauthenticated callers receive HTTP 401:

```json
{ "stage": "memories_export", "error": "user_auth_required" }
```

## Query parameters

None today. The export is unconditional for the authenticated
memory context.

## Response shape

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
  "memory_quality": { /* memory-stats.md shape */ },
  "filename": "clementine_memory_export_20260514_142.json",
  "exported_at": 1715620920000,
  "export_json": "{\n  \"exported_at\": 1715620920000,\n  \"source\": \"ip\",\n  ...\n}\n"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `source` | string | yes | matches the source key from `memories-list.md` |
| `source_ip` | string | yes | normalized requester IP |
| `session_id` | string | yes | from `buildReadStateMeta` |
| `state_version` | string | yes | for downstream cache invalidation |
| `last_updated_at` | int \| null | yes | epoch ms |
| `history_updated_at` | int \| null | yes | epoch ms |
| `memory_updated_at` | int \| null | yes | epoch ms |
| `last_turn_id` | string \| null | yes | last committed turn id |
| `schema_version` | int | yes | `1` |
| `backend_build` | string | yes | from read meta |
| `backend_boot_id` | string | yes | from read meta |
| `memory_quality` | object | yes | rollup matching `memory-stats.md` |
| `filename` | string | yes | suggested filename in the form `clementine_memory_export_<YYYYMMDD>_<turnCount>.json` |
| `exported_at` | int | yes | server-stamped epoch ms |
| `export_json` | string | yes | full export payload serialized as JSON (with trailing newline) |

## `export_json` payload shape

The `export_json` field is a **pre-serialized JSON string**.
iOS may either write the string straight to disk or decode it
to a payload object. The decoded payload contains:

| Key | Type | Notes |
| --- | --- | --- |
| `exported_at` | int | echoes top-level `exported_at` |
| `source` | string | echoes top-level `source` |
| `source_ip` | string | echoes top-level `source_ip` |
| `session_id` | string | from read meta |
| `state_version` | string | from read meta |
| `last_turn_id` | string \| null | from read meta |
| `assistant_name` | string | normalized self-name |
| `user_name` | string \| null | primary user name from memory |
| `remembered_names` | array | sanitized via `sanitizeRememberedPeople`, capped at `USER_MEMORY_REMEMBERED_PEOPLE_MAX` |
| `behavior_mode` | string | `"surface"` default |
| `relationship_depth_score` | number | 0..1 |
| `memory_quality` | object | rollup |
| `cycle_index` | int | 0+ |
| `season` | int | 1+ |
| `season_progress` | number | 0..1 |
| `themes` | array | sanitized active themes |
| `memory_cards` | array | up to 180 memory cards |
| `tasks` | array | up to `TASKS_MAX_STORED` (full status filter) |
| `history_threads` | array | up to 280 conversation history threads |

## Read-state headers

- `Cache-Control: no-store`
- All headers from `applyReadStateHeaders(res, readMeta)`.

## Invariants

- `filename` is server-generated; iOS does not request a
  specific name. Pattern is deterministic given `exported_at`
  + `memory.turns`.
- The exported `memory_cards` are limited to 180 (vs the
  `/memories` list's `limit=24` default) — export is meant to
  be comprehensive.
- `history_threads` are limited to 280.
- `tasks` carries `status: "all"` rather than only `open` — the
  export is intentionally complete.
- The route does NOT write any backfill (unlike `/memories`'s
  `maybeBackfillThemesFromHistory`). Export is read-only.

## V1 alignment

V1 line 54: "Human privacy decision is made for full memory
export/delete." `D-creative-memory-export-approval` and
`D-creative-memory-delete-scope` were resolved on 2026-05-14. The
export route ships as the V1 data-control surface; delete remains
scoped to the approved V1 creative-memory-only semantics if Codex
assigns that implementation before post-V1 cleanup.

## Compatibility rules

- iOS keys on `export_json` (string) as the primary payload.
- `filename` is informational; iOS may override the saved
  filename.
- New optional fields on the outer envelope or on the inner
  `export_json` payload are tolerated.
- Removing `export_json`, `filename`, or `exported_at`
  requires a schema bump.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the inline `app.get("/memories/export", ...)` handler in
  `backend/index.js`. Will be amended when Phase 6 extracts the
  route to `backend/lib/memories_route.js`.
- 2026-05-26 — Auth/privacy hardening: export now requires
  trusted auth identity and no longer falls back to IP memory.
