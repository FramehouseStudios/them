---
id: T114
title: Add V1 manual QA checklist and TestFlight preflight artifact
owner: codex
status: merged
branch: codex/T114-v1-manual-qa-preflight
pillar: mobile-first
v1_pillar: ios
v1_effect: closes the V1 manual QA script and TestFlight preflight artifact checklist items
---

## Scope

Add a small, deterministic script that prints or writes the V1 human QA
checklist, plus a TestFlight preflight artifact that names what is verified,
what is parked, and which manual flows remain to be signed off.

## Done When

- `scripts/v1_manual_qa_checklist.mjs` emits Markdown and JSON.
- `docs/testflight-v1-preflight.md` records the current V1 verified/parked
  state for external-review prep.
- `docs/runbook-v1-smoke.md` links the human QA checklist command.
- `docs/v1-definition.md` marks the manual QA script and TestFlight artifact
  checklist items complete without claiming human signoff.

## Verification

- `node --test scripts/v1_manual_qa_checklist.test.mjs`
- `node scripts/v1_manual_qa_checklist.mjs --json`
- `npm run v1:status`
- `node scripts/pre_flight.mjs --strict`
- `node scripts/build_tasks_md.mjs --write`
- `git diff --check`

Not run: iOS build/themTests, because this adds release-readiness docs and a
Node checklist generator only.
