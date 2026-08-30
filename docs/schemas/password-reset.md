# password-reset envelope schema

Canonical request + response shapes for the two password-reset
routes: `POST /auth/request_password_reset` (issue token) and
`POST /auth/reset_password` (consume token, set new password,
revoke all sessions).

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/auth/request_password_reset` | `{ ok, delivery, debug_password_reset_token? }` |
| POST | `/auth/reset_password` | `{ ok, revoked_sessions }` |

## Schema version

`1`. Additive only.

## Owner

- **Backend**: support agent. Token generation + hashing + consume +
  all-sessions-revoke live in `backend/lib/user_auth.js`.
- **iOS UI**: Codex. Triggers request from the "Forgot password"
  screen and presents the post-consume confirmation.

## Access-control posture

**TIER-3 SENSITIVE**. The plaintext reset token MUST NOT appear
in logs, telemetry, or any non-production response except behind
the `allowDebugTokens` flag (default off in production).

## Request shapes

### `POST /auth/request_password_reset`

```json
{ "email": "writer@example.com" }
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `email` | string | yes | account email; case-insensitive lookup |

### `POST /auth/reset_password`

```json
{ "token": "rst_...", "new_password": "newvalidpass123" }
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | string | yes | issued by `request_password_reset` |
| `new_password` | string | yes | min 8 chars, validated server-side |

## Success response shapes

### `/auth/request_password_reset`

```json
{
  "ok": true,
  "delivery": { "status": "queued", "transport": "log" },
  "debug_password_reset_token": "rst_..."
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | bool | yes | constant `true` |
| `delivery` | object | yes | `{ status, transport }` describing email transport |
| `debug_password_reset_token` | string | no | present only when `allowDebugTokens` is true |

### `/auth/reset_password`

```json
{ "ok": true, "revoked_sessions": 3 }
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `ok` | bool | yes | constant `true` |
| `revoked_sessions` | int | yes | count of auth sessions invalidated by the reset |

## Error envelope

| HTTP | `error` | `stage` | When |
| --- | --- | --- | --- |
| 400 | `email_required` | `validate` | request_password_reset with missing email |
| 400 | `token_required` | `validate` | reset_password with missing token |
| 400 | `new_password_required` | `validate` | reset_password with missing new_password |
| 400 | `password_too_short` | `validate` | new_password fails min-length check |
| 401 | `invalid_reset_token` | `consume_token` | token unknown, expired, or already used |
| 404 | `user_not_found` | `lookup_user` | email has no associated account |
| 503 | `user_auth_not_configured` | `configure` | JWT secret missing in production |

Note: by design, `request_password_reset` returns `ok` even when
the email is unknown — so the public surface does not leak account
existence. The 404 path is reserved for internal flows.

## Invariants

- Successful `reset_password` **revokes all active sessions** for
  the user, not just the requester's. Load-bearing for V1 trust.
- The reset token is single-use; consuming it (success or failure)
  marks it consumed.
- Token TTL is `passwordResetTtlSeconds` (default 600s / 10 min).

## Compatibility rules

- New extras on the success envelope are tolerated by iOS.
- Removing or renaming `revoked_sessions` requires schema bump.
- `new_password` field name is load-bearing — iOS expects exactly
  this key on the consume call.

## Changelog

- v1 — initial documented shape. `revoked_sessions` count is the
  iOS-visible signal that the reset fully cleaned up sessions.
