# Spec: T-account-deletion-and-export

**Status**: ready (Claude can implement) + iOS surface via Codex.
**Owner**: claude (backend) → codex (iOS UI surface).
**V1 pillar**: ios
**V1 effect**: closes the App Store / privacy compliance gap. Apple
requires both account deletion and data export for any app that
collects personal information. io.them collects user-authored
screenplays, voice transcripts, character mentions, and email
addresses — all personal. Without these endpoints, V1 cannot pass
App Store review.

Distinct from `D-creative-memory-export-approval` and
`D-creative-memory-delete-scope` (which scoped the *memory*-only
surface for V1): this is the *full account* surface, required for
Apple compliance.

## Problem

The backend exposes per-domain memory delete and export
(`POST /data/memories/clear`, `POST /memory/forget`, the forthcoming
`PR #94` export), but there is no single endpoint that:
1. Returns every piece of user-owned data in one downloadable archive.
2. Deletes the user account, sessions, and all owned data on request.

Apple App Store Guideline 5.1.1 (v) and GDPR Article 17/20 both
require this. Without it, the App Store reviewer will reject the
submission.

## Scope

In:
- `GET /account/export` — returns a single signed-URL or inline JSON
  archive containing every store entry owned by the authenticated
  user: profile, sessions, history turns, memory (all tiers),
  screenplay projects, accepted twists, telemetry rows.
- `DELETE /account` — irreversibly deletes the user account and all
  owned data. Requires re-authentication (password or current Apple
  identity-token) and a 7-day delay with a recovery window (per
  Apple guidance), implemented as a soft-delete that hard-deletes
  after 7 days.
- Audit log entry on both actions (separate from user-visible data;
  retained per legal policy).
- iOS surface: a "Delete account" and "Download my data" entry in
  `DataControlsScreen.swift`, gated by re-auth, with clear copy.

Out:
- Re-creating an account with the same email after deletion. Allowed
  by default (no soft block); product can change later.
- Exporting binary blobs (audio recordings) — current architecture
  doesn't store the raw audio server-side, only transcripts. If
  T-ios-offline-outbox lands and audio blobs are persisted, this
  spec must be revisited.

## Approach

### Backend
1. New `lib/account_routes.js` with `mountAccountRoutes(app, deps)`.
2. `GET /account/export`:
   - Require user auth.
   - Iterate every persistence domain (KNOWN_DOMAINS in
     `persistence_adapter.js`) and select rows where the key is
     owned by the user.
   - Stream as JSON to the client; > 5 MB → respond with a
     short-lived signed download URL (`/account/export/:token`).
   - Audit log: `account_export_requested`, `account_export_completed`.
3. `DELETE /account`:
   - Require user auth + a fresh re-auth token (separate from the
     session bearer; password challenge or Apple identity-token).
   - Mark the user as `pending_deletion_at = now()`. Revoke all
     sessions. Return 202 Accepted with the scheduled hard-delete
     date.
   - Background sweep (or just an on-login check) hard-deletes
     accounts past `pending_deletion_at + 7 days`.
   - Audit log: `account_deletion_requested`, `account_hard_deleted`.
4. New migration `008_account_lifecycle.sql` adds
   `pending_deletion_at` to user_store rows + an `account_audit_log`
   table.

### iOS (Codex spec stub)
- DataControlsScreen gains two rows:
  - "Download my data" → progress indicator → save to Files.
  - "Delete my account" → password / Apple re-auth → confirmation
    sheet → 202 → countdown text "Your account will be permanently
    deleted on YYYY-MM-DD. Sign in to cancel."
- After delete is requested, all subsequent app launches show only
  a "cancel deletion" screen until the soft-delete is undone or the
  hard-delete date passes.

## Acceptance

- A signed-in user can request export, download a JSON file
  containing every store row keyed by their user-id and nothing
  else.
