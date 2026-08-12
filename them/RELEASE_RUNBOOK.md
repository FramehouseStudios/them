# io.them Release Runbook

Last updated: 2026-05-28

## Operator Quick Path
- Prepare ignored local release config:

```bash
cp them/Release.local.env.example them/Release.local.env
chmod 600 them/Release.local.env
```

- Fill `DEVELOPMENT_TEAM_ID` and `APP_TOKEN_RELEASE` in `them/Release.local.env`.
- Keep `BACKEND_URL=https://api.them.io` unless the hosted release backend changes.
- Check secret-safe release config status:

```bash
node scripts/release_config_status.mjs
```

- Local release preflight:

```bash
scripts/run_release_preflight.sh
```

This wrapper proves Clementine's adaptive writer-block rescue on iPhone and
macOS, the live backend URL, the production Mac desktop archive, and the iPhone
App Store preflight path. Use
`RUN_MAC_DESKTOP_PREFLIGHT=0` only for a deliberately iPhone-only local
diagnostic run. Use `RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE=0` only to isolate a
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
| `.github/workflows/release-preflight.yml` | Release-candidate preflight | push tag `rc-*`, `workflow_dispatch`, `workflow_call` | Enforces `RUN_QUALITY_GATE=1` before iPhone and Mac desktop preflight. |
| `rc-smoke-*` disposable tag | One-off trigger smoke | temporary pushed tag | Use only for validating the automated release-preflight trigger path, then delete it. |

## Repo Settings Checklist
- Protect the `rc-*` tag pattern in repository settings.
- Limit `rc-*` tag creation to release maintainers.
- Make sure the checked-in GitHub Actions workflows have access to:
  - `OPENAI_API_KEY`
  - `APP_TOKEN`
- Confirm Actions permissions are sufficient for artifact upload and summary output.

## Release Sequence
1. Confirm local build and config are ready with `node scripts/release_config_status.mjs`.
2. Run `scripts/run_release_preflight.sh` locally and confirm Clementine's paired Studio writer-block smoke, live backend, Mac desktop archive, and iPhone preflight checks are green.
3. Push an `rc-*` tag to trigger `.github/workflows/release-preflight.yml`.
4. Review the Actions summary and any uploaded failure artifacts:
   - `/tmp/them-quality-gate-backend.log`
   - `/tmp/them_release_preflight_build.log`
5. Only move on to archive/upload once the release-preflight workflow is green.

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
1. Confirm `git status` does not include `them/Release.local.env`.
2. Run `scripts/run_release_preflight.sh`.
3. Push an `rc-*` tag, or use the disposable `rc-smoke-*` path if you are only testing automation.
4. Open the workflow `Summary` tab first, then inspect uploaded artifacts if the run is red.
5. If you used a disposable smoke tag, delete it from the remote and your local clone after verification.

## Related Files
- `.github/workflows/quality-gate.yml`
- `.github/workflows/release-preflight.yml`
- `them/Release.local.env.example`
- `scripts/release_config_status.mjs`
- `scripts/run_release_preflight.sh`
- `them/QUALITY_GATE.md`
- `them/APP_STORE_SUBMISSION_CHECKLIST.md`
