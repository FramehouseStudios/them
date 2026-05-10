# io.them macOS App Store Submission Checklist

Last updated: 2026-03-27

## 1. Blocking Config (must pass before archive)
- Set `DEVELOPMENT_TEAM_ID` in `/Users/halfmutantfilms/Desktop/io.them/them/Config.xcconfig`.
- Set `APP_TOKEN_RELEASE` in `/Users/halfmutantfilms/Desktop/io.them/them/Config.xcconfig`.
- Confirm Release `BACKEND_URL` in `/Users/halfmutantfilms/Desktop/io.them/them/them.xcodeproj/project.pbxproj` points to your hosted API (not localhost).
- Confirm `PRIVACY_POLICY_URL` and `SUPPORT_EMAIL` values in `/Users/halfmutantfilms/Desktop/io.them/them/them/Info-Release.plist` are production values.

## 2. Security + Entitlements
- Confirm App Sandbox + mic + network client entitlements in `/Users/halfmutantfilms/Desktop/io.them/them/them/them.entitlements`.
- Confirm Release Hardened Runtime is enabled in `/Users/halfmutantfilms/Desktop/io.them/them/them.xcodeproj/project.pbxproj`.

## 3. Privacy + Policy
- Publish the privacy policy page at `https://them.io/privacy` (or update plist URL first).
- Ensure App Store Connect Privacy answers match `/Users/halfmutantfilms/Desktop/io.them/them/them/PrivacyInfo.xcprivacy`.
- Confirm in-app data controls work: clear history and clear memories.

## 4. Build + Preflight
- Run the backend/app quality gate first:
```bash
cd /Users/halfmutantfilms/Desktop/io.them/them
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
  - Checked-in CI and any release automation should set `RUN_QUALITY_GATE=1` when invoking `appstore_preflight.sh`, so a release candidate does not skip backend quality checks by default.
- Checked-in workflow template:
  - `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/quality-gate.yml`
- Checked-in release automation template:
  - `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml`
  - This workflow now auto-runs on push tags matching `rc-*`, and remains available through `workflow_dispatch` / `workflow_call`.
- Required GitHub Actions secrets for the checked-in workflow defaults:
  - `OPENAI_API_KEY`
  - `APP_TOKEN`
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
| `release-preflight-failure-logs` | The Release macOS build or preflight checks failed. | `/tmp/them_release_preflight_build.log` |
| Either failure artifact bundle | A Studio visual smoke failed and you need to see the live draft page state. | `/tmp/them-smoke/them-home.png` |
- Release-candidate tag policy and repo-settings checklist:
  - `/Users/halfmutantfilms/Desktop/io.them/them/RELEASE_RUNBOOK.md`
- When CI fails, open these in order:
  - the workflow run `Summary` tab for the fast-fail reason or enforced/skipped sections
  - the named artifact bundle for logs
  - `/Users/halfmutantfilms/Desktop/io.them/them/RELEASE_RUNBOOK.md` if the run came from an `rc-*` tag
- Run:
```bash
cd /Users/halfmutantfilms/Desktop/io.them/them
./scripts/appstore_preflight.sh
```
- If you want the App Store preflight to include the full quality gate in one command:
```bash
cd /Users/halfmutantfilms/Desktop/io.them/them
RUN_QUALITY_GATE=1 ./scripts/appstore_preflight.sh
```
- Fix all `[FAIL]` results before archive.

## 5. Archive + Validation
- Archive in Xcode with Release configuration for macOS.
- Run Validate App.
- Resolve all privacy/entitlement/signing warnings before upload.

## 6. App Store Connect Metadata
- App description, keywords, support URL, marketing URL.
- Privacy policy URL.
- Category and age rating questionnaire.
- Screenshots for required macOS display sizes.
- App Review contact details.

## 7. App Review Notes (recommended)
- Explain microphone use in one sentence.
- Explain that voice/audio and text are processed by AI providers to deliver app functionality.
- Provide a demo account only if your app requires login.
