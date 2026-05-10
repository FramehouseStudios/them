# Quality Gate Enforcement (Release Preflight)

This doc covers the **CI-side enforcement** of `RUN_QUALITY_GATE` for release-candidate builds. The application-side companion at `them/QUALITY_GATE.md` covers the iOS preflight script's controls and policy. The two should stay aligned.

## Policy

Every release-candidate workflow run **must** execute the backend quality gate before producing a build. A release that ships without backend regression coverage is a release that ships blind.

This is enforced in `.github/workflows/release-preflight.yml`:

- `RUN_QUALITY_GATE: 1` lives in the workflow `env:` block, so the value is set for every step in the job.
- A dedicated **`Verify Quality Gate Was Enforced`** step runs after `bash ./scripts/appstore_preflight.sh`. It fails the build with `::error::` annotations if either condition is false:
  1. `RUN_QUALITY_GATE != "1"` at the time of verification.
  2. `/tmp/them-quality-gate-backend.log` is missing or empty (the gate produced no evidence).

The verification step exists so that an accidental edit to the workflow `env:` block, or a regression in `scripts/appstore_preflight.sh` that silently skips the gate, fails the build instead of producing a green run.

## How releases are triggered

Two valid triggers for `release-preflight.yml`:

1. **`rc-*` tag push** — push a tag matching `rc-*` (e.g. `rc-2026-05-09-1`) to origin. The workflow runs automatically.
2. **Manual `workflow_dispatch`** — trigger from the GitHub Actions UI. Same enforcement applies.

Both paths use the same `env:` block; both run the verification step.

## Verifying the policy is alive

To confirm enforcement is actually in place after a workflow change:

```bash
# Push a no-op smoke tag
git tag rc-smoke-$(date +%Y%m%d-%H%M%S)
git push origin --tags

# Watch the workflow run
gh run watch
```

In the run summary, the `Verify Quality Gate Was Enforced` step must report a non-zero `gate_size`. If it does not, the release is not safe to ship.

## Required secrets

The workflow fails fast (before invoking the script) if either secret is missing:

- `OPENAI_API_KEY` — required by prompt regression and talk recovery checks inside the gate.
- `APP_TOKEN` — required by speculative reuse, smoke, and ops alert checks.

Both are listed under `secrets:` for `workflow_call` consumers as well.

## Relationship to the iOS-side QUALITY_GATE.md

`them/QUALITY_GATE.md` documents:

- The application-side preflight script (`scripts/appstore_preflight.sh`) and its env-controlled knobs.
- The default policy that the script keeps `RUN_QUALITY_GATE` opt-in for *local* invocations.

This document (`docs/quality-gate-enforcement.md`) documents:

- The **CI-side** enforcement: the workflow always sets `RUN_QUALITY_GATE=1`, and the verification step ensures the gate actually ran.

Local developers may run the script with the gate off for fast iteration. CI must not. Both files should reference each other and stay current.

## Rollback

To diagnose a verification-step false-positive:

1. Check `release-preflight-failure-logs` artifact for `/tmp/them-quality-gate-backend.log`.
2. If the file is genuinely empty, the gate skipped — investigate `scripts/appstore_preflight.sh` and `scripts/quality_gate.sh` for a regression.
3. If the file is large but the verification step still failed, the verification step itself has a bug — file a follow-up against `release-preflight.yml`.

Do **not** fix verification by removing the verification step. Fix the gate.
