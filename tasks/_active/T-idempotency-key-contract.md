---
id: T-idempotency-key-contract
title: Cross-route idempotency-key contract + reusable envelope
owner: support
status: review
branch: support/backend-idempotency-envelope
pillar: talk
v1_pillar: talk
v1_effect: makes the iOS offline outbox safe across all retry-prone routes; without this, retried screenplay saves / memory writes would create duplicates.
---

## Scope

Spec: `docs/specs/T-idempotency-key-contract.md`.

- `backend/lib/idempotency_envelope.js`: `withIdempotency(handler, deps)`
  envelope, in-memory LRU cache, body-hash mismatch → 409, 5xx not cached.
- 10 tests in `tests/idempotency_envelope.test.mjs`.
- Helper extraction only; wiring into specific routes (memory, screenplay)
  lands in follow-up PRs scoped to each adoption.

## Done when

- `node --test tests/idempotency_envelope.test.mjs` green (10/10).
- Spec defines the contract for the iOS outbox consumer.
- `/talk` continues to use its existing helper byte-identically.
- Follow-up adoption tasks filed (memory, screenplay write routes).
