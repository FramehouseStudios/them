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

- **Backend / verification**: Claude. Apple JWKS `kid` selection +
  identity-token verification + nonce verification + linkage to `user_store`.
- **iOS / token source**: Codex. The Apple identity token comes
  from `ASAuthorizationAppleIDProvider` on the device.

## Access-control posture

**TIER-3 SENSITIVE**. The identity token is short-lived but
sensitive. Treat the Apple `sub` claim as PII; persist via the
`appleSubject` field on the user record and never expose it in
public envelopes (`buildPublicUser` strips it).

Production requires `AUTH_APPLE_AUDIENCE`; every identity token is validated
against that Services ID or bundle identifier as well as Apple's issuer,
signature, expiry, key ID, and the request nonce.

## Request

```json
{
  "identity_token": "eyJraWQiOiJ...",
  "nonce": "client-nonce-or-sha256",
  "authorization_code": "c8b7...",
  "email": "ada@example.com",
  "given_name": "Ada",
  "family_name": "Lovelace"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `identity_token` | string | yes | Apple JWT, verified against Apple JWKS by `kid` in production |
| `nonce` | string | production yes | Expected nonce claim. Backend accepts either the exact claim value or the SHA-256/base64url of this value. |
| `raw_nonce` | string | production yes if `nonce` absent | Raw client nonce. Backend compares its SHA-256/base64url value to the token claim. |
| `nonce_sha256` | string | production yes if `nonce`/`raw_nonce` absent | Pre-hashed expected nonce claim. |
| `authorization_code` | string | no | reserved for future server-side refresh |
| `email` | string | no | tolerated and ignored for wire compatibility; it is never an identity source and cannot create or link an account |
| `given_name` | string | no | optional display name |
| `family_name` | string | no | optional display name |

The verified identity token is the only source of account-linking identity.
For a previously unknown Apple `sub`, the token must contain both a non-empty
`email` claim and a true `email_verified` claim. That verified claim may create
a new account or explicitly link an existing account with the same canonical
email. The request body's `email` value is never substituted for a missing token
claim and cannot create or link identity.

Apple may omit email from later authorizations. Once an Apple `sub` has been
linked, repeat sign-in resolves the known subject and does not require another
email claim.

## Success response

Identical to the shared `auth.md` success envelope. The `user`
object's `auth_provider` field will report `"apple"` for accounts
created via this route.

## Error response

| HTTP | `error` | `stage` | When |
| --- | --- | --- | --- |
| 400 | `identity_token_required` | `auth_apple` | missing or empty `identity_token` |
| 400 | `apple_nonce_required` | `auth_apple` | production request omitted nonce material |
| 400 | `apple_email_required` | `auth_apple` | previously unknown Apple subject lacked a token-verified email claim |
| 409 | `email_taken` | `auth_apple` | the verified email belongs to an account that cannot be linked by this request |
| 409 | `apple_subject_taken` | `auth_apple` | the verified email is already linked to a different Apple subject |
| 401 | `invalid_apple_identity_token` | `auth_apple` | signature, `kid`, audience, issuer, or expiry check failed |
| 401 | `invalid_apple_nonce` | `auth_apple` | token nonce did not match the request nonce |
| 503 | `apple_jwks_unavailable` | `auth_apple` | Apple JWKS endpoint unreachable or fetch unavailable |
| 503 | `apple_sign_in_not_configured` | `auth_apple` | production Apple audience is absent, or non-production verification has no configured key source |
| 503 | `user_auth_not_configured` | `auth_apple` | JWT secret missing in production |
| 5xx | `apple_sign_in_failed` | `auth_apple` | unexpected internal during linkage |

## Compatibility rules

- New fields on the request are tolerated but ignored unless
  documented here.
- Client-supplied `email` is tolerated for wire compatibility but is
  never an identity source. Only an email claim verified inside the
  Apple identity token may create or link an account.
- `AUTH_APPLE_TEST_JWT_SECRET` and `AUTH_APPLE_JWT_PUBLIC_KEY` are ignored
  in production; production verification uses Apple JWKS by `kid`.
- Production must set `AUTH_APPLE_AUDIENCE`; audience validation cannot be
  disabled or omitted.
- Removing or renaming a request field requires a `schema_version`
  bump and coordinated iOS rollout.
- The success envelope stays in lockstep with `auth.md`. Apple-
  specific extras (if any) ship as additive fields with a debug-
  only prefix where appropriate.

## Changelog

- v1 — initial documented shape. Mirrors `auth.md` success
  envelope after Apple verification.
- v1.1 — document production JWKS `kid` verification, nonce fields,
  and production-disabled test/static-key verification.
- v1.2 — make token-verified email the only create/link source, document
  `apple_email_required`, and clarify email-less repeat sign-in for known subjects.
- v1.3 — require production audience validation and document Apple-linkage
  conflict responses.
