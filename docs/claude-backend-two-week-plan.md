# Claude Backend Two-Week Plan

This is Claude's backend-only execution plan for the audit-driven V1 sprint.
Claude should read this after `docs/claude-inbox.md` and before opening or
continuing backend work.

## Operating Rule

- Work exactly one day-task at a time.
- When a full day-task is complete, do not wait for the human to copy/paste the
  next instruction. Append an event-lane update, confirm no Codex blocker or
  review request is waiting, then start the next incomplete day-task.
- If Codex posts a concrete app smoke failure, pause this plan and fix that
  exact backend failure first.
- Do not open schema-only, decomposition-only, memory-delete, release-config,
  Apple signing, or speculative polish work during this sprint.
- Every PR must include focused tests, `node scripts/pre_flight.mjs --strict`,
  and an event-lane update.
- Auth, privacy, realtime, migrations, provider-cost, and CI-adjacent backend
  changes are heavy-review lanes even when tests pass.

## Week 1: Security, Auth, Cost Control

### Day 1: Backend Exposure Lock

Expected files:
- `backend/lib/user_auth.js`
- `backend/index.js`
- realtime route libs
- visual context route/mount path
- focused backend tests

Do:
- Protect `/realtime/*` and `/visual/context` where user data, memory, or paid
  provider access is involved.
- Strip inbound `X-User-Id` before auth attaches identity.
- Stop rewriting `req.headers["x-user-id"]`.
- Replace screenplay owner resolution with `req.authUser.id` / `req.userId`.
- Add IDOR tests for cross-user screenplay access.
- Add protected-route tests for realtime/visual paid paths.

Done when:
- Client headers cannot impersonate another user.
- Realtime/visual paid paths require authenticated identity.
- Focused tests and strict pre-flight pass.
- Event lane says Day 1 is ready for Codex review.

### Day 2: Rate Limits

Expected files:
- `backend/lib/rate_limit.js`
- `backend/index.js`
- auth/realtime/talk/visual route mounts
- focused tests

Do:
- Wire the existing limiter on `/auth/*`, `/talk`, `/realtime/*`, and
  `/visual/context`.
- Use authenticated user ID when present.
- Use trusted `req.ip` only after `app.set("trust proxy", 1)`.
- Add tests for `429` behavior and reset identity separation.

Done when:
- Brute-force auth and provider-cost paths are rate-limited.
- Focused tests and strict pre-flight pass.
- Event lane says Day 2 is ready for Codex review.

### Day 3: Provider Spend Guard

Expected files:
- provider usage/spend guard module
- Talk/realtime/visual integration points
- focused tests

Do:
- Track daily per-user provider usage.
- Add a configurable V1 cap.
- Return support-safe `429` or `402` style response when capped.
- Never log transcripts, screenplay text, private memory, or provider secrets.

Done when:
- One user cannot create unbounded OpenAI/ElevenLabs spend.
- Tests prove allowed and capped flows.
- Strict pre-flight passes.

### Day 4: Apple Auth Hardening

Expected files:
- `backend/lib/user_auth.js`
- Apple auth tests
- schema docs only if response behavior changes

Do:
- Verify Apple JWTs by JWK `kid`.
- Verify nonce.
- Hard-disable `AUTH_APPLE_TEST_JWT_SECRET` in production.
- Keep test-only auth paths explicit and impossible to enable accidentally in
  production.

Done when:
- Apple Sign In verification is production-shaped and key-rotation-safe.
- Auth tests and strict pre-flight pass.

### Day 5: Password Reset And Auth Enumeration

Expected files:
- `backend/lib/user_auth.js`
- auth integration tests

Do:
- Make password reset response shape identical for known and unknown emails.
- Remove debug reset tokens from non-test/non-local paths.
- Confirm account existence cannot be inferred from response body.

Done when:
- Password reset does not leak account existence through body shape.
- Focused auth tests and strict pre-flight pass.

### Day 6: Account Deletion Backend

