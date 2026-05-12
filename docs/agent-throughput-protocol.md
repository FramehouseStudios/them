# Agent Throughput Protocol

This is the low-friction operating rhythm for Codex, Claude, and the
human. It exists to increase shipping speed, not to create ceremony.

## Defaults

1. **WIP limit:** Claude may keep at most three non-merged PRs active:
   one blocker fix, one small support/eval/doc PR, and one backend feature.
   If the open Claude queue is above that, Claude clears blockers before
   opening net-new work.
2. **Blocker-first:** `do-not-merge`, `needs-human`, tier-3, and conflicting
   PRs outrank new feature work.
3. **Merge train:** Codex batches routine tier-1 review/merge work, then
   opens one coordination refresh after the batch. Do not refresh the handoff
   lane after every tiny merge unless it unblocks app work.
4. **No quiet merging:** Tier-1 PRs still need green checks, no blocker labels,
   and explicit trusted review/approval per D005 and the strict auto-merge
   workflow.
5. **Ready-for-iOS tags:** Backend PRs that create app-facing contracts should
   be labeled or documented as one of:
   - `ready-for-ios`: merged contract is safe for Codex to consume.
   - `blocked-for-ios`: backend exists but should not be consumed yet.
   - `backend-only`: no app surface expected.
   - `needs-human-policy`: product/privacy/security approval needed.

## Daily Loop

Codex:

```bash
node scripts/agent_next.mjs --role=codex
node scripts/coordination_state.mjs read
```

Claude:

```bash
node scripts/agent_next.mjs --role=claude
node scripts/coordination_state.mjs read
```

The human can ask either agent to “read the repo queue” instead of
copying a long handoff. The current source of truth is
`docs/coordination.json`; inbox files are summaries.

## Merge Train Rule

Codex should batch clean tier-1 PRs when all are true:

- The PR has green checks.
- No `do-not-merge`, `needs-human`, or tier-3 label is present.
- The diff is additive or routine for the declared tier.
- Verification is reported in the PR body or repeated by Codex when risk
  warrants it.

After the train, Codex opens one coordination refresh if at least three PR
states changed or if the batch unblocked app work.

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
