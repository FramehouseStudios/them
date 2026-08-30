# Operating Protocol

This protocol is superseded by [AGENTS.md](../AGENTS.md), [DECISIONS.md](../DECISIONS.md), [docs/live-handoff.md](live-handoff.md), and the current GitHub PR queue.

## Current Rule

io.them now uses one live project workflow:

1. The human is product lead and final authority for product direction, release credentials, App Store/privacy answers, and destructive GitHub actions.
2. Codex is the active implementation owner.
3. New implementation work uses `codex/<task-id>-<short-name>` branches unless the human says otherwise.
4. Old helper-lane task records are historical evidence only; do not merge old assistant-branded branches wholesale.
5. Useful old backend/security/release ideas must be ported into fresh project-owned PRs and reverified.

## What To Read First

1. `AGENTS.md`
2. `TASKS.md`
3. `DECISIONS.md`
4. `docs/live-handoff.md`
5. `docs/codex-inbox.md`
6. `docs/support-inbox.md` for the compact backend backlog table only.

If any file disagrees with `AGENTS.md` or `DECISIONS.md`, treat the disagreement as stale and update the stale file before acting on it.

## Human Clearance Boundary

Do not mutate these without explicit human approval:

- GitHub remote branch deletion, bulk PR closure, tag deletion, or public-history rewrite.
- App Store metadata, privacy answers, signing material, production backend URL, production app token, provider keys, and release credentials.
- Risky auth/privacy/account-deletion/export behavior.

## Preferred End State

Small verified PRs, a clean GitHub front door, and no active process that makes the app wait on a separate assistant lane.
