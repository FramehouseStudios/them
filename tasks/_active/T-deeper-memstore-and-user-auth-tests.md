---
id: T-deeper-memstore-and-user-auth-tests
title: Deeper tests for memory_store + user_auth
owner: claude
status: review
branch: claude/T-deeper-memory-store-tests
pillar: infra (test coverage)
v1_pillar: infra
v1_effect: closes the deeper coverage gap for memory_store (V1 line 49) and user_auth (V1 line 17 + tier-3 surface)
---

## Scope

Ships the **deeper** tier of coverage for two stateful libs:

### memory_store_deeper.test.mjs (10 tests)

Extends #216's smoke surface with:
- `sanitizeClientTokenAliasList` order preservation + 24-default cap.
- Multi-alias IP registration round-trip.
- Sequential `setPersistedUserMemoryForIp` calls update the same IP.
- Save → reset → load round-trip preserves multiple users.
- Save produces a valid JSON file.
- Cleanup respects `USER_MEMORY_MAX_TRACKED` (5-entry cap via the
  save-triggered cleanup chain).
- Live `userMemoryByIp.size` accessor reflects mutations.
- Tolerates empty memory object.

### user_auth_deeper.test.mjs (12 tests)

Extends #218's smoke surface with:
- `buildPublicUser` exposes snake_case keys (`user_id`, `email`,
  `email_verified`, `created_at`, `auth_provider`).
- `buildPublicUser` strips `passwordHash`, `salt`, `appleSubject`.
- `buildPublicUser` derives `auth_provider` from `appleSubject` /
  `password` presence.
- `buildManagedSession` tolerates null/undefined/empty.
- `createUserAuthSubsystem` returns 12 named handlers +
  `protectUserRoutes`.
- `handleAuthSignup` + `handleAuthLogin` return 503
  `user_auth_not_configured` when JWT secret is missing in
  production.
- Error envelope has `stage` + `error` keys.

## What this PR does NOT cover

- Full handler round-trips (signup → login → refresh → logout,
  password-reset, email-verification, Apple flow). Each requires
  a real user_store backing + real JWT signing and belongs in its
  own scoped PR.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: closes the deeper coverage gap for memory_store
  (V1 line 49 — block-signal history + character mentions persist
  through this lib) and user_auth (V1 line 17 — talk pipeline auth
  + tier-3 surface stability).`

## Verification

`node --test backend/tests/memory_store_deeper.test.mjs
backend/tests/user_auth_deeper.test.mjs` → **22/22 pass**.

## Followups

Full handler round-trip tests for user_auth (the harder PR) stay
filed in `T-untested-libs-followups`. memory_store sanitize-path
coverage is now genuinely deeper; further fixtures could exercise
the cross-user isolation + adapter dual-write paths but those are
already lightly covered through the route tests.
