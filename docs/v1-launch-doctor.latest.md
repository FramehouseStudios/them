# io.them V1 Launch Doctor

- Generated: 2026-05-17T21:31:39.959Z
- Overall: not_started
- Passed: 0/4
- Failed: 0

## Talk Pipeline

- Pillar: talk
- Status: not_started
- Goal: Record voice, receive a useful companion reply, hear playback, and keep the turn.
- Pass criteria: Voice -> reply -> playback -> saved turn works without a restart or manual repair.
- Evidence: 2026-05-17: deterministic/local talk evidence remains valid, and PR #33 is merged after GitHub `evaluate` plus `eval:gate against Postgres` passed. Real app voice smoke is still blocked by missing them/Release.local.env and absent release Development Team, BACKEND_URL, and APP_TOKEN.

Blocked: real app voice smoke needs release config plus a human/device run.

## Screenplay Studio

- Pillar: screenplay
- Status: not_started
- Goal: Create a project, write a properly formatted page, save it, reopen it, and export it.
- Pass criteria: A one-page screenplay survives save/reopen and exports through the current Studio controls.
- Evidence: 2026-05-17 T152 rerun: deterministic screenplay smoke proof remains valid; release preflight still fails before signed/manual Studio run because release config is missing.

Blocked: create/save/export/reopen manual smoke has not run against signed release configuration.

## Creative Memory

- Pillar: memory
- Status: not_started
- Goal: Confirm io.them remembers safe creative context and exposes enough shape to diagnose memory.
- Pass criteria: Memory improves continuity, diagnostics are readable, and privacy-gated export/delete behavior is understood.
- Evidence: 2026-05-17 T152 rerun: deterministic memory recall proof remains valid; #94 core-only export is merged and #99 destructive delete remains post-V1.

Blocked: real app memory recall smoke still needs release config and manual app run. Privacy decision is no longer blocking V1 export scope.

## Realtime

- Pillar: realtime
- Status: not_started
- Goal: Mint a realtime session, confirm supplier metadata, and verify degraded-mode behavior.
- Pass criteria: Realtime starts on the primary path, fallback is visible when triggered, and no dead-end state traps the user.
- Evidence: 2026-05-17 T152 rerun: deterministic realtime failover proof remains valid. scripts/run_release_preflight.sh failed because them/Release.local.env is missing; direct scripts/appstore_preflight.sh reported fail=3 warn=1.

Blocked: real primary/fallback realtime manual smoke still needs hosted backend URL, production APP_TOKEN, Development Team, and signing identity.
