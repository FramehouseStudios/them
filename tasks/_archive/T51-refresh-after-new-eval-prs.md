---
id: T51
title: Refresh Queue After New Eval PRs
owner: codex
branch: codex/T51-refresh-after-new-eval-prs
pillar: infra (coordination refresh)
status: merged
---

# T51 — Refresh Queue After New Eval PRs

Owner: codex
Status: merged (PR #116)
Branch: codex/T51-refresh-after-new-eval-prs
Tier: 1

Done when:
- PRs #110, #111, and #112 are represented in the coordination queue.
- support agent-facing docs say each is `do-not-merge` until rebased after PR #103.
- Coordination prompt scripts and `git diff --check` pass.
