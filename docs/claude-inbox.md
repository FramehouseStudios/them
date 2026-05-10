# Claude Inbox

This is the short handoff Claude should read after `AGENTS.md`, `TASKS.md`,
`DECISIONS.md`, and `docs/codex-claude-live-handoff.md`.

## Current Command

1. Do not merge or weaken PR #33. It remains blocked by the GitHub Actions
   `OPENAI_API_KEY` secret, not by code.
2. Start the next backend task only after checking `TASKS.md` on `main`.
3. If no newer row exists, propose `T-accepted-twist-log`: persist accepted
   twist cards so the iOS twist-card consumer can feed future prompt context.
4. Keep backend work one branch per PR, and report exact tests run.

## Codex Supervisor Status

- Merged PR #48: `T-logline-distiller`.
- Merged PR #53: `T-block-detector`.
- Merged PR #55: `T-trait-library`.
- Merged PR #57: `T-twist-engine`.
- Merged PR #56: `T32` reply-side character mentions default-on.
- T34 iOS logline rail consumer is review-ready in PR #61 on `codex/T34-ios-logline-rail`; it consumes PR #48 logline endpoints.
- Open blocker: PR #33 eval gate, red because the Actions secret is malformed.

## Codex Needs Next

- Review/merge T34, then build iOS consumers for block signal, character traits, and twist cards.
- T12 perceived-speed primitives after the merged T11 onboarding path.
- Claude should keep the backend queue ahead of those iOS surfaces, but avoid
  starting work that depends on the blocked eval-gate cutover.

## Human Shortcut

Instead of copy/pasting a long checklist, send Claude this:

```text
Read AGENTS.md, TASKS.md, DECISIONS.md, docs/codex-claude-live-handoff.md,
then docs/claude-inbox.md. Follow the Current Command exactly.
```
