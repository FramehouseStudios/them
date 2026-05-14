# outbox-event envelope schema

Canonical record shape for entries in the outbox store
(`backend/lib/outbox_store.js`). Outbox entries are the durable
queue of side-effects (emails, third-party API calls, deferred
writes) that survive process restarts and replay deterministically.

## Owner

- **Backend / record shape**: Claude. Defined in
  `backend/lib/outbox_store.js`.
- **Consumers**: backend snapshotter (`outbox_snapshotter.js`) and
  the per-effect drainers (email transport, etc.).
- **iOS visibility**: none. Outbox is server-internal — iOS sees
  only the user-facing effects (delivery status fields, etc.).

## Access-control posture

**PER-USER**. Records can reference user ids and PII (e.g. email
addresses for delivery). Never expose outbox records to iOS or to
public surfaces. Read access is operator-only.

## Schema version

`1`. Additive only. Schema version is implicit; consumers tolerate
unknown fields.

## Record shape

```json
{
  "id": "ob_2026-05-13T17:42:00Z_a8b9",
  "kind": "email.password_reset",
  "created_at": 1715620920000,
  "attempts": 0,
  "next_attempt_at": 1715620920000,
  "status": "pending",
  "payload": { "user_id": "u_abc", "to": "writer@example.com", "token_hash": "..." },
  "last_error": null,
  "completed_at": null
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | sortable id with embedded timestamp |
| `kind` | string | yes | dotted namespace (`email.password_reset`, `email.email_verification`, etc.) |
| `created_at` | int | yes | epoch ms |
| `attempts` | int | yes | retry counter; bounded by per-kind max |
| `next_attempt_at` | int | yes | epoch ms; entry is eligible when `Date.now() >= next_attempt_at` |
| `status` | string | yes | `pending` \| `in_flight` \| `succeeded` \| `failed_permanent` |
| `payload` | object | yes | kind-specific; treat as opaque outside the kind's drainer |
| `last_error` | string \| null | yes | one-line cause for the last failed attempt |
| `completed_at` | int \| null | yes | epoch ms; set when status transitions to terminal |

## Lifecycle

1. **enqueue** — caller writes `{ kind, payload }`. Store fills
   `id`, `created_at`, `attempts: 0`, `status: "pending"`,
   `next_attempt_at: created_at`.
2. **claim** — drainer scans for `status: "pending" &&
   next_attempt_at <= now`, transitions to `in_flight`.
3. **complete** — drainer transitions to `succeeded` or schedules
   a retry (`next_attempt_at += backoff(attempts)`).
4. **permanent fail** — after max attempts, transitions to
   `failed_permanent` with `last_error` populated.

## Invariants

- Claim must be atomic enough that two drainers don't double-send
  on the same entry. In-process file store uses a single-writer
  pattern.
- A `succeeded` entry MUST NOT be retried. Drainers check `status`
  before acting.
- `failed_permanent` requires operator inspection — never auto-
  retried.
- `payload` for `email.*` kinds carries token hashes, never the
  plaintext token. Outbox is durable; plaintext tokens are not.

## Replay

`outbox_snapshotter.js` writes periodic snapshots so that on
restart the in-memory state can be rebuilt. The replay is
deterministic in the sense that the same snapshot + same
subsequent enqueues yields the same record set.

## Compatibility rules

- New `kind` values are additive — drainers that don't recognize
  a kind leave the entry alone.
- New optional fields on records are tolerated; old records
  without them are read with defaults.
- Renaming or removing top-level fields requires a coordinated
  drain-then-migrate.

## Changelog

- v1 — initial documented shape. Matches the canonical structure
  in `backend/lib/outbox_store.js`.
