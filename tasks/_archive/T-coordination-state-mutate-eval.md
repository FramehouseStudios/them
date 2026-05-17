---
id: T-coordination-state-mutate-eval
title: Round-trip eval over coordination_state.mjs mutate subcommands
owner: claude
status: merged
branch: claude/T-coordination-state-mutate-eval
pillar: infra (coordination)
---

## Scope

PR #117 ships a standalone schema check and PR #144 adds a
`validate` subcommand. Both validate the *current* file. Neither
catches the case where a future change to one of the *mutating*
subcommands silently produces a file that the validator rejects.

This PR adds `scripts/coordination_state_mutate_eval.mjs` which:

1. Builds a temp dir mirroring the script's expected layout
   (`scripts/coordination_state.mjs` + `docs/coordination.json`).
2. Seeds a minimal valid state.
3. Runs each mutating subcommand in turn:
   - `add-pr` → validate
   - `set-pr` → validate
   - `close-pr` → validate
   - `add-blocker` → validate
   - `clear-blocker` → validate
   - `add-decision` → validate
   - `clear-decision` → validate
4. Asserts every intermediate state passes `validate`.
5. Asserts the final state matches the seed shape (back to empty
   arrays) with a fresh `updatedAt`.

Smoke test execs the eval and asserts exit 0.

## Done when

`node scripts/coordination_state_mutate_eval.mjs` exits 0 against
the current CLI; smoke test green.
