---
id: T-operating-protocol-narrative
title: docs/operating-protocol.md — narrative complement to AGENTS.md
owner: support
status: merged
branch: support/T-operating-protocol-narrative
pillar: infra (operator docs)
v1_pillar: infra
v1_effect: lowers the onboarding cost for new readers (or future agents) — one narrative doc explains the AGENTS.md rules in context instead of requiring three coordination files cross-read
---

## Scope

Ships `docs/operating-protocol.md` — narrative complement to
`AGENTS.md` that walks through:
- The product (north star, V1 target).
- The three roles (Codex / support agent / human) with scope.
- The four coordination files (AGENTS.md, TASKS.md,
  DECISIONS.md, coordination.json + inboxes + event lane).
- How a PR ships (8 numbered steps).
- The V1 status reporter (#243).
- The pre-flight rules catalog (10+ rules).
- The V1 smoke chain (4 smokes + runbook reference).
- The decomposition spec discipline.
- The schema discipline.
- Things this protocol explicitly avoids.
- How this doc gets updated.

## Why this matters

`AGENTS.md` is the rules of record — dense, load-bearing, no
slack. New readers (or a future agent) face a steep ramp:
combine AGENTS.md + TASKS.md + DECISIONS.md + support-inbox +
v1-definition.md to build context.

This narrative doc is the on-ramp. It does not replace any of
those — it points at them with context.

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: lowers the onboarding cost for new readers (or
  future agents). One narrative doc explains the AGENTS.md rules
  in context instead of requiring four coordination files
  cross-read. Doesn't replace any load-bearing doc — points at
  them with context.`

## Verification

- No load-bearing claim in the narrative contradicts AGENTS.md
  (the doc says so explicitly: "anything load-bearing → update
  AGENTS.md, not this file").
- Pre-flight rule list matches the current rules in
  `scripts/pre_flight.mjs`.
- V1 smoke list matches `scripts/v1_*_smoke.mjs` (4 smokes).
- Merge authority language matches AGENTS.md/D005: support agent-owned
  PRs wait for Codex review and support agent never self-merges.

## Done when

`docs/operating-protocol.md` lands. AGENTS.md is unchanged.

## Followups (not in this PR)

- Add a "common gotchas" section if patterns emerge from
  post-mortems (e.g. coordination drift incidents).
- Cross-link this doc from `README.md` once Codex confirms the
  pointer is wanted there.

## Self-audit revision

support agent's first self-audit, written before #250 and #259 merged,
caught that the initial draft listed `task-missing-status` /
`task-invalid-status` as live too early. The draft also omitted
`schema-doc-backend-drift` (added by Codex #257 to main).

Rewrote the "pre-flight rules" section to:
- List only the rules that were live on main at that moment.
- Separate then-in-flight #250/#259 rules into their own subsection.
- Add a note about the older `startsWith("T-")` file filter and
  planned filter expansion.

## Supervisor revision

Codex rebased this branch after #250 and #259 merged, then made
the narrative match the current rules of record:

- Removed the stale "rules in flight" section and listed
  `task-id-mismatch-filename`, `task-missing-status`, and
  `task-invalid-status` as live pre-flight rules.
- Updated the accepted task-status set to include AGENTS/TASKS
  workflow values plus grandfathered coordination statuses.
- Replaced the incorrect "self-review-and-merge for backend-only
  PRs" sentence with the AGENTS/D005 rule: support agent-owned PRs wait
  for Codex review and support agent never self-merges.
- Replaced the non-canonical `note` event reference with canonical
  event-lane kinds.
