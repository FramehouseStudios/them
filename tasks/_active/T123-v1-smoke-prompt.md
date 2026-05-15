---
id: T123
title: Make V1 manual smoke handoff one-command
owner: codex
status: in-progress
branch: codex/T123-v1-smoke-prompt
pillar: mobile-first
v1_pillar: ios
v1_effect: reduces human friction for the remaining V1 manual smoke and TestFlight signoff items
---

## Scope

Tighten the human V1 smoke handoff so the remaining manual checks can be run
from one repo command instead of reading multiple docs. Keep the generated
TestFlight preflight artifact in sync with the readiness proof.

## Done When

- `scripts/v1_manual_qa_checklist.mjs` includes the current app build/test
  readiness proof in generated output.
- The script can print a compact human smoke prompt with pass/fail fields.
- Tests cover the new prompt and generated readiness proof.
- `docs/testflight-v1-preflight.md` regenerates without dropping the current
  app build/test section.
- `TASKS.md` is regenerated.

## Verification

- Pending.
