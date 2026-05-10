# io.them Quality Gate

Last updated: 2026-03-27

## Purpose
- `/Users/halfmutantfilms/Desktop/io.them/them/scripts/quality_gate.sh` is the main backend/app gate entrypoint.
- `/Users/halfmutantfilms/Desktop/io.them/them/backend/package.json` exposes `eval:gate` for the npm-side suite.
- `eval:speculative-reuse` is part of the gate path and should be treated as a standard regression check for speculative `/talk` prepare/reuse behavior.

## Default Policy
- `RUN_QUALITY_GATE` stays opt-in for `/Users/halfmutantfilms/Desktop/io.them/them/scripts/appstore_preflight.sh`.
- Reason: App Store preflight should stay focused on release build, signing, entitlements, privacy manifest, and plist correctness by default.
- Release automation and checked-in CI should prefer `RUN_QUALITY_GATE=1` when invoking `/Users/halfmutantfilms/Desktop/io.them/them/scripts/appstore_preflight.sh` so a release candidate does not skip backend gates by accident.
- Checked-in release automation template: `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml`
- Release trigger policy: `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml` stays manually callable and reusable, and now also runs on push tags matching `rc-*`. Use a protected `rc-*` tag pattern for release candidates.
- CI enforcement details live in [docs/quality-gate-enforcement.md](../docs/quality-gate-enforcement.md). The release workflow includes a `Verify Quality Gate Was Enforced` step after preflight; it fails if `RUN_QUALITY_GATE` is not `1` or `/tmp/them-quality-gate-backend.log` is missing or empty.
- When you want a single command that includes backend quality checks first, use:

```bash
cd /Users/halfmutantfilms/Desktop/io.them/them
RUN_QUALITY_GATE=1 ./scripts/appstore_preflight.sh
```

## Gate Controls
- `RUN_EVAL=1`
  - Runs the prompt regression suite.
- `RUN_SPECULATIVE_REUSE_GATE=1`
  - Runs `npm run eval:speculative-reuse`.
- `RUN_SMOKE=1`
  - Runs `npm run smoke`.
- `RUN_TALK_RECOVERY_GATE=1`
  - Runs the talk recovery contract test.
- `RUN_ALERT=1`
  - Runs ops alert checks.
- `RUN_LOAD=1`
  - Runs the load profile.

## Required Secrets
- `OPENAI_API_KEY`
  - Required when prompt regression or talk recovery stays enabled.
  - With the current default workflow settings, both `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/quality-gate.yml` and `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml` expect it.
- `APP_TOKEN`
  - Required when speculative reuse, smoke, or ops alert checks stay enabled.
  - With the current default workflow settings, both checked-in workflows expect it.
- If you manually disable the dependent sections in `quality-gate.yml`, you can relax the corresponding secret requirement for that run.
- Both checked-in workflows now fail fast with a short Actions summary if the required secrets are missing, before dependency install or shell-script execution begins.
- If another workflow calls these via `workflow_call`, pass the secrets explicitly or use `secrets: inherit`.

## Invocation Matrix
| Mode | Entry point | Default expectation | Recommended env |
| --- | --- | --- | --- |
| Local | `/Users/halfmutantfilms/Desktop/io.them/them/scripts/quality_gate.sh` | Run the whole backend/app gate directly when you want full regression coverage. | `RUN_SERVER=1` if the backend is not already running. |
| CI gate | `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/quality-gate.yml` | Use the checked-in workflow template as the repo-owned gate path. Manual runs can skip expensive sections with workflow inputs instead of editing YAML. | `OPENAI_API_KEY`, `APP_TOKEN`, `RUN_SERVER=1` |
| Release automation | `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml` | Enforce `RUN_QUALITY_GATE=1` when running macOS release preflight in automation. Auto-runs on `rc-*` tags and stays callable manually. | `OPENAI_API_KEY`, `APP_TOKEN`, `RUN_QUALITY_GATE=1` |
| Release preflight | `/Users/halfmutantfilms/Desktop/io.them/them/scripts/appstore_preflight.sh` | Keep local preflight opt-in, but default release automation to include the gate first. | `RUN_QUALITY_GATE=1` |

## Common Commands
- Full quality gate:

```bash
cd /Users/halfmutantfilms/Desktop/io.them/them
./scripts/quality_gate.sh
```

- Quality gate without prompt regression:

```bash
cd /Users/halfmutantfilms/Desktop/io.them/them
RUN_EVAL=0 ./scripts/quality_gate.sh
```

- Quality gate without speculative reuse:

```bash
cd /Users/halfmutantfilms/Desktop/io.them/them
RUN_SPECULATIVE_REUSE_GATE=0 ./scripts/quality_gate.sh
```

- NPM gate path:

```bash
cd /Users/halfmutantfilms/Desktop/io.them/them/backend
npm run eval:gate
```

## Desktop and iOS App Tests
- Use these commands for the shared app/unit-test gate after client changes. macOS local tests disable code signing because the Debug app host has sandbox entitlements but local CI does not require a development certificate.

```bash
cd /Users/halfmutantfilms/Desktop/io.them
xcodebuild -project them.xcodeproj -scheme them -configuration Debug -sdk macosx -destination "platform=macOS" -derivedDataPath /tmp/io-them-mac-tests CODE_SIGNING_ALLOWED=NO test
```

```bash
cd /Users/halfmutantfilms/Desktop/io.them
xcodebuild -project them.xcodeproj -scheme them -configuration Debug -sdk iphonesimulator -destination "platform=iOS Simulator,name=iPhone 17" -derivedDataPath /tmp/io-them-ios-tests test
```

