---
id: T120
title: Memory export/delete privacy decision packet
owner: codex
status: review
branch: codex/T120-memory-privacy-decision-packet
pillar: longitudinal learning
v1_pillar: memory
v1_effect: unblocks the V1 human privacy decision for full memory export/delete
---

## Scope

Make the parked privacy decisions for Claude PRs #94 and #99 answerable
without asking the human to inspect old PR bodies. Keep the routes parked until
the human explicitly approves the privacy/data-control policy.

## Done When

- A short decision packet summarizes what #94 and #99 expose/delete.
- `docs/decisions-queue.md` links to the packet and states the safe default.
- `docs/testflight-v1-preflight.md` points to the same packet for V1 blockers.
- `TASKS.md` is regenerated.

## Verification

- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed
