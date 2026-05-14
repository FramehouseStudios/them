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

### D-creative-memory-export-approval — Approve full memory export?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Why it matters:** This decides whether Claude PR #94 can expose a full
  creative-memory export route for V1 data controls.
- **Question:** May Claude merge PR #94 to expose full creative-memory export,
  assuming the route remains authenticated and documented as
  privacy/data-control work?
- **Default if no answer:** Do not merge PR #94.

### D-creative-memory-delete-scope — What should memory delete remove?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Why it matters:** This decides whether Claude PR #99 can ship a memory
  deletion route and what data it is allowed to erase.
- **Question:** For PR #99, should V1 allow `DELETE /memory/forget` to delete
  only `creative_memory`, or should it also delete project-scoped screenplay
  artifacts and derived memories?
- **Default if no answer:** Do not merge PR #99.

### D-auth-route-extraction-clearance — Clear auth extraction after rebase?
- **Asked by:** codex
- **Asked at:** 2026-05-14
- **Why it matters:** This decides whether PR #212 can leave the tier-3 hold
  once Claude rebases and tests are green.
- **Question:** After Claude rebases PR #212 and tests are green, may Codex
  clear the tier-3 auth gate and merge the byte-identical `/auth` route
  extraction under D005?
- **Default if no answer:** Keep PR #212 labeled `do-not-merge`.

---

## Resolved

_(empty)_
