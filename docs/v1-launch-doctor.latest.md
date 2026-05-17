# io.them V1 Launch Doctor

- Generated: 2026-05-17T01:55:44.856Z
- Overall: not_started
- Passed: 0/4
- Failed: 0

## Talk Pipeline

- Pillar: talk
- Status: not_started
- Goal: Record voice, receive a useful companion reply, hear playback, and keep the turn.
- Pass criteria: Voice -> reply -> playback -> saved turn works without a restart or manual repair.
- Evidence: Deterministic V1 smokes passed; escalated local talk integration smoke passed 6/7 with 1 expected skip after sandbox bind was allowed. scripts/run_release_preflight.sh failed before preflight because them/Release.local.env is missing.

Blocked: real app voice smoke not run because Release.local.env is missing and release BACKEND_URL/APP_TOKEN/Development Team are not configured.

## Screenplay Studio

- Pillar: screenplay
- Status: not_started
- Goal: Create a project, write a properly formatted page, save it, reopen it, and export it.
- Pass criteria: A one-page screenplay survives save/reopen and exports through the current Studio controls.
- Evidence: Deterministic screenplay smoke passed through npm run eval:v1-smokes; manual QA artifact refreshed at docs/testflight-v1-preflight.md.

Blocked: real app Studio create/save/export/reopen smoke not run against signed release config.

## Creative Memory

- Pillar: memory
- Status: not_started
- Goal: Confirm io.them remembers safe creative context and exposes enough shape to diagnose memory.
- Pass criteria: Memory improves continuity, diagnostics are readable, and privacy-gated export/delete behavior is understood.
- Evidence: Deterministic memory recall smoke passed; D-creative-memory-delete-scope resolved 2026-05-17 as out of V1; PR #99 closed.

Blocked: real app memory recall smoke not run. Privacy decision is no longer blocking V1: #94 shipped core-only export and #99 delete is post-V1.

## Realtime

- Pillar: realtime
- Status: not_started
- Goal: Mint a realtime session, confirm supplier metadata, and verify degraded-mode behavior.
- Pass criteria: Realtime starts on the primary path, fallback is visible when triggered, and no dead-end state traps the user.
- Evidence: Deterministic realtime failover smoke passed through npm run eval:v1-smokes; scripts/appstore_preflight.sh still reports fail=3 warn=1 for Development Team, BACKEND_URL, APP_TOKEN.

Blocked: real primary/fallback manual smoke not run because release backend/token/supplier config are not present.
