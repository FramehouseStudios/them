# outbox-routes envelope schemas

Canonical request + response shapes for the two `/outbox/*`
HTTP routes — the operator-facing surface for inspecting the
durable side-effect queue (record shape in
`docs/schemas/outbox-event.md`).

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/outbox` | list envelope (200; auth 401; disabled 404) |
| POST | `/outbox/retry` | retry envelope (200 / 404 / 409; auth 401) |

Body limit on `/outbox/retry`: `256kb`.

## Schema version

`1`. Field sets are stable; additive only.

## Owner

- **Backend**: `backend/lib/outbox_routes.js`.
- **Consumer**: ops dashboards + operator CLI tools. iOS does
  NOT consume these routes today.

## Access-control posture

**SERVER-OPERATOR ONLY**. The global outbox can contain payloads from many
users, so ordinary user authentication and the app's shipped `X-APP-TOKEN`
do not authorize either route. Both routes require the server-only
`X-OUTBOX-OPERATOR-TOKEN` header to exactly match `OUTBOX_OPERATOR_TOKEN`.
The comparison uses fixed-length SHA-256 digests with `timingSafeEqual`.
This credential is additive: when the global app-token gate is enabled, an
operator client supplies both `X-APP-TOKEN` and `X-OUTBOX-OPERATOR-TOKEN`.

When `OUTBOX_OPERATOR_TOKEN` is unset, the HTTP control plane is disabled and
both routes return `404`. This does not disable the internal outbox worker.
Production rejects configured operator tokens shorter than 32 characters.

## `GET /outbox` request

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `status` | string | no | one of `all`, `pending`, `completed`, `failed`. Unknown values fall back to `all`. |
| `limit` | int | no | `parseQueryLimit(.., 80, 500)` — default 80, max 500 |

## `GET /outbox` response (200)

```json
{
  "ok": true,
  "status_filter": "pending",
  "limit": 80,
  "count": 12,
  "items": [ /* OutboxRow[] — see outbox-event.md */ ]
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | bool | yes | constant `true` |
| `status_filter` | string | yes | echo of the normalized raw query string. Unknown values still query as `all`, but this field remains the submitted value. |
| `limit` | int | yes | echo of the resolved limit |
| `count` | int | yes | `items.length` for the returned page |
| `items` | array | yes | outbox rows matching `outbox-event.md` |

## `POST /outbox/retry` request

```json
{ "id": "ob_abc123" }
```

Or for batch retry:

```json
{ "limit": 32 }
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | no | when supplied (non-empty after trim), retry only this item |
| `limit` | int | no | when `id` NOT supplied, batch size; clamped via `parseQueryLimit(.., OUTBOX_WORKER_BATCH_SIZE, 200)` |

## `POST /outbox/retry` response — single-item

### 200 success
```json
{ "ok": true, "id": "ob_abc123", "status": "completed", "error": null, "item": { /* row */ } }
```

### 404 not found
```json
{ "ok": false, "id": "ob_abc123", "status": "", "error": "not_found", "item": null }
```

### 409 conflict (anything else)
```json
{ "ok": false, "id": "ob_abc123", "status": "<status>", "error": "<code>", "item": null }
```

| HTTP | Cause |
| --- | --- |
| 200 | `processSingleOutboxItemById` returned `ok: true` |
| 404 | `result.error === "not_found"` |
| 409 | any other failure (terminal status, drainer error, etc.) |

## `POST /outbox/retry` response — batch

```json
{ "ok": true, "claimed": 12, "completed": 8, "failed": 3, "retried": 1 }
```

Fields beyond `ok` come from `processOutboxBatch` (see
`outbox_store.js`). The route spreads them into the envelope.

## Invariants

- Single-item path is taken iff `req.body.id` is non-empty
  after `trim()`. `id: ""` falls into the batch path.
- `items` in `GET /outbox` matches `outbox-event.md`
  field-for-field; this doc doesn't re-list those fields.
- Batch retry counts are integer-only.

## Compatibility rules

- Ops dashboards key on `items[]` shape + `count`.
- Adding new status filter values is additive. Consumers must
  tolerate unknown `status_filter` echoes because the current
  handler falls back to querying `all` while echoing the raw
  submitted filter.
- Adding new fields to the retry envelope is additive.
- Removing `ok`, `id` (single-item), or `claimed`/`completed`/
  `failed`/`retried` (batch) requires a schema bump.

## V1 alignment

Not in the V1 checklist; operator-only surface. Documenting
the contract keeps it stable through any future decomposition.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the two inline handlers in `backend/index.js`.
