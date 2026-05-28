# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/v1-definition.md`, `docs/coordination.json`, and
`docs/agent-throughput-protocol.md`.

Codex owns this file because it is the iOS/product request channel to Claude.
Claude should not use it as a historical merge log. Claude's live updates go
to `docs/agent-events-*.jsonl` through `node scripts/agent_event.mjs append`.
Codex owns `docs/coordination.json` refreshes unless explicitly assigned.

## Current Command

Active schedule: `docs/v1-two-week-free-first-schedule.md`. The 2026-05-17
audit is now a launch input. When the human says `continue`, Codex starts at
the earliest incomplete day in that schedule. Claude reads that file and works
only on the current Codex-assigned deep task. Paid/external release inputs are
last unless already free/available: Apple team/signing, hosted release
`BACKEND_URL`, production `APP_TOKEN`, and real provider keys for final
Talk/Realtime proof.

Claude's backend sprint plan is `docs/claude-backend-two-week-plan.md`.
Claude must execute it day by day. When a full day-task is complete, Claude
must append proof to the event lane, check Launch Room/agent_next, and start
the next incomplete day-task automatically unless Codex has posted a blocker,
review request, or emergency smoke failure. The human must not be used as a
copy-paste bridge for the next-day instruction.

Current V1 state: `cd backend && npm run v1:status` is 29/34 after the Day 14
release switch-flip tooling and the resolved memory privacy decision refresh.
The code-owned gates are green or expected-red
only for private/external release inputs: strict pre-flight passes, deterministic
V1 smokes pass, backend tests pass, iOS unit/UI tests passed on iPhone 17 Pro,
and the Release iPhone build inside App Store preflight passes. Do not reopen
eval-quality, decomposition, or schema-doc lanes unless Codex posts a concrete
regression.
Release branch sync is current with `origin/main` as of 2026-05-28: the active
release branch merged the two newer main protocol commits, and the previous
90/56 dry-run conflict note is resolved. See `docs/v1-branch-sync-status.md`
for the latest sync proof.
The launch lane is still blocked by private release configuration:
no `them/Release.local.env` exists in the current worktree, the environment
lacks `DEVELOPMENT_TEAM_ID` and release `APP_TOKEN_RELEASE`, and
`scripts/appstore_preflight.sh` remains expected-red with `fail=2 warn=1`.
Release `BACKEND_URL` is hosted as `https://api.them.io`. Day 14 repo tooling
now exists: `node scripts/release_config_status.mjs` reports missing private
inputs without printing secrets, and `scripts/run_release_preflight.sh` fails
closed at config status until those inputs are present.
Launch Doctor now tracks the fifth V1 gate as `iOS Release Readiness`, so
manual smoke proof is incomplete until Talk, Studio, Memory, Realtime, and
release readiness are all recorded from the actual release path.
The generated TestFlight checklist at `docs/testflight-v1-preflight.md` is
also five-flow/current; strict pre-flight now fails if it drifts from
`scripts/v1_manual_qa_checklist.mjs`.
Deterministic V1 smokes are green, and the local `/talk` integration smoke
passes when local loopback binding is allowed.

1. Run:

   ```bash
   node scripts/v1_launch_room.mjs --role=claude
   node scripts/agent_next.mjs --role=claude
   node scripts/coordination_state.mjs read
   node scripts/agent_event.mjs tail --n=20
   ```

2. Treat this inbox and `agent_next` as the first screen. The Claude backend
   sprint is complete through Day 14 in the event lane; Claude is support-only
   for exact V1 smoke, release, or backend regression failures unless Codex
   assigns a new post-V1 lane.
3. Do not open coordination-refresh PRs. Append event-lane updates after PR
   open, rebase, blocker clear, and ready-for-review transitions.
4. Every PR description must include:

   ```text
   V1 pillar: talk | screenplay | memory | realtime | ios | infra
   V1 effect: closes <docs/v1-definition.md checklist item> | unblocks <item> | infrastructure for <item>
   ```

5. PR #33, PR #212, and PR #94 are merged. PR #99 memory delete is out of V1
   and must not be reopened unless Codex assigns a post-V1 deletion task.
6. If a backend feature spans more than three PRs or touches talk/auth/privacy,
   open a short design note before implementation.
7. The schema-doc-only train through PR #286 is complete. Do not open more
   schema-doc-only PRs unless Codex asks; PRs #287/#289/#291/#292/#294 were
   closed as out-of-lane, and #293 merged only as a corrected Phase 7a design
   note. PR #299 was also closed as out-of-lane schema-only. PR #335 merged
   Phase 7b, so implementation is no longer the backend lane.
8. Do not ask the human to inspect old PR bodies for #94/#99. Use
   `docs/decisions-queue.md` as the privacy/data-control record:
   `D-creative-memory-export-approval` and `D-creative-memory-delete-scope`
   are resolved; #99 is post-V1 unless Codex assigns it.
9. Phase 7b dependency-boundary decision: use `acorn` and `acorn-walk` as
   backend devDependencies to compute the extracted talk-handler closure
   deterministically. Do not ask for human-in-the-loop dependency convergence,
   and do not hand-maintain the closure by vibes. This shipped with PR #335.
10. Do not touch release config, memory delete, talk handler decomposition, or
    schema-only docs unless Codex posts a concrete failure. Auth/privacy work is
    allowed only for the current audit-schedule assignment.
11. Do not work on paid/external release inputs before the free-first schedule
    reaches Day 14 unless Codex explicitly says those inputs are available.

## Backend Work Codex Actually Wants Next

These are ordered by app-visible V1 impact, not by backend curiosity.

| Priority | Request | Why it matters | Expected shape |
| --- | --- | --- | --- |
| 1 | Support V1 manual smoke failures | Talk, Studio, Memory, Realtime, and iOS Release Readiness still need human release-path proof. | If Codex posts a concrete smoke failure, pause all other work and fix that exact backend failure first. |
| 2 | Support release config/preflight failures | Private Apple/team/token inputs are the remaining switch-flip blockers. | Do not create or commit secrets. If private inputs are supplied and preflight fails for a repo-owned reason, fix that specific failure. |
| 3 | Emergency backend regression only | The Day 1-14 backend sprint is complete and new backend scope adds release risk. | Open backend work only for a reproducible V1 regression or a Codex-assigned post-V1 task. |

## Decomposition Rules

Phases 0-3 of `docs/specs/T-decompose-backend-index.md` proved the extraction
pattern. Future phase PRs are fast-lane eligible only when they follow it:

- one phase per PR, one route domain per file group;
- mount order unchanged;
- route-local JSON parser where the route reads `req.body`;
- required-deps guard at mount time;
- focused integration tests on a bare Express app;
- `node scripts/pre_flight.mjs` run before review.

Phase 7, the talk pipeline, is not fast-lane by default. Phase 7c may open
because PR #349 is merged and Codex approved the 3-factory shape, but the
implementation remains heavy-lane because it touches the V1 talk path.

## Claude Event Template

After opening or updating a PR:

```bash
node scripts/agent_event.mjs append --by=claude --kind=pr_opened --pr=<N> --comment="<V1 pillar>: <short useful state>"
```

Use `pr_rebased`, `review_ready`, `blocker_cleared`, or `product_state` when
those are more accurate. Keep comments short enough that `agent_next` is useful.

## Product-State Update Template

At most once per day, append:

```bash
node scripts/agent_event.mjs append --by=claude --kind=product_state --comment="ships: <user-visible thing>; blocker: <specific gap>; ask_codex: <one concrete ask>"
```

This replaces long human copy/paste reports with a searchable live tape.
