# io.them V1 TestFlight Preflight

This artifact names the V1 proof a human should run before TestFlight or external review. It does not claim human signoff; it makes the signoff path explicit.

## Automated Proof

### Deterministic V1 smokes

`cd backend && npm run eval:v1-smokes`

Prompt shape, Fountain export fixture, creative-memory recall, and realtime failover stay deterministic.

### Backend live talk smoke

`cd backend && BASE_URL=<hosted-or-local-api> APP_TOKEN=<token> ./smoke.sh <real-audio.wav>`

Health/session/history/memories/talk all respond, and /talk returns non-empty audio.

### Current V1 status

`npm run v1:status`

The checked and parked V1 checklist items match docs/v1-definition.md.

### Current app build and tests

`docs/v1-build-test-readiness.md`

The latest local app build and themTests result is recorded separately from the human smoke and signed-release checks.

### iOS V1 UI smoke

`scripts/run_v1_ui_smoke.sh`

The five XCUITests cover onboarding, talk-to-screenplay UI flow, export, memory recall, and realtime stub fallback before human visual/audio signoff.

### Release preflight

`scripts/run_release_preflight.sh`

Release settings, private signing/token inputs, privacy manifest, iPhone-only TestFlight posture, and the Release iPhone build are ready for archive checks.

Current local proof, 2026-05-28 America/Los_Angeles: strict pre-flight, canon/V1 smokes, backend tests, authenticated backend smoke through `/session`, `/history`, `/memories`, and `/talk`, free/local quality gate, unsigned Release iPhone Simulator build, and iOS Debug unit/UI tests all passed. `scripts/appstore_preflight.sh` and `scripts/run_release_preflight.sh` correctly remain red without paid/private release inputs: missing `DEVELOPMENT_TEAM_ID`, missing release `APP_TOKEN_RELEASE`, and a Release entitlements confirmation warning before upload. `them/Release.local.env.example`, `scripts/release_config_status.mjs`, and `scripts/run_release_preflight.sh` keep the private release switch-flip path explicit without printing secrets.

## Platform Posture

- V1 is iPhone only.
- macOS remains dormant scaffolding and is excluded from Release/TestFlight posture until a dedicated Mac shell ships.

## Manual App Flows

### Talk Pipeline

Goal: record voice -> get reply -> hear reply -> saved turn

1. Launch the app against the intended backend.
2. Record a short messy screenplay impulse using the microphone.
3. Confirm the companion reply appears in the talk surface.
4. Play the generated audio reply or confirm the visible audio-unavailable fallback.
5. Quit and reopen the app; confirm the turn is still present.

Pass: Reply text is visible, audio behavior is explained, and the saved turn survives relaunch.

### Screenplay Studio

Goal: create project -> write scene -> save -> export -> reopen

1. Create a new screenplay project from a cold app state.
2. Write one scene heading, one action line, one character cue, and one dialogue line.
3. Save the draft and confirm the saved state is visible.
4. Export through the available format picker.
5. Reopen the project and confirm the page content survives.

Pass: The Studio produces a readable screenplay page and preserves it through save/export/reopen.

### Creative Memory

Goal: mention character -> later suggestion recalls them

1. Mention a named character and a distinctive voice/trait in a talk or studio interaction.
2. Refresh the memory summary in Data Controls.
3. Ask for a later suggestion involving that character.
4. Confirm the suggestion references the character without exposing private debug payloads.

Pass: The app recalls useful character context and keeps support/debug surfaces plain-language.

### Realtime

Goal: primary mint works; failures surface as local fallback or production degraded state

1. Set realtime supplier to the primary provider.
2. Start a realtime session and confirm the primary session is minted.
3. Force the primary provider to fail or run with a known failing primary config.
4. In local/test, confirm deterministic stub fallback is visible and usable.
5. In production, confirm the app shows degraded/unavailable state with no synthetic client secret.

Pass: Primary succeeds when healthy; local/test fallback remains visible; production failures never report stub as a successful realtime session.

### iOS Release Readiness

Goal: real release config -> green preflight -> exported Launch Doctor proof -> human signoff

1. Create the ignored Release.local.env from the checked-in template.
2. Fill in the Apple Development Team ID and production APP_TOKEN_RELEASE.
3. Keep the hosted backend URL at https://api.them.io unless the release backend changes.
4. Run the release preflight and confirm it is green.
5. Export Launch Doctor JSON/Markdown from the app or CLI fallback.
6. Record final human signoff before TestFlight or external review.

Pass: Release config is real, preflight is green, Launch Doctor proof is exported, and human sign-off is recorded before TestFlight/external review.

## Parked Before V1 External Review

- Creative-memory delete implementation (#94, #99): Privacy decision is resolved; core memory export is approved/tracked in #94, while #99 delete implementation remains post-V1 unless Codex assigns it.
- Auth route extraction (#212): Tier-3 auth work remains do-not-merge until explicitly cleared.

## Status Command

Run `npm run v1:status` after updating docs/v1-definition.md.

<sub>Generated from `scripts/v1_manual_qa_checklist.mjs`.</sub>