Expected files:
- `backend/lib/account_routes.js`
- account lifecycle store
- `backend/index.js`
- account route tests

Do:
- Ensure account delete/export routes are mounted.
- Require authenticated user.
- Revoke sessions/tokens on account deletion.
- Delete or tombstone user-owned data according to the existing lifecycle
  design.

Done when:
- Codex can wire an in-app Delete Account flow against a real backend route.
- Account tests and strict pre-flight pass.

### Day 7: Week 1 Backend Closure

Do:
- Re-run all focused tests from Days 1-6.
- Run backend `npm test` if feasible.
- Run `node scripts/pre_flight.mjs --strict`.
- Append one event-lane closure note with what passed, what failed, and what
  remains.

Done when:
- Week 1 security/auth/cost/account blockers are merged, review-ready, or each
  has one exact blocker.

## Week 2: Realtime, Persistence, Launch Smokes

### Day 8: Realtime Production Truth

Expected files:
- realtime supplier/failover libs
- realtime route tests

Do:
- Prevent production stub secrets from returning as successful realtime
  sessions.
- If the real supplier fails in production, return truthful degraded or `503`
  behavior.
- Preserve explicitly configured local/test stub behavior.

Done when:
- Production cannot fake realtime success.
- Realtime tests and strict pre-flight pass.

### Day 9: Talk Failure Diagnostics

Expected files:
- talk handler/route libs
- support-safe diagnostic helpers
- tests

Do:
- Make provider failures app-readable and support-safe.
- Include request ID, provider stage, and error class.
- Do not log transcripts, screenplay text, private memory, or secrets.

Done when:
- Codex can diagnose Talk smoke failures without private-content leakage.
- Tests and strict pre-flight pass.

### Day 10: Memory Route Auth And Privacy

Expected files:
- memory route/store integration
- memory tests

Do:
- Ensure memory read/write/export routes require authenticated users where user
  data is involved.
- Remove spoofable IP ownership for V1 protected flows.
- Add tests proving unauthenticated and cross-user access are denied.

Done when:
- Memory cannot be read or written by spoofing IP or headers.
- Tests and strict pre-flight pass.

### Day 11: Screenplay Persistence Guard

Expected files:
- screenplay store/routes
- screenplay tests

Do:
- Ensure screenplay project/version routes are auth-bound.
- Add cross-user read/write denial tests.
- Make Postgres write failures visible where they affect save truth.

Done when:
- Script saves are owner-safe and failure is not silently hidden from callers.
- Tests and strict pre-flight pass.

### Day 12: Launch Smoke Backend Support

Do:
- Support Codex on Talk, Studio, Memory, and Realtime smoke failures.
- Fix only exact failures from Launch Doctor evidence.
- Do not start a new backend initiative.

Done when:
- Local app smokes either pass or have one exact non-backend blocker.

### Day 13: Backend Release Candidate Gate

Do:
- Run backend focused tests.
- Run deterministic V1 smokes.
- Run strict pre-flight.
- Run the relevant quality-gate subset if secrets are available.
- Append event-lane proof.

Done when:
- Backend is ready for release rehearsal or has one exact blocker.

### Day 14: Freeze And Emergency Only

Do:
- Do not start new backend work.
- Fix emergency backend failures only when Codex assigns them.
- Help Codex with signed/release-path backend failures if assigned.

Done when:
- Backend is not introducing new risk while Codex finishes TestFlight readiness.

## Required Event-Lane Pattern

After opening a day PR:

```bash
node scripts/agent_event.mjs append --by=claude --kind=pr_opened --pr=<N> --comment="Day <N>: <short state>; tests: <focused checks>; next: Codex review"
```

After completing a day without a PR:

```bash
node scripts/agent_event.mjs append --by=claude --kind=product_state --comment="Day <N> complete: <what changed>; passed: <checks>; failed: <exact blocker or none>; next: Day <N+1>"
```

Before starting the next day:

```bash
node scripts/v1_launch_room.mjs --role=claude --no-events
node scripts/agent_next.mjs --role=claude --no-events
```
