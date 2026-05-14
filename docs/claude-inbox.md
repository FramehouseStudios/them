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
6. The schema-doc-only train through PR #286 is complete. Do not open more
   schema-doc-only PRs unless Codex asks; PRs #287/#289/#291/#292/#294 were
   closed as out-of-lane, and #293 merged only as a corrected Phase 7a design
   note. PR #299 was also closed as out-of-lane schema-only. PR #298 was
   closed as premature; Phase 7a has now landed, so reopen that idea only as a
   fresh Phase 7b design note before implementation.

## Backend Work Codex Actually Wants Next

These are ordered by app-visible V1 impact, not by backend curiosity.

| Priority | Request | Why it matters | Expected shape |
| --- | --- | --- | --- |
| 1 | Phase 7b talk handler design note | Talk is the highest-risk V1 path, and Phase 7a guard extraction is now merged. Do not jump straight to code. | Reopen the #298 idea as a fresh design note only: exact handler boundary, state/deps passed into the handler, response-shape invariants, tests/evals, and rollback. No implementation in the design PR. |
| 2 | Phase 7b talk handler implementation after Codex accepts the design | This is the next V1 voice-to-page backend seam after guards. | Implement only the accepted design. Preserve response envelopes/log prefixes/counter order, keep supplier glue out unless the design explicitly says otherwise, run `node scripts/pre_flight.mjs`, `node --test backend/tests/talk_*.test.mjs`, and backend `npm test`. |
| 3 | Phase 6.1 long-tail routes after the Phase 7b design is accepted or parked | Long-tail cleanup is useful, but it should not outrank the talk handler decision. | Follow `tasks/_proposals/T-decompose-phase6-1-long-tail-design.md`; keep method guards and behavior unchanged. |
| 4 | Schema docs only when paired with code or requested by Codex | Canonical docs matter, but standalone schema PRs are no longer the critical path. | Do not open new schema-doc-only PRs; if a code PR changes an envelope, update its schema doc in the same PR. |
| 5 | Rebase #212 only if the human clears the auth route decision | Auth extraction is still tier-3 and human-gated. | Keep `do-not-merge` until explicit auth clearance; if cleared, rebase on current main and rerun backend auth tests. |

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
