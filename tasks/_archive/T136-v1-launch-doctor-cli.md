---
id: T136
title: Add Launch Doctor CLI proof recorder
owner: codex
status: merged
branch: codex/T136-v1-launch-doctor-cli
pillar: mobile-first
v1_pillar: ios
v1_effect: unblocks V1 manual smoke signoff by making Launch Doctor proof capture scriptable and repo-readable
---

## Scope

Add a repo-native CLI companion for the in-app V1 Launch Doctor. The script
must generate the same schema/versioned JSON and Markdown summary as the app
from explicit pass/fail/in-progress/not-started flags or a pasted manual QA
result block.

## Done When

- A script can write `docs/v1-launch-doctor.latest.json` and matching Markdown
  from explicit flow results without inventing a pass.
- The script can parse the result block printed by
  `scripts/v1_manual_qa_checklist.mjs --prompt`.
- `scripts/v1_launch_room.mjs` can read the generated report unchanged.
- Docs explain the app export path and CLI fallback path.
- Focused script tests and launch-room tests pass.

## Verification

- `node --check scripts/v1_launch_doctor_report.mjs` passed.
- `node --test scripts/v1_launch_doctor_report.test.mjs` passed 4/4.
- `node --test scripts/v1_launch_room.test.mjs` passed 5/5.
- `node --test scripts/v1_manual_qa_checklist.test.mjs` passed 4/4.
- `node scripts/coordination_state.mjs validate` passed.
- `node scripts/pre_flight.mjs --strict` passed.
- `git diff --check` passed.
