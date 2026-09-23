---
id: T-decompose-phase4-auth-routes
title: Decompose backend/index.js — Phase 4 (11 /auth/* routes)
owner: support
status: merged
branch: support/T-decompose-phase4-auth-routes
pillar: infra (backend architecture)
v1_pillar: infra
v1_effect: infrastructure for iOS Release Readiness — byte-identical extraction of the 11 /auth/* routes out of backend/index.js continues the decomposition so the auth surface is reviewable and testable in isolation
---

## Scope

Phase 4 of the `backend/index.js` decomposition. Phases 0–3 all
merged on main. Per spec, max 1 decomp PR in flight.

Routes extracted byte-identically to `backend/lib/auth_routes.js`:

- POST `/auth/signup`
- POST `/auth/login`
- POST `/auth/apple`
- POST `/auth/refresh`
- POST `/auth/logout`
- GET  `/auth/sessions`
- POST `/auth/sessions/revoke`
- POST `/auth/request_password_reset`
- POST `/auth/reset_password`
- POST `/auth/request_email_verification`
- POST `/auth/verify_email`

All 11 were thin delegates to handlers that already live in
`lib/user_auth.js`. The lib bundles them under
`mountAuthRoutes(app, { userAuth })` with the shared 256kb JSON
parser created inside the lib. Required-deps guard fails loud at
mount if any of the 11 handlers is missing.

Access-control posture (documented in the module header):
**TIER-3 SENSITIVE** — auth handlers gate the rest of the surface.
No contract change in this PR.

## Verification

- `node --test backend/tests/auth_routes.test.mjs` → **10/10 pass**.
- Required-deps guard tested for every handler name.
- Production-style test uses a bare Express app (no `app.use(express.json())`).
- `node --check backend/index.js` passes.
- `backend/index.js`: -5 net lines (12 deletions, 7 insertions for
  the new import + mount call + comment).

## Done when

The 11 auth routes are no longer inline; the lib file exists with
tier-3-sensitive posture documented; tests pass; behavior is
byte-identical.

## Next phase

Phase 5 (per spec): extract `/realtime/*` routes (supplier mint,
health probe, ICE servers). Per spec, max 1 decomp PR in flight,
so Phase 5 is gated on this landing.
