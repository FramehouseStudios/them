---
id: T107
title: Block standalone schema-doc branches when the Claude inbox says they are out of lane
owner: codex
status: review
branch: codex/T107-preflight-schema-lane-guard
pillar: infra
v1_pillar: infra
v1_effect: prevents repeat schema-doc-only PR churn while Phase 7a talk work is the priority
---

## Scope

Teach `scripts/pre_flight.mjs` to warn when a branch changes schema docs without
implementation files while `docs/claude-inbox.md` says standalone schema-doc
PRs are out of lane.

## Done When

- `pre_flight` detects schema-doc-only branches using `origin/main...HEAD`.
- The check is gated by the live `docs/claude-inbox.md` instruction, so the
  rule can stand down when Codex explicitly reopens schema-doc work.
- Branches that pair schema docs with backend/scripts/iOS implementation files
  are not flagged.
- Regression tests cover both blocked and allowed branch shapes.

## Verification

- `node --check scripts/pre_flight.mjs`
- `node --test scripts/pre_flight.test.mjs`
- `node scripts/pre_flight.mjs`
- `git diff --check`

Not run: iOS build/themTests, because this is coordination tooling only.
