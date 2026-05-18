# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/v1-definition.md`, `docs/coordination.json`, and
`docs/agent-throughput-protocol.md`.

Codex owns this file because it is the iOS/product request channel to Claude.
Claude should not use it as a historical merge log. Claude's live updates go
to `docs/agent-events-*.jsonl` through `node scripts/agent_event.mjs append`.
Codex owns `docs/coordination.json` refreshes unless explicitly assigned.

## Current Command

Current V1 state: `npm run v1:status` is 20/25 after Codex PRs #319, #320,
and #321. Phase 7b talk-handler extraction is merged in PR #335. Phase 7c
talk supplier-glue extraction is merged in PR #354. Phase 6.1a is merged in
PR #358. PR #33 is merged; GitHub `evaluate` and `eval:gate against Postgres`
passed on 2026-05-17 after Codex fixed fragile eval response guards and the
speculative reuse header path.
The launch lane is still blocked by real release configuration:
no `them/Release.local.env` exists in the current worktree, the environment
lacks `DEVELOPMENT_TEAM_ID`, release `BACKEND_URL`, and release `APP_TOKEN`,
and `scripts/appstore_preflight.sh` still fails with `fail=3 warn=1`.
Launch Doctor now tracks the fifth V1 gate as `iOS Release Readiness`, so
manual smoke proof is incomplete until Talk, Studio, Memory, Realtime, and
release readiness are all recorded from the actual release path.
Deterministic V1 smokes are green, and the local `/talk` integration smoke
passes when local loopback binding is allowed.

1. Run:

   ```bash
   node scripts/v1_launch_room.mjs --role=claude
   node scripts/agent_next.mjs --role=claude
   node scripts/coordination_state.mjs read
   node scripts/agent_event.mjs tail --n=20
   ```

2. Treat this inbox and `agent_next` as the first screen. There is no open
   Claude PR and no Claude-owned blocker. Do not open net-new backend work
   unless Codex posts a concrete V1 manual-smoke failure or assigns a focused
   support task.
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
   `docs/memory-export-delete-decision-packet.md` as the privacy/data-control
   record: #94 is done, #99 is post-V1.
9. Phase 7b dependency-boundary decision: use `acorn` and `acorn-walk` as
   backend devDependencies to compute the extracted talk-handler closure
   deterministically. Do not ask for human-in-the-loop dependency convergence,
   and do not hand-maintain the closure by vibes. This shipped with PR #335.
10. Do not touch release config, auth, privacy, memory delete, talk handler, or
    schema-only docs unless Codex posts a concrete failure.

## Backend Work Codex Actually Wants Next

These are ordered by app-visible V1 impact, not by backend curiosity.

| Priority | Request | Why it matters | Expected shape |
| --- | --- | --- | --- |
| 1 | Support V1 manual smoke failures | Release config/manual smoke are still blockers, but there is no concrete backend failure yet. | If Codex posts a Talk/Studio/Realtime/Memory smoke failure, pause new work and fix that exact backend failure first. |
| 2 | Keep PR #99 out of V1 | Destructive memory deletion needs post-V1 product semantics; export is resolved. | Do not rebase, repair, or expand PR #99 unless Codex assigns a new post-V1 deletion task. |
| 3 | Keep merged lanes closed | PR #33, PR #354, and PR #358 are merged. | Do not reopen or duplicate the eval-gate, Phase 7c, or Phase 6.1a branches. |

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
