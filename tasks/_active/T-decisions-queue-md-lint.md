---
id: T-decisions-queue-md-lint
title: Lint docs/decisions-queue.md format
owner: claude
status: review
branch: claude/T-decisions-queue-md-lint
pillar: infra (coordination)
---

## Scope

`docs/decisions-queue.md` declares its own format in the preamble.
PR #104 added a parser that reads the file programmatically. The
format and the parser have to stay in lockstep — a typo or missing
field in the markdown silently corrupts the read endpoint and any
downstream consumer.

This PR adds `scripts/decisions_queue_lint.mjs`, which validates:

1. The file parses (has `## Open` and `## Resolved` headers).
2. Every entry under `## Open` is `### D-<slug> — <question>`.
3. Each open entry has `Asked by` and `Asked at` (ISO YYYY-MM-DD).
4. Each open entry has at least one of `Question` / `Why it matters`
   / `Default if no answer`.
5. Slug IDs are unique across both sections.

Default mode prints findings and exits 0 (warn-only — safe to wire
into observability today). `--strict` exits non-zero so the future
CI flip is a one-line change.

Smoke test (`decisions_queue_lint.test.mjs`) runs the real script
against the real repo state and verifies the `--strict` exit-code
contract against a tampered temp fixture.

## Done when

`node scripts/decisions_queue_lint.mjs` runs cleanly against the
current main; `node --test scripts/decisions_queue_lint.test.mjs`
green.
