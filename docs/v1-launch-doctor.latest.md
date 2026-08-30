# io.them V1 Launch Doctor

- Generated: 2026-05-18T00:47:05.000Z
- Overall: failed
- Passed: 0/5
- Failed: 1

## Talk Pipeline

- Pillar: talk
- Status: failed
- Goal: Record voice, receive a useful companion reply, hear playback, and keep the turn.
- Pass criteria: Voice -> reply -> playback -> saved turn works without a restart or manual repair.
- Evidence: 2026-05-18 free/local backend smoke on http://127.0.0.1:3000 passed health, session, history, and memories. POST /talk reached STT and failed with OpenAI 401 invalid_api_key because the local key was a dummy value.

Blocked for real Talk proof until a real/free OPENAI_API_KEY is available or a repo-owned mock STT/TTS path exists. This is not assigned to support agent as a backend bug yet.

## Screenplay Studio

- Pillar: screenplay
- Status: not_started
- Goal: Create a project, write a properly formatted page, save it, reopen it, and export it.
- Pass criteria: A one-page screenplay survives save/reopen and exports through the current Studio controls.
- Evidence: 2026-05-18 deterministic V1 screenplay smoke passed via cd backend && npm run eval:v1-smokes; app create/save/export/reopen has not been run in Launch Doctor.

Next free proof is an app-level Studio smoke against local config; signed/release Studio proof waits for deferred release inputs.

## Creative Memory

- Pillar: memory
- Status: not_started
- Goal: Confirm io.them remembers safe creative context and exposes enough shape to diagnose memory.
- Pass criteria: Memory improves continuity, diagnostics are readable, and privacy-gated export/delete behavior is understood.
- Evidence: 2026-05-18 deterministic V1 memory recall smoke passed via cd backend && npm run eval:v1-smokes; app mention/recall/Data Controls flow has not been run in Launch Doctor.

Next free proof is an app-level memory recall and diagnostics smoke.

## Realtime

- Pillar: realtime
- Status: not_started
- Goal: Mint a realtime session, confirm supplier metadata, and verify degraded-mode behavior.
- Pass criteria: Realtime starts on the primary path, fallback is visible when triggered, and no dead-end state traps the user.
- Evidence: 2026-05-18 deterministic V1 realtime failover smoke passed via cd backend && npm run eval:v1-smokes; real app primary/stub fallback smoke has not been run in Launch Doctor.

Next free proof should use the repo stub/failing realtime config and record exactly which path was stubbed.

## iOS Release Readiness

- Pillar: ios
- Status: not_started
- Goal: Confirm release config, signed preflight, and Launch Doctor proof are ready before TestFlight or external review.
- Pass criteria: Release config is real, preflight is green, Launch Doctor proof is exported, and human sign-off is recorded before TestFlight/external review.
- Evidence: 2026-05-18 release config status still reports missing them/Release.local.env plus DEVELOPMENT_TEAM_ID, hosted BACKEND_URL, and production APP_TOKEN.

Paid/external release inputs are deferred to the end of the two-week free-first schedule unless they become free sooner.
