# V1 Build And Test Readiness

This artifact records the current app build and `themTests` proof used to close
the V1 release-readiness checklist item in `docs/v1-definition.md`.

## Last Verified

2026-08-28 America/Los_Angeles on branch
`codex/T-v1-human-clearance` after integrating current `main`.

## Commands

```sh
cd backend && npm test
cd backend && npm audit --audit-level=high
xcodebuild test -project them.xcodeproj -scheme them \
  -destination 'platform=iOS Simulator,id=B70AFDA9-3FB1-4439-BEB6-9AA735EAC364' \
  -parallel-testing-enabled NO -only-testing:themTests \
  -resultBundlePath /tmp/io-them-unit-20260828-final.xcresult
IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=B70AFDA9-3FB1-4439-BEB6-9AA735EAC364' \
  scripts/run_v1_ui_smoke.sh \
  -resultBundlePath /tmp/io-them-v1-ui-smoke-20260828-final.xcresult
DEVELOPMENT_TEAM_ID=<dummy-team> APP_TOKEN_RELEASE=<dummy-token> \
  BACKEND_URL=https://api.them.io RUN_QUALITY_GATE=0 \
  bash scripts/appstore_preflight.sh
node --test scripts/*.test.mjs
node scripts/pre_flight.mjs --strict
node scripts/coordination_state.mjs validate
```

## Results

- Backend suite: `2,269` tests total; `2,268` passed, `1` intentionally skipped,
  `0` failed. Tests run serially because the full suite contains shared
  process/port fixtures that race under file-level concurrency.
- Backend dependency audit: `0` vulnerabilities across `126` dependencies.
- Complete iOS `themTests`: `497` passed, `0` failed on iPhone 17 / iOS 26.2.
- Locally signed sequential iOS V1 UI suite: `31` total, `24` passed,
  `7` fixture/server-gated skips, `0` failed. This exercises the simulator's
  normal “Sign to Run Locally” path and real Keychain relaunch behavior; it is
  not App Store distribution-signing proof.
- The UI pass includes local-demo/Apple separation, remembered credentials
  through Keychain, opt-out, Creative Partner reuse/Voice Pin/To Page routing,
  screenplay generation/export/restore, memory, realtime, and recovery states.
- The seven explicit skips require external fixtures: backend restore server
  (`1`), cross-platform restore/learned-memory fixtures (`3`), screenplay-save
  recovery server (`2`), and writer-block instinct fixture (`1`).
- Clean unsigned iPhone Release inside App Store preflight built successfully.
  AppIcon source and compiled rendition checks passed, no private config was
  bundled, and iPhone-only platform/device-family checks passed.
- Dummy-value App Store preflight was expected red at `fail=1 warn=0`; the sole
  failure is the missing human-owned dedicated iOS Sign in with Apple
  entitlement. No valid distribution signing identity is installed locally.
- Live production release checks remain red: `https://api.them.io/healthz` and
  `https://them.io/privacy` redirect to an unrelated parked-domain page.
- Repository release secrets remain incomplete: `OPENAI_API_KEY` exists;
  `APP_TOKEN_RELEASE` and `DEVELOPMENT_TEAM_ID` are absent.

## Boundaries

This proof is the current code-owned local build and automated test suite. It
does not approve the branch's human-owned `PrivacyInfo.xcprivacy` declaration,
Apple capability/entitlement/signing, production secrets or DNS, App Store
Connect metadata, a signed archive, TestFlight upload, or physical-iPhone
Launch Doctor signoff. Those remain covered by
`docs/testflight-v1-preflight.md`.
