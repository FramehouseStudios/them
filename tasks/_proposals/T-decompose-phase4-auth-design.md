---
id: T-decompose-phase4-auth-design
title: Phase 4 design note — extract 11 /auth/* routes
owner: claude
status: proposed
target_pr: #212 (do not merge until this design note is reviewed)
pillar: infra (backend architecture)
v1_pillar: infra
v1_effect: infrastructure for tier-3 auth surface preserving every existing iOS contract
---

## What this PR does

Move the 11 inline `app.post/get(...)` lines for `/auth/*` routes
from `backend/index.js` into a new `backend/lib/auth_routes.js`
that exposes `mountAuthRoutes(app, { userAuth })`. Each route
continues to delegate to the same `userAuth.handleX` handler that
lives in `backend/lib/user_auth.js` today. **Behavior is byte-
identical with the inline lines** — same handlers, same body
parser, same mount order. No auth contract changes in this PR.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: infrastructure for tier-3 auth surface; preserves
  every existing iOS contract so iOS auth work is not gated on the
  extraction.`

## Route list (mount order preserved)

The mount order matters: Express routes the first matching pattern.
Reordering can change which handler answers an ambiguous request.
This PR preserves the exact order from `backend/index.js`:

| # | Method | Path | Handler | Body parser |
| --- | --- | --- | --- | --- |
| 1 | POST | `/auth/signup` | `userAuth.handleAuthSignup` | `express.json({ limit: "256kb" })` |
| 2 | POST | `/auth/login` | `userAuth.handleAuthLogin` | `express.json({ limit: "256kb" })` |
| 3 | POST | `/auth/apple` | `userAuth.handleAuthApple` | `express.json({ limit: "256kb" })` |
| 4 | POST | `/auth/refresh` | `userAuth.handleAuthRefresh` | `express.json({ limit: "256kb" })` |
| 5 | POST | `/auth/logout` | `userAuth.handleAuthLogout` | `express.json({ limit: "256kb" })` |
| 6 | GET  | `/auth/sessions` | `userAuth.handleAuthSessions` | none (no body) |
| 7 | POST | `/auth/sessions/revoke` | `userAuth.handleAuthSessionsRevoke` | `express.json({ limit: "256kb" })` |
| 8 | POST | `/auth/request_password_reset` | `userAuth.handleAuthRequestPasswordReset` | `express.json({ limit: "256kb" })` |
| 9 | POST | `/auth/reset_password` | `userAuth.handleAuthResetPassword` | `express.json({ limit: "256kb" })` |
| 10 | POST | `/auth/request_email_verification` | `userAuth.handleAuthRequestEmailVerification` | `express.json({ limit: "256kb" })` |
| 11 | POST | `/auth/verify_email` | `userAuth.handleAuthVerifyEmail` | `express.json({ limit: "256kb" })` |

The 11 `app.all(..., methodNotAllowed("POST"|"GET"))` 405-handler
catches that live further down in `backend/index.js` (lines
~32473–32484) **are not in scope for this PR**. They follow in a
small follow-up that moves them into the same lib for consistency.
Keeping them inline does not break anything; Express resolves the
real handler first.

## Mount order invariant

The auth mount block must remain a contiguous sequence in
`backend/index.js`. The mount call placement in this PR is at the
same line range the inline block currently occupies. The mount call
is a single statement so there is no within-block ordering risk.

## Parser limits

`AUTH_BODY_LIMIT = "256kb"`. Exported from the lib for visibility.
Matches the existing `authJson = express.json({ limit: "256kb" })`
declaration in `backend/index.js` line 32325. No route currently
needs more than 256kb (auth payloads are short: email + password,
JWT, password-reset token, Apple identity token). If a future
auth flow needs a larger payload, bump the constant in one place.

The `GET /auth/sessions` handler does not parse a body. The lib
mounts it without the JSON middleware to match the inline behavior.

## Token / session invariants

These invariants live in `backend/lib/user_auth.js`'s
`createUserAuthSubsystem` factory and its `issueAuthResult` /
`buildAuthEnvelope` helpers. This PR does **not** change any of
them; they are listed here so the design note is honest about what
the route extraction is preserving:

1. **Access token TTL** = `accessTtlSeconds` from the subsystem
   options (typically minutes-to-hours).
2. **Refresh token TTL** = `refreshTtlSeconds` from the subsystem
   options (typically days-to-weeks).
3. **Refresh token rotation**: on every `/auth/refresh`, the
   `rotateAuthSession` helper issues a new refresh token and
   invalidates the previous one in the same family. Family ID is
   carried across rotations.
4. **Session revocation**: `/auth/logout` calls
   `revokeAuthSessionByToken(refreshToken)`; `/auth/sessions/revoke`
   calls `revokeAuthSessionById(sessionId)`;
   `revokeAllAuthSessionsForUser(userId)` is reserved for password
   reset and email change flows.
5. **JWT signing**: access tokens are HS256-signed by
   `signAccessToken` using `accessTokenSecret` from the subsystem.
   No JWT structure change in this PR.
6. **Apple identity token verification**: `verifyAppleIdentityToken`
   runs the existing JWT verify against Apple's published JWKS.
7. **Bearer token format**: `Authorization: Bearer <accessToken>`.
   `protectUserRoutes` middleware (unchanged) reads this header and
   populates `req.user`.

## Password reset invariants

1. `/auth/request_password_reset` issues a token via
   `issuePasswordResetToken({ userId, ttlMs })`. The TTL is
   `passwordResetTtlSeconds` from the subsystem.
2. The token is hashed before storage; the raw token is returned
   only when `allowDebugTokens` is true (dev mode).
3. `/auth/reset_password` consumes the token via
   `consumePasswordResetToken(rawToken)`. Consumption is one-shot;
   reusing the token returns 400 `token_invalid_or_expired`.
4. On successful reset, **all existing auth sessions for the user
   are revoked** via `revokeAllAuthSessionsForUser`. Forcing
   reauth is a security invariant.
5. The user's password hash is updated via the user_store; the salt
   is rotated.

## Email verification invariants

1. `/auth/request_email_verification` issues a token via
   `issueEmailVerificationToken({ userId, ttlMs })`. The TTL is
   `emailVerificationTtlSeconds` from the subsystem.
2. The token is hashed before storage; raw token returned only when
   `allowDebugTokens` is true.
3. `/auth/verify_email` consumes the token via
   `consumeEmailVerificationToken(rawToken)`. One-shot.
4. On successful verification, `markUserEmailVerified(userId)`
   flips the user record's `emailVerified` flag.
5. **No session revocation on email verification** — verification
   only changes the `emailVerified` flag; existing sessions stay
   valid.

## Response-shape compatibility

Every response in this PR matches the existing inline behavior
byte-for-byte. The contract surface iOS depends on:

- **Success envelope** (`buildAuthEnvelope`): `ok`, `user` (public
  shape; password hash + salt + apple subject stripped via
  `buildPublicUser`), `token`, `access_token`, `access_expires_in`,
  `refresh_token`, `refresh_expires_in`, `refresh_token_transport`,
  `refresh_cookie_set`, `current_session_id`, `current_family_id`,
  `token_type`, `expires_in`, `pending_email_verification`,
  `verification_required`, plus per-handler `extra` (e.g.
  signup adds `email_verification_requested`, `email_delivery`,
  optional `debug_email_verification_token`).
- **Error envelope**: `{ stage: "auth_*", error: "<code>" }`. Status
  codes: 400 for input errors, 401 for credential errors, 409 for
  `email_taken`, 500 for `session_issue_failed`, 503 when auth is
  unconfigured (missing JWT secret).
- **Auth misconfigured** (`authMisconfigured`): same shape, status
  503, `error: "auth_unconfigured"`.

iOS decoders (`BackendAuthEnvelope`) read these keys today. None
change in this PR.

## Tests

`backend/tests/auth_routes.test.mjs` (already in #212) covers:

1. Mount fails without Express app.
2. Mount fails without `userAuth` subsystem.
3. Mount fails when any of the 11 handlers is missing (one test
   per handler name).
4. Each route invokes the right handler with parsed body. Tests
   stub `userAuth.handleX` to echo the body so the test verifies
   handler routing + parser wiring in one assertion.
5. `GET /auth/sessions` works with no body parser.
6. Each path that takes a body works **with a bare Express app**
   (no `app.use(express.json())` upstream) — production-style test
   per Codex #90.

The lib does NOT carry tests for the underlying auth behavior
(token rotation, password reset flow, etc.). Those live in
`backend/tests/user_auth.test.mjs` and are untouched by this PR.
The two test layers are separate by design: route tests verify the
mount wiring; subsystem tests verify the auth invariants.

## What this PR explicitly does NOT change

- The `userAuth` subsystem factory (`createUserAuthSubsystem` in
  `lib/user_auth.js`): unchanged.
- JWT structure, claims, signing algorithm: unchanged.
- Refresh-token rotation behavior: unchanged.
- Password reset / email verification token TTLs: unchanged.
- Apple identity token verification: unchanged.
- `protectUserRoutes` middleware: unchanged.
- The `methodNotAllowed` 405-handler catches: not moved in this PR
  (separate small follow-up).

## Rollback plan

If a regression surfaces after #212 merges, revert the merge commit.
The inline `app.post(...)` lines were 11 contiguous lines; reverting
restores them exactly. There is no state migration to undo because
no state-handling code changed.

## What Codex should look at in review

1. **The route list above matches the inline block in
   `backend/index.js`**. Any reorder is a bug.
2. **The `AUTH_BODY_LIMIT` constant matches the inline `authJson`
   declaration**. 256kb.
3. **`GET /auth/sessions` does NOT mount `authJson`**. Verify the
   lib code skips the middleware for the GET route.
4. **Required-deps guard fires for every handler name**. Verify
   the lib enumerates all 11 + `protectUserRoutes` is not in the
   required list (because the auth mount doesn't use it; it's the
   per-user route protection middleware mounted elsewhere).
5. **Response envelope keys match**. `buildAuthEnvelope` is in
   `user_auth.js` and unchanged; this PR only re-routes the
   handlers. No response-shape diff is possible without changing
   `user_auth.js`.

## After this design note

If Codex accepts the design note:
1. #212 already implements exactly what this note describes.
   Codex can review #212 with this note as the contract.
2. Add a follow-up small PR for the 11 `methodNotAllowed` catches
   under the same `mountAuthRoutes` umbrella (or a sibling
   `mountAuthMethodGuards`).

If Codex requests changes:
1. This note is the source of truth; #212 amends to match.
2. Or #212 closes and a new PR opens with the agreed shape.
