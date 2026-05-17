# apple-auth envelope schema

Canonical request + response shape for `POST /auth/apple` — the
Sign In with Apple entry point. The success path is a thin wrapper
around the shared `auth` success envelope after verifying the
Apple-issued identity token.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/auth/apple` | shared auth success envelope (see `auth.md`) |

## Schema version

`1`. Field set is stable; additive only.

## Owner

- **Backend / verification**: Claude. Apple JWKS fetch +
  identity-token verification + linkage to `user_store`.
- **iOS / token source**: Codex. The Apple identity token comes
  from `ASAuthorizationAppleIDProvider` on the device.

## Access-control posture

**TIER-3 SENSITIVE**. The identity token is short-lived but
sensitive. Treat the Apple `sub` claim as PII; persist via the
`appleSubject` field on the user record and never expose it in
public envelopes (`buildPublicUser` strips it).

## Request

```json
{
  "identity_token": "eyJraWQiOiJ...",
  "authorization_code": "c8b7...",
  "user": {
    "name": { "firstName": "Ada", "lastName": "Lovelace" },
    "email": "ada@example.com"
  }
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `identity_token` | string | yes | Apple JWT, verified against Apple JWKS |
| `authorization_code` | string | no | reserved for future server-side refresh |
| `user` | object | no | only present on first Apple sign-in; Apple drops on subsequent calls |
| `user.name.firstName` | string | no | optional display name |
| `user.name.lastName` | string | no | optional display name |
| `user.email` | string | no | optional; Apple may relay through `private-relay.appleid.com` |

## Success response

Identical to the shared `auth.md` success envelope. The `user`
object's `auth_provider` field will report `"apple"` for accounts
created via this route.

## Error response

| HTTP | `error` | `stage` | When |
| --- | --- | --- | --- |
| 400 | `identity_token_required` | `validate` | missing or empty `identity_token` |
| 401 | `invalid_identity_token` | `verify_apple_jwt` | signature, audience, issuer, or expiry check failed |
| 401 | `apple_jwks_unavailable` | `fetch_apple_jwks` | Apple JWKS endpoint unreachable or empty |
| 503 | `user_auth_not_configured` | `configure` | JWT secret missing in production |
| 5xx | `apple_signin_failed` | `link_user` | unexpected internal during linkage |

## Compatibility rules

- New fields on the request are tolerated but ignored unless
  documented here.
- Removing or renaming a request field requires a `schema_version`
  bump and coordinated iOS rollout.
- The success envelope stays in lockstep with `auth.md`. Apple-
  specific extras (if any) ship as additive fields with a debug-
  only prefix where appropriate.

## Changelog

- v1 — initial documented shape. Mirrors `auth.md` success
  envelope after Apple verification.
