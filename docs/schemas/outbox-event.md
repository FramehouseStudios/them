# outbox-event record schema

Canonical record shape for entries in the outbox store
(`backend/lib/outbox_store.js`). Outbox entries are the durable
queue of side-effects (note capture, email compose, calendar
compose) that survive process restarts and replay deterministically
via the scale-backplane.

## Owner

- **Backend / record shape**: support agent. Defined in
  `backend/lib/outbox_store.js`. Persisted via the
  `scaleBackplane.enqueueOutbox / claimDueOutbox / updateOutbox /
  listOutbox` interface.
- **Consumers**: per-effect drainers configured at startup:
  - `note_capture` → `captureLocalNote`
  - `email_compose` → `sendLocalEmail`
  - `calendar_compose` → `buildCalendarComposeUrl`
- **iOS visibility**: none. Outbox is server-internal — iOS sees
  only the user-facing effects (delivery status fields on
  request_password_reset, email_verification, etc.).

## Access-control posture

**PER-USER**. Records can reference user ids and PII inside
`payload` (e.g. email addresses, note text). Never expose outbox
records to iOS or to public surfaces. Read access is operator-only.

## Schema version

Implicit `1`. Field set tracks the row built by
`enqueueActionOutbox` in `backend/lib/outbox_store.js`. Schema
version is implicit (not an explicit row field today); consumers
tolerate unknown fields.

## Record shape

Exactly as written by `enqueueActionOutbox` and updated by
`processOutboxBatch` / `retryOutboxAction` / `runOutboxWorkerTick`.

```json
{
  "id": "a8b9c1d2-...",
  "type": "email_compose",
  "actionKey": "outbox_email_compose::{\"recipient\":\"writer@example.com\"}",
  "status": "pending",
  "attempts": 0,
  "createdAt": 1715620920000,
  "updatedAt": 1715620920000,
  "nextAttemptAt": 1715620920000,
  "payload": { "recipient": "writer@example.com", "subject": "Reset", "body": "..." },
  "result": {},
  "lastError": ""
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | UUID set by `randomUUID()` at enqueue |
| `type` | string | yes | normalized via `normalizeLocalActionType()`; one of `note_capture`, `email_compose`, `calendar_compose`, or other drainer-defined values |
| `actionKey` | string | yes | dedup key; either caller-supplied or built via `buildOutboxActionKey(type, payload)` which signs `outbox_<type>` + the payload |
| `status` | string | yes | one of `pending`, `completed`, `failed` (see status values below) |
| `attempts` | int | yes | retry counter; bounded by `OUTBOX_RETRY_MAX_ATTEMPTS` |
| `createdAt` | int | yes | epoch ms; set at enqueue |
| `updatedAt` | int | yes | epoch ms; bumped on every status transition |
| `nextAttemptAt` | int | yes | epoch ms; entry is eligible when `Date.now() >= nextAttemptAt` |
| `payload` | object | yes | kind-specific; treat as opaque outside the type's drainer; never `null` (coerced to `{}`) |
| `result` | object | yes | drainer-emitted outcome; never `null` (coerced to `{}`) |
| `lastError` | string | yes | snippet (capped at 640 chars via `normalizeSnippet`); empty string when no error |

Field-name casing: the live code uses **camelCase** (`actionKey`,
`createdAt`, `updatedAt`, `nextAttemptAt`, `lastError`) — not
snake_case. Match the casing exactly when consuming or asserting.

## Status values (live)

| Value | Meaning |
| --- | --- |
| `pending` | newly enqueued OR retry-scheduled after a transient failure |
| `completed` | drainer reported success; terminal |
| `failed` | drainer reported a terminal failure OR retries exhausted; terminal |

Note: earlier drafts of this doc invented additional status
values and a separate completion-timestamp field. The live code
emits only the three status values above. `updatedAt` is the
canonical "when did the last transition happen" stamp — there is
no separate completion-stamp field.

## Lifecycle

1. **enqueue** — caller invokes `enqueueActionOutbox({ type,
   payload, status?, retryAt?, actionKey?, result? })`. Store
   builds the row above and calls
   `scaleBackplane.enqueueOutbox(row)`. If the backplane reports
   `duplicate: true`, the duplicate row is returned unchanged.
2. **claim** — `processOutboxBatch({ limit })` calls
   `scaleBackplane.claimDueOutbox(limit)` which returns up to
   `limit` items with `status: pending` and
   `nextAttemptAt <= now`.
3. **retry** — `retryOutboxAction(item)` dispatches by `type`,
   calling the matching drainer. The result is mapped to a
   `{ ok, done, error, result }` tuple.
4. **update** — on `done: true`, status transitions to
   `completed` (success) or `failed` (terminal failure). On
   non-terminal failures, status stays `pending` and
   `nextAttemptAt` is advanced via `computeOutboxRetryAt(attempts)`
   (exponential backoff: 1× → 32× of `OUTBOX_RETRY_BASE_DELAY_MS`).

## Per-type payload + result

### `note_capture`
- payload: `{ noteText: string }` (max 1600 chars via `normalizeSnippet`).
- success result: `{ status: "saved", ... }` from `captureLocalNote`.
- terminal error: missing `noteText` → `missing_note_text`.

### `email_compose`
- payload: `{ recipient, subject, body }`.
- success result: `{ status: "composed", recipient, subject, body }`.
- terminal errors: `needs_recipient`, `needs_content`, `disabled`.

### `calendar_compose`
- payload: `{ title, startAt, endAt, target }` (target falls back
  to `CALENDAR_COMPOSE_TARGET`).
- success result: `{ status: "composed", composeUrl, ... }` built
  via `buildCalendarComposeUrl`.

## Invariants

- Claim must be atomic enough that two drainers don't double-send
  on the same entry. The `scaleBackplane` impl handles
  serialization.
- A `completed` entry MUST NOT be retried. Drainers gate on
  `status === "pending"`.
- A `failed` entry stays failed; operators may re-enqueue manually
  via `processSingleOutboxItemById`.
- `payload` for sensitive flows (password reset, email
  verification) carries token hashes, never plaintext.

## Compatibility rules

- New `type` values are additive — drainers that don't recognize
  a type return `{ ok: false, done: true, error: "unsupported_type" }`
  which marks the entry terminal.
- New optional fields on records are tolerated by readers; old
  rows without them read with defaults.
- Renaming any top-level field requires a coordinated migration
  because `scaleBackplane` adapters key on these names.

## Drift check

The `schema-doc-backend-drift` pre-flight rule (introduced in
#257) audits this doc against
`backend/lib/outbox_store.js` for the canonical field set
+ status values. If a status or field is added in code without
landing in this doc, pre-flight flags it.

## Changelog

- v1 — initial documented shape, matched line-by-line against the
  canonical record built by `enqueueActionOutbox` in
  `backend/lib/outbox_store.js`. Earlier draft used snake_case
  field names and a richer state machine that did not exist in
  the live code; this version corrects to the actual camelCase
  fields and the `pending | completed | failed` status set.
