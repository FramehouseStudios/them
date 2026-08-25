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
- The V1 single-instance constraint is explicit until auth snapshot writes are
  replaced by row-scoped transactions and refresh-token compare-and-swap.
- Focused auth/persistence tests, iOS session-restore tests, strict pre-flight,
  and `git diff --check` pass.

## Verification

- `npm test` in `backend/`: 2,131 passed, 1 skipped, 0 failed.
- Focused auth/account/persistence/startup/realtime suite: 138 passed, 0
  failed.
- iOS session restore and credential migration: 33 passed, 0 failed.
- Canon/V1 deterministic quality gate, including the learned-answer realtime
  voice smoke: passed. Live provider audio gates remain external because the
  local OpenAI credential returns `provider_auth` 401.
- Strict pre-flight, task front matter, syntax checks, and `git diff --check`:
  passed.
- Repository-wide task sync still reports only the pre-existing legacy/orphan
  task debt; this task's row and status are synchronized.
