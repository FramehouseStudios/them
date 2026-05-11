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

| PR | Task | Tier | Status | Codex action |
| --- | --- | --- | --- | --- |
| [#33](https://github.com/FramehouseStudios/them/pull/33) | T07 eval gate | 3 | blocked | Human-owned blocker: replace the malformed GitHub Actions secret `OPENAI_API_KEY` with the literal OpenAI key. Do not weaken the gate. |
| [#63](https://github.com/FramehouseStudios/them/pull/63) | T-trust-tiers | 2 | conflicting | Review after rebase; merge only with explicit human approval of standing trust/pre-approval policy changes. |
| [#67](https://github.com/FramehouseStudios/them/pull/67) | T-tasks-per-row | 1 | conflicting | Review after rebase; merge only if the generator keeps `TASKS.md` faithful. |

## Endpoint Contracts Ready to Consume

No unconsumed Claude endpoint contracts are waiting on Codex right now. PR #59 (`T-accepted-twist-log`) is merged, and Codex PR #71 wires its accepted-twist Keep/Dismiss/Reload calls on iOS.

## Coordination Infrastructure Now Live for Codex

With PR #60, PR #64, PR #65, and PR #66 live, the remaining coordination upgrades change the day-to-day loop as they merge:

1. **Trust tiers** (PR #63 / `AGENTS.md`) — every Codex PR gets a tier label:
   - **Tier 1** (default, auto-mergeable): routine iOS feature work consuming a merged Claude contract, doc fixes, conflict refreshes, status flips.
   - **Tier 2**: edits to `AGENTS.md` / `DECISIONS.md` / `KNOWN_DOMAINS` / CI workflows / response-shape changes Claude consumes.
   - **Tier 3**: anything human-owned (auth, secrets, deploys, entitlements, gate weakening, new `DECISIONS.md` row).
2. **Auto-merge workflow** (merged PR #64) — squash-merges Tier 1 PRs once: suite is green, `tier-1` label present, no blocking label, and either a formal review approval, a trusted repo-author supervisor approval comment, or 4h quiet. Apply `blocker` in a comment or `tier-2`/`tier-3`/`needs-human` to stop it.
3. **Coordination state** (merged PR #65 / `docs/coordination.json` + `scripts/coordination_state.mjs`) — fast read of open PRs / blockers / decisions. Run `export COORD_AGENT=codex`. Update on PR open/close: `node scripts/coordination_state.mjs add-pr --number=N --title=T --owner=codex --tier=1 --branch=B`.
4. **Decisions queue** (merged PR #66 / `docs/decisions-queue.md`) — the only place to post "needs human" questions. One concrete question per entry, with a safe default the agent will follow absent the human's answer.
5. **Per-row task files** (PR #67 / `tasks/_active/`) — optional. New tasks can drop `tasks/_active/T-<slug>.md` instead of editing `TASKS.md` directly. Removes the recurring "two agents touch the same line of TASKS.md" merge-conflict class. `node scripts/build_tasks_md.mjs` renders the rebuilt section.

## Blockers Affecting Codex

- Codex PR #71 is mergeable and verified, but needs external review/merge because Codex must not merge its own PR.
- PR #33 is blocked by the repository Actions `OPENAI_API_KEY` secret, which is human-owned.
- Claude PRs #63 and #67 are conflict-blocked until rebased.

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
