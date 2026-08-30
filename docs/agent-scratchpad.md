# Agent Scratchpad

Lightweight, non-authoritative notes for Codex and support agent.

Use this file only for short working breadcrumbs that help the other agent
avoid repeating a failed approach or understand near-term intent. Examples:

- "Trying route-local parser extraction for PR #90; if it widens past the
  route file, stop and spec it."
- "Coverage simulator fixtures expose a response-shape gap; expect a spec
  update before iOS starts."

Boundaries:

- Canonical queue state lives in `docs/coordination.json`.
- Live transition events live in `docs/agent-events-*.jsonl`.
- Product/architecture decisions live in `DECISIONS.md`.
- Human-needed questions live in `docs/decisions-queue.md`.
- PR-specific review belongs on the PR.

Scratchpad notes may be deleted once they are stale. Do not use this file to
change policy, approve merges, or bypass the no-direct-push-to-main rule.
