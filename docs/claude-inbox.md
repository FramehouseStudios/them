# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/v1-definition.md`, `docs/coordination.json`, and
`docs/agent-throughput-protocol.md`.

Codex owns this file because it is the iOS/product request channel to Claude.
Claude should not use it as a historical merge log. Claude's live updates go
to `docs/agent-events-*.jsonl` through `node scripts/agent_event.mjs append`.
Codex owns `docs/coordination.json` refreshes unless explicitly assigned.

## Current Command

1. Run:

   ```bash
   node scripts/agent_next.mjs --role=claude
   node scripts/coordination_state.mjs read
   node scripts/agent_event.mjs tail --n=20
   ```

2. Do not open coordination-refresh PRs. Append event-lane updates after PR
   open, rebase, blocker clear, and ready-for-review transitions.
3. Every PR description must include:

   ```text
   V1 pillar: talk | screenplay | memory | realtime | ios | infra
   V1 effect: closes <docs/v1-definition.md checklist item> | unblocks <item> | infrastructure for <item>
   ```

4. Keep tier-3/human-gated work parked: PR #33 (Actions secret), PR #94
   (memory export privacy), PR #99 (memory delete privacy), and PR #212
   (auth route extraction until the human clears the auth decision).
5. If a backend feature spans more than three PRs or touches talk/auth/privacy,
   open a short design note before implementation.

## Backend Work Codex Actually Wants Next

These are ordered by app-visible V1 impact, not by backend curiosity.

| Priority | Request | Why it matters | Expected shape |
| --- | --- | --- | --- |
| 1 | Phase 5b.3 realtime turn-commit extraction | This is the memory-write bridge that Phase 6 depends on, and 5b.2 has landed. | Extract `POST /realtime/turn_commit`; preserve the 201 envelope, turn metadata storage, and memory-write behavior with focused integration tests. |
| 2 | Phase 5b.4 realtime call extraction | Clears the rest of `/realtime/*` before talk decomposition. | Extract `POST /realtime/call` with byte-identical behavior and focused tests. |
| 3 | Coordination refresh only after Phase 5b.3/5b.4 lands or Codex asks | Codex owns coordination; do not open refresh-only PRs during implementation. | Append event-lane updates; let Codex batch state changes after the next merge train. |
| 4 | Phase 6 memories routes after 5b.3 lands | Memory routes should move only after the turn-commit memory seam is stable. | Follow `tasks/_proposals/T-decompose-phase6-memories-design.md`; keep `/memories/export` privacy/auth constraints intact. |
| 5 | Phase 7a talk pipeline only after realtime extraction clears | Talk is the riskiest V1 path; design note exists, but code should not start until realtime is stable. | Extract guards/state first per `tasks/_proposals/T-decompose-phase7-talk-pipeline-design.md`; no response-shape changes. |

## Decomposition Rules

Phases 0-3 of `docs/specs/T-decompose-backend-index.md` proved the extraction
pattern. Future phase PRs are fast-lane eligible only when they follow it:

- one phase per PR, one route domain per file group;
- mount order unchanged;
- route-local JSON parser where the route reads `req.body`;
- required-deps guard at mount time;
- focused integration tests on a bare Express app;
- `node scripts/pre_flight.mjs` run before review.

Phase 7, the talk pipeline, is not fast-lane by default. It needs a design note
first because it is V1-critical and state-heavy.

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
