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

The latest local app build and `themTests` result is recorded separately from
the human smoke and signed-release checks.

### Release preflight

`scripts/appstore_preflight.sh`

Release settings, privacy manifest, entitlements, and macOS release build are ready for archive checks.

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

Goal: primary mint works; forced primary failure shows fallback

1. Set realtime supplier to the primary provider.
2. Start a realtime session and confirm the primary session is minted.
3. Force the primary provider to fail or run with a known failing primary config.
4. Confirm the app shows the fallback/degraded state and does not strand the writer.

Pass: Primary succeeds when healthy; fallback is visible and usable when primary fails.

## Parked Before V1 External Review

- Full creative-memory export/delete (#94, #99): Needs explicit human
  privacy/data-control approval before merge. Decision packet:
  `docs/memory-export-delete-decision-packet.md`.
- Postgres eval gate (#33): Needs the GitHub Actions OPENAI_API_KEY secret fixed by a human.
- Auth route extraction (#212): Tier-3 auth work remains do-not-merge until explicitly cleared.

## Status Command

Run `npm run v1:status` after updating docs/v1-definition.md.

<sub>Generated from `scripts/v1_manual_qa_checklist.mjs`.</sub>
