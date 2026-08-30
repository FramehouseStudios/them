---
id: T-user-auth-roundtrip-tests
title: Full handler round-trip tests for backend/lib/user_auth.js
owner: support
status: review
branch: support/T-user-auth-roundtrip-tests
pillar: infra (test coverage)
v1_pillar: infra
v1_effect: closes the last untested-libs gap for the tier-3 auth surface — auth gates every V1 iOS contract
---

## Scope

Closes the deferred followup from #241 by exercising the actual
handler flows iOS depends on with **real user_store + real JWT
signing** (no mocks for crypto).

13 round-trip tests across 7 flows:

### Signup (3 tests)
- Creates a user and returns access+refresh tokens; the access
  token verifies with the configured HS256 secret.
- Rejects duplicate email with 409 `email_taken`.
- Rejects short password with 400 `password_too_short`.

### Login (3 tests)
- Returns access+refresh tokens for valid credentials.
- Rejects unknown email with 401 `invalid_credentials`.
- Rejects wrong password with 401 `invalid_credentials`.

### Refresh + rotation (3 tests)
- Refresh rotates the token and preserves `family_id` across the
  rotation (load-bearing for iOS session-list UX).
- Using a rotated refresh token a second time fails.
- Missing `refresh_token` returns 4xx.

### Logout (1 test)
- Invalidates the refresh token; subsequent refresh with the same
  token fails.

### Password reset (2 tests)
- `request_password_reset` issues a `debug_password_reset_token`
  in non-production mode.
- `reset_password` consumes the token, revokes all sessions for
  the user (security invariant), and the new password works for
  subsequent login.

### Email verification (1 test)
- Signup with `requireEmailVerification: true` issues a debug
  verification token; `verify_email` consumes it and the response
  succeeds.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the last untested-libs gap for the tier-3
  auth surface. Auth gates every V1 iOS contract (talk, screenplay,
  memory, realtime). A regression in the signup→login→refresh
  flow would silently break iOS.`

## Verification

`node --test backend/tests/user_auth_roundtrip.test.mjs` → **13/13
pass**. Uses real `user_store` (in-memory + temp JSON store) and
HS256 JWT signing with a test secret.

## What this does NOT cover

- Apple Sign In identity-token verification (needs stubbed Apple
  JWKS).
- Production-mode JWT secret loading (the existing 503-when-
  missing path is already covered by #241).
- `protectUserRoutes` middleware (covered by route-level tests
  on protected endpoints).

## Done when

Round-trip tests ship + pass. `T-untested-libs-followups` can mark
the user_auth full-handler coverage complete.

## After this PR

The 7 stateful libs (utils, persona, screenplay_store, outbox_store,
memory_store, user_store, user_auth) are now covered at smoke +
deeper + (for user_auth) round-trip tiers. Pre-flight's
`lib-missing-test` rule is clean on main.
