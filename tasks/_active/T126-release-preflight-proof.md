---
id: T126
title: Run and record release preflight
owner: codex
status: review
branch: codex/T126-release-preflight-proof
pillar: mobile-first
v1_pillar: ios
v1_effect: proves or surfaces blockers in the release preflight path before TestFlight handoff
---

## Scope

Run `scripts/appstore_preflight.sh` on current `main` and record the outcome
as a release-readiness artifact. This does not change signing, entitlements, or
human-owned release settings.

## Done When

- `scripts/appstore_preflight.sh` is run locally.
- A readiness artifact records pass/fail/warn counts and any blockers.
- `docs/testflight-v1-preflight.md` links to the release preflight proof.
- Coordination state and the live handoff record the outcome.
- `TASKS.md` is regenerated.

## Verification

- `scripts/appstore_preflight.sh` -> failed as expected, surfacing 6 release
  configuration/signing blockers and 0 warnings
- `node scripts/coordination_state.mjs validate` -> passed
- `node scripts/pre_flight.mjs --strict` -> passed
- `git diff --check` -> passed
