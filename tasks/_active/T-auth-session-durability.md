---
id: T-auth-session-durability
title: Make auth sessions durable before success responses
owner: codex
status: review
branch: codex/T-auth-session-durability
pillar: longitudinal learning
v1_pillar: ios
v1_effect: prevents newly created accounts and rotating refresh sessions from being reported as successful before canonical persistence completes.
---

## Scope

- Await the existing user-store persistence queue before any mutating auth
  handler returns success.
- Return a stable failure instead of claiming success when canonical auth
  persistence fails, and only mark it retryable after durable compensation.
- Serialize auth mutations, restore the pre-request checkpoint on persistence
  failure, and keep bearer reads from observing transient rotation state.
- Verify Apple identity before entering the mutation lock and bound JWKS
  discovery so an identity-provider stall cannot block every authenticated
  request.
- Fail production startup closed when canonical auth records cannot be read;
  never authenticate from a stale local snapshot during a database outage.
- Treat an initialized-but-empty canonical auth store as authoritative so a
  stale legacy JSON mirror cannot resurrect deleted users or sessions.
- Hydrate and prune every canonical auth page so records beyond the adapter's
  10,000-row page cap cannot disappear from revocation or later reappear.
- Validate the canonical marker and stage the complete auth identity graph
  before swapping it live, rejecting malformed rows, key mismatches, orphaned
  credentials, duplicate identities, and incomplete login mechanisms without
  clearing the last known-good in-memory state.
- Accept Apple account creation/linking only from a token-verified email claim;
  never substitute the request body's email for missing identity data.
- Require production Apple audience validation so tokens issued for another
  app cannot authenticate here.
- Revoke account sessions durably before scheduling deletion, so no failed
  compensation can leave an unacknowledged hard deletion queued.
- Commit lifecycle state and its audit record atomically so an audit failure
  cannot leave an unacknowledged deletion or cancellation behind.
- Keep legacy-import dry runs read-only, validate the entire legacy auth
  snapshot before any database operation, and replace all four auth tables
  plus the canonical marker in one rollback-safe Postgres transaction.
- Require an explicit destructive opt-in for an authoritative empty auth
  replacement; schema-only must neither clear auth data nor silently authorize
  an empty database, and production must reject uninitialized canonical auth.
- Reject contradictory email-verification state and password records whose
  digest encoding or PBKDF2 work factor could bypass comparison or block login.
- Preserve existing access/refresh token contracts and iOS Keychain restore.
- Do not create, commit, log, or expose account credentials.

## Done when

- Signup, login, refresh, logout, session revocation, reset, and verification
  handlers settle their queued persistence writes before a success response.
- A delayed adapter proves signup does not answer early; adapter failures
  produce `503 auth_persistence_failed` without leaking tokens, and the
  `retryable` flag truthfully reflects whether rollback became durable.
- Slow Apple JWKS discovery does not block bearer auth or unrelated signup,
  and a real production boot exits when Postgres is unavailable.
- An Apple token without a verified email cannot take over a password account
  by supplying its email in the request body; known Apple subjects can still
  sign in when later tokens omit email.
- Empty canonical state survives restart without legacy resurrection; all
  auth pages hydrate and prune; failed durable revocation restores both live
  and canonical sessions without first scheduling deletion.
- Invalid canonical metadata or identity rows fail closed while preserving
  live state; exact-snapshot imports remove omitted stale credentials only at
  commit and restore the complete prior snapshot on rollback.
- Deletion scheduling and cancellation each use one atomic Postgres statement;
  an audit-write failure leaves the prior lifecycle state unchanged.
- Production rejects missing or mismatched Apple audiences, and failed or
  dry-run legacy imports cannot publish partial authoritative auth state.
- Empty imports fail closed without explicit authorization, and corrupted
  verification/password records fail before database writes or live hydration.
- Schema-only setup leaves an empty auth database uninitialized; production
  fails closed until a validated exact import publishes its canonical marker.
- The V1 single-instance constraint is explicit until auth snapshot writes are
  replaced by row-scoped transactions and refresh-token compare-and-swap.
- Focused auth/persistence tests, iOS session-restore tests, strict pre-flight,
  and `git diff --check` pass.

## Verification

- `npm test` in `backend/`: 2,238 passed, 1 skipped, 0 failed.
- Focused Apple/auth/account/persistence/migration suite: 222 passed, 0
  failed.
- Focused iOS account/session restore and workspace-auth policy: 20 passed, 0
  failed on iPhone 17 Pro (iOS 26.2 simulator).
- Canon/V1 deterministic quality gate, including the learned-answer realtime
  voice smoke and craft completeness: passed. The live regression/provider
  gate remains external because this environment has no valid live provider
  credential.
- Strict pre-flight, task front matter, syntax checks, and `git diff --check`:
  passed.
- Repository-wide task sync still reports only the pre-existing legacy/orphan
  task debt; this task's row and status are synchronized.
