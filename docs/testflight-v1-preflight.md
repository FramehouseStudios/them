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

`xcodebuild -project them.xcodeproj -scheme them -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:themUITests test`

The five XCUITests cover onboarding, talk-to-screenplay UI flow, export, memory recall, and realtime stub fallback before human visual/audio signoff.

### Release preflight

`DEVELOPMENT_TEAM_ID=<team-id> APP_TOKEN_RELEASE=<token> scripts/appstore_preflight.sh`

Release settings, private signing/token inputs, privacy manifest, iPhone-only TestFlight posture, and the Release iPhone build are ready for archive checks.

Current local proof, 2026-05-24 America/Los_Angeles: `scripts/appstore_preflight.sh` was run without paid/private release inputs. Privacy manifest, release plist, hosted backend URL, iPhone-only posture, and the unsigned Release iPhone build passed. The command correctly remains red with `fail=2 warn=1`: missing `DEVELOPMENT_TEAM_ID`, missing release `APP_TOKEN`, and a Release entitlements warning that must be confirmed before upload.

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

## Parked Before V1 External Review

- Full creative-memory export/delete (#94, #99): Needs explicit human privacy/data-control approval before merge.
- Postgres eval gate (#33): Needs the GitHub Actions OPENAI_API_KEY secret fixed by a human.
- Auth route extraction (#212): Tier-3 auth work remains do-not-merge until explicitly cleared.

## Status Command

Run `npm run v1:status` after updating docs/v1-definition.md.

<sub>Generated from `scripts/v1_manual_qa_checklist.mjs`.</sub>
