# Codex Inbox

This is the short handoff Codex should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/codex-claude-live-handoff.md`, and
`docs/coordination.json`.

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
| [#63](https://github.com/FramehouseStudios/them/pull/63) | T-trust-tiers | 3 | policy-gated | D005 now records the human-approved Codex supervisor authority. Do not merge #63 unless it is reconciled with D005 and has explicit human approval for any remaining trust-policy changes. |
| [#74](https://github.com/FramehouseStudios/them/pull/74) | T-prompt-wire-traits-and-twists | 2 | blocked | Has `do-not-merge`; Claude must rebase/fix and provide integration proof without weakening gates. |
| [#76](https://github.com/FramehouseStudios/them/pull/76) | T-logline-drift-alert | 1 | blocked | Has `do-not-merge`; needs endpoint/status proof before Codex review. |
| [#79](https://github.com/FramehouseStudios/them/pull/79) | T-first-page-telemetry-sink | 2 | blocked | Has `do-not-merge`; needs rebase/task detail and green checks. |
| [#80](https://github.com/FramehouseStudios/them/pull/80) | T-craft-frameworks-eval | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker and keep eval coverage intact. |
| [#81](https://github.com/FramehouseStudios/them/pull/81) | T-block-signal-clears-on-completion | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker and keep behavior tests. |
| [#82](https://github.com/FramehouseStudios/them/pull/82) | T-realtime-supplier-health | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker and keep route tests. |
| [#83](https://github.com/FramehouseStudios/them/pull/83) | T-fountain-export-endpoint | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker and keep endpoint tests. |
| [#84](https://github.com/FramehouseStudios/them/pull/84) | T-realtime-supplier-failover | 2 | blocked | Has `do-not-merge`; needs cross-agent review only after route-level coverage is explicit. |
| [#85](https://github.com/FramehouseStudios/them/pull/85) | T-backend-surface-smoke | 1 | blocked | Has `do-not-merge`; this is the likely next infrastructure unblock after Claude clears its blocker. |
| [#86](https://github.com/FramehouseStudios/them/pull/86) | T-genre-classifier | 1 | blocked | Has `do-not-merge`; Claude should clear the documented blocker before Codex review. |
| [#87](https://github.com/FramehouseStudios/them/pull/87) | T-screenplay-import-fountain | 1 | review | Labeled tier-1; Codex should review the Fountain import contract and decide whether iOS import UI follows. |
| [#88](https://github.com/FramehouseStudios/them/pull/88) | T-coverage-simulator | 1 | review | Labeled tier-1; Codex should review the coverage simulator contract and decide whether iOS coverage cards follow. |
| [#89](https://github.com/FramehouseStudios/them/pull/89) | T-codex-inbox-refresh-2 | 1 | blocked | Has `do-not-merge`; superseded by T42/T43 unless Claude rebases and keeps only non-duplicative improvements. |
| [#90](https://github.com/FramehouseStudios/them/pull/90) | T-fdx-export-endpoint | 1 | review | Labeled tier-1; Codex should review the Final Draft export contract and decide iOS export wiring order. |
| [#91](https://github.com/FramehouseStudios/them/pull/91) | T-archetype-engine | 1 | review | Labeled tier-1; Codex should review the character archetype contract before wiring it into the traits rail. |
| [#92](https://github.com/FramehouseStudios/them/pull/92) | T-payoff-tracker | 1 | review | Labeled tier-1; Codex should review payoff tracking before adding craft warning cards. |

## Endpoint Contracts Ready to Consume

Potential new contracts are in review, not yet consumed: PR #87 (`POST /screenplay/import/fountain`), PR #88 (`POST /craft/coverage/simulate`), PR #90 (`POST /screenplay/export/fdx`), PR #91 (`GET /memory/character-archetypes`), and PR #92 (`POST /craft/payoff/track`). Do not start iOS consumers until those PRs are reviewed and merged.

## Coordination Infrastructure Now Live for Codex

With PR #60, PR #64, PR #65, PR #66, PR #67, PR #72, and D005 live, the coordination loop is now repo-native:

1. **Trust tiers** (PR #63 / `AGENTS.md`) — every Codex PR gets a tier label:
   - **Tier 1** (default, merge-eligible after explicit trusted approval): routine iOS feature work consuming a merged Claude contract, doc fixes, conflict refreshes, status flips.
   - **Tier 2**: edits to `AGENTS.md` / `DECISIONS.md` / `KNOWN_DOMAINS` / CI workflows / response-shape changes Claude consumes.
   - **Tier 3**: anything human-owned (auth, secrets, deploys, entitlements, gate weakening, new `DECISIONS.md` row).
2. **Auto-merge workflow** (merged PR #64, hardened by PR #72) — merges Tier 1 PRs only after green checks, `tier-1`, no blocker label, and explicit trusted approval. There is no quiet-time fallback.
3. **Coordination state** (merged PR #65 / `docs/coordination.json` + `scripts/coordination_state.mjs`) — fast read of open PRs / blockers / decisions. Run `export COORD_AGENT=codex`. Update on PR open/close: `node scripts/coordination_state.mjs add-pr --number=N --title=T --owner=codex --tier=1 --branch=B`.
4. **Decisions queue** (merged PR #66 / `docs/decisions-queue.md`) — the only place to post "needs human" questions. One concrete question per entry, with a safe default the agent will follow absent the human's answer.
5. **Per-row task files** (merged PR #67 / `tasks/_active/`) — optional. New tasks can drop `tasks/_active/T-<slug>.md` instead of editing `TASKS.md` directly. Removes the recurring "two agents touch the same line of TASKS.md" merge-conflict class. `node scripts/build_tasks_md.mjs` renders the rebuilt section.

## Blockers Affecting Codex

- D005 now authorizes Codex supervisor self-merges under the recorded guardrails.
- PR #33 is blocked by the repository Actions `OPENAI_API_KEY` secret, which is human-owned.
- Claude PR #63 is policy-gated and likely superseded by D005 unless remaining policy changes are explicitly approved.

## Decisions Claude Needs from Codex

- PR #63 (`T-trust-tiers`) still requires explicit human acceptance before merge if it changes standing trust/pre-approval policy beyond D005.

## Human Shortcut

Instead of copy/pasting a long handoff, send Codex this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
docs/coordination.json, then docs/codex-inbox.md. Pick the next Codex action
from the open Claude PRs section and the coordination queue.
```

To print the same compact handoff prompt from the repo:

```bash
node scripts/print_codex_prompt.mjs
```
