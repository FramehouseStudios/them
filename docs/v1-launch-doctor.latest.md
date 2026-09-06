# THEM V1 Launch Doctor

- Generated: 2026-05-28T20:30:00.000Z
- Overall: not_started
- Passed: 0/5
- Failed: 0

## Talk Pipeline

- Pillar: talk
- Status: not_started
- Goal: Record voice, receive a useful companion reply, hear playback, and keep the turn.
- Pass criteria: Voice -> reply -> playback -> saved turn works without a restart or manual repair.
- Evidence: 2026-05-28 deterministic V1 voice-to-page smoke passed after extracted talk-handler live routing. Automated iOS V1 UI smoke passed via scripts/run_v1_ui_smoke.sh on iPhone 17 Pro, including the talk-to-screenplay stub flow. Full manual microphone record/reply/playback/save smoke has not been rerun in Launch Doctor.

Backend /talk now routes through backend/lib/talk_handler.js and the full backend test suite passed after inline handler removal. Real microphone/audio proof still requires app/device or hosted credentials.

## Screenplay Studio

- Pillar: screenplay
- Status: not_started
- Goal: Create a project, write a properly formatted page, save it, reopen it, and export it.
- Pass criteria: A one-page screenplay survives save/reopen and exports through the current Studio controls.
- Evidence: 2026-05-28 deterministic V1 screenplay smoke passed: Fountain export fixture preserved title, scenes, character cue, dialogue ordering, and byte determinism. Automated iOS V1 UI smoke passed via scripts/run_v1_ui_smoke.sh on iPhone 17 Pro, including Studio export. App create/save/export/reopen manual flow has not been rerun in Launch Doctor.

Next proof is the in-app Screenplay Studio manual smoke against the intended backend. No Launch Doctor pass is claimed yet.

## Creative Memory

- Pillar: memory
- Status: not_started
- Goal: Confirm THEM remembers safe creative context and exposes enough shape to diagnose memory.
- Pass criteria: Memory improves continuity, diagnostics are readable, and privacy-gated export/delete behavior is understood.
- Evidence: 2026-05-28 deterministic V1 memory recall smoke passed: character mention persisted, prompt-ready recall returned JUNE with voice/tags, reads stayed deterministic, and user isolation held. Automated iOS V1 UI smoke passed via scripts/run_v1_ui_smoke.sh on iPhone 17 Pro, including memory recall. App mention/recall/Data Controls manual flow has not been rerun in Launch Doctor.

Next proof is an app-level character continuity smoke with Data Controls visible to the human tester.

## Realtime

- Pillar: realtime
- Status: not_started
- Goal: Mint a realtime session, confirm supplier metadata, and verify degraded-mode behavior.
- Pass criteria: Realtime starts on the primary path, fallback is visible when triggered, and no dead-end state traps the user.
- Evidence: 2026-05-28 deterministic V1 realtime failover smoke passed: primary success, primary-to-stub fallback, fallback failure, and pinned-provider failure paths all behaved as expected. Automated iOS V1 UI smoke passed via scripts/run_v1_ui_smoke.sh on iPhone 17 Pro, including realtime stub fallback. Real app primary/fallback manual flow has not been rerun in Launch Doctor.

Next proof is the in-app realtime manual smoke using primary provider plus forced-failure/degraded-mode configuration.

## iOS Release Readiness

- Pillar: ios
- Status: not_started
- Goal: Confirm release config, signed preflight, and Launch Doctor proof are ready before TestFlight or external review.
- Pass criteria: Release config is real, preflight is green, Launch Doctor proof is exported, and human sign-off is recorded before TestFlight/external review.
- Evidence: 2026-05-28 V1 status is 29/34. Deterministic V1 smokes passed and scripts/run_v1_ui_smoke.sh passed 5/5 on iPhone 17 Pro after replacing the stale iPhone 15 destination. Remaining blockers are the four manual app smokes plus final human release signoff/private release inputs.

Release signoff remains intentionally unpassed until Apple team/signing, production APP_TOKEN_RELEASE, exported Launch Doctor proof, and human approval are present.
