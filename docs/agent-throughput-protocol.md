# Agent Throughput Protocol

This is the low-friction operating rhythm for Codex, Claude, and the
human. It exists to increase shipping speed, not to create ceremony.

## Defaults

1. **WIP limit:** Claude may keep at most three non-merged PRs active in
   normal mode: one blocker fix, one small support/eval/doc PR, and one
   backend feature. When at least 80% of Claude's active PRs are blocker
   clears, the temporary clearing-mode cap is six because those fixes are
   independent and parallelizable. If the open Claude queue is above the
   current cap, Claude clears blockers before opening net-new work.
2. **Blocker-first:** `do-not-merge`, `needs-human`, tier-3, and conflicting
   PRs outrank new feature work.
3. **Live event lane:** Every state transition gets an append-only event in
   `docs/agent-events-*.jsonl` through `node scripts/agent_event.mjs append`.
   `docs/coordination.json` remains canonical state; the event lane is the
   live tape of intent between refreshes.
4. **Pre-flight before PR:** Claude runs `node scripts/pre_flight.mjs` before
   opening backend/script PRs. Warnings are treated as future Codex comments.
5. **Merge train:** Codex batches routine tier-1 review/merge work, then
   opens one coordination refresh after the batch. Do not refresh the handoff
   lane after every tiny merge unless it unblocks app work.
6. **No quiet merging:** Tier-1 PRs still need green checks, no blocker labels,
   and explicit trusted review/approval per D005 and the strict auto-merge
   workflow.
7. **Ready-for-iOS tags:** Backend PRs that create app-facing contracts should
   be labeled or documented as one of:
   - `ready-for-ios`: merged contract is safe for Codex to consume.
   - `blocked-for-ios`: backend exists but should not be consumed yet.
   - `backend-only`: no app surface expected.
   - `needs-human-policy`: product/privacy/security approval needed.
8. **Spec-first for multi-PR features:** Any feature expected to span more
   than three PRs starts with a spec PR. The spec locks contracts, file
   ownership, acceptance evals, PR sequence, and which backend/iOS tracks may
   start in parallel. Once Codex approves the spec, implementation PRs that
   stay inside it are fast-lane eligible.
9. **V1 effect required:** Every PR names its V1 pillar and concrete V1
   effect. If the effect is "none", the PR should not open without explicit
   Codex assignment.
10. **Coordination ownership:** Codex owns `docs/coordination.json` and
    `docs/claude-inbox.md`. Claude owns backend implementation updates and
    emits live events. Claude should not open coordination-refresh PRs unless
    Codex explicitly assigns one.

## Daily Loop

Codex:

```bash
node scripts/agent_next.mjs --role=codex
node scripts/coordination_state.mjs read
node scripts/agent_event.mjs tail --n=20
```

Claude:

```bash
node scripts/agent_next.mjs --role=claude
node scripts/coordination_state.mjs read
node scripts/agent_event.mjs tail --n=20
```

The human can ask either agent to “read the repo queue” instead of
copying a long handoff. The current source of truth is
`docs/coordination.json`; inbox files are summaries.

## Product-State Layer

The task loop is fast only when the product target is explicit. The current
target is `docs/v1-definition.md`. Before choosing net-new work, agents ask:

1. Does this close a V1 checklist item?
2. Does this unblock a named V1 checklist item?
3. Is this required infrastructure for a named V1 checklist item?

If the answer to all three is no, the work waits.

Every PR description should include:

```text
V1 pillar: talk | screenplay | memory | realtime | ios | infra
V1 effect: closes <checklist item> | unblocks <item> | infrastructure for <item>
```

Agents may append one `product_state` event per day:

```bash
node scripts/agent_event.mjs append --by=<agent> --kind=product_state --comment="ships: ...; blocker: ...; ask_<other>: ..."
```

This is the async substitute for the human copying long state reports between
agents.

## Cross-Agent Design Window

Before a high-risk PR opens, the proposing agent creates a short design note
under `tasks/_proposals/` and emits an event-lane note. High-risk means talk
pipeline, auth, privacy/data-control, persistence migrations, new response
schemas consumed by iOS, or any feature expected to span more than three PRs.

The other agent has one normal polling window to object or ask for a narrower
contract. If there is no objection, implementation may start. Tiny spec
amendments can be recorded as a PR comment; broad contract changes still need
a spec/doc PR.

## Backend Decomposition Fast Lane

The backend-index decomposition pattern is now proven for Phases 0-3. Future
mechanical phases are fast-lane eligible when they preserve mount order,
preserve response shapes, keep route-local parsers, include required-deps
guards, and add bare-Express integration tests.

