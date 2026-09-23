# TASKS.md — io.them Active Work

> **Rule:** Every task has one owner, one branch, one scope, and one definition of done. Every task must serve at least one north-star pillar — **mobile-first**, **voice→scene**, **living companion**, **longitudinal learning**. See `AGENTS.md`.

## Status vocabulary
`ready` → `ready-for-support` → `in-progress` → `review` → `merged`

## Branch conventions
- `codex/<task-id>-<short-name>`
- `support/backend-<short-name>`

---

## Open rows without a task file

Rows that predate `tasks/_active/` and are still open. Everything else from the
hand-written tables lives in `tasks/HISTORY-2026-05.md`.

| ID   | Title                                              | Owner  | Status            |
|------|----------------------------------------------------|--------|-------------------|
| T01  | Triage 409-file uncommitted snapshot               | human  | ready             |
| T07-cutover | Drop dual-write JSON paths after Postgres soak | support | blocked-T07-eval |

- T01: the shared Desktop checkout is iCloud-synced and carries `<file> 2.<ext>` duplicates that Xcode synchronized groups compile; human-owned cleanup.
- T07-cutover: `backend/lib/memory_store.js` and `backend/lib/screenplay_store.js` still dual-write to the persistence adapter (T07c); `T-archive-legacy-json-stores` in `tasks/_active/` is the follow-on.

---

## Notes

- Claim a row by editing it to `Owner=<you>, Status=in-progress` **as the first commit on your new branch**. If two agents try to claim the same row, the merge conflict on this file is the correct signal — do not work around it; resolve the intent.
- New rows must include a one-line "done when" before they go to `ready` or `ready-for-support`. A row without a definition of done does not belong in this file.
- When a row reaches `merged`, move it to "Completed" with the merge date. Prune rows older than 30 days.

---

<!-- BEGIN AUTOGEN active-tasks -->

## Active work — quick view (auto-generated from tasks/_active/)

