---
id: T-deeper-lib-tests-batch
title: Deeper direct tests for user_store (with planned followups for memory_store + user_auth)
owner: support
status: review
branch: support/T-deeper-lib-tests-batch
pillar: infra (test coverage)
v1_pillar: infra
v1_effect: infrastructure for "iOS exposes a plain-language memory summary and refresh state" (V1 line 53) + tier-3 auth surface stability
---

## Scope

Ships **deeper** coverage for `backend/lib/user_store.js` beyond
#217's smoke surface. 18 new tests covering the real user + auth-
session lifecycle:

- `createUser` — happy path, email-required rejection, password-
  too-short rejection, duplicate-email rejection.
- `createOrAttachAppleUser` — fresh apple user, attach to existing
  password user with matching email.
- `authenticateUser` — happy path, unknown-email rejection,
  wrong-password rejection.
- `issueAuthSession` + `getAuthSessionByToken` — round-trip.
- `rotateAuthSession` — fresh token, preserved family id, previous
  token invalidation.
- `revokeAuthSessionById` / `revokeAuthSessionByToken` /
  `revokeAllAuthSessionsForUser` — including `exceptSessionId`.
- `markUserEmailVerified` — happy path + unknown-user-null.

Uses real `fs` + `writeJsonFileAtomic` against a temp store path
so the persistence round-trip is genuinely exercised. Drains
in-memory state between tests so cross-test pollution is
impossible.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for "iOS exposes a plain-language
  memory summary and refresh state" (V1 line 53) — auth gates
  every memory-summary read. Also tier-3 stability across the
  whole user lifecycle (signup → auth → refresh → revoke).`

## Verification

`node --test backend/tests/user_store_deeper.test.mjs` → **18/18
pass**. Plus the existing #217 smoke (`user_store.test.mjs`) →
3/3 still pass.

## Planned followups (NOT in this PR)

The user asked for deeper tests on memory_store + user_store +
user_auth (3 libs). user_store is shipped here. The other two
each warrant their own ~500-line PR with full dep coverage:

### `memory_store_deeper.test.mjs` (followup)

`backend/lib/memory_store.js` has ~25 deps on the
`sanitizePersistedSessionMemory` path. #216 stubs each as a pass-
through. Deeper coverage requires:

- A real `clampUnit`, `createEmptyEmotionMemory`,
  `normalizeAffectionStyle`, etc. — most of which live in
  `backend/lib/utils.js` or as standalone helpers in
  `backend/index.js`.
- A real `personalitySignalKeys` + `rankPersonalitySignals` so
  the sanitize-on-read path actually surfaces personality signals.
- A real `pushBoundedUniqueFolded` so the listening-facts cap
  works.
- Fixtures that exercise: cold state, warm state with multiple
  characters, eviction at the max threshold, backfill-on-read.

This is a meaningful PR on its own. Filing as a followup keeps
this PR reviewable.

### `user_auth_deeper.test.mjs` (followup)

`backend/lib/user_auth.js` has ~15 deps on the auth handler
chain. #218 covers exports + `buildPublicUser` strip + handler
surface. Deeper coverage requires:

- A real JWT signing key + verify (HS256).
- A real `user_store` (already covered by `user_store_deeper`,
  could import).
- Apple identity token verify against a stubbed JWKS.
- Fixtures for: signup → login → refresh → logout round-trip,
  password reset (request → consume → all-sessions-revoke),
  email verification (request → consume → emailVerified flip),
  session-revoke flows.

This is also a meaningful PR on its own. Filing as a followup.

## Done when

`user_store_deeper.test.mjs` ships + passes. `T-untested-libs-
followups` is updated to note user_store is now deeply covered;
the memory_store + user_auth deeper followups stay open as
separate task entries.
