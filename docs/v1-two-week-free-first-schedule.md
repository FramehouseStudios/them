# V1 Two-Week Audit-Driven Completion Schedule

This is the active schedule when the human says `continue`.

The 2026-05-17 audit is now a launch input. The plan stays free-first where
possible, but security, privacy, App Review, and CI merge safety outrank local
smoke polish. Paid/external release inputs still come last unless already
available: Apple Developer team/signing and production `APP_TOKEN_RELEASE`.
Release `BACKEND_URL` is already `https://api.them.io` unless the release
backend changes.

## Non-Negotiable Rules

- Codex owns V1 completion, app smoke, launch truth, reviews, merges, and
  final release readiness.
- Claude works one deep task at a time and only from this schedule or a direct
  Codex assignment.
- Claude's backend-specific daily execution plan lives in
  `docs/claude-backend-two-week-plan.md`. When a full day-task is complete,
  Claude appends proof, checks Launch Room/agent_next, and starts the next
  incomplete day-task automatically unless Codex has posted a blocker, review
  request, or emergency smoke failure.
- Claude must not open net-new schema-only, decomposition-only, release-config,
  memory-delete, or polish work while audit launch blockers wait.
- Claude must not touch Apple signing, `them/Release.local.env`, production
  tokens, hosted release secrets, or release metadata unless Codex explicitly
  assigns a concrete repo-only support task.
- Any auth, privacy, security, CI, migration, release, entitlement, or App
  Store metadata change is heavy-lane review, even if tests pass.
- Every day ends with Launch Doctor/proof docs/event-lane truth updated.
- Do not claim manual smoke, signed build, TestFlight readiness, hosted backend
  readiness, or release preflight passed unless it actually ran and passed.

## Current Truth At Audit Intake

- V1 is 20/25.
- Open PRs: none.
- Claude active work: none.
- Launch Doctor: `failed`, 0/5 passed, failed=1 because local `/talk` reached
  STT and hit OpenAI `401 invalid_api_key` with a dummy local key.
- Deterministic V1 smokes passed for Talk subset, Studio subset, Memory subset,
  and Realtime subset.
- Free/local backend smoke passed `health`, `session`, `history`, and
  `memories`.
- Release preflight: `fail=3 warn=2`.
- Current exact release blockers:
  - missing `them/Release.local.env`;
  - missing `DEVELOPMENT_TEAM_ID`;
  - missing release `APP_TOKEN_RELEASE`;
  - valid Apple signing identity not proven on this machine.
- PR #33, PR #354, PR #358, and PR #359 are merged. Do not reopen or duplicate
  those lanes.

## Audit Launch Blockers We Must Clear In 14 Days

- Provider key exposure response: rotate any real OpenAI/ElevenLabs keys that
  appeared in local env files or AI-tool-visible context, delete local
  production env files, and keep secrets out of git.
- Backend exposure lock: require real user auth for `/realtime/*`,
  `/visual/context`, memory/history/screenplay-sensitive routes; strip inbound
  `X-User-Id`; replace header-trusted ownership with `req.authUser.id`.
- Rate limits and spend guard: wire existing limiter at `/auth/*`,
  `/realtime/*`, `/talk`, and visual context; add a V1 daily per-user provider
  budget guard or explicit launch cap.
- Apple/auth hardening: disable test-HMAC Apple JWT verification in production,
  verify Apple `kid`/JWKs/nonce, and keep auth routes non-enumerating.
- App Review fixes: mount account deletion, expose in-app Delete Account, gate
  debug bundle and Talk Diagnostics out of Release, remove unused Contacts
  permission or make it truly used, update privacy declarations and policy.
- Realtime correctness: no production stub secret as successful failover; real
  provider failure must degrade truthfully or return a supportable 503.
- Lifecycle/platform fixes: stop mic/realtime/audio on background, fix Debug
  ATS scope, set V1 iPhone-only release targeting, and keep macOS dormant until
  it has truthful proof.
- CI/merge hardening: quality gate must run on PRs, auto-merge must deny risky
  paths, require distinct cross-agent approval, and prevent agents from
  auto-merging workflow/secret/entitlement/migration/release changes.

## Parked Past V1

These matter, but do not block a capped V1 if the launch blockers above are
fixed and documented:

- Full backend `index.js` decomposition below 800 lines.
- Full `ScreenplayStudioScreen` and `RootExperienceView` decomposition.
- Full relational screenplay/memory schema rewrite.
- Redis/distributed idempotency and multi-instance Render scaling.
- Localization.
- Brand rename away from `Her*`/`Clementine*`.

## Week 1: Stop The Bleeding

### Day 0: Secret Exposure Response

