# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, `docs/codex-claude-live-handoff.md`, and
`docs/coordination.json`.

## Current Command

1. Do not merge or weaken PR #33. It remains blocked by the GitHub Actions
   `OPENAI_API_KEY` secret, not by code.
2. Treat `docs/coordination.json` as the live queue. After every Claude PR
   update, refresh that file and leave a concise PR comment for Codex.
3. Do not merge PR #63 unless the human explicitly accepts any standing
   trust/pre-approval policy changes beyond D005; if edited, keep it aligned
   with the no-quiet-time auto-merge rule from PR #72.
4. Clear `do-not-merge` blockers on existing PRs before opening more backend
   feature branches. Start with the oldest blocked PR that you can make green.
5. Treat full-memory export/import/delete surfaces as human-gated privacy work,
   not routine tier-1 work.
6. Keep backend work one branch per PR, and report exact tests run.

## Codex Supervisor Status

- Merged PR #48: `T-logline-distiller`.
- Merged PR #53: `T-block-detector`.
- Merged PR #55: `T-trait-library`.
- Merged PR #57: `T-twist-engine`.
- Merged PR #59: `T-accepted-twist-log`; verification passed syntax checks, focused accepted-twist backend tests 17/17, and full backend `npm test` 296 pass / 1 skipped.
- Merged PR #60: `T-codex-inbox` was conflict-resolved by Codex supervisor; it adds `docs/codex-inbox.md` and `scripts/print_codex_prompt.mjs` for Claude→Codex handoffs.
- Merged PR #65: `T-coordination-state` was conflict-resolved by Codex supervisor; it adds `docs/coordination.json` and `scripts/coordination_state.mjs` for a machine-readable queue.
- Merged PR #64: `T-auto-merge-tier1` was conflict-resolved and hardened by Codex supervisor; the workflow now counts supervisor approval comments only from OWNER/MEMBER/COLLABORATOR authors.
- Merged PR #66: `T-decisions-queue` was conflict-resolved by Codex supervisor; it adds `docs/decisions-queue.md` and the AGENTS pointer for human-needed questions.
- Merged PR #72: `T-strict-auto-merge` removes the four-hour quiet-time fallback; Tier 1 auto-merge now requires explicit trusted approval.
- Merged PR #67: `T-tasks-per-row` adds `tasks/_active/` per-row task files and `scripts/build_tasks_md.mjs`; Codex supervisor rebased it over current main and removed stale 4h-quiet wording from the seeded T-trust-tiers file.
- Accepted D005: Codex has supervisor self-merge authority under guardrails. Do not tell the human to manually merge routine Codex PRs if checks are green and no blocker labels are present.
- Merged PR #56: `T32` reply-side character mentions default-on.
- Merged PR #61: `T34` iOS logline rail consumer; it consumes PR #48 logline endpoints.
- Merged PR #62: `T35` iOS block-signal nudge surface consumes PR #53 `GET /memory/block-signal`.
- Merged PR #68: `T36` iOS character-traits side-rail consumer consumes PR #55 `GET /memory/character-traits`.
- Merged PR #69: `T37` iOS twist-card consumer consumes PR #57 `POST /craft/twist/suggest`; verification passed package tests, focused Xcode tests, full macOS tests, generic iOS build, and diff check.
- Merged PR #70: `T12` perceived-speed primitives; verification passed focused perceived-speed tests 2/2, full macOS `themTests` 73/73, generic iOS build, and diff check.
- Merged PR #71: `T38-accepted-twist-ios` wires iOS Keep/Dismiss/Reload calls for the merged PR #59 accepted-twist endpoints; verification passed package tests, focused accepted-twist Xcode tests 2/2, full macOS `themTests` 75/75, generic iOS build, diff check, and GitHub evaluate.
- Merged PR #73: `T39-symbol-warning` fixes the Studio SF Symbol warning.
- Merged PR #75: `T40-userdefaults-suite-warning` fixes the app UserDefaults suite warning.
- Merged PR #78: `T41-defer-studio-debug-publish` defers Studio debug lifecycle publishing until after SwiftUI mutations settle.
- Merged PR #93: `T42-supervisor-merge-protocol` records D005 and makes the Codex/Claude handoff lane coordination-first.
- Merged PR #95: `T43-refresh-claude-queue` refreshes the queue after Claude opened PRs #91 and #92 during the T42 landing window.
- In-progress PR-to-open: `codex/T44-creative-memory-export-triage` records PR #94 as a human-gated privacy/data-control item.
- Open blocker: PR #33 eval gate, red because the Actions secret is malformed.

## Codex Needs Next

- Use `node scripts/coordination_state.mjs read` before choosing work.
- Clear blockers on PRs already open before starting net-new backend feature work.
- Keep the backend queue ahead of iOS surfaces, but avoid work that depends on the blocked eval-gate cutover.

## Human Shortcut

Instead of copy/pasting a long checklist, send Claude this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
docs/coordination.json, then docs/claude-inbox.md. Follow the Current Command
exactly.
```

## Reciprocal Channel (Claude → Codex)

Claude maintains `docs/codex-inbox.md` as the symmetric reverse of this
file. After every Claude task or PR, Claude updates that inbox with the
PR number, branch, endpoint contracts ready to consume, blockers, and
the next recommended Codex action — so the human no longer has to copy/
paste a Claude→Codex handoff. The Codex-side prompt printer is
`scripts/print_codex_prompt.mjs`.
