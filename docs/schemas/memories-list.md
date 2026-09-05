# memories-list envelope schema

Canonical response shape for `GET /memories` — the iOS-facing
list view that powers "what does the companion remember about
me?" UX (V1 line 53). Includes the read-state-versioning headers
and the delta-no-change short-circuit.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/memories` | memories envelope (200), 304 on matching list ETag, 401 without auth, 503 when authoritative storage is unreadable |

## Schema version

`1`. The envelope carries `schema_version` (snake_case) derived
from `buildReadStateMeta`.

## Owner

- **Backend**: `backend/lib/memories_route.js`, with canonical account and creative persistence.
- **Apple client**: `them/BackendMemoryAPI.swift` and `them/MemoriesScreen.swift`.

## Access-control posture

**PER-USER**. The route requires trusted authenticated identity
before resolving memory. Authenticated memory resolves through the
auth user scope (`authuser:<user_id>`) or an auth-bound session;
caller-supplied `X-User-Id` and unauthenticated IP ownership are
not accepted. Unauthenticated callers receive HTTP 401:

```json
{ "stage": "memories", "error": "user_auth_required" }
```

## Query parameters

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `limit` | int | no | clamps via `parseQueryLimit(.., 24, 120)` — default 24, max 120 |
| `sinceVersion` | string | no | account-store cursor; with creative persistence configured, responses remain full snapshots even when this matches |
| `story_preference_project_id` | string | no | filters preference rows by project ID; takes precedence over title |
| `story_preference_project_title` | string | no | filters preference rows by title when no ID is supplied |

`If-None-Match` request header: a matching opaque list ETag returns 304
with no body. With creative persistence configured, this validator covers
the account cursor, creative ledger (including ordering timestamps), limit,
and preference scope. An old account-only ETag cannot validate the list.
The account `state_version` remains unchanged for mutation compatibility.

## Response shape (200 full)

```json
{
  "source": "ip",
  "source_ip": "10.0.0.1",
  "assistant_name": "Clementine",
  "user_name": "Ada",
  "relationship_depth_score": 0.42,
  "behavior_mode": "surface",
  "cycle_index": 3,
  "season": 1,
  "season_progress": 0.18,
  "session_id": "sess_abc",
  "state_version": "v9",
  "creative_memory_revision": "cm_content_hash",
  "last_updated_at": 1715620920000,
  "history_updated_at": 1715620920000,
  "memory_updated_at": 1715620920000,
  "last_turn_id": "turn_xyz",
  "schema_version": 1,
  "backend_build": "build-id",
  "backend_boot_id": "boot-id",
  "is_delta": false,
  "delta_no_change": false,
  "memory_quality": { /* snapshot from buildMemoryQualitySnapshot */ },
  "story_move_preferences": [ /* scoped learned and explicit preferences */ ],
  "memories": [ /* array of memory cards from buildMemoryCards */ ],
  "conversation_samples": [ /* array of history threads */ ]
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `source` | string | yes | `"ip"`, `"session"`, or other identifier from `selectMemoryRecordForRead` |
| `source_ip` | string | yes | normalized requester IP |
| `assistant_name` | string | yes | normalized self-name (`Clementine` default) |
| `user_name` | string \| null | yes | primary user name from memory |
| `relationship_depth_score` | number | yes | 0..1 |
| `behavior_mode` | string | yes | `"surface"` default; other values per `behaviorMode` discipline |
| `cycle_index` | int | yes | 0+ |
| `season` | int | yes | 1+ |
| `season_progress` | number | yes | 0..1 |
| `session_id` | string | yes | from `buildReadStateMeta` |
| `state_version` | string | yes | account-store mutation cursor and sinceVersion; not the list ETag |
| `creative_memory_revision` | string | yes | content revision for creative-memory mutations; unchanged timestamps alone do not change it |
| `last_updated_at` | int \| null | yes | epoch ms |
| `history_updated_at` | int \| null | yes | epoch ms |
| `memory_updated_at` | int \| null | yes | epoch ms |
| `last_turn_id` | string \| null | yes | last committed turn id |
| `schema_version` | int | yes | `1` |
| `backend_build` | string | yes | from read meta |
| `backend_boot_id` | string | yes | from read meta |
| `is_delta` | boolean | yes | `true` when `?sinceVersion` was supplied |
| `delta_no_change` | boolean | yes | may be true only for account-only operation without a configured creative store |
| `story_move_preferences` | array | yes | project-scoped learned and corrected preferences; empty is authoritative only on successful reads |
| `memory_quality` | object | yes | from `buildMemoryQualitySnapshot` — `memory-stats.md` for the rollup shape |
| `memories` | array | yes | up to `limit` memory cards |
| `conversation_samples` | array | yes | history-thread excerpts; size scales with `limit` (3..12) |

## Response shape (200 delta-no-change)

Only in legacy account-only operation (no creative store), when
`?sinceVersion` matches `state_version` exactly:

```json
{
  "source": "ip",
  "source_ip": "10.0.0.1",
  "assistant_name": "Clementine",
  /* ... same headline fields as above ... */
  "is_delta": true,
  "delta_no_change": true,
  "memory_quality": { /* still computed; cheap */ },
  "memories": [],
  "conversation_samples": []
}
```

Both arrays are empty — iOS keeps the prior list state. All
metadata fields stay populated so iOS UI badges can still
refresh.

## Response shape (304)

When `If-None-Match` matches the current etag, server returns
HTTP 304 with no body. `Cache-Control: no-store` and the
read-state headers are already set before the 304 is emitted.

## Read-state headers

All responses (200, 200-delta, and 304) set:

- `Cache-Control: no-store`
- All headers from `applyReadStateHeaders(res, readMeta)` —
  typically `x-state-version`, `x-session-id`, `x-last-updated-at`,
  `x-history-updated-at`, `x-memory-updated-at`, `x-schema-version`,
  `etag` (opaque list representation validator with creative persistence).
- `x-creative-memory-revision` (matches the response's creative content revision).

## Invariants

- `memories.length <= limit`.
- `conversation_samples.length <= Math.max(3, Math.min(12, limit))`.
- `delta_no_change: true` implies `memories: []` and
  `conversation_samples: []`. `is_delta` is true.
- `delta_no_change: false` with `is_delta: true` means the body is
  a full replacement snapshot. The account cursor may be unchanged while
  creative preferences or canon changed or were cleared.
- `delta_no_change: false` with `is_delta: false` means no
  `sinceVersion` was supplied — body is full.
- A `?sinceVersion=` (empty string) is treated as not-supplied
  (`is_delta: false`).
- `memory_quality` matches `docs/schemas/memory-stats.md` field
  names + shape.

## Side effects

`GET /memories` is mostly read-only but DOES perform a
background backfill via `maybeBackfillThemesFromHistory`. If
the backfill writes themes, the route persists the updated
memory through `persistCanonicalWritableMemoryContext`. Both authoritative
reads must succeed before backfill begins; an unreadable creative ledger
must not trigger a write or manufacture an empty success response.

## Errors

Unreadable account or creative persistence returns HTTP 503 with
`Cache-Control: no-store` and the existing error envelope:

```json
{
  "ok": false,
  "action": "read",
  "status": "memory_persistence_unavailable",
  "message": "Memory sync is temporarily unavailable. No changes were applied.",
  "request_id": "request-id"
}
```

No memory arrays or successful read cursors are published. The client keeps
its loaded cards, preferences, selection, and cached validator, exposes a
retry action, and replaces them only after a successful read. A missing or
genuinely empty creative record remains valid; unsupported versions and
malformed persisted records fail rather than silently clearing the list.

## Compatibility rules

- iOS keys on `memories[]`, `state_version`, `session_id`,
  `memory_quality`, and the read-state headers.
- Adding optional fields to the envelope is tolerated.
- Removing any of the keys above requires a schema bump.
- `delta_no_change` flag is load-bearing for iOS bandwidth
  optimization; do not remove without coordinating with iOS.

## V1 alignment

V1 line 53: "iOS exposes a plain-language memory summary and
refresh state." This envelope is the data layer; iOS owns the
plain-language rendering. `memory_quality` + the headline
fields (`relationship_depth_score`, `behavior_mode`, `cycle_index`,
`season_progress`) are the primary signals iOS surfaces.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the inline `app.get("/memories", ...)` handler in
  `backend/index.js`. Will be amended when Phase 6 extracts
  the handler to `backend/lib/memories_route.js`.
- 2026-05-26 — Auth/privacy hardening: `GET /memories` now
  requires trusted auth identity and no longer falls back to
  unauthenticated IP memory.
- 2026-09-04 — Fail closed on unreadable creative persistence; preserve
  client state on 503; scope list validators across account and creative
  stores; return full empty snapshots after cross-device clears.
