# session envelope schema

Canonical response shape for `POST /session` — the session
lifecycle endpoint iOS calls on app launch to mint/refresh a
client token and pull the restored-session bootstrap payload.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/session` | 201 session envelope (rate-limited via `sessionRateLimitGuard`) |

## Schema version

`1`. Envelope carries `schema_version` field
(`API_SCHEMA_VERSION`).

## Owner

- **Backend**: Claude. Inline handler in `backend/index.js`.
  Not in any current decomp phase.
- **iOS**: Codex. Powers the app-launch bootstrap UI; pulls
  user identity, assistant identity, and the
  "where-did-we-leave-off" recap.

## Access-control posture

**TIER-3 SENSITIVE**. The session response carries the client
token (load-bearing for downstream `X-Client-Token` auth) plus
the user's memory bootstrap (assistant name, user name,
remembered people, last-conversation recap). The route honors
the bearer-token auth chain when present (`authUser`); when
absent, it issues an unauthenticated session.

## Request shape

No body. Identity comes from:
- `X-APP-TOKEN` header (server-issued; tracked via the
  `recordUserInitiatedSession` accountability path)
- `X-Client-Token` header (existing session token, when
  re-using a prior session)
- Bearer token (`req.authUser`) when present from the auth
  middleware

## Response shape (201)

```json
{
  "user_id": "u_abc",
  "authenticated": true,
  "client_token": "ct_...",
  "session_id": "ct_...",
  "expires_in": 86400,
  "assistant_name": "Clementine",
  "assistant_self_name": "Clementine",
  "user_name": "Ada",
  "remembered_names": [
    { "name": "Bob", "relation": "friend" }
  ],
  "last_conversation_recap": "Talked about ...",
  "last_conversation_snapshot": "The user said ...",
  "last_conversation_at": 1715620920000,
  "evolution_sync": {
    "stage": 1,
    "depth_score": 0.4,
    "romance_tension": 0.2,
    "session_count": 14,
    "reassurance_need": 0.3
  },
  "state_version": "v9",
  "last_updated_at": 1715620920000,
  "history_updated_at": 1715620920000,
  "memory_updated_at": 1715620920000,
  "last_turn_id": "turn_xyz",
  "schema_version": 1,
  "backend_build": "build-id",
  "backend_boot_id": "boot-id"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `user_id` | string \| null | yes | from bearer-auth `authUser.id`; null for unauthenticated |
| `authenticated` | bool | yes | `Boolean(user_id)` |
| `client_token` | string | yes | the session token to send in `X-Client-Token` on subsequent calls; same value as `session_id` |
| `session_id` | string | yes | alias for `client_token` |
| `expires_in` | int | yes | seconds until token expiry (`SESSION_TTL_MS / 1000`) |
| `assistant_name` | string | yes | normalized assistant name |
| `assistant_self_name` | string | yes | alias of `assistant_name` |
| `user_name` | string \| null | yes | user's primary name from memory |
| `remembered_names` | array | yes | `{ name, relation }` objects; capped at `USER_MEMORY_REMEMBERED_PEOPLE_MAX` |
| `last_conversation_recap` | string | yes | `normalizeSnippet` clamped to 220 chars |
| `last_conversation_snapshot` | string | yes | `normalizeSnippet` clamped to 420 chars |
| `last_conversation_at` | int \| null | yes | epoch ms |
| `evolution_sync` | object | yes | session-evolution snapshot — `{ stage, depth_score, romance_tension, session_count, reassurance_need }` (fields nullable) |
| read-meta fields | various | yes | `state_version` / `last_updated_at` / etc. matching `memories-list.md` |

## Response headers

- `x-backend-build` — build id
- `x-backend-boot-id` — boot id
- `x-user-id` — only set when `authenticated: true`

## Invariants

- `client_token` and `session_id` are byte-identical strings in
  the response. iOS can read either; both refer to the same
  token.
- `expires_in` is in seconds, not ms.
- When a request supplies a valid `X-Client-Token` already
  associated with the same `authUser.id`, the session is
  **refreshed** (TTL extended) rather than a new token issued.
- The endpoint always returns 201 on success — even for
  re-used existing tokens. iOS can treat 201 as "session
  ready" regardless of whether it's a fresh mint or a refresh.
- Background `maybeBackfillThemesFromHistory` may fire as a
  side effect; the visible envelope shape is unchanged.

## Sibling routes (not in this doc)

- `PATCH /session/evolution` — updates the
  `evolution_sync` block. Documented separately if/when its
  contract stabilizes; today the field set is open for
  iteration.
- `GET /auth/sessions` — lists all sessions for the user (auth
  surface; see `auth.md`).
- `POST /auth/sessions/revoke` — revokes a session (auth
  surface; see `auth.md`).

## Compatibility rules

- iOS keys on `client_token`, `assistant_name`, `user_name`,
  `state_version`, `expires_in`.
- Adding new optional fields is tolerated.
- Removing any documented field requires a schema bump.
- `client_token` / `session_id` dual-naming is stable — iOS
  may use whichever it standardized on.

## V1 alignment

V1 doesn't explicitly call out `/session`, but the talk
pipeline + memory surface BOTH depend on a valid client token.
The session envelope is the iOS bootstrap that makes the rest
of the V1 surface accessible.

## Changelog

- v1 — initial documented shape, matched line-by-line against
  the inline `app.post("/session", ...)` handler in
  `backend/index.js`.