## CI / External Pipelines
- Checked-in workflow template: `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/quality-gate.yml`
- Checked-in release automation template: `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml`
- `quality-gate.yml` workflow inputs mirror the main gate toggles:
  - `run_eval`
  - `run_speculative_reuse_gate`
  - `run_smoke`
  - `run_talk_recovery_gate`
  - `run_alert`
  - `run_load`
- Both checked-in workflows now write a short Actions step summary that makes enforced vs skipped sections visible from the run UI.
- On failure, the checked-in workflows upload the most useful local logs as CI artifacts:
  - `/tmp/them-quality-gate-backend.log`
  - `/tmp/them_release_preflight_build.log`
  - `/tmp/them-smoke/them-home.png`
- The Studio visual smoke screenshot path is now part of both checked-in failure artifact bundles when that file exists, so a failed `eval:studio-voice-visual` run can be debugged from CI instead of only from a local terminal.
- `release-preflight.yml` also runs automatically on push tags matching `rc-*`. Protect that tag pattern in repo settings if you want only release maintainers to trigger it.
- Release-candidate policy and repo-settings notes now live in `/Users/halfmutantfilms/Desktop/io.them/them/RELEASE_RUNBOOK.md`.
- If your CI lives outside the repo, use `/Users/halfmutantfilms/Desktop/io.them/them/scripts/quality_gate.sh` as the source of truth for gate env vars.
- At minimum, external CI should document:
  - `RUN_EVAL`
  - `RUN_SPECULATIVE_REUSE_GATE`
  - `RUN_SMOKE`
  - `RUN_TALK_RECOVERY_GATE`
  - `RUN_QUALITY_GATE`
- If external CI also drives release preflight, set `RUN_QUALITY_GATE=1` before invoking `/Users/halfmutantfilms/Desktop/io.them/them/scripts/appstore_preflight.sh`.

## Reusable Workflow Example
- Example caller that reuses `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/quality-gate.yml` with a reduced scope:

```yaml
jobs:
  fast-gate:
    uses: ./.github/workflows/quality-gate.yml
    with:
      run_eval: false
      run_speculative_reuse_gate: true
      run_smoke: true
      run_talk_recovery_gate: false
      run_alert: false
      run_load: false
    secrets: inherit
```

- Use `secrets: inherit` when the caller already has `OPENAI_API_KEY` and `APP_TOKEN` in scope.
- If you do not want to inherit everything, pass only the required secrets explicitly via `workflow_call`.

## Common Caller Patterns
| Pattern | When to use it | Example shape |
| --- | --- | --- |
| Full gate via `secrets: inherit` | A parent workflow wants the repo-default gate behavior without repeating every secret. | Call `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/quality-gate.yml` and use `secrets: inherit`. |
| Reduced gate via explicit inputs | A parent workflow wants to skip expensive sections like prompt eval or talk recovery. | Call `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/quality-gate.yml` with `run_eval: false`, `run_talk_recovery_gate: false`, and any other needed toggles. |
| Release preflight via explicit required secrets | A parent workflow wants to delegate release preflight but keep secret flow explicit. | Call `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml` and pass `OPENAI_API_KEY` plus `APP_TOKEN` under `secrets:`. |

## Reusable Release Workflow Example
- Example caller that reuses `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml` and passes the required secrets explicitly:

```yaml
jobs:
  rc-preflight:
    uses: ./.github/workflows/release-preflight.yml
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      APP_TOKEN: ${{ secrets.APP_TOKEN }}
```

- Use this pattern when a parent workflow should own the trigger but still delegate the actual release preflight to the checked-in reusable workflow.
- `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml` requires both secrets when called via `workflow_call`.

## CI Troubleshooting
- Missing secrets before the gate starts:
  - Look for `Status: failed before gate execution` or `Status: failed before preflight execution` in the Actions summary.
  - Fix `OPENAI_API_KEY` and/or `APP_TOKEN` in repo secrets, or pass them explicitly when using `workflow_call`.
- Backend/app gate failed after startup:
  - Open the uploaded artifact that contains `/tmp/them-quality-gate-backend.log`.
  - Expected contents: backend boot logs, eval/smoke startup output, and the last backend-side failure lines before the gate stopped.
  - Use the Actions summary to see which sections were enforced for that run.
- Studio visual smoke failed:
  - Open the uploaded screenshot at `/tmp/them-smoke/them-home.png` from the failure artifact bundle.
  - Expected contents: the live Studio draft page during the voice visual smoke, including whether draft text appeared before playback finished.
  - Use this first when the failure is visual/layout/timing rather than backend boot or build output.
- Release preflight build failed:
  - Open the `release-preflight-failure-logs` artifact and inspect `/tmp/them_release_preflight_build.log`.
  - Expected contents: the Release macOS build output from `appstore_preflight.sh`, including signing, entitlement, plist, or build-system errors.
  - Cross-check the Actions summary to confirm the run came from an `rc-*` tag versus a manual retry.
- Duplicate runs on the same ref:
  - Both checked-in workflows now use `concurrency` and cancel older in-progress runs for the same ref.
  - If a run was auto-cancelled, continue from the newest run on that branch or tag.

## Related Files
- `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/quality-gate.yml`
- `/Users/halfmutantfilms/Desktop/io.them/them/.github/workflows/release-preflight.yml`
- `/Users/halfmutantfilms/Desktop/io.them/them/RELEASE_RUNBOOK.md`
- `/Users/halfmutantfilms/Desktop/io.them/them/scripts/quality_gate.sh`
- `/Users/halfmutantfilms/Desktop/io.them/them/scripts/appstore_preflight.sh`
- `/Users/halfmutantfilms/Desktop/io.them/them/APP_STORE_SUBMISSION_CHECKLIST.md`
- `/Users/halfmutantfilms/Desktop/io.them/them/backend/package.json`
