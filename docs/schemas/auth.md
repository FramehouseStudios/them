# auth envelope schema

Canonical response shapes for the `/auth/*` route family. The
success envelope is shared across `signup`, `login`, `apple`, and
`refresh`. The error envelope is shared across all 11 routes.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/auth/signup` | success envelope + optional email_verification_requested |
| POST | `/auth/login` | success envelope |
| POST | `/auth/apple` | success envelope |
| POST | `/auth/refresh` | success envelope (new access + refresh tokens) |
| POST | `/auth/logout` | minimal `{ ok }` envelope |
| GET | `/auth/sessions` | `{ ok, sessions: [...] }` |
| POST | `/auth/sessions/revoke` | minimal `{ ok }` envelope |
| POST | `/auth/request_password_reset` | `{ ok }` + optional debug token |
| POST | `/auth/reset_password` | `{ ok }` + auth revocation count |
| POST | `/auth/request_email_verification` | `{ ok }` + optional debug token |
| POST | `/auth/verify_email` | `{ ok }` |

## Schema version

`1` (no explicit `schemaVersion` field in the envelope today; iOS
keys off the field set itself). Future additive changes stay at v1;
removals / meaning-changes bump to v2 and add an explicit
`schema_version` field.

## Owner

- **Backend / envelope shape**: Claude. The envelope is built in
  `backend/lib/user_auth.js`'s `buildAuthEnvelope` helper.
- **iOS decoder**: Codex. `BackendAuthEnvelope` decoder in the iOS
  project.

## Access-control posture

**TIER-3 SENSITIVE**. Auth envelopes carry tokens, session ids,
family ids, and the public user record. Token + refresh_token MUST
NOT leak into logs (use redacted forms). The `buildPublicUser`
helper strips `passwordHash`, `salt`, and `appleSubject` from the
user object before it reaches this envelope.

## Success envelope fields

| Key | Type | Required | Source | Notes |
| --- | --- | --- | --- | --- |
| `ok` | boolean | yes | constant `true` | error path uses `{ stage, error }` instead |
| `user` | object | yes | `buildPublicUser(user)` | id, email, emailVerified, createdAt, optional name |
| `token` | string \| null | yes | access JWT | legacy alias of `access_token`; both ship until iOS drops the alias |
| `access_token` | string \| null | yes | access JWT | preferred |
| `access_expires_in` | int \| null | yes | `accessTtlSeconds` | seconds; null when no token issued |
| `refresh_token` | string \| null | yes | refresh JWT | null on /auth/logout |
| `refresh_expires_in` | int \| null | yes | session expiresAt minus now, in seconds | null when no refresh |
| `refresh_token_transport` | string \| null | yes | `"body"` or null | reserved for future cookie transport |
| `refresh_cookie_set` | boolean | yes | constant `false` | reserved for cookie transport |
| `current_session_id` | string \| null | yes | session.sessionId | for revoke-this-session UX |
| `current_family_id` | string \| null | yes | session.familyId | carries across refresh rotations |
| `token_type` | string | yes | `"Bearer"` | for `Authorization` header |
| `expires_in` | int \| null | yes | mirror of access_expires_in | legacy alias |
| `pending_email_verification` | boolean | yes | derived | `requireEmailVerification && !user.emailVerified` |
| `verification_required` | boolean | yes | mirror of pending_email_verification | alias |

## Per-route `extra` fields (mixed into the envelope)

- `/auth/signup` adds:
  - `email_verification_requested`: boolean
  - `email_delivery`: object `{ status, transport }`
  - `debug_email_verification_token` (only when `allowDebugTokens` is true)
- `/auth/request_password_reset` adds:
  - `debug_password_reset_token` (debug only)
  - `delivery`: object
- `/auth/reset_password` adds:
  - `revoked_sessions`: int (count of sessions invalidated on success)
- `/auth/request_email_verification` adds:
  - `debug_email_verification_token` (debug only)
  - `delivery`: object

## Error envelope

```json
{
  "stage": "auth_<route>",
  "error": "<code>"
}
```

| Stage | Common error codes | HTTP |
| --- | --- | --- |
| `auth_signup` | `email_taken`, `signup_failed`, `session_issue_failed` | 409 / 400 / 500 |
| `auth_login` | `email_required`, `invalid_credentials`, `session_issue_failed` | 400 / 401 / 500 |
| `auth_apple` | `invalid_apple_identity_token`, `email_taken`, `apple_sign_in_failed` | 401 / 409 / 400 |
| `auth_refresh` | `invalid_refresh_token`, `refresh_token_required`, `session_issue_failed` | 401 / 400 / 500 |
| `auth_logout` | `refresh_token_required` | 400 |
| `auth_sessions` | `unauthenticated` | 401 |
| `auth_sessions_revoke` | `session_id_required`, `session_not_found` | 400 / 404 |
| `auth_password_reset` | `email_required`, `token_invalid_or_expired` | 400 |
| `auth_email_verification` | `user_required`, `token_invalid_or_expired` | 400 |
| any | `auth_unconfigured` | 503 (when JWT secret missing) |

## Sample success response

```json
{
  "ok": true,
  "user": {
    "id": "u_abc123",
    "email": "writer@example.com",
    "emailVerified": false,
    "createdAt": 1700000000000
  },
  "token": "eyJhbGciOi...",
  "access_token": "eyJhbGciOi...",
  "access_expires_in": 900,
  "refresh_token": "rt_xyz...",
  "refresh_expires_in": 2592000,
  "refresh_token_transport": "body",
  "refresh_cookie_set": false,
  "current_session_id": "sess_abc",
  "current_family_id": "fam_def",
  "token_type": "Bearer",
  "expires_in": 900,
  "pending_email_verification": true,
  "verification_required": true,
  "email_verification_requested": true,
  "email_delivery": {
    "status": "queued",
    "transport": "none"
  }
}
```

## Compatibility rules

- **Additive within v1**: new optional keys are fine. iOS decoders
  must ignore unknown keys (Codex's `BackendAuthEnvelope` uses
  `Codable` with explicit fields; unknown keys are dropped).
- **Type narrowing**: never. If a key was `string | null`, it must
  stay nullable. Tightening to `string` is a v2 bump.
- **Key removal**: v2 bump. Document the removed key in the
  changelog and the iOS decoder migration.
- **Stage / error code changes**: error codes are part of the
  envelope contract. Renaming an error code (e.g.
  `invalid_credentials` → `bad_password`) breaks iOS error mapping.
  Add new codes additively; deprecate old ones one release at a
  time.

## Changelog

- 2026-05-14 — Doc created. Reflects shape produced by
  `backend/lib/user_auth.js` `buildAuthEnvelope` at this date.
