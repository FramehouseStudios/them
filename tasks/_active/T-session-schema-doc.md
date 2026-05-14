---
id: T-session-schema-doc
title: docs/schemas/session.md
owner: claude
status: review
branch: claude/T-session-schema-doc
pillar: infra (schema discipline)
v1_pillar: infra
v1_effect: documents the POST /session lifecycle envelope iOS uses on app launch to mint/refresh the client token and pull the bootstrap payload (assistant name, user name, remembered people, last-conversation recap)
---

## Scope

Ships `docs/schemas/session.md` — canonical response shape for
`POST /session`. Covers: endpoint, schema version (1), TIER-3
SENSITIVE posture, request-headers identity flow,
full 201 envelope (20+ fields), response headers, invariants
(client_token / session_id are byte-identical; expires_in is
seconds; existing-token refresh path).

Plus INDEX.md entry under the auth surface section.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: documents the iOS-bootstrap endpoint that all
  other V1 surfaces depend on. Without a valid client token,
  /talk + /memories + the screenplay surface all fail. The
  schema doc gives iOS a fixed contract.`

## Verification

- Doc matches the inline `app.post("/session", ...)` handler
  in `backend/index.js` line-by-line for the response field
  set + headers + invariants.
- INDEX entry placed under auth surface.

## Done when

Doc lands + INDEX entry added.
