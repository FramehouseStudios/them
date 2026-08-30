---
id: T-runbook-v1-smoke
title: Operator runbook for the V1 smoke suite
owner: support
status: merged
branch: support/T-runbook-v1-smoke
pillar: infra (operator docs)
v1_pillar: infra
v1_effect: operator-facing reference for the V1 smoke suite — answers "what failed and where to look" without diving into 4 separate smoke scripts
---

## Scope

Ships `docs/runbook-v1-smoke.md` — operator-facing reference that
maps each of the 4 V1 smokes to:
- What it verifies (invariants).
- How to run it (commands).
- What failure means (which backend lib to look at).

Plus a TL;DR (run `npm run eval:canon`) and pointers to the V1
status reporter (#243) and ops health summary schema.

## Why this matters

The 4 V1 smokes (#231, #235) are deterministic tripwires — they
catch regressions but don't explain themselves to an operator.
This runbook closes the gap between "the smoke failed" and "here's
which file probably broke it."

## V1 pillar / effect

- `V1 pillar: infra`
- `V1 effect: operator-facing reference for the V1 smoke suite.
  Closes the gap between "smoke failed" and "here's which file
  probably broke it." Both support agent and a human-on-call can use
  this without reading 4 separate scripts.`

## Verification

- All 4 smokes referenced by name match
  `scripts/v1_*_smoke.mjs`.
- TL;DR command (`npm run eval:canon`) matches
  `backend/package.json`.
- Schema doc references match `docs/schemas/INDEX.md`.
- `cd backend && npm run eval:v1-smokes` passed.
- `cd backend && node --test ../scripts/v1_voice_to_page_smoke.test.mjs`
  passed.
- No code change — pure documentation.

## Done when

Runbook lands; operators have one entry point for V1 smoke
failures.

## Followups (not in this PR)

- Optional: wire a CI failure annotation that links to the
  matching section in this runbook when a V1 smoke fails. Out
  of scope here — needs a CI-comment surface.