Talk pipeline decomposition is excluded from the mechanical fast lane until a
design note is reviewed because it is the core V1 path.

## Adoption Matrix

Claude's second-pass efficiency proposal is accepted with these decisions:

| # | Proposal | Decision |
|---|---|---|
| 1 | Live event lane | **Adopted.** Shipped as `docs/agent-events-*.jsonl` + `scripts/agent_event.mjs`; `agent_next` now surfaces recent events. |
| 2 | Pre-flight self-check | **Adopted.** Shipped as `scripts/pre_flight.mjs`; expanded to cover determinism and schema-version envelope warnings. |
| 3 | Spec-first protocol | **Adopted.** Required for features spanning more than three PRs. |
| 4 | Two-lane review queue | **Adopted with guardrails.** Fast lane is for tiny, green, unblocked tier-1 PRs; heavy lane remains for schema, privacy, security, cross-agent, or product-risk work. |
| 5 | Structured blocker metadata | **Adopted compatibly.** `coordination.json` may carry optional `blocker_kind`, `blocker_against_pr`, `reviewer_note`, and `expected_action` while keeping legacy `blocker` text. |
| 6 | Raise WIP cap for blocker clearing | **Adopted.** `agent_next` reports cap 6 in clearing mode, cap 3 otherwise. |
| 7 | Parallel iOS/backend tracks | **Adopted via spec-first.** Codex may start iOS against an approved spec before backend PRs merge. |
| 8 | Aggressive auto-merge-tier1 use | **Adopted.** Codex should label eligible tier-1 PRs and rely on the workflow when conditions match. |
| 9 | Predictable merge-train cadence | **Modified.** Default target cadence is morning and late-afternoon Pacific when Codex is active; urgent green unblocks may merge immediately. |
| 10 | Shared scratchpad | **Modified.** Use `agent_event note` for live intent and `docs/agent-scratchpad.md` for non-authoritative working notes. No direct push to `main`. |

## Merge Train Rule

Codex should batch clean tier-1 PRs when all fast-lane conditions are true:

- The PR has green checks.
- No `do-not-merge`, `needs-human`, or tier-3 label is present.
- The diff is additive or routine for the declared tier.
- The diff is under roughly 200 lines, or is a generated/docs-only update
  with no runtime behavior risk.
- No schema, privacy, security, billing, auth, entitlement, or human-only
  surface changes are present.
- Verification is reported in the PR body or repeated by Codex when risk
  warrants it.
- Claude posted the standard rebase/verification comment if the PR was
  previously blocked.

After the train, Codex opens one coordination refresh if at least three PR
states changed or if the batch unblocked app work.

Heavy-lane PRs are anything else: tier-2/tier-3, schema changes, new app-facing
contracts without a spec, auth/privacy/security surfaces, product decisions,
or repeated review failures.

## Spec-First Parallel Tracks

A spec PR for a multi-PR feature must include:

- Route/store/client contracts and response envelopes.
- File ownership and write boundaries for Claude and Codex.
- Acceptance evals and focused tests.
- PR sequence, including which PRs may start in parallel.
- iOS preview/fixture plan when the app can build against the contract early.

After Codex approves the spec, Claude may open backend implementation PRs and
Codex may start the iOS implementation in parallel. If the spec changes, both
agents stop and update the spec before widening the implementation.

## Structured Blockers

Keep the human-readable `blocker` field for compatibility, but add structured
fields when possible:

```json
{
  "blocker": "do-not-merge: rebase after PR #160 and rerun npm test",
  "blocker_kind": "needs_rebase",
  "blocker_against_pr": 160,
  "reviewer_note": "conflict only; keep behavior unchanged",
  "expected_action": "rebase on current main and rerun focused eval/backend tests"
}
```

Allowed `blocker_kind` values:

- `needs_rebase`
- `needs_test_fix`
- `needs_scope_narrowing`
- `policy_gated`
- `needs_human`

## Blocker Comment Standard

Every blocker comment must include:

- The exact failing behavior.
- The file, route, script, or test surface involved.
- The exact tests to run before requesting review again.
- The exact condition for removing the blocker label.

## Queue-Cutting Rule

When open PR count is slowing work, stale handoff-only PRs and superseded
support branches should be closed. The target is fewer than 15 open PRs,
with app-facing contracts and urgent blockers at the top.

## Scratchpad Boundary

`docs/agent-scratchpad.md` is for lightweight intent notes and failed-approach
breadcrumbs. It is not canonical state, not a decision record, and not a
replacement for PR comments. Use `docs/coordination.json` for truth,
`docs/agent-events-*.jsonl` for live transitions, and `DECISIONS.md` /
`docs/decisions-queue.md` for product or architecture decisions.
