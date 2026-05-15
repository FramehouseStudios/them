# Idempotency-Key — io.them backend client contract

This is the client-facing contract for retry-safe POST/PUT/PATCH
requests against the io.them backend. The primary consumer is the
iOS offline outbox (`T-ios-offline-outbox`), but the same contract
applies to any HTTP client that retries on transport failure.

The server-side implementation is documented in
`docs/specs/T-idempotency-key-contract.md` and lives in
`backend/lib/idempotency_envelope.js` (plus the older talk-path
helper in `backend/lib/talk_state.js`).

## When to send

Send `X-Idempotency-Key` on **every retry-prone POST/PUT/PATCH**.
Don't send it on GET, HEAD, OPTIONS, or DELETE — those are either
idempotent by definition or have their own retry semantics.

Always reuse the **same** key when retrying a request after a
transport failure or a 5xx server response.

Always generate a **new** key for a logically new request, even if
the body is similar.

## Header

```
X-Idempotency-Key: <opaque-string, ≤ 128 chars, recommended v4 UUID>
```

## Server behavior

| Server saw | Server does |
|---|---|
| First request with key K | Handler runs; response is cached under (user_id, route, K) for 10 min. |
| Same K, same body, within 10 min | Returns the cached status + body. Adds `X-Idempotency-Replayed: 1` header. Handler does NOT re-run. |
| Same K, **different body**, within 10 min | Returns `409 Conflict` with body `{"error":"idempotency_key_reused_with_different_body"}`. |
| Same K, after 10 min | Treats as a new request. Handler runs again. |
| Handler returned 2xx or 4xx (other than 409) | Response is cached. Retry returns the cached response. |
| Handler returned 5xx | Response is **not** cached. Retry will run the handler again. |

## Client recipe (iOS outbox example)

```
1. Outbox enqueues a POST. Generates a v4 UUID K and stores it
   alongside the request.
2. Outbox sends the request with `X-Idempotency-Key: K`.
3a. Server returns 2xx → outbox removes the entry. Done.
3b. Server returns 4xx (≠ 429, ≠ 409) → outbox marks the entry
    `parked` and surfaces it to the user. Same K means a retry is
    a no-op replay.
3c. Server returns 5xx or transport error → outbox schedules a
    retry with the SAME K. Backoff: 5s, 15s, 60s, 5m, 30m.
3d. Server returns 409 idempotency_key_reused_with_different_body
    → bug in the client. The outbox logs and parks the entry; do
    NOT silently rotate the key, because that masks the bug.
```

## Generating keys

- iOS: `UUID().uuidString`.
- Node: `crypto.randomUUID()`.
- Web: `crypto.randomUUID()`.

Keys are opaque to the server. Don't encode meaning into them.

## What the server ignores

- Whitespace at the head/tail of the value (trimmed).
- Keys longer than 128 chars (treated as no-key).
- Empty or missing header (treated as no-key — handler runs every time).

## Limitations (V1)

- The cache is in-memory per backend instance. If the backend scales
  horizontally, a retry routed to a different instance will execute
  fresh. V1 is single-instance, so this is acceptable.
- The cache survives at most 10 minutes. Don't retry an outbox entry
  beyond that window and expect the same idempotency guarantee.
- Audio multipart uploads (the talk path) use the existing
  `X-Idempotency-Key` honored by `createTalkIdempotencyHelpers`;
  same contract.

## Adoption status

| Endpoint | Idempotency-key honored? |
|---|---|
| `POST /talk` | Yes (via `createTalkIdempotencyHelpers`) |
| `POST /memories/*` | Planned (T-idempotency-key-contract follow-up) |
| `POST /screenplay/projects/:id/save` | Planned (T-idempotency-key-contract follow-up) |
| `DELETE /account` | Yes (via `withIdempotency` envelope) |

Anything not in the table assumes the legacy "send it and pray"
contract; the iOS outbox should avoid retrying those until they
adopt the envelope.