| ID                                   | Title                                                                         | Owner   | Status  |
|--------------------------------------|-------------------------------------------------------------------------------|---------|---------|
| T-archive-legacy-json-stores         | Move backend/*_store.json into backend/data/_legacy/                          | support | ready   |
| T-auth-demo-keychain-login           | Add local demo login and Keychain remembered credentials                      | codex   | review  |
| T-auth-session-durability            | Make auth sessions durable before success responses                           | codex   | review  |
| T-backend-openai-cost-cap            | OpenAI per-day / per-user / per-hour budget cap                               | support | ready   |
| T-backend-pg-pool-tuning             | Production-tune the Postgres connection pool                                  | support | ready   |
| T-decompose-root-experience-view     | Decompose them/RootExperienceView.swift (529 KB) into per-concern modules     | codex   | ready   |
| T-decompose-screenplay-studio-screen | Decompose them/ScreenplayStudioScreen.swift (1.1 MB) into per-concern modules | codex   | ready   |
| T-ios-keychain-token-migration       | Migrate iOS auth tokens from UserDefaults to Keychain                         | codex   | review  |
| T-ios-offline-outbox                 | iOS client outbox for offline-tolerant talk turns                             | codex   | ready   |
| T-macos-posture-cleanup              | Gate macOS scaffolding off the V1 iOS scheme                                  | codex   | ready   |
| T-trust-tiers                        | Trust tiers + standing pre-approvals (AGENTS.md)                              | support | review  |
| T-untested-libs-followups            | Add tests for remaining untested infrastructure libs                          | support | planned |
| T43-refresh-support-queue            | Refresh support agent queue after supervisor protocol merge                   | codex   | review  |
| T47-refresh-after-new-support-prs    | Refresh queue after new support agent PR triage                               | codex   | review  |

## Active work — full detail (auto-generated)

### T-archive-legacy-json-stores — Move backend/*_store.json into backend/data/_legacy/
- **Owner:** support
- **Branch:** -
- **Pillar:** infra (enables all)
- **Status:** ready

## Scope

Spec: `docs/specs/T-archive-legacy-json-stores.md`.

Move `screenplay_store.json` (3.6 MB), `user_memory_store.json`
(296 KB), `outbox_store.json`, `knowledge_cards.json` into
`backend/data/_legacy/`. Update `persistence_json.js` default root.
Add `.gitignore` for the new path. One-time fallback warning if
only the old path exists.

## Done when

- The four legacy JSON files no longer sit at `backend/<filename>.json`.
- `npm test` and dev `npm start` work against the new path.
- `du -sh backend/` decreases by ~4 MB.
- Deprecation warning fires once if only the old path exists.

### T-auth-demo-keychain-login — Add local demo login and Keychain remembered credentials
- **Owner:** codex
- **Branch:** codex/T-auth-demo-keychain-login
- **Pillar:** mobile-first
- **Status:** review

## Scope

- Add a debug-and-loopback-only fake email account through the existing email
  signup/login routes.
- Add explicit remembered-email and remembered-password controls to Profile.
- Store the opted-in password only in Apple Keychain and clear it immediately
  when the user disables remembrance.
- Preserve refresh-token session restoration and keep Sign in with Apple on
  the Apple-issued identity-token path.
- Normalize backend millisecond session timestamps before rendering account
  activity so a valid current session never appears tens of thousands of years
  in the future.
- Keep authenticated Data Controls responsive by caching its recovery-owner
  scope outside SwiftUI rendering and deferring legacy token cleanup until the
  auth session read has released its queue.
- Do not add a backend demo endpoint, production credential, or auth bypass.

## Done when

- The documented demo credential can create or reuse a local account and sign
  in through normal auth.
- Remembered credentials repopulate after sign-out/relaunch, while disabling
  the option removes them.
- Release or non-loopback configurations cannot surface or invoke demo login.
- Current-session activity displays the real calendar date for both legacy
  second timestamps and backend millisecond timestamps.
- Data Controls opens and remains interactive for a remembered signed-in
  account while backend identity and memory refreshes run concurrently.
- Focused credential/auth tests, iPhone and macOS builds, local backend smoke,
  strict pre-flight, and `git diff --check` pass.

## Verification

- Focused credential and authentication policy tests: 61 passed, 0 failed.
- Remembered-login/session-date policy tests after the live smoke repair: 26
  passed, 0 failed.
- Focused account deletion, password reset, session bootstrap, and auth-race tests: 15 passed, 0 failed.
- Signed Profile UI tests for demo separation and Keychain relaunch restoration: 2 passed, 0 failed.
- Focused remembered-login and recovery-owner partition tests: 29 passed, 0
  failed, 0 skipped.
- Full `themTests` target: 497 passed, 0 failed, 0 skipped.
- Exact replay of the formerly deadlocked first-page telemetry test: 1 passed, 0 failed.
- Backend auth/account contracts: 37 passed, 0 failed.
- iOS Simulator Release, macOS Scaffold Debug, and macOS Scaffold Release builds passed.
- Rebuilt macOS Scaffold Debug app relaunched into the same authenticated local
  account and rendered the active session as `Aug 27, 2026` instead of year
  `58625`.
- Process sampling reproduced the Data Controls freeze as a main-thread/auth
  session queue lock inversion. The rebuilt app then opened Data Controls,
  refreshed memory shape, opened Launch Doctor, exported its report, returned
  home, and reopened Account without a freeze.
- Launch Doctor records Screenplay Studio passed with a cold-reopened clean
  operator-provided Fountain draft outside the repository (the local path and document are not tracked);
  the JSON and Markdown reports were exported to Downloads.
- Release-app scan found none of the demo email, password, or UI label.
- Isolated local-backend smoke passed signup, refresh rotation, logout, repeat login, persistence, process restart, and repeat login.
- `node scripts/pre_flight.mjs --strict`, active-task front-matter evaluation, and `git diff --check` passed.
- Global strict task sync still reports repository-wide legacy/orphan debt; this task's row, owner, and status are synchronized and produce no finding.

### T-auth-session-durability — Make auth sessions durable before success responses
- **Owner:** codex
- **Branch:** codex/T-auth-session-durability
- **Pillar:** longitudinal learning
- **Status:** review

## Scope

- Await the existing user-store persistence queue before any mutating auth
  handler returns success.
- Return a stable failure instead of claiming success when canonical auth
  persistence fails, and only mark it retryable after durable compensation.
- Serialize auth mutations, restore the pre-request checkpoint on persistence
  failure, and keep bearer reads from observing transient rotation state.
- Verify Apple identity before entering the mutation lock and bound JWKS
  discovery so an identity-provider stall cannot block every authenticated
  request.
- Fail production startup closed when canonical auth records cannot be read;
  never authenticate from a stale local snapshot during a database outage.
- Treat an initialized-but-empty canonical auth store as authoritative so a
  stale legacy JSON mirror cannot resurrect deleted users or sessions.
- Hydrate and prune every canonical auth page so records beyond the adapter's
  10,000-row page cap cannot disappear from revocation or later reappear.
- Validate the canonical marker and stage the complete auth identity graph
  before swapping it live, rejecting malformed rows, key mismatches, orphaned
  credentials, duplicate identities, and incomplete login mechanisms without
  clearing the last known-good in-memory state.
- Accept Apple account creation/linking only from a token-verified email claim;
  never substitute the request body's email for missing identity data.
- Require production Apple audience validation so tokens issued for another
  app cannot authenticate here.
- Revoke account sessions durably before scheduling deletion, so no failed
  compensation can leave an unacknowledged hard deletion queued.
- Commit lifecycle state and its audit record atomically so an audit failure
  cannot leave an unacknowledged deletion or cancellation behind.
- Keep legacy-import dry runs read-only, validate the entire legacy auth
  snapshot before any database operation, and replace all four auth tables
  plus the canonical marker in one rollback-safe Postgres transaction.
- Require an explicit destructive opt-in for an authoritative empty auth
  replacement; schema-only must neither clear auth data nor silently authorize
  an empty database, and production must reject uninitialized canonical auth.
- Reject contradictory email-verification state and password records whose
  digest encoding or PBKDF2 work factor could bypass comparison or block login.
- Preserve existing access/refresh token contracts and iOS Keychain restore.
- Do not create, commit, log, or expose account credentials.

## Done when

- Signup, login, refresh, logout, session revocation, reset, and verification
  handlers settle their queued persistence writes before a success response.
- A delayed adapter proves signup does not answer early; adapter failures
  produce `503 auth_persistence_failed` without leaking tokens, and the
  `retryable` flag truthfully reflects whether rollback became durable.
- Slow Apple JWKS discovery does not block bearer auth or unrelated signup,
  and a real production boot exits when Postgres is unavailable.
- An Apple token without a verified email cannot take over a password account
  by supplying its email in the request body; known Apple subjects can still
  sign in when later tokens omit email.
- Empty canonical state survives restart without legacy resurrection; all
  auth pages hydrate and prune; failed durable revocation restores both live
  and canonical sessions without first scheduling deletion.
- Invalid canonical metadata or identity rows fail closed while preserving
  live state; exact-snapshot imports remove omitted stale credentials only at
  commit and restore the complete prior snapshot on rollback.
- Deletion scheduling and cancellation each use one atomic Postgres statement;
  an audit-write failure leaves the prior lifecycle state unchanged.
- Production rejects missing or mismatched Apple audiences, and failed or
  dry-run legacy imports cannot publish partial authoritative auth state.
- Empty imports fail closed without explicit authorization, and corrupted
  verification/password records fail before database writes or live hydration.
- Schema-only setup leaves an empty auth database uninitialized; production
  fails closed until a validated exact import publishes its canonical marker.
- The V1 single-instance constraint is explicit until auth snapshot writes are
  replaced by row-scoped transactions and refresh-token compare-and-swap.
- Focused auth/persistence tests, iOS session-restore tests, strict pre-flight,
  and `git diff --check` pass.

## Verification

- `npm test` in `backend/`: 2,238 passed, 1 skipped, 0 failed.
- Focused Apple/auth/account/persistence/migration suite: 222 passed, 0
  failed.
- Focused iOS account/session restore and workspace-auth policy: 20 passed, 0
  failed on iPhone 17 Pro (iOS 26.2 simulator).
- Canon/V1 deterministic quality gate, including the learned-answer realtime
  voice smoke and craft completeness: passed. The live regression/provider
  gate remains external because this environment has no valid live provider
  credential.
- Strict pre-flight, task front matter, syntax checks, and `git diff --check`:
  passed.
- Repository-wide task sync still reports only the pre-existing legacy/orphan
  task debt; this task's row and status are synchronized.

### T-backend-openai-cost-cap — OpenAI per-day / per-user / per-hour budget cap
- **Owner:** support
- **Branch:** -
- **Pillar:** infra (enables all)
- **Status:** ready

## Scope

Spec: `docs/specs/T-backend-openai-cost-cap.md`.

In-memory cost meter keyed by `(YYYY-MM-DD, route_class, user_id)`,
env-driven caps, `/ops/cost` endpoint, 402 response on cap breach.

## Done when

- 5 successive talk calls within a minute that estimate above the
  per-hour cap return 402 instead of calling OpenAI.
- `/ops/cost` returns the current-day spend per route_class.
- Unit tests cover meter math, rollover, refund-on-failure.

### T-backend-pg-pool-tuning — Production-tune the Postgres connection pool
- **Owner:** support
- **Branch:** -
- **Pillar:** infra (enables all)
- **Status:** ready

## Scope

Spec: `docs/specs/T-backend-pg-pool-tuning.md`.

Tuned `new Pool(...)` config in `lib/persistence_postgres.js`
(max, idleTimeoutMillis, connectionTimeoutMillis, statement_timeout,
application_name), a `pool.on('error')` handler, and `/ops/pg-pool`
status endpoint. New env vars documented in `.env.example` + DEPLOY.md.

## Done when

- `pg_stat_activity.application_name` shows `them-backend@<build>`.
- A 30s blocking query elsewhere does not stall our requests beyond
  `PG_STATEMENT_TIMEOUT_MS`.
- `/ops/pg-pool` returns pool stats JSON.

### T-decompose-root-experience-view — Decompose them/RootExperienceView.swift (529 KB) into per-concern modules
- **Owner:** codex
- **Branch:** -
- **Pillar:** ios
- **Status:** ready

## Scope

Spec: `docs/specs/T-decompose-root-experience-view.md`.

Phased, byte-identical extraction following the backend Phase 0–N
pattern. Six phases planned: viewmodel, onboarding, companion
presence, screenplay shell, modal sheets, residual.

## Done when

- `RootExperienceView.swift` is < 100 KB.
- Each phase landed as its own PR, byte-identical, with a
  pre/post view-hierarchy screenshot pair.
- No regression in `themTests` or V1 manual smoke.

### T-decompose-screenplay-studio-screen — Decompose them/ScreenplayStudioScreen.swift (1.1 MB) into per-concern modules
- **Owner:** codex
- **Branch:** -
- **Pillar:** ios
- **Status:** ready

## Scope

Spec: `docs/specs/T-decompose-screenplay-studio-screen.md`.

Seven phased extractions: viewmodel, paper canvas, command palette,
inline editor, voice overlay, inspector tabs, fixer queue + toast.
Each phase gated by `npm run eval:studio` (39-step gauntlet).

## Done when

- `ScreenplayStudioScreen.swift` is < 250 KB.
- `npm run eval:studio` green at every phase.
- `T-ios-xcuitest-v1-smoke` (once landed) continues to pass.

### T-ios-keychain-token-migration — Migrate iOS auth tokens from UserDefaults to Keychain
- **Owner:** codex
- **Branch:** codex/T-ios-keychain-token-migration
- **Pillar:** ios
- **Status:** review

## Scope

Spec: `docs/specs/T-ios-keychain-token-migration.md`. Decision:
`D-token-keychain-migration` in `docs/decisions-queue.md`
(resolved 2026-05-14).

Finish the existing partial credential migration by making Keychain the source
of truth before any legacy defaults read, routing every app-token consumer
through that migration, and preventing failed new secure writes from falling
back to plaintext defaults. Keep the existing public client surface unchanged.

## Done when

- Keychain values are the source of truth on a fresh install and after the
  one-shot upgrade reconciliation completes.
- Existing UserDefaults entries are cleared after migration.
- `themTests` covers fresh-install, upgrade, keychain-fail branches.
- Manual smoke: install previous build, sign in, install this build
  over the top — sign-in survives.

## Local verification

- `BackendCredentialMigrationTests` pass 38/38 on an iPhone 17 Pro simulator,
  including transient-read and old-build conflict regression cases.
- The complete iOS `themTests` target passes 516/516.
- The focused suite performs real Security-framework create, read, update, and
  delete operations against an isolated Keychain service.
- A real `app_token` upgrade fixture migrates through the production helper into
  a unique test Keychain service, clears the legacy value, and remains
  idempotent without touching an app user's credential namespace.

## Human clearance remaining

- Install a previous signed build on a physical iPhone, sign in, install the
  new signed build over it, and confirm the remembered session survives. This
  cannot be reproduced by an unsigned local simulator build.

### T-ios-offline-outbox — iOS client outbox for offline-tolerant talk turns
- **Owner:** codex
- **Branch:** -
- **Pillar:** talk
- **Status:** ready

## Scope

Spec: `docs/specs/T-ios-offline-outbox.md`.

Durable client-side outbox actor that queues failed `/talk` POSTs and
retries them on app foreground + `NWPathMonitor` recovery. Visible UI
state for queued turns. Backend already exposes `/outbox` and
`/outbox/retry`; this is the missing client piece.

## Done when

- Airplane-mode → record turn → reconnect → turn lands without
  user intervention.
- Kill app while queue non-empty → relaunch → queue intact and drains.
- 4xx (non-retryable) → entry transitions to `parked` and is
  user-visible / user-deletable.
- Unit tests cover the state machine + backoff schedule.

### T-macos-posture-cleanup — Gate macOS scaffolding off the V1 iOS scheme
- **Owner:** codex
- **Branch:** -
- **Pillar:** ios
- **Status:** ready

## Scope

Spec: `docs/specs/T-macos-posture-cleanup.md`. Decision:
`D-desktop-posture-v1` in `docs/decisions-queue.md` (resolved
2026-05-14: no desktop app for V1).

Inventory every `#if os(macOS)` branch in `them/`; for each either
(a) keep with a one-line "reason" comment, (b) wrap in a dormant
`THEM_MAC_SHELL` compile flag, or (c) delete. Remove macOS from the
active V1 TestFlight scheme. Leave the project-wide `macosx` flag in
`SUPPORTED_PLATFORMS` so a future Mac shell isn't re-plumbed from
scratch.

## Done when

- `grep -rn "#if os(macOS)" them/` shows every branch annotated or
  gated.
- V1 TestFlight scheme excludes macOS as a destination.
- macOS scheme still compiles (dormant), no warning regressions.
- iOS scheme `themTests` green.

### T-trust-tiers — Trust tiers + standing pre-approvals (AGENTS.md)
- **Owner:** support
- **Branch:** support/T-trust-tiers
- **Pillar:** infra (enables all)
- **Status:** review

## Scope

Adds a new `## Trust Tiers (standing pre-approvals)` section to
`AGENTS.md` defining three merge tiers — Tier 1 (agent-owned,
merge-eligible only when the suite is green and a trusted cross-agent approval is present),
Tier 2 (cross-agent review required), Tier 3 (human approval
required). Codifies which classes of PRs can ship without the human
becoming the merge bottleneck. Canonical reference point for the
`auto-merge-tier1.yml` workflow.

## Done when

AGENTS.md carries the Trust Tiers section with explicit lists of
what's Tier 1 / 2 / 3 and the escalation rules; the section names the
`tier-1` / `tier-2` / `tier-3` labels the auto-merge workflow will
read.

### T-untested-libs-followups — Add tests for remaining untested infrastructure libs
- **Owner:** support
- **Branch:** (not opened)
- **Pillar:** infra (test coverage)
- **Status:** planned

## Scope

The round-19 test-coverage audit found 7 `backend/lib/*.js` files
without any direct or indirect test imports:

- `memory_store` (626 lines)  — session memory persistence
- `outbox_store` (274 lines)  — scale-backplane outbox persistence
- `persona`      (317 lines)  — persona runtime
- `screenplay_store` (210 lines) — screenplay store (Phase 2 used it indirectly)
- `user_auth`    (780 lines)  — auth subsystem
- `user_store`   (705 lines)  — user persistence
- `utils`        (154 lines)  — pure-function toolbox

Coverage landed for `utils.js` (#200), `persona.js` (#205),
`screenplay_store.js` (#206), and `outbox_store.js` (#207). The
remaining 3 are foundational and stateful (memory + auth). Each
deserves its own focused test PR rather than a single mega-PR.

## Suggested phasing

1. **memory_store** — biggest single piece. Round-trip persisted
   session memory; eviction; backfill.
2. **user_store** — same shape as memory_store. Round-trip;
   per-IP / per-client-token lookup.
3. **user_auth** — tied to `user_store`. Test auth issuance + token
   verification + the `req.user` middleware.

## Done when

The remaining 3 libs have a `backend/tests/<name>.test.mjs` with at
least smoke coverage of the most-used exports + at least one
round-trip-through-persistence test for the stateful ones.

## Why this matters

When the backend decomposition lands the rest of its phases (3–8)
many handlers will start passing these libs in as deps. If we
extract a route into a lib and the store it depends on has no
test, a behavior regression in the store is invisible until it
hits a downstream route's integration test. Direct tests on the
stores catch regressions at the source.

### T43-refresh-support-queue — Refresh support agent queue after supervisor protocol merge
- **Owner:** codex
- **Branch:** codex/T43-refresh-support-queue
- **Pillar:** infra (enables all)
- **Status:** review

- **Done when:** `docs/coordination.json` and Codex/support agent inboxes reflect the current open support agent PR queue after T42, including PRs #91 and #92; superseded PR #89 is marked blocked; verification commands for the coordination scripts pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

### T47-refresh-after-new-support-prs — Refresh queue after new support agent PR triage
- **Owner:** codex
- **Branch:** codex/T47-refresh-after-new-support-prs
- **Pillar:** infra (enables all)
- **Status:** review

- **Done when:** `docs/coordination.json`, Codex inbox, support agent inbox, and the live handoff ledger record PR #99 as human-gated privacy/data-control work and PR #100 as blocked on ops access-control plus true windowed counts; prompt printers and coordination script checks pass.

- **Scope:** protocol/docs only. No app or backend runtime changes.

<!-- END AUTOGEN active-tasks -->