Human:
- Rotate any real OpenAI and ElevenLabs keys that appeared in local
  `backend/.env`, `backend/.env.production`, screenshots, transcripts, or
  AI-tool-visible context.
- Delete local production env copies after rotation. Keep Render/password
  manager as the source of truth.

Codex:
- Verify env files are gitignored and not committed.
- Add or run secret scanning/preflight checks if the repo lacks them.
- Record only presence/absence, never secret values.

Claude:
- Stand by.

Exit:
- No repo or coordination file contains provider secrets, and the human has one
  exact rotation checklist if rotation is not yet complete.

### Day 1: Backend Exposure Lock

Claude:
- Own one deep backend task only.
- Expected files: `backend/lib/user_auth.js`, `backend/index.js`, realtime route
  libs, visual context mount path, and focused backend tests.
- Add `/realtime/*` and `/visual/context` to protected user-auth coverage where
  user data, memory, or paid provider access is involved.
- Strip inbound `X-User-Id` before auth attaches identity.
- Stop rewriting `req.headers["x-user-id"]`; downstream ownership must use
  `req.authUser.id` / `req.userId`.
- Replace screenplay owner resolution away from caller-supplied headers.
- Add regression tests for cross-user screenplay access and protected realtime
  or visual routes.

Codex:
- Review deeply for auth/privacy regressions.
- Run focused backend tests, strict pre-flight, and Launch Room.

Exit:
- No client-supplied header can select another user's screenplay/memory owner,
  and cost-attached realtime/visual paths require authenticated identity.

### Day 2: Rate Limits And Spend Guard

Claude:
- Wire the existing rate limiter on `/auth/*`, `/realtime/*`, `/talk`, and
  `/visual/context`.
- Use per-user identity where authenticated; fall back to trusted `req.ip` only
  after `app.set("trust proxy", 1)`.
- Add a V1 provider budget guard: per-user daily counter, configurable limit,
  support-safe 429/402 response, and tests.

Codex:
- Verify limiter behavior locally with real HTTP requests, not only unit tests.
- Record provider-cost risk as guarded or name the exact remaining blocker.

Exit:
- Brute-force auth and provider-cost endpoints have enforced limits, tested
  responses, and support-safe diagnostics.

### Day 3: Account Deletion And App Review Data Controls

Codex:
- Verify backend account lifecycle routes are mounted and tested.
- Add in-app Delete Account entry in `DataControlsScreen` or the active
  settings/data surface.
- Confirm destructive flow is explicit, reversible only where true, and not
  confused with PR #99 memory-delete semantics.

Claude:
- Fix backend account route/mount/test gaps only if Codex assigns them.

Exit:
- App Review 5.1.1(v) account deletion has an app path, backend path, and tests.

### Day 4: Apple/Auth Hardening

Claude:
- Replace production Apple static-key/test-HMAC risk with JWK `kid` verification
  and nonce verification.
- Hard-disable `AUTH_APPLE_TEST_JWT_SECRET` in production.
- Make password-reset request responses non-enumerating and remove debug tokens
  from non-test flows.

Codex:
- Review for production/test separation and run auth integration tests.

Exit:
- Apple Sign In verification is production-shaped, and debug/test auth paths
  cannot accidentally ship.

### Day 5: CI And Agent Merge Safety

Codex:
- Add `pull_request` coverage to `quality-gate.yml` with safe defaults.
- Harden `auto-merge-tier1.yml` with risky-path deny rules:
  `.github/**`, `Dockerfile`, `backend/render.yaml`, entitlements,
  `PrivacyInfo.xcprivacy`, `backend/config.js`, `backend/migrations/**`,
  release scripts, and quality/preflight scripts.
- Require distinct cross-agent approval; reject self-approval and agent
  auto-merge of workflows/secrets/release/privacy/auth paths.
- Add tests or static checks for the deny list if possible.

Claude:
- Stand by unless Codex asks for workflow review only.

Exit:
- Agents cannot rubber-stamp risky repo changes into `main`.

### Day 6: Release UI And Privacy Surface

Codex:
- Gate Release-reachable Debug Bundle and Talk Diagnostics out of Release.
- Remove unused Contacts permission, or wire it into a truly reachable shipping
  flow with matching privacy copy.
- Update `PrivacyInfo.xcprivacy`, App Store privacy mapping, and public privacy
  policy to name actual data classes and AI vendors.
- Decide V1 stance on romantic/love-mode behavior: remove/disable unsolicited
  modes for V1 or explicitly mark rating/privacy implications.

Claude:
- Stand by unless a backend privacy endpoint bug is assigned.

