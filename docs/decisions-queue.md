# Decisions Queue

Short, scannable list of items that need the **human's** decision.

This file is the only place the human needs to look to find every
open question from either agent. Neither agent should propose
decisions inside PR bodies, Slack, or chat memory — only here. Once
a decision is made, the agent that asked moves the entry from
**Open** to **Resolved** with the human's answer and the date.

Open entries follow this shape:

```markdown
### D-<short-slug> — <one-line question>
- **Asked by:** claude | codex
- **Asked at:** YYYY-MM-DD
- **Why it matters:** one sentence on what unblocks if you answer.
- **Question:** the single concrete question. No menus longer than 3
  options.
- **Default if no answer:** what the agent will do absent an answer
  (always a safe, conservative default).
```

Rules:

- One question per entry. If you have three questions, file three
  entries.
- If a question grows into an architectural decision, the agent must
  also propose a `D###` row in `DECISIONS.md` and link to it from
  the queue entry. The queue entry resolves when the human accepts
  or rejects the ADR.
- Resolved entries below ~30 days may be pruned.

---

## Open

_None as of 2026-05-10._

---

## Resolved

_(empty)_
