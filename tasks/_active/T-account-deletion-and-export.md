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

- Route shapes + behavior DONE: `backend/lib/account_routes.js`
  (`GET /account/export`, `DELETE /account`, `POST /account/cancel-deletion`)
  + 10 tests (`tests/account_routes.test.mjs`) with injected deps.
- Migration DONE: `backend/migrations/008_account_lifecycle.sql`
  (account_lifecycle + account_audit_log tables).
- REMAINING: wire real deps in index.js — `resolveAuthenticatedUser`,
  `exportUserData` (iterate persistence domains), `lifecycleStore`
  (persisted via account_lifecycle table), the 7-day hard-delete
  sweep job, and the iOS DataControlsScreen surface (Codex).

## Done when

- Signed-in user can export every owned store row in one JSON
  archive. (route done; real exporter wiring remaining)
- Signed-in user can request account deletion; sessions revoked;
  hard delete fires after 7 days. (route + soft-delete done; sweep
  job remaining)
- Re-signing in within the window cancels the pending deletion. (route done)
- App Store privacy questionnaire entries match the new endpoints.