Exit:
- App Review privacy/debug blockers are fixed or have one exact remaining
  product decision.

### Day 7: Week 1 Security/App Review Closure

Codex:
- Re-run Launch Room, strict pre-flight, backend focused tests, and app build
  checks that do not require paid signing.
- Update Launch Doctor, proof docs, and event lane.
- Merge only blocker-clearing PRs.

Claude:
- Emergency fixes only.

Exit:
- Auth/AuthZ, rate limits, account deletion, App Review debug/privacy, and CI
  merge-safety are either passed or have one exact blocker each.

## Week 2: Make It Releasable And Prove It

### Day 8: Realtime Production Truth

Codex:
- Verify realtime primary/fallback behavior against local/free config.
- Ensure production cannot return a fake stub secret as success.
- Record real vs stubbed proof.

Claude:
- Fix only assigned realtime supplier/failover defects with focused tests.

Exit:
- Realtime either works on the real path or degrades truthfully.

### Day 9: Talk Pipeline Proof

Codex:
- Run Talk locally with a real/free provider key if available; otherwise record
  the exact credential blocker.
- Verify record/type turn -> reply -> audio or explicit fallback -> saved turn.

Claude:
- Fix only an assigned backend Talk failure.

Exit:
- Talk is passed locally or has one exact non-code blocker.

### Day 10: Studio And Memory App Proof

Codex:
- Run Studio: create project -> write scene -> save -> export -> reopen.
- Run Memory: mention character/trait -> later suggestion recalls it -> Data
  Controls remains plain-language and support-safe.
- Record Launch Doctor proof.

Claude:
- Fix only assigned screenplay/memory backend failures.

Exit:
- Studio and Memory are passed locally or have exact blockers.

### Day 11: Lifecycle And Platform Release Shape

Codex:
- Stop mic/realtime/audio on `.background`, or document required background
  audio entitlement if intentionally shipping.
- Fix Debug ATS to scoped localhost/tunnel exceptions.
- Set V1 release targeting to iPhone-only; keep macOS/desktop dormant unless
  proof exists.
- Run unsigned iOS/macOS build checks.

Claude:
- Stand by.

Exit:
- Platform lifecycle and release target risks are closed or exactly blocked.

### Day 12: Production-Shape Config Without Paid Inputs

Codex:
- Verify release config validation fails clearly without secrets.
- Verify local/free config mimics production shape without committing secrets.
- Keep `them/Release.local.env` ignored and uncommitted.

Claude:
- Harden backend config validation only if Codex assigns a concrete ambiguity.

Exit:
- When real release values arrive, the next command and expected result are
  obvious.

### Day 13: Free-First Release Candidate Rehearsal

Codex:
- Run all free/local gates:
  - strict pre-flight;
  - relevant Node tests;
  - app build/tests with signing disabled;
  - deterministic V1 smokes;
  - Launch Doctor local proof;
  - release config status/preflight expected-red documentation.
- Freeze non-critical work.

Claude:
- Emergency blocker fixes only.

Exit:
- The repo can say clearly: "ready except paid/external release inputs" or name
  one exact non-paid blocker.

### Day 14: Paid/External Switch-Flip Last

Only if free/available, human provides:
- Apple `DEVELOPMENT_TEAM_ID`;
- valid Apple signing identity;
- production `APP_TOKEN_RELEASE`;
- real/free provider keys needed for final Talk/Realtime proof.

Codex:
- Create local ignored `them/Release.local.env`.
- Keep `BACKEND_URL=https://api.them.io` unless the release backend changes.
- Run `node scripts/release_config_status.mjs`.
- Run `scripts/run_release_preflight.sh`.
- Produce signed build/TestFlight path only if the above passes.
- Run final Launch Doctor against intended release path.

Claude:
- Frozen except emergency backend/support failures assigned by Codex.

Exit:
- V1 is TestFlight-ready, or the only remaining blocker is one exact
  paid/external dependency.

## What To Do On `continue`

Codex:
1. Run `git status`, `gh pr list`, Launch Room, and `agent_next`.
2. Start at the earliest incomplete day in this schedule.
3. Prefer clearing one audit launch blocker over opening side work.
4. Update Launch Doctor/proof docs/event lane before stopping.

Claude:
1. Read this file, `docs/claude-inbox.md`, Launch Room, and `agent_next`.
2. Work only on the current Codex-assigned deep task.
3. If assigned, fix exactly that blocker, run named tests, append event-lane
   status, and stop.

Human:
1. Rotate exposed provider keys immediately if they were real.
2. Avoid paid/external release inputs until Day 14 unless they are already
   free/available.
3. Keep secrets out of git, chat, screenshots, and agent-visible files.
