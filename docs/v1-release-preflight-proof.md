# V1 Release Preflight Proof

This artifact records the latest code-owned iPhone App Store/TestFlight proof. It does not claim Apple signing, deployment, App Store Connect metadata, or human device signoff.

## Last Run

2026-08-28 America/Los_Angeles on `codex/T-v1-human-clearance`.

## Configuration Audit

The release path uses ignored, mode-600 local inputs:

- `them/Release.local.env` is the operator input.
- `scripts/run_release_preflight.sh` rejects symlinks, non-regular files, and any `Release.local.env` mode other than 600 before sourcing it. Its full quality gate defaults on.
- `scripts/write_release_xcconfig.mjs` validates and atomically writes the Team ID, app token, and hosted HTTPS backend origin to ignored `them/Release.local.xcconfig` immediately before Xcode inspection/build. This keeps a later Organizer archive on the same backend that preflight checked.
- `Release.local.xcconfig` is an exact synchronized-folder membership exception, is excluded from all four target configurations, and is a hard-fail artifact if present in the built app.
- `APP_TOKEN_RELEASE` is never passed in `xcodebuild` argv. It is shipped as app configuration and is extractable, so user authentication—not this shared value—is the authorization boundary.

The proof run used dummy values only. The generated dummy xcconfig was removed from the worktree and preserved temporarily at `/tmp/io-them-dummy-Release.local-20260828-final.xcconfig`; no `Release.local.env` or `Release.local.xcconfig` is tracked or present in the release branch.

## Automated Result

The unsigned clean iPhone Release command shape was:

```sh
DEVELOPMENT_TEAM_ID=<dummy-team> \
APP_TOKEN_RELEASE=<dummy-token> \
BACKEND_URL=https://api.them.io \
RUN_QUALITY_GATE=0 \
bash scripts/appstore_preflight.sh
```

Result: `fail=1`, `warn=0`.

Passing checks included:

- iPhone-only Release platforms and device family.
- Bundle identifier, injected Team ID, hosted backend, app token, privacy URL, support email, and microphone purpose string.
- Audio Data/User Content privacy declarations with tracking disabled.
- Assigned 1024×1024 opaque PNG AppIcon.
- Clean unsigned Release compilation.
- Built `them.app` contains no `Release.local.env`, template env, `Release.local.xcconfig`, or dotenv artifact.
- Built `Info.plist` names `AppIcon`, and `assetutil` finds the compiled `AppIcon` rendition in `Assets.car`.

The one failed App Store preflight check was expected and human-owned:

- iPhone Release has no dedicated `CODE_SIGN_ENTITLEMENTS` file containing `com.apple.developer.applesignin = [Default]`. The existing `them/them.entitlements` is macOS-only and must not be reused for iPhone.

Focused release/security contracts passed, including mode-600/symlink rejection before secrets are sourced, canonical-policy success, unrelated-page rejection, and redirect rejection through localhost HTTP fixtures. The live production checks remain a human deployment blocker: on 2026-08-28 both `https://api.them.io/healthz` and `https://them.io/privacy` returned HTTP 302 to `https://introvert.com/?domain=them.io`.

## Code-Owned Verification

- Focused providerless-startup, PII-safe request-logging, and screenplay-ownership tests: `45` passed, `0` failed.
- Backend suite: `2,269` total; `2,268` passed, `1` intentionally skipped, `0` failed.
- Backend dependency audit: `0` vulnerabilities across `126` dependencies.
- Complete script-contract suite: `197` passed, `0` failed.
- Complete iOS `themTests`: `497` passed, `0` failed on iPhone 17 / iOS 26.2. Result bundle: `/tmp/io-them-unit-20260828-final.xcresult`.
- Locally signed sequential simulator V1 UI suite: `31` total; `24` passed, `7` fixture/server-gated skips, `0` failed on iPhone 17 / iOS 26.2. Result bundle: `/tmp/io-them-v1-ui-smoke-20260828-final.xcresult`. This uses Xcode's normal simulator “Sign to Run Locally” path so the Keychain relaunch contract is real; it is not App Store distribution-signing proof.
- The passing UI stories include DEBUG-local demo/Apple separation, remembered email/password restoration through Apple Keychain, disabling remembered login, and Creative Partner mode/reuse/Voice Pin/To Page routing.
- The seven explicit skips require external fixtures: backend restore server (`1`), cross-platform restore/learned-memory fixtures (`3`), screenplay-save recovery server (`2`), and writer-block instinct fixture (`1`).
- Creative Partner's failed “To Page” route was caused by the reuse action re-focusing the Studio composer after reload, leaving the software keyboard over the button. Clearing focus after the reload transaction fixed the root cause; both the focused regression and full suite passed.
- Clean unsigned iPhone Release preflight with dummy values: `fail=1 warn=0`; the build, AppIcon, bundle-isolation, and persisted backend-origin checks passed. The dedicated human-owned iOS Apple entitlement is the sole preflight failure.

