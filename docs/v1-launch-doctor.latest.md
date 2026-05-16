# io.them V1 Launch Doctor

- Generated: 2026-05-16T21:46:40.914Z
- Overall: not_started
- Passed: 0/4
- Failed: 0

## Talk Pipeline

- Pillar: talk
- Status: not_started
- Goal: Record voice, receive a useful companion reply, hear playback, and keep the turn.
- Pass criteria: Voice -> reply -> playback -> saved turn works without a restart or manual repair.
- Evidence: Preflight fail=3 warn=1. Env audit shows DEVELOPMENT_TEAM_ID, BACKEND_URL, APP_TOKEN missing. codesigning identities=0.

Blocked: real V1 manual smoke was not performed because release BACKEND_URL, APP_TOKEN, and Development Team/signing identity are not configured in this worktree or environment.

## Screenplay Studio

- Pillar: screenplay
- Status: not_started
- Goal: Create a project, write a properly formatted page, save it, reopen it, and export it.
- Pass criteria: A one-page screenplay survives save/reopen and exports through the current Studio controls.
- Evidence: Automated app health is green: macOS build passed, macOS themTests passed 108/108, generic iOS build passed unsigned.

Blocked: screenplay manual smoke still needs a human/app run against the intended release backend and signed/release configuration.

## Creative Memory

- Pillar: memory
- Status: not_started
- Goal: Confirm io.them remembers safe creative context and exposes enough shape to diagnose memory.
- Pass criteria: Memory improves continuity, diagnostics are readable, and privacy-gated export/delete behavior is understood.
- Evidence: Release secrets missing. Manual Launch Doctor proof had not existed before this T139 report.

Blocked: creative-memory manual recall smoke and privacy decisions remain human/release gates before external review.

## Realtime

- Pillar: realtime
- Status: not_started
- Goal: Mint a realtime session, confirm supplier metadata, and verify degraded-mode behavior.
- Pass criteria: Realtime starts on the primary path, fallback is visible when triggered, and no dead-end state traps the user.
- Evidence: Release preflight still blocks on Development Team, BACKEND_URL, and APP_TOKEN.

Blocked: realtime primary/fallback manual smoke requires the intended release backend/token and configured supplier environment.
