---
id: T-coordination-state-eval
title: Schema check on docs/coordination.json
owner: support
status: merged
branch: support/T-coordination-state-eval
pillar: infra (coordination)
---

## Scope

`docs/coordination.json` is read by the CLI helper, the inbox files,
and downstream automation. A typo or shape regression silently
corrupts every reader. This PR adds `scripts/coordination_state_schema_check.mjs`
which:

- Confirms the file parses.
- Asserts the top-level shape (`schemaVersion`, `updatedAt` ISO-8601,
  `updatedBy`, `openPullRequests`, `blockers`, `decisionsPending`,
  `endpointsAwaitingIosConsumer`).
- For each open PR, validates required fields and the `owner ∈
  {support, codex, human}` + `tier ∈ {1, 2, 3}` enums.
- For each blocker, validates `id`, `owner`, `summary`.

A smoke test (`coordination_state_schema_check.test.mjs`) execs the
script and asserts exit 0 against the current repo state, so a future
parser refactor can't silently break the gate.

## Done when

`node scripts/coordination_state_schema_check.mjs` exits 0 against
`main`; `node --test scripts/coordination_state_schema_check.test.mjs`
green.
