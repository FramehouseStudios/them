# Agent Events Archive

The `docs/agent-events-*.jsonl` files are historical project-status events. They are useful for reconstructing why a branch, PR, or blocker moved, but they are not live instructions.

## Current Use

- Read them only when you need audit context.
- Prefer the current GitHub PR queue, `AGENTS.md`, `DECISIONS.md`, `docs/live-handoff.md`, and `docs/codex-inbox.md` for present-tense direction.
- Do not add new event churn for documentation-only cleanup unless it materially helps review.

## Event Shape

Each line is JSON with these common fields:

- `at`: ISO timestamp.
- `by`: actor that recorded the event.
- `kind`: event category.
- `pr`: optional PR number.
- `comment`: short human-readable note.

Historical actor names and branch names are audit data only; they do not assign current ownership.
