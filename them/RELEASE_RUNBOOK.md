# io.them Release Runbook

Last updated: 2026-08-28

## Operator Quick Path
- Prepare ignored local release config:

```bash
cp them/Release.local.env.example them/Release.local.env
chmod 600 them/Release.local.env
```

- Fill `DEVELOPMENT_TEAM_ID`, `APP_TOKEN_RELEASE`, and `OPENAI_API_KEY` in `them/Release.local.env`.
- Keep `BACKEND_URL=https://api.them.io` unless the hosted release backend changes.
- Keep `PRIVACY_POLICY_URL` identical to the URL shipped in `them/Info-Release.plist`.
- Check secret-safe release config status:

```bash
node scripts/release_config_status.mjs
```

- Local release preflight:

```bash
scripts/run_release_preflight.sh
```

This wrapper proves Clementine's adaptive writer-block rescue, the locally
signed iPhone-simulator V1 UI suite (including Keychain relaunch), the exact live backend and
privacy-policy surfaces, and the iPhone App Store preflight path.
It defaults the full quality gate on and refuses to source a symlink,
non-regular file, or release env file that is not mode 600. It also persists
the validated backend origin into the ignored Xcode include so Organizer
archives the same endpoint that preflight inspected.
V1 is iPhone-only; the Mac Studio scaffold is outside this gate and can be
checked explicitly with `RUN_MAC_DESKTOP_PREFLIGHT=1`. Use
`RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE=0` only to isolate a
different failing release gate; never use that override for release sign-off.

- Smoke tag trigger:

```bash
TAG="rc-smoke-$(date +%Y%m%d-%H%M%S)" && git tag "$TAG" && git push origin "$TAG"
```

- Delete smoke tag:

```bash
git push origin ":refs/tags/$TAG" && git tag -d "$TAG"
```

## Release-Candidate Tag Policy
- Use `rc-*` tags for release candidates.
- `.github/workflows/release-preflight.yml` runs automatically when an `rc-*` tag is pushed.
- Keep `workflow_dispatch` and `workflow_call` for dry runs or manual retries, but treat pushed `rc-*` tags as the canonical automated preflight trigger.

## Workflow Guide
| Workflow | Primary use | Trigger | Notes |
| --- | --- | --- | --- |
| `.github/workflows/quality-gate.yml` | Manual smoke or reusable backend/app regression gate | `workflow_dispatch`, `workflow_call` | Best for interactive validation or a parent workflow that wants to skip some expensive sections. |
| `.github/workflows/release-preflight.yml` | Release-candidate preflight | push tag `rc-*`, `workflow_dispatch`, `workflow_call` | Enforces the live structural canary and `RUN_QUALITY_GATE=1` before iPhone preflight. |
| `rc-smoke-*` disposable tag | One-off trigger smoke | temporary pushed tag | Use only for validating the automated release-preflight trigger path, then delete it. |

## Repo Settings Checklist
- Protect the `rc-*` tag pattern in repository settings.
- Limit `rc-*` tag creation to release maintainers.
- Make sure the checked-in GitHub Actions workflows have access to:
  - `OPENAI_API_KEY`
  - `APP_TOKEN_RELEASE`
  - `DEVELOPMENT_TEAM_ID`
- Set repository variables `BACKEND_URL` and `PRIVACY_POLICY_URL` only when they match the values intended to ship. The wrapper rejects a privacy URL that differs from `Info-Release.plist`.
- Confirm Actions permissions are sufficient for artifact upload and summary output.

## Release Sequence
1. Confirm local build and config are ready with `node scripts/release_config_status.mjs`.
2. Confirm the human-owned Email Address privacy declaration, iOS Sign in with Apple entitlement/capability, production public surfaces, and AppIcon are approved.
3. Run `scripts/run_release_preflight.sh` locally and confirm the live backend/privacy policy, full quality gate, and clean iPhone Release build are green.
4. Push an `rc-*` tag to trigger `.github/workflows/release-preflight.yml`.
5. Review the Actions summary and any uploaded failure artifacts:
   - `/tmp/them-quality-gate-backend.log`
   - `/tmp/them_release_preflight_build.log`
6. Only move on to signed archive, Validate App, physical-iPhone TestFlight smoke, and App Store Connect review once the workflow is green.

## Manual Trigger Smoke
- Use a disposable tag name when you want to verify the automatic `rc-*` trigger path without creating a real release candidate.
- Example:

```bash
TAG="rc-smoke-$(date +%Y%m%d-%H%M%S)"
git tag "$TAG"
git push origin "$TAG"
```

- After the workflow starts and you have what you need, remove the test tag from the remote and your local clone:

```bash
git push origin ":refs/tags/$TAG"
git tag -d "$TAG"
```

- Do not reuse a previous smoke tag name. A fresh tag keeps the release-preflight run history easy to read.

## Commit And Release Checklist
1. Confirm `git status` does not include `them/Release.local.env` or `them/Release.local.xcconfig`.
2. Run `scripts/run_release_preflight.sh`.
3. Push an `rc-*` tag, or use the disposable `rc-smoke-*` path if you are only testing automation.
4. Open the workflow `Summary` tab first, then inspect uploaded artifacts if the run is red.
5. If you used a disposable smoke tag, delete it from the remote and your local clone after verification.

## Human Clearance Boundary

Automation stops until a release owner:

1. Reviews and approves the branch's Email Address declaration in `PrivacyInfo.xcprivacy` plus the Tier-3 auth/release PR.
2. Enables Sign in with Apple for `io.them.them` in the Apple Developer portal, creates/approves a dedicated iOS entitlement containing `com.apple.developer.applesignin = [Default]`, regenerates provisioning, and wires it only to iPhone Release. Do not reuse the macOS sandbox entitlement file.
3. Deploys the backend using `backend/DEPLOY.md`: provision Postgres, apply every migration, deliberately establish the canonical auth-store marker, keep V1 at one instance, and set `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `APP_TOKEN`, and `AUTH_APPLE_AUDIENCE`. Backend `APP_TOKEN` must match app `APP_TOKEN_RELEASE`.
4. Publishes `https://api.them.io` and the privacy URL in `Info-Release.plist` as direct HTTP 200 io.them surfaces without redirects or parked-domain content.
5. Supplies the Apple Team ID and repository secrets named above without committing or pasting them into tickets. `APP_TOKEN_RELEASE` ships inside the app and is extractable, so it is an app-install identifier—not a user secret or sole authorization boundary.
6. Approves/replaces the generated icon and completes App Store privacy, export-compliance, screenshots, URLs, review-contact, and App Review account metadata.
7. Produces a signed archive, runs Validate App, installs the TestFlight build on a physical iPhone, verifies real Apple and email authentication plus Keychain opt-in/opt-out, completes the five manual flows, exports Launch Doctor proof, and records signoff. The DEBUG `.invalid` credentials are not a production or Apple-login account.

## Related Files
- `.github/workflows/quality-gate.yml`
- `.github/workflows/release-preflight.yml`
- `them/Release.local.env.example`
- `scripts/release_config_status.mjs`
- `scripts/run_release_preflight.sh`
- `them/QUALITY_GATE.md`
- `them/APP_STORE_SUBMISSION_CHECKLIST.md`
