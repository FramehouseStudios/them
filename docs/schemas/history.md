# history envelope schemas

Canonical request + response shapes for the two `/history/*`
routes — the conversation-history surface iOS uses to render
prior turns + annotate them with studio metadata.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/history` | list envelope (200), 304 on If-None-Match hit |
| POST | `/history/annotate_turn` | annotate envelope (200), 400/404 on validation/missing |

Body limit on `/history/annotate_turn`: `256kb`.

## Schema version

`1`. Envelopes carry `schema_version` derived from
`buildReadStateMeta`.

## Owner

- **Backend**: Claude. Inline handlers in `backend/index.js`.
  Not in any current decomp phase.
- **iOS**: Codex. Powers the history pane + studio-annotation
  loop.

## Access-control posture

**PER-USER**. List reads via `selectMemoryRecordForRead`;
annotate writes via `resolveWritableMemoryContext`.
`X-Client-Token` session or token alias is used when present,
otherwise the normalized requester IP. The inline handlers do
not enforce an auth-only history gate today.

## `GET /history` request

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `limit` | int | no | `parseQueryLimit(.., 60, 240)` — default 60, max 240 |
| `sinceTurnId` | string | no | when supplied (parsed via `parseTurnIdToNumber`), response is filtered to `turn > sinceTurnNumber` |
| `screenplayProjectId` | string | no | clamped to 96 chars; filters threads to a specific screenplay project |

`If-None-Match`: when it matches the current state-version etag,
server returns HTTP 304 with no body. `Cache-Control: no-store`
and read-state headers are set before the 304 is emitted.

## `GET /history` response (200)

```json
{
  "source": "ip",
  "source_ip": "10.0.0.1",
  "assistant_name": "Clementine",
  "user_name": "Ada",
  "remembered_names": [ { "name": "Bob", "relation": "friend" } ],
  "conversation_count": 14,
  "last_conversation_recap": "Talked about...",
  "last_conversation_at": 1715620920000,
  "session_id": "sess_abc",
  "state_version": "v9",
  "last_updated_at": 1715620920000,
  "history_updated_at": 1715620920000,
  "memory_updated_at": 1715620920000,
  "last_turn_id": "turn_xyz",
  "schema_version": 1,
  "backend_build": "build-id",
  "backend_boot_id": "boot-id",
  "is_delta": false,
  "since_turn_id": null,
  "threads": [ /* conversation history threads from buildConversationHistoryThreads */ ]
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `source` | string | yes | match `memories-list.md` |
| `source_ip` | string | yes | normalized requester IP |
| `assistant_name` | string | yes | normalized self-name |
| `user_name` | string \| null | yes | primary user name |
| `remembered_names` | array | yes | `{ name, relation }` objects; capped at `USER_MEMORY_REMEMBERED_PEOPLE_MAX` |
| `conversation_count` | int | yes | total conversations the companion has seen |
| `last_conversation_recap` | string | yes | `normalizeSnippet` clamped to 220 chars |
| `last_conversation_at` | int \| null | yes | epoch ms |
| read-meta fields | various | yes | matches `memories-list.md` |
| `is_delta` | bool | yes | `true` when `sinceTurnId` was supplied AND `> 0` |
| `since_turn_id` | string \| null | yes | echoed `turn-<N>` when delta mode active |
| `threads` | array | yes | history threads; clipped by `limit` |

## `POST /history/annotate_turn` request

```json
{
  "turn_id": "turn-42",
  "studio": { /* studio metadata object */ }
}
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `turn_id` (or `turnId`) | string | yes | parsed via `parseTurnIdToNumber`; must resolve to a positive integer |
| `studio` | object | yes | passed through `sanitizeStudioTurnMetadata` (also accepts the request body as the studio object directly) |

## `POST /history/annotate_turn` response

### 200 success

```json
{
  "ok": true,
  "action": "annotate_turn",
  "status": "updated",
  "turn_id": "turn-42",
  "session_id": "sess_abc",
  "state_version": "v9",
  "last_turn_id": "turn_xyz",
  "last_updated_at": 1715620920000,
  "history_updated_at": 1715620920000,
  "memory_updated_at": 1715620920000,
  "schema_version": 1,
  "backend_build": "build-id",
  "backend_boot_id": "boot-id"
}
```

### 400 — validation

| `error` | `stage` | Cause |
| --- | --- | --- |
| `valid_turn_id_required` | `history_annotate_turn` | `turn_id` missing or `parseTurnIdToNumber` returned ≤ 0 |
| `studio_metadata_required` | `history_annotate_turn` | `studio` missing or `sanitizeStudioTurnMetadata` returned null |

### 404 — missing turn

| `error` | `stage` | Cause |
| --- | --- | --- |
| `turn_not_found` | `history_annotate_turn` | no history item matches `turnNumber` after the lookup |

## Read-state headers

GET 200/304 and POST 200 responses set:
- `Cache-Control: no-store`
- All headers from `applyReadStateHeaders(res, readMeta)`.

`POST /history/annotate_turn` 200 additionally sets:
- `x-turn-id: turn-<N>`
- `x-turn-meta-available: 1`

POST 400/404 validation and missing-turn responses do not build
read-state metadata today, so they only carry the `{ stage, error }`
body.

## Invariants

- Annotations MERGE studio metadata onto the matching history
  item — they don't replace the prior studio object outright.
- Success requires at least one matching history item. In the
  normal data model turn ids are unique, but if duplicate rows
  exist the handler annotates every row with the matching turn.
- `is_delta` in the list response is true iff `sinceTurnId`
  was supplied AND parsed to a positive number.
- `screenplayProjectId` filter on the list narrows threads
  to those tagged with the project id (passed through to
  `buildConversationHistoryThreads`).

## Compatibility rules

- iOS keys on `threads[]`, `state_version`, `since_turn_id`,
  `conversation_count`, `last_conversation_at`.
- Adding optional fields is tolerated.
- Removing any of the read-meta fields, `threads`, or the
  annotate 200 envelope keys requires a schema bump.
- The annotate request accepts both `turn_id` and `turnId` —
  this dual-naming is intentional (matches the rest of the
  per-user surface) and stable.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the two inline handlers in `backend/index.js`.
