---
id: T-operating-protocol-narrative
title: docs/operating-protocol.md — narrative complement to AGENTS.md
owner: claude
status: review
branch: claude/T-operating-protocol-narrative
pillar: infra (operator docs)
v1_pillar: infra
v1_effect: lowers the onboarding cost for new readers (or future agents) — one narrative doc explains the AGENTS.md rules in context instead of requiring three coordination files cross-read
---

## Scope

Ships `docs/operating-protocol.md` — narrative complement to
`AGENTS.md` that walks through:
- The product (north star, V1 target).
- The three roles (Codex / Claude / human) with scope.
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
combine AGENTS.md + TASKS.md + DECISIONS.md + claude-inbox +
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
- Pre-flight rule list matches the 10 rules currently in
  `scripts/pre_flight.mjs`.
- V1 smoke list matches `scripts/v1_*_smoke.mjs` (4 smokes).

## Done when

`docs/operating-protocol.md` lands. AGENTS.md is unchanged.

## Followups (not in this PR)

- Add a "common gotchas" section if patterns emerge from
  post-mortems (e.g. coordination drift incidents).
- Cross-link this doc from `README.md` once Codex confirms the
  pointer is wanted there.
