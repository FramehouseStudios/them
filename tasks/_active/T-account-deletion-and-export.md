---
id: T-account-deletion-and-export
title: GET /account/export + DELETE /account (Apple/GDPR compliance)
owner: claude
status: review
branch: claude/backend-account-routes
pillar: ios
v1_pillar: ios
v1_effect: closes the App Store / GDPR compliance gap; Apple requires account deletion + data export for any app that collects personal information. V1 cannot pass App Store review without these.
---

## Scope

Spec: `docs/specs/T-account-deletion-and-export.md`.

Backend: `lib/account_routes.js` with `GET /account/export` and
`DELETE /account` (7-day soft delete + hard delete sweep). New
migration `008_account_lifecycle.sql`. iOS surface via Codex follow-up
in `DataControlsScreen.swift`.

## Progress

Phase-0 DONE (branch `claude/backend-post-v1-audit`):
- `backend/lib/account_routes.js` + 10 tests — route shapes, deps injected.
- `backend/lib/account_lifecycle_store.js` + 8 tests — table-backed
  store (read / markPendingDeletion / clearPendingDeletion /
  listDueForHardDelete / finalizeHardDelete / audit), pg-style
  client injected, in-memory-fake tested.
- `backend/migrations/008_account_lifecycle.sql`.
- Precise Phase-1 wiring plan written into the spec
  (`docs/specs/T-account-deletion-and-export.md`) with verified
  index.js line refs.
- Flagged `D-account-export-key-scope` in the decisions queue —
  per-user key convention must be confirmed before Phase-1 merges.

Phase-1 REMAINING (next, one PR): wire deps in index.js
(`resolveAuthenticatedUser` ← `req.authUser.id`; `lifecycleStore` ←
pg pool; `exportUserData` ← `sharedPersistence.list`), mount at
`index.js:26410`, add the hard-delete sweep timer, wire
`verifyReauthProof`. Phase-2: iOS DataControlsScreen (Codex).

## Done when

- Signed-in user can export every owned store row in one JSON
  archive. (route done; real exporter wiring remaining)
- Signed-in user can request account deletion; sessions revoked;
  hard delete fires after 7 days. (route + soft-delete done; sweep
  job remaining)
- Re-signing in within the window cancels the pending deletion. (route done)
- App Store privacy questionnaire entries match the new endpoints.
