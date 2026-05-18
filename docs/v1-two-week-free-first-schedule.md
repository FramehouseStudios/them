# V1 Two-Week Free-First Completion Schedule

This is the active schedule when the human says `continue`.

The paid or external inputs come last unless they are already free/available:
Apple Developer team/signing, hosted production backend URL, and production app
token. Until those exist, Codex and Claude prove everything possible locally,
record only factual proof, and keep the final release switch-flip isolated.

## Non-Negotiable Rules

- Codex owns V1 completion, app smoke, launch truth, reviews, merges, and
  final release readiness.
- Claude works one deep task at a time and only from this schedule or a direct
  Codex assignment.
- Claude must not open net-new backend, schema-only, release-config, auth,
  privacy, memory-delete, or polish work while smoke/release blockers wait.
- Claude must not touch Apple signing, `them/Release.local.env`, production
  tokens, hosted release secrets, or release metadata unless Codex explicitly
  assigns a concrete repo-only support task.
- If a smoke fails, Claude fixes only the exact assigned backend/support
  failure, with named files, tests, and definition of done.
- Every day ends with Launch Doctor/proof docs/event-lane truth updated.
- Do not claim manual smoke, signed build, TestFlight readiness, hosted backend
  readiness, or release preflight passed unless it actually ran and passed.

## Current Truth At Schedule Start

- V1 is 20/25.
- Open PRs: none.
- Claude active work: none.
- Launch Doctor: `not_started`, 0/5.
- Release preflight: `fail=3 warn=1`.
- Current exact release blockers:
  - missing `them/Release.local.env`;
  - missing `DEVELOPMENT_TEAM_ID`;
  - missing release `BACKEND_URL`;
  - missing release `APP_TOKEN`;
  - valid Apple signing identity not proven on this machine.
- PR #33, PR #354, PR #358, and PR #359 are merged. Do not reopen or duplicate
  those lanes.

## Week 1: Prove The App Works Locally

### Day 1: Free Local V1 Proof Setup

Codex:
- Run `node scripts/v1_launch_room.mjs --role=codex --no-events`.
- Run `node scripts/agent_next.mjs --role=claude --no-events`.
- Start the local backend/app path with free/local configuration only.
- Run as much of the V1 Launch Doctor flow as can be truthfully run locally.
- Record factual Launch Doctor states; do not leave missing evidence vague.

Claude:
- Stand by.
- Do not open a PR unless Codex posts a concrete local smoke failure.

Exit:
- Launch Doctor no longer contains blank/ambiguous evidence for flows Codex can
  attempt locally, or every not-run flow has an exact reason.

### Day 2: Talk Pipeline Local Smoke

Codex:
- Run Talk locally: record/type turn -> reply -> audio or explicit fallback ->
  saved turn after relaunch/reopen.
- Record pass/fail/evidence in Launch Doctor.

Claude:
- If assigned, fix only the exact backend Talk failure.
- Required proof for any Claude fix: focused Talk test, relevant backend test,
  `node scripts/pre_flight.mjs --strict`, and event-lane update.

Exit:
- Talk is passed locally or has one exact blocker.

### Day 3: Studio Local Smoke

Codex:
- Run Studio locally: create project -> write scene -> save -> export -> reopen.
- Verify export/error alternatives are app-facing, not backend-only.
- Record Launch Doctor proof.

Claude:
- If assigned, fix only the exact screenplay backend/support failure.

Exit:
- Studio is passed locally or has one exact blocker.

### Day 4: Memory Local Smoke

Codex:
- Run Memory locally: mention character/trait -> later suggestion recalls them
  -> Data Controls memory summary stays plain-language/support-safe.
- Record Launch Doctor proof.

Claude:
- If assigned, fix only the exact memory backend/support failure.
- Do not reopen memory delete. PR #99 remains out of V1.

Exit:
- Memory is passed locally or has one exact blocker.

### Day 5: Realtime Local/Fallback Smoke

Codex:
- Run Realtime locally as far as free configuration allows.
- Prove primary mint if possible.
- Prove forced primary failure/degraded fallback with stub/failing config if
  paid provider access is unavailable.
