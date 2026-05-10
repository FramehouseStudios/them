# Codex Inbox

This is the short handoff Codex should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, and `docs/codex-claude-live-handoff.md`.

Claude maintains this file. It is the symmetric reverse of
`docs/claude-inbox.md` and removes the need for the human to copy/paste
Claude→Codex handoffs after each Claude PR.

Claude updates this file at the end of every Claude task or PR. Each
update should fit the standing PR template: task id, branch, PR URL,
exact endpoints/files changed, exact tests run, what Codex should
consume next, and any blockers.

## Current Open Claude PRs

| PR | Task | Branch | Status | Codex action |
| --- | --- | --- | --- | --- |
| [#63](https://github.com/FramehouseStudios/them/pull/63) | T-trust-tiers | `claude/T-trust-tiers` | conflicting | Review after rebase; merge only with explicit human approval of standing trust/pre-approval policy changes. |
| [#64](https://github.com/FramehouseStudios/them/pull/64) | T-auto-merge-tier1 | `claude/T-auto-merge-tier1` | conflicting + failing check | Review only after rebase and the `auto-merge-tier1 / evaluate` check is green without weakening gates. |
| [#65](https://github.com/FramehouseStudios/them/pull/65) | T-coordination-state | `claude/T-coordination-state` | conflicting | Review after rebase so automation state has one structured source. |
| [#66](https://github.com/FramehouseStudios/them/pull/66) | T-decisions-queue | `claude/T-decisions-queue` | conflicting | Review after rebase so human-needed product calls stop getting buried. |
| [#67](https://github.com/FramehouseStudios/them/pull/67) | T-tasks-per-row | `claude/T-tasks-per-row` | conflicting | Review after rebase; merge only if the generator keeps `TASKS.md` faithful. |
| [#33](https://github.com/FramehouseStudios/them/pull/33) | T07 eval gate | `claude/T07-eval-gate-postgres` | blocked | Human-owned: replace the malformed GitHub Actions secret `OPENAI_API_KEY` with the literal OpenAI key. Do not weaken the gate. |

## Endpoint Contracts Ready to Consume

No unconsumed Claude endpoint contracts are waiting on Codex right now. PR #59 (`T-accepted-twist-log`) is merged, and Codex PR #71 wires its accepted-twist Keep/Dismiss/Reload calls on iOS.

## Blockers Affecting Codex

- Codex PR #71 is mergeable and verified, but needs external review/merge because Codex must not merge its own PR.
- PR #33 is blocked by the repository Actions `OPENAI_API_KEY` secret, which is human-owned.
- Claude PRs #63, #64, #65, #66, and #67 are conflict-blocked until rebased.
- PR #64 also has a failing `auto-merge-tier1 / evaluate` check and must be fixed without weakening gates.

## Decisions Claude Needs from Codex

- PR #63 (`T-trust-tiers`) requires explicit human acceptance before merge because it changes standing trust/pre-approval policy.

## Human Shortcut

Instead of copy/pasting a long handoff, send Codex this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
then docs/codex-inbox.md. Pick the next Codex action from the open
Claude PRs section.
```

To print the same compact handoff prompt from the repo:

```bash
node scripts/print_codex_prompt.mjs
```
