# email-verification envelope schema

Canonical request + response shapes for the two email-verification
routes: `POST /auth/request_email_verification` (issue token) and
`POST /auth/verify_email` (consume token, flip `emailVerified`).

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/auth/request_email_verification` | `{ ok, delivery, debug_email_verification_token? }` |
| POST | `/auth/verify_email` | `{ ok, user }` |

## Schema version

`1`. Additive only.

## Owner

- **Backend**: Claude. Token generation + consume + `emailVerified`
  flip live in `backend/lib/user_auth.js`.
- **iOS UI**: Codex. Triggers request when `pending_email_verification`
  is true on the auth envelope; presents the verified-state UI.

## Access-control posture

**TIER-3 SENSITIVE**. Same posture as password-reset: plaintext
verification token is debug-only.

## Request shapes

### `POST /auth/request_email_verification`

```json
{}
```

The request body is empty — identity comes from the bearer token.
This route is `requireUserAuth`-protected.

### `POST /auth/verify_email`

```json
{ "token": "vrf_..." }
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | string | yes | issued by `request_email_verification` or by signup when `requireEmailVerification` is on |

## Success response shapes

### `/auth/request_email_verification`

```json
{
  "ok": true,
  "delivery": { "status": "queued", "transport": "log" },
  "debug_email_verification_token": "vrf_..."
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | bool | yes | constant `true` |
| `delivery` | object | yes | `{ status, transport }` describing email transport |
| `debug_email_verification_token` | string | no | present only when `allowDebugTokens` is true |

### `/auth/verify_email`

```json
{
  "ok": true,
  "user": {
    "user_id": "u_...",
    "email": "writer@example.com",
    "email_verified": true,
    "created_at": 1700000000000,
    "auth_provider": "password"
  }
}
```

The `user` object matches `buildPublicUser` (see `auth.md`) with
`email_verified` now `true`.

## Error envelope

| HTTP | `error` | `stage` | When |
| --- | --- | --- | --- |
| 400 | `token_required` | `validate` | verify_email with missing token |
| 401 | `invalid_verification_token` | `consume_token` | token unknown, expired, or already used |
| 401 | `unauthorized` | `protect_route` | request_email_verification without bearer token |
| 409 | `email_already_verified` | `consume_token` | account already in verified state |
| 503 | `user_auth_not_configured` | `configure` | JWT secret missing in production |

## Invariants

- The verification token is single-use; consume marks consumed.
- Token TTL is `emailVerificationTtlSeconds` (default 600s).
- A successful consume flips `emailVerified` from `false` to `true`
  and stamps `emailVerifiedAt` (epoch ms).
- `autoVerifyEmails: true` short-circuits the flow — signup
  returns with `email_verified: true` and never issues a token.
- `requireEmailVerification: true` causes signup to include the
  verification token inline (or its debug form) in the response so
  iOS can present the verify-now screen immediately.

## Compatibility rules

- iOS keys on `pending_email_verification` (from the auth
  envelope) to decide whether to surface the verify screen.
- New extras on `delivery` are tolerated by iOS.
- Removing the `user` field from `/auth/verify_email` requires a
  schema bump.

## Changelog

- v1 — initial documented shape. `verify_email` returns the
  updated public user so iOS can refresh local state in one round.
