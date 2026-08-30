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

The 31-test sequential XCUITest suite covers the connected V1 app, including locally signed Keychain relaunch, Creative Partner routing, talk-to-screenplay, export/restore, memory, realtime, and recovery states. Fixture-gated skips remain explicit and do not count as human signoff.

### Release preflight

`scripts/run_release_preflight.sh`

Release settings, private signing/token inputs, live backend and shipped privacy-policy URLs, privacy manifest, AppIcon, iPhone-only TestFlight posture, and the Release iPhone build are ready for signed archive checks.

Current local proof, 2026-08-28 America/Los_Angeles: the integrated release line includes current `main`; 497/497 iOS unit tests passed; the locally signed simulator V1 UI suite completed 31 tests with 24 passed, 7 explicit fixture/server-gated skips, and 0 failed; focused providerless-startup, PII-safe request logging, and screenplay ownership tests passed; release config/AppIcon/public-surface contracts passed; and a clean unsigned iPhone Release build was exercised with a dummy ignored config. The gate intentionally remains red until a human approves the branch's Email Address privacy declaration, supplies DEVELOPMENT_TEAM_ID and production APP_TOKEN_RELEASE, approves a dedicated iOS Sign in with Apple entitlement/capability, deploys the backend and privacy policy, and completes distribution-signed physical-device/App Store Connect checks.

## Platform Posture

- iPhone TestFlight remains the App Store release lane.
- The Mac Studio scaffold is outside V1 and is available only as an explicit opt-in diagnostic lane.

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

### iPhone Release Readiness

Goal: real release config -> live public surfaces -> signed iPhone archive -> exported Launch Doctor proof -> human signoff

1. Create the ignored Release.local.env from the checked-in template.
2. Fill in DEVELOPMENT_TEAM_ID, production APP_TOKEN_RELEASE, and OPENAI_API_KEY; keep the file mode 600.
3. Deploy the production backend with Postgres, every migration, the canonical auth-store marker, one V1 backend instance, and real DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, APP_TOKEN, and AUTH_APPLE_AUDIENCE; APP_TOKEN must match APP_TOKEN_RELEASE.
4. Publish https://api.them.io and the exact privacy URL shipped in Info-Release.plist, then confirm both return direct HTTP 200 io.them content without redirects or parked-domain material.
5. Approve a dedicated iOS entitlement containing com.apple.developer.applesignin = [Default], enable Sign in with Apple for io.them.them in the Apple portal, regenerate provisioning, and wire only that file to iphoneos Release.
6. Review and approve the Email Address declaration in PrivacyInfo.xcprivacy, approve or replace the generated AppIcon, and complete App Store privacy/export-compliance metadata.
7. Add GitHub Actions secrets APP_TOKEN_RELEASE and DEVELOPMENT_TEAM_ID, verify OPENAI_API_KEY, then run scripts/run_release_preflight.sh without disabling any gate and require the rc-* workflow to pass.
8. Archive and Validate the distribution-signed iPhone app, upload it to TestFlight, and install the build on a physical iPhone.
9. Verify real Sign in with Apple using an actual Apple ID, server-backed email signup/sign-in, session restoration, Remember Me/Keychain opt-in and opt-out, sign-out, and account deletion. The DEBUG .invalid demo account is not an Apple or production account.
10. Run all five manual flows on the TestFlight build, export Launch Doctor JSON/Markdown, and record final human signoff before external review.

Pass: Public surfaces, signed archive validation, physical-device flows, Launch Doctor proof, metadata, and human sign-off are all green before TestFlight/external review.

## Parked Before V1 External Review

- Creative-memory delete implementation (#99): The privacy decision and core export work are merged; destructive memory delete remains post-V1 unless Codex assigns it.

## Status Command

Run `npm run v1:status` after updating docs/v1-definition.md.

<sub>Generated from `scripts/v1_manual_qa_checklist.mjs`.</sub>