## GitHub Configuration Audit

As of 2026-08-28, `OPENAI_API_KEY` exists as a repository secret; `APP_TOKEN_RELEASE` and `DEVELOPMENT_TEAM_ID` are absent. `BACKEND_URL` and `PRIVACY_POLICY_URL` repository variables are also absent. Workflow fallbacks currently match the intended URLs, and any future variables must exactly match the shipped configuration.

## Human Clearance Required

1. Review and approve the Tier-3 release PR, the generated AppIcon, and the branch's human-owned Email Address declaration in `them/PrivacyInfo.xcprivacy`; keep `do-not-merge` until every item below is green.
2. In Apple Developer, enable Sign in with Apple for `io.them.them`. Create/approve a dedicated iOS entitlement containing `com.apple.developer.applesignin = [Default]`, wire it only to iphoneos Release, regenerate the provisioning profile, and configure a valid distribution identity. Do not reuse `them/them.entitlements`, which is the macOS sandbox entitlement file.
3. Deploy the backend using `backend/DEPLOY.md`: provision Postgres, apply every migration, deliberately establish the canonical auth-store marker, keep V1 at one backend instance, and set `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `APP_TOKEN`, and `AUTH_APPLE_AUDIENCE`. Backend `APP_TOKEN` must match app `APP_TOKEN_RELEASE`; the Apple audience must match the approved app identifier.
4. Attach DNS so `https://api.them.io/healthz` and `/api/version` directly return the expected io.them JSON envelopes. Publish the exact privacy-policy URL from `Info-Release.plist` as a direct HTTP 200 io.them policy page. Redirects and parked-domain content are release failures.
5. Create ignored `them/Release.local.env` from the template, keep it a regular non-symlink file with mode 600, and fill real `DEVELOPMENT_TEAM_ID`, `APP_TOKEN_RELEASE`, and `OPENAI_API_KEY` values.
6. Add GitHub Actions secrets `APP_TOKEN_RELEASE` and `DEVELOPMENT_TEAM_ID`; verify the existing `OPENAI_API_KEY`. Set `BACKEND_URL` or `PRIVACY_POLICY_URL` repository variables only if they exactly match the shipped values.
7. Run `scripts/run_release_preflight.sh` without disabling any gate. Push an `rc-*` tag only after it is fully green, then confirm the release-preflight workflow is green.
8. Complete App Store Connect description, keywords, category/age rating, privacy answers, export-compliance answers, support/marketing URLs, screenshots, review contact, and App Review Information. Because production requires login, provide a disposable server-backed review account; never submit the DEBUG `.invalid` demo credentials.
9. Produce a signed Release archive, run Validate App, upload it to TestFlight, and install the build on a physical iPhone.
10. On that TestFlight build, verify real Sign in with Apple using an actual Apple ID, email signup/sign-in, valid-session restoration, Remember Me/Keychain opt-in and opt-out, sign-out, account deletion, and the five Launch Doctor flows. Apple never accepts an app-created password.
11. Export Launch Doctor JSON/Markdown, record physical-device signoff, then remove `do-not-merge` and approve/merge the Tier-3 PR.

## Boundary

Code-owned Release build, artifact isolation, AppIcon compilation, auth persistence, and simulator behavior are proven. Human approval of the privacy-manifest change, Apple capability/signing, real secrets, live DNS/deployment, App Store metadata, and physical-device approval cannot be truthfully completed without the release owner.