- A signed-in user can request deletion. Sessions revoked. After 7
  days (or `ACCOUNT_DELETION_HARD_DELETE_DELAY_SECONDS=0` in tests),
  all rows for that user-id are gone from every store.
- Re-signing in within the 7-day window cancels the pending deletion.
- App Store privacy questionnaire entries match the new endpoints.

## Risks

- Export file size for a heavy user could be huge. Mitigation:
  stream as ndjson, not a single in-memory blob; cap per-domain
  rows to 100k each in V1 with a follow-up paginated export.
- Account-deletion idempotency. Mitigation: idempotency-key envelope
  from `T-idempotency-key-contract` covers this.
- Audit log retention. Out of scope here — legal decides retention.

## Wiring plan (precise — verified against index.js 2026-05-15)

Phase-0 (DONE, on `claude/backend-post-v1-audit`):
- `lib/account_routes.js` + 10 tests — route shapes, deps injected.
- `lib/account_lifecycle_store.js` + 8 tests — table-backed store
  (`createAccountLifecycleStore({ client })`), pg-style client
  injected, mirrors `persistence_postgres.js`.
- `migrations/008_account_lifecycle.sql` — `account_lifecycle` +
  `account_audit_log` tables.

Phase-1 (NEXT — the actual wiring; one PR):
1. **Auth dep.** `req.authUser?.id` is the canonical authenticated
   user id, attached by `userAuth.attachUserAuth` middleware
   (`index.js:3092`). Wire:
   ```js
   resolveAuthenticatedUser: (req) =>
     req.authUser?.id ? { id: String(req.authUser.id) } : null
   ```
   No new auth code — reuse the existing subsystem
   (`createUserAuthSubsystem`, `index.js:3078`).
2. **Lifecycle store dep.** In Postgres mode, build the store with
   the same pool the persistence adapter uses. The pg client is
   created in `lib/persistence_postgres.js` (`loadPgClient`); expose
   a `getRawClient()` accessor or pass `sharedPersistence`'s client.
   In JSON dev mode, fall back to an in-memory shim (no DB) so dev
   `npm start` still boots — the store is only meaningful in prod.
3. **Export dep.** `exportUserData({ userId, domains })` iterates
   `sharedPersistence.list({ domain, prefix, limit })` (signature
   confirmed: `lib/persistence_postgres.js:98`,
   `lib/persistence_json.js:127`). For each KNOWN_DOMAIN, list with
   the user's key prefix. **Open question for Codex/human:** the
   legacy memory path keys by session/ip, not user-id
   (`index.js:26617` `/data/memories/clear` uses
   `resolveWritableMemoryContext`, not `req.authUser`). Export
   correctness depends on confirming the per-user key convention per
   domain. Track as `D-account-export-key-scope` in the decisions
   queue before Phase-1 merges.
4. **Mount point.** Add `mountAccountRoutes(app, deps)` next to
   `mountApiVersionRoute(app, …)` (`index.js:26410`). Routes:
   `GET /account/export`, `DELETE /account`,
   `POST /account/cancel-deletion`.
5. **Sweep job.** A 1/hour timer (or on-login check) calls
   `lifecycleStore.listDueForHardDelete()` → for each, run the same
   per-domain delete the export iterates, then
   `lifecycleStore.finalizeHardDelete(userId)`. Reuse the
   `OUTBOX_WORKER` interval pattern (`index.js` ~31536) for the
   timer.
6. **Re-auth.** `verifyReauthProof` wires to the existing password
   challenge / Apple identity-token verifier in `user_auth.js`
   (`verifyAppleIdentityToken`). Do NOT accept the session bearer
   alone for `DELETE /account`.

Phase-2 (Codex, iOS): `DataControlsScreen.swift` surface per the
"iOS" section above.

## Out-of-scope follow-ups

- Selective export ("just my screenplays, not memory").
- Account merge after deletion (re-signup with same email).
- Server-side audit log shipping to long-term storage.
