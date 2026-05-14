# memories-mutate envelope schemas

Canonical request + response shapes for the four `/memories/*`
mutation routes. Sibling to `memories-list.md` (read) and
`memories-export.md` (full dump).

## Endpoints

| Method | Path | Verb | Returns |
| --- | --- | --- | --- |
| POST | `/memories/update` | mutate a memory card | 200 / 400 update envelope |
| POST | `/memories/forget` | delete a memory card | 200 / 400 forget envelope |
| POST | `/memories/promote` | promote a card to a theme | 200 / 400 promote envelope |
| POST | `/memories/feedback` | record human feedback on a card | 200 / 400 feedback envelope |

All four share the same body limit (`256kb`), the same
read-state headers cycle, and the same `memory_quality` /
read-meta sub-envelope. They differ in `action`, `status`
verbs, and per-route fields.

## Schema version

`1`. All four envelopes carry `schema_version` derived from
`buildReadStateMeta`.

## Owner

- **Backend**: Claude. Inline handlers in `backend/index.js`
  (will move to `backend/lib/memories_route.js` in Phase 6 per
  #228 design note).
- **iOS**: Codex. Powers the memory-card UI (edit / delete /
  promote / feedback buttons).

## Access-control posture

**PER-USER**. Each mutation resolves the writable context via
`resolveWritableMemoryContext(req, nowTs)` and persists via
`persistWritableMemoryContext`. Same scope rules as
`memories-list.md`.

## Shared request fields

All four routes accept these fields (per-route subsets):

| Key | Type | Notes |
| --- | --- | --- |
| `card_id` (or `id`) | string | normalized via `normalizeMemoryCardId`; required by all four |
| `key` | string | trimmed; theme-key alias of `card_id` (one of the two is required) |
| `title` | string | `normalizeSnippet`-clamped to 84 chars; only on `update` + `promote` |
| `summary` | string | clamped to 260 chars; only on `update` + `promote` |
| `reason` | string | clamped to 220 chars; only on `update` + `promote` |

## Shared response envelope (fields all four return)

```json
{
  "ok": true,
  "action": "update | forget | promote | feedback",
  "status": "<verb-specific>",
  "message": null,
  "session_id": "sess_abc",
  "state_version": "v9",
  "last_turn_id": "turn_xyz",
  "last_updated_at": 1715620920000,
  "history_updated_at": 1715620920000,
  "memory_updated_at": 1715620920000,
  "backend_boot_id": "boot-id",
  "memory_quality": { /* memory-stats.md shape */ },
  "schema_version": 1,
  "backend_build": "build-id"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | bool | yes | `true` on success, `false` on 400 |
| `action` | string | yes | one of `update / forget / promote / feedback` |
| `status` | string | yes | per-route success/failure verb (see each route below) |
| `message` | string \| null | yes | on failure, a short cause; null on success |
| `session_id` ... `backend_build` | various | yes | the standard read-state metadata from `applyReadStateHeaders` / `buildReadStateMeta` (matches `memories-list.md`) |
| `memory_quality` | object | yes | refreshed snapshot — same shape as `memory-stats.md` |

All four routes also set:
- `Cache-Control: no-store`
- Headers from `applyReadStateHeaders(res, readMeta)`.

## Per-route fields + status verbs

### `POST /memories/update`

Extra response fields:
- `memory_card`: the updated card object (or `null` if not
  found in the rebuilt cards list).

Statuses: `updated` on success, `failed` on 400 (e.g. unknown
card_id).

### `POST /memories/forget`

Extra response fields:
- `forgotten_id`: id of the card that was forgotten (echoes
  `card_id` or the canonical id resolved from `key`).
- `theme_key`: theme key derived from the forgotten card, or
  empty string.

Statuses: `forgotten` on success, `failed` on 400.

### `POST /memories/promote`

Extra response fields:
- `memory_card`: the promoted card object (or null).
- `theme_key`: theme-key the card was promoted under.

Statuses: `promoted` on success (the lib also returns
`created: 1` when the theme was new — surfaces in the
`message` field), `failed` on 400.

### `POST /memories/feedback`

Same shared envelope; no extra fields. Statuses: `recorded` on
success, `failed` on 400.

## Invariants

- `ok: true` ↔ HTTP 200. `ok: false` ↔ HTTP 400.
- Every successful mutation persists via
  `persistWritableMemoryContext` before the response is built —
  the response always reflects the post-mutation state.
- `memory_quality` reflects the **post-mutation** state, not
  the pre-mutation state.
- Read-state headers (`state_version`, etc.) update with the
  new persisted memory state version.
- `update` + `promote` echo the updated card; `forget` does
  not (the card is gone) — `forgotten_id` is the only echo.

## Compatibility rules

- iOS keys on `ok`, `action`, `status`, `memory_card` (update +
  promote), `forgotten_id` (forget), `state_version`.
- Adding optional response fields is tolerated.
- Removing any of `ok`, `action`, `status`, `state_version`
  requires a schema bump.
- The `update` / `promote` status verbs are stable; adding a
  new status value (e.g. `unchanged`) is additive.

## V1 alignment

V1 line 54 ("Human privacy decision is made for full memory
export/delete") gates the `forget` route's full-data-deletion
semantics on a human policy call. The route ships now; the
policy call is iOS-driven. The schema doc canonicalizes the
backend response so the policy decision doesn't reshape the
contract afterwards.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the four inline handlers in `backend/index.js`. Will be
  amended when Phase 6 extracts the routes to
  `backend/lib/memories_route.js` per the #228 design note.
