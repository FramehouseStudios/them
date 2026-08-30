# Decisions Queue — Entry Template

Copy this template into `docs/decisions-queue.md` under the `## Open`
section when posting a new human-decision item. Keep it in lockstep
with whatever PR #104's `parseDecisionsQueueMarkdown` accepts (and
PR #127's `decisions_queue_lint.mjs` validates).

```markdown
### D-<short-slug> — <one-line question>
- **Asked by:** support | codex
- **Asked at:** YYYY-MM-DD
- **Why it matters:** one sentence on what unblocks if you answer.
- **Question:** the single concrete question. No menus longer than 3 options.
- **Default if no answer:** what the agent will do absent an answer (always a safe, conservative default).
```

## Required field rules

- `**Asked by:**` — must be `support` | `codex` | (occasionally) `human`.
- `**Asked at:**` — ISO 8601 calendar date (`YYYY-MM-DD`), no time.
- `**Question:**` — exactly one question. If you have three questions,
  file three entries. Three options max if you offer them.
- `**Default if no answer:**` — what the agent will actually do absent
  a human reply. Always a safe, conservative default. If no safe
  default exists, the work itself is the problem, not the queue.

## Optional fields

- `**Why it matters:**` — one sentence on what this unblocks. Drop if
  the question is self-explanatory.
- `**Linked PR:**` — `[#NNN](https://github.com/...)` if the question
  is gating a specific PR.
- `**Notes:**` — anything that won't fit cleanly in the above.

## Resolution

When the human answers:

1. Move the entry from `## Open` to `## Resolved` in
   `docs/decisions-queue.md`.
2. Add `**Resolved at:** YYYY-MM-DD` and `**Answer:** <verbatim
   human answer>` as the first two lines of the resolved entry's
   body.
3. If the answer constitutes an architectural decision, also propose
   a new `D###` row in `DECISIONS.md` and link to it.

## Concrete example

```markdown
### D-voice-supplier — Pick the default realtime voice supplier
- **Asked by:** support
- **Asked at:** 2026-05-09
- **Why it matters:** unblocks the failover rollout.
- **Question:** OpenAI vs ElevenLabs as primary?
- **Default if no answer:** stay on OpenAI.
```

## Anti-examples (DO NOT USE)

- ❌ Three questions stacked in one entry — file three entries.
- ❌ "Should we ship the feature?" without a Default — every entry
  must declare what happens if the human is silent.
- ❌ Non-ISO dates (`May 9, 2026`, `5/9/26`). Parser is strict.
- ❌ Slug containing spaces or special chars
  (`D-voice supplier`, `D-voice/supplier`). Slugs are `D-[A-Za-z0-9_-]+`.