- Record exactly which path was real vs stubbed.

Claude:
- If assigned, fix only the exact realtime supplier/fallback backend failure.

Exit:
- Realtime has local primary/fallback proof or one exact blocker.

### Day 6: Unsigned Platform Build Confidence

Codex:
- Run macOS build/test with signing disabled.
- Run generic iOS build with signing disabled.
- Update build/test proof docs if results changed.

Claude:
- Stand by unless a concrete backend test failure appears.

Exit:
- Unsigned desktop/iOS build confidence is current and recorded.

### Day 7: Week 1 Closure

Codex:
- Re-run Launch Room.
- Re-run strict pre-flight and relevant smoke tests.
- Update Launch Doctor, proof docs, and event lane.
- Merge only blocker-clearing PRs.

Claude:
- No new work unless Codex assigns a smoke failure.

Exit:
- Each of Talk, Studio, Memory, Realtime, and local release-readiness prep is
  passed locally or has one exact blocker.

## Week 2: Make The Local Proof Scalable And Release-Ready

### Day 8: Production-Shape Config Without Paid Inputs

Codex:
- Verify release config validation fails clearly without secrets.
- Verify local/free config can mimic production shape without committing
  secrets.
- Keep `them/Release.local.env` ignored and uncommitted.

Claude:
- If assigned, harden backend config validation only when a concrete ambiguity
  blocks smoke/release prep.

Exit:
- When real release values arrive, the next command and expected failure/success
  are obvious.

### Day 9: Observability And Support Readiness

Codex:
- Audit whether Talk/Studio/Memory/Realtime smoke failures are diagnosable
  without private content leakage.

Claude:
- If assigned, add the smallest backend diagnostic for a concrete blind spot:
  request ID, provider failure code, latency bucket, or support-safe metric.
- Do not log creative/private content.

Exit:
- A smoke failure can be triaged without log spelunking or privacy leakage.

### Day 10: Automate Repeated Smoke Proof

Codex:
- Convert repeatable smoke checks into scripts/tests where possible.
- Add strict pre-flight guards for any repeated coordination/proof mistake.

Claude:
- If assigned, add backend harness support only for a concrete automated-smoke
  gap.

Exit:
- Repeated smoke/proof mistakes become checks, not reminders.

### Day 11: Persistence And Scale Audit

Codex:
- Audit production persistence risks: tenancy, backups, restore, migration,
  retention, rate limits, and provider failure behavior.
- Name only V1 launch-impacting gaps.

Claude:
- If assigned, implement one scoped backend hardening task with tests.

Exit:
- Production persistence/scale gaps are either guarded, explicitly parked, or
  assigned as one concrete blocker.

### Day 12: Platform Parity Pass

Codex:
- Compare macOS and iOS behavior for permissions, audio, file export/import,
  persistence, and degraded states.
- Update proof docs with exact pass/fail state.

Claude:
- Stand by unless a backend parity failure is assigned.

Exit:
- No unknown iOS/desktop parity blocker remains.

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
- The repo can say clearly: “ready except paid/external release inputs” or name
  one exact non-paid blocker.

### Day 14: Paid/External Switch-Flip Last

Only if free/available, human provides:
- Apple `DEVELOPMENT_TEAM_ID`;
- valid Apple signing identity;
- hosted release `BACKEND_URL`;
- production `APP_TOKEN`.

Codex:
- Create local ignored `them/Release.local.env`.
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
3. Prefer completing/recording one V1 smoke proof over opening new work.
4. Update Launch Doctor/proof docs/event lane before stopping.

Claude:
1. Read this file, `docs/claude-inbox.md`, Launch Room, and `agent_next`.
2. If no Codex assignment names a concrete smoke/backend failure, do nothing
   except remain in support mode.
3. If assigned, fix exactly that blocker and stop.

Human:
1. Avoid paid/external inputs until Day 14 unless they are already free.
2. If providing paid/external inputs earlier, tell Codex explicitly and keep
   secrets out of git.
