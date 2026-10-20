# io.them iPhone TestFlight Submission Checklist

Last updated: 2026-08-30

## 1. Blocking Config (must pass before archive)
- Create ignored local release config from the checked-in template:
```bash
cp them/Release.local.env.example them/Release.local.env
chmod 600 them/Release.local.env
```
- Fill `DEVELOPMENT_TEAM_ID`, `APP_TOKEN_RELEASE`, and `OPENAI_API_KEY` in `them/Release.local.env`.
- Keep `BACKEND_URL=https://them-backend.onrender.com` until a custom domain passes the live backend gate. `api.them.io` currently redirects to a parked domain.
- Confirm `PRIVACY_POLICY_URL` and `SUPPORT_EMAIL` values in `them/Info-Release.plist` are production values.
- Do not put production values in tracked `Config.xcconfig`, screenshots, tickets, or chat. The generated `Release.local.xcconfig` is ignored, mode 600, and explicitly excluded from every app target.
- Treat `APP_TOKEN_RELEASE` as extractable app configuration, never as a user secret or sole authorization boundary.

## 2. Security + Entitlements
- Human-review and approve the branch's Email Address declaration in `them/PrivacyInfo.xcprivacy`; then confirm microphone/network behavior and every collected-data declaration match App Store Connect privacy answers.
- Enable Sign in with Apple for `io.them.them` in the Apple Developer portal.
- Confirm the checked-in `them/them-iOS.entitlements` capability is approved for the App ID and present in regenerated provisioning. The iPhone target already wires this dedicated file; do not replace it with `them/them.entitlements`, which contains macOS sandbox keys.
- Confirm the iPhone TestFlight lane remains iPhone-only.
- Keep the Mac Studio scaffold outside V1; run `RUN_MAC_DESKTOP_PREFLIGHT=1 scripts/run_release_preflight.sh` only for a separate desktop handoff or demo.

## 3. Privacy + Policy
- Publish the privacy policy page at the exact URL in `them/Info-Release.plist`; release preflight rejects redirects, parked pages, and workflow-variable mismatches.
- Deploy the backend with Postgres, all migrations, the canonical auth-store marker, one V1 instance, and real `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `APP_TOKEN`, and `AUTH_APPLE_AUDIENCE`. The backend `APP_TOKEN` must match the app's `APP_TOKEN_RELEASE`.
- Attach DNS so the exact Release `BACKEND_URL` serves direct healthy `/healthz` and `/api/version` io.them responses.
- Ensure App Store Connect Privacy answers match `them/PrivacyInfo.xcprivacy`.
- Include Audio Data, User Content, and Email Address as app-functionality data types.
- Confirm the privacy policy names the active AI provider paths: OpenAI and, when enabled, ElevenLabs.
- Confirm Contacts permission is explained as Quick Email recipient suggestions and remains user-initiated.
- Confirm in-app data controls work: clear history and clear memories.

## 4. Build + Preflight
- Run the backend/app quality gate first:
```bash
./scripts/quality_gate.sh
```
- Gate toggles available in CI or local env:
  - `RUN_EVAL`
  - `RUN_SPECULATIVE_REUSE_GATE`
  - `RUN_SMOKE`
  - `RUN_TALK_RECOVERY_GATE`
  - `RUN_QUALITY_GATE`
- Default policy:
  - Local `appstore_preflight.sh` keeps `RUN_QUALITY_GATE` opt-in, so the script remains a build/signing/privacy check unless you explicitly ask it to include backend gates.
  - Human release signoff uses `run_release_preflight.sh`, which defaults `RUN_QUALITY_GATE=1`. Checked-in CI also enforces it.
- Checked-in workflow template:
  - `.github/workflows/quality-gate.yml`
- Checked-in release automation template:
  - `.github/workflows/release-preflight.yml`
  - This workflow now auto-runs on push tags matching `rc-*`, and remains available through `workflow_dispatch` / `workflow_call`.
- Required GitHub Actions secrets for the checked-in workflow defaults:
  - `OPENAI_API_KEY`
  - `APP_TOKEN_RELEASE`
  - `DEVELOPMENT_TEAM_ID`
- If a checked-in workflow is missing required secrets, it now fails before the shell scripts start and records the problem in the Actions summary.
- Failure artifacts from CI:
  - `quality-gate-failure-logs`
  - `release-preflight-failure-logs`
  - inside those artifacts, start with:
    - `/tmp/them-quality-gate-backend.log`
    - `/tmp/them_release_preflight_build.log`
    - `/tmp/them-smoke/them-home.png` for Studio visual smoke failures
- Artifact quick triage:

| Artifact or tab | Use it when | Open this first |
| --- | --- | --- |
| `Summary` tab | The workflow failed before much output was produced. | Fast-fail secret errors or enforced/skipped section summary. |
| `quality-gate-failure-logs` | The backend/app gate failed after startup. | `/tmp/them-quality-gate-backend.log` |
| `release-preflight-failure-logs` | The Release iPhone build or preflight checks failed. | `/tmp/them_release_preflight_build.log` |
| Either failure artifact bundle | A Studio visual smoke failed and you need to see the live draft page state. | `/tmp/them-smoke/them-home.png` |
- Release-candidate tag policy and repo-settings checklist:
  - `them/RELEASE_RUNBOOK.md`
- When CI fails, open these in order:
  - the workflow run `Summary` tab for the fast-fail reason or enforced/skipped sections
  - the named artifact bundle for logs
  - `them/RELEASE_RUNBOOK.md` if the run came from an `rc-*` tag
- Run:
```bash
./scripts/run_release_preflight.sh
```
- This wrapper checks Clementine's adaptive writer-block rescue, the locally signed sequential iPhone-simulator V1 UI suite (including Keychain relaunch), the exact live backend and shipped privacy-policy surfaces, and the clean iPhone Release build/AppIcon path. Distribution signing remains a separate human archive/TestFlight gate.
- Mac preflight is off by default because V1 is iPhone-only. Never disable live backend or public-surface checks for release sign-off.
- `RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE=0` is for isolating another failing gate only; do not use it for release sign-off.
- The wrapper includes the full quality gate by default. Never override it to `0` for release signoff:
```bash
./scripts/run_release_preflight.sh
```
- Fix all `[FAIL]` results before archive.

## 5. Archive + Validation
- Archive in Xcode with Release configuration for iPhone.
- Run Validate App.
- Install the uploaded build through TestFlight on a physical iPhone and complete `docs/testflight-v1-preflight.md`.
- Export Launch Doctor JSON/Markdown and attach it to the release record.
- Resolve all privacy/entitlement/signing warnings before upload.

## 6. App Store Connect Metadata
- App description, keywords, support URL, marketing URL.
- Privacy policy URL.
- Category and age rating questionnaire.
- Screenshots for required iPhone display sizes.
- App Review contact details.
- Human confirmation of export-compliance answers before changing `Info-Release.plist`.
- Human approval of the generated AppIcon or replacement artwork.

## 7. App Review Notes (recommended)
- Explain microphone use in one sentence.
- Explain that voice/audio, text, and screenplay content are processed by OpenAI and optionally ElevenLabs to deliver app functionality.
- Explain that Contacts access is optional and only used for Quick Email recipient suggestions.
- Because production requires login, provide a disposable server-backed App Review account in App Review Information. Never submit the DEBUG `.invalid` demo credentials; Sign in with Apple must use a real Apple ID and never accepts an app-created password.
