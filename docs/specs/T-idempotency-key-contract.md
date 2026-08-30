# Spec: T-idempotency-key-contract

**Status**: ready (support agent can implement) + handoff to Codex for the
iOS outbox usage.
**Owner**: support (backend contract) → codex (iOS outbox consumer).
**V1 pillar**: talk
**V1 effect**: makes the iOS offline outbox safe — without an
idempotency contract, retried POSTs after network recovery create
duplicate turns / scenes / memory writes. Today `/talk` honors
`X-Idempotency-Key` via `createTalkIdempotencyHelpers`
(see `backend/lib/talk_state.js`), but no other route does, and the
contract isn't written down.

## Problem

The talk path already implements idempotency:
- `X-Idempotency-Key` header (optional, client-generated UUID)
- In-memory cache keyed by `(session_id, idempotency_key)`
- Same key within `TALK_IDEMPOTENCY_TTL_MS` returns the cached
  response without re-executing the handler

But the iOS outbox (`T-ios-offline-outbox`) needs the same guarantee
for any retried POST. If the outbox retries a screenplay save, a
memory mention write, or a creative-memory delete, the backend must
collapse duplicates. Today only `/talk` does.

## Scope

In:
- Document the canonical contract once, in this spec.
- Extract a reusable `withIdempotency(handler, deps)` envelope in
  `backend/lib/idempotency_envelope.js` so future routes adopt it
  without re-implementing.
- Wire the envelope into the two highest-value V1 routes after
  `/talk`: `/memories/record-character-mention` and
  `/screenplay/projects/:id/save` (or whichever screenplay write is
  most retry-prone — Codex to confirm).
- Add a test that exercises the envelope: same key returns cached
  body + status; different key executes; expired key re-executes.

Out:
- Cross-instance idempotency. Single-instance in-memory cache is
  sufficient for V1; if the backend scales horizontally, this becomes
  a Redis-backed move (`T-idempotency-redis-followup`).
- Idempotency for GET / DELETE routes. Contract is POST/PUT/PATCH only.

## The contract

### Request

- **Header**: `X-Idempotency-Key: <uuid-or-opaque-string>`
- Client SHOULD use a v4 UUID. Backend treats it as an opaque string
  ≤ 128 chars. Empty / missing key → no idempotency (handler runs
  fresh each time).

### Cache key

- Composite of `(authenticated_user_id, route_path, x_idempotency_key)`.
- For `/talk`, the route uses `(session_id, key)` as it does today;
  the envelope generalizes to user-id for non-talk routes.

### Replay behavior

- First request: handler executes; response is cached with status,
  headers (minus Set-Cookie), and JSON body. TTL defaults to 10 min
  per `TALK_IDEMPOTENCY_TTL_MS`.
- Subsequent request with the same key, within TTL: backend returns
  the cached status + body, with header `X-Idempotency-Replayed: 1`
  added.
- After TTL expiry: handler runs again (idempotency window closed).
- Request body bytes are hashed and compared against the cached
  request hash. If the body differs, return `409 Conflict` with
  `{"error": "idempotency_key_reused_with_different_body"}`. (This
  catches the case where a client reuses a key by mistake.)

### Error responses

- 5xx responses are NOT cached; the client should retry.
- 4xx responses (other than `409 idempotency_key_reused_*`) ARE
  cached, so a bad request doesn't get re-executed on retry.

### Headers passed through

- `Content-Type`, `Cache-Control` from the cached response.
- `X-Idempotency-Replayed: 1` added on replay.
- `Set-Cookie` is stripped (no session token replay).

## Acceptance

- `backend/lib/idempotency_envelope.js` exists, exports
  `withIdempotency(handler, deps)`.
- At least one non-talk route adopts the envelope and gains tests.
- `/talk` continues to honor `X-Idempotency-Key` byte-identically.
- A new file `docs/api/idempotency-key.md` documents the contract for
  consumers (Codex iOS outbox in particular).
- Tests cover: cache hit, cache miss, expired key, body-mismatch 409,
  5xx not cached, 4xx cached.

## Risks

- Cache memory growth. Mitigation: existing TALK_IDEMPOTENCY_MAX_ENTRIES
  LRU bound is the model; the envelope inherits it.
- Cross-user key collision. Mitigation: cache key includes user-id.

## iOS outbox usage (Codex)

When the outbox enqueues a POST, it generates a fresh v4 UUID and
attaches `X-Idempotency-Key: <uuid>`. The same UUID is reused on
every retry of that entry. Once the backend acks 2xx, the outbox
removes the entry. If the outbox crashes between server-ack and
removal, the next launch retries the same key → backend replays the
cached 2xx → outbox removes the entry. No duplicate writes.
