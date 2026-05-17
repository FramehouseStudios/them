---
id: T-decisions-queue-fixture-template
title: docs/decisions-queue-template.md (copy-paste entry template)
owner: claude
status: merged
branch: claude/T-decisions-queue-fixture-template
pillar: infra (coordination)
---

## Scope

`docs/decisions-queue.md` declares its own format inline, but the
format is easy to get subtly wrong (non-ISO date, multi-question
entry, missing default). PR #104 parses the file programmatically;
PR #127 lints it. This PR adds a copy-paste-friendly template at
`docs/decisions-queue-template.md` so both agents (and the human)
have one place to grab a known-good entry skeleton.

Includes:

- The canonical markdown template (the same one PR #104's parser
  expects).
- Required vs optional field rules.
- A concrete worked example.
- Anti-examples (multi-question, non-ISO date, slug with whitespace)
  that the lint script will reject.

No code change. Pure docs. Lives next to `docs/decisions-queue.md`
so the cross-reference is one filesystem hop away.

## Done when

`docs/decisions-queue-template.md` exists and matches the format
PR #104's parser + PR #127's lint accept.
