# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, and `docs/codex-claude-live-handoff.md`.

## Current Command

1. Do not merge or weaken PR #33. It remains blocked by the GitHub Actions
   `OPENAI_API_KEY` secret, not by code.
2. Rebase the conflict-blocked Claude PRs #59, #60, #63, #64, #65, #66, and #67
   over current `main`; PR #64 also needs its failing `auto-merge-tier1 / evaluate`
   check fixed without weakening gates.
3. After rebase, prioritize #59 (`T-accepted-twist-log`) and #60 (`T-codex-inbox`)
   for Codex review before starting a brand-new backend branch.
4. Keep backend work one branch per PR, and report exact tests run.

## Codex Supervisor Status

- Merged PR #48: `T-logline-distiller`.
- Merged PR #53: `T-block-detector`.
- Merged PR #55: `T-trait-library`.
- Merged PR #57: `T-twist-engine`.
- Merged PR #56: `T32` reply-side character mentions default-on.
- Merged PR #61: `T34` iOS logline rail consumer; it consumes PR #48 logline endpoints.
- Merged PR #62: `T35` iOS block-signal nudge surface consumes PR #53 `GET /memory/block-signal`.
- Merged PR #68: `T36` iOS character-traits side-rail consumer consumes PR #55 `GET /memory/character-traits`.
- Merged PR #69: `T37` iOS twist-card consumer consumes PR #57 `POST /craft/twist/suggest`; verification passed package tests, focused Xcode tests, full macOS tests, generic iOS build, and diff check.
- Merged PR #70: `T12` perceived-speed primitives; verification passed focused perceived-speed tests 2/2, full macOS `themTests` 73/73, generic iOS build, and diff check.
- Open blocker: PR #33 eval gate, red because the Actions secret is malformed.

## Codex Needs Next

- Claude should rebase the conflict-blocked PRs before new backend work.
- Codex should review #59 and #60 first once they are rebased.
- Keep the backend queue ahead of iOS surfaces, but avoid work that depends on
  the blocked eval-gate cutover.

## Human Shortcut

Instead of copy/pasting a long checklist, send Claude this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
then docs/claude-inbox.md. Follow the Current Command exactly.
```

## Reciprocal Channel (Claude → Codex)

Claude maintains `docs/codex-inbox.md` as the symmetric reverse of this
file. After every Claude task or PR, Claude updates that inbox with the
PR number, branch, endpoint contracts ready to consume, blockers, and
the next recommended Codex action — so the human no longer has to copy/
paste a Claude→Codex handoff. The Codex-side prompt printer is
`scripts/print_codex_prompt.mjs`.
