---
id: T125
title: Record deterministic V1 smoke proof
owner: codex
status: merged
branch: codex/T125-deterministic-v1-smoke-proof
pillar: mobile-first
v1_pillar: ios
v1_effect: proves the deterministic V1 smoke pack is green on current main before human manual smoke and TestFlight handoff
---

## Scope

Run the deterministic V1 smoke pack on current `main` and record a durable
proof artifact so the TestFlight preflight does not point to an unverified
command.

## Done When

- `cd backend && npm run eval:v1-smokes` passes on current main.
- A readiness artifact records the command, branch, time, and result.
- `docs/testflight-v1-preflight.md` links the deterministic smoke proof.
- Coordination state and the live handoff record the proof.
- `TASKS.md` is regenerated.

## Verification

- `cd backend && npm run eval:v1-smokes` -> passed
- `node scripts/coordination_state.mjs validate` -> passed
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed
