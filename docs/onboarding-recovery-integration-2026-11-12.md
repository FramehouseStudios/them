# Onboarding, recovery and writer integration — 2026-11-12

## Current result and boundaries

VERIFIED: preserved original #422 `6a5010eeede3d5edb482287d548f66fd0a9da366` in a no-ff integration, retained the published writer/backend custody work, and repaired two onboarding/authentication ownership problems. Current app sources are exactly those tested at `cd8e95ecdb12925707a099b04997ee413c3f10e3`. Subsequent preserving merge `443b38bfed774a17eafc3d69741be0a0f57f795d` adds the published #964 CI provider-approval fence; `bd4096a3` adapts its isolated shell fixture to the existing child runner contract. Neither changes app/backend/package/project sources.

Main and production are unchanged. Local HTTP responses are synthetic, with authentication required; they establish deterministic plumbing and persistence, not Clementine's actual model, microphone or real-phone behavior. No fresh paid provider call was authorized or made locally. Historical hosted billing is unknown.

## Root causes and changes

1. Original onboarding intent could be lost across sign-in. The existing onboarding flow is extracted from Root into its feature view, retaining captured name/scene/voice input, accessible narrow layouts, account-before-write routing, cancellation and once-only resumption. Existing protected input scope and project custody remain connected. Original #422 history and proof document are preserved, not replaced.
2. The activated DEBUG resume fallback ran after a stored-credential journey deliberately returned no automation override. An early canonical stored-mode guard now governs both fallback paths. Production bootstrap identity persistence uses the same policy helper exercised by tests, inside the existing auth-state queue and epoch/deletion checks. Release uses the same persistence closure; no second auth store is added.
3. A late account callback for cancelled action A could consume or dismiss replacement action B. Each captured action now owns a UUID, even for identical payloads. Account presentation/dismissal, restore completion and consumption carry that owner. Stale callbacks still reconcile committed authentication, then cannot consume, cancel or show failure UI for a newer action. The held-old-login HTTP/UI race itself has not been injected; source wiring and five production-policy state sequences cover this boundary.
4. Earlier export failure was a partially clipped drawer control reported as hittable by XCTest. Four existing export actions now use the established full-frame reveal helper; no assertion or product action was removed. The green isolated export and actual Files/Quick Look observation are recorded separately in `docs/external-export-proof-2026-11-12.md`.
5. The CI fence removes job-wide provider credentials and incidental warmup. Child recovery/D009 gates survive the merge. The isolated test fixture initially omitted the newer canonical recovery contract; copying its real existing scripts fixes that fixture without stubbing or disabling the production check.

## Proof actually executed

Owned simulator: `81F0FF38-9DAD-4011-907B-357DFADD094C`, iPhone 17 Pro / iOS 26.2, Xcode 26.3. Canonical proof runs erased that exact device; signing stayed enabled.

| Boundary | Result | Qualification |
| --- | --- | --- |
| Stored-auth regression before guard | 1 test, 1 failure, 0 skips | Two expected assertions; real native failure retained |
| Auth/onboarding focused cohort after repair | 75 pass, 0 fail, 0 skip | Six matching classes; a seventh requested legacy class selector matched zero and is not counted |
| Current complete `themTests` | 1,599 pass, 0 fail, 0 skip | Actual signed native bundle at cd8 |
| First-run/auth/cancel/resume UI | 5 pass, 0 fail, 0 skip | Synthetic login/voice fixtures; no real Apple or microphone claim |
| Current authenticated writer loop | 1 pass, 0 fail, 0 skip | Create, write, save, export-return, relaunch/restore; local backend |
| Current offline/auth/conflict recovery UI | 3 pass, 0 fail, 0 skip | Reconnect, actual local expired-auth refresh, retained conflict/relaunch choice |
| Current voice-fault UI | 1 pass, 0 fail, 0 skip | Deterministic fault recovery, not live speech synthesis |
| macOS scaffold | BUILD SUCCEEDED | Compile only |
| Backend Node20.20.2 | 3,121 pass, 0 fail, 5 skip | Inherited unchanged full backend tree `9f46fee2f4b8ea96941c9e6028a37e3a61f85d15` from T1411; not rerun for Swift/CI-only changes |
| Export component | Earlier red 0/1/0 → green 1/0/0 | Exact 103-byte Markdown opened in Files Quick Look outside THEM; component observation predates cd8, not a new current full journey |
| Child CI fixture | Earlier 16 pass/2 fail/0 skip → 18/0/0 | Missing contract-script fixture fixed; no native/provider invocation |
| D009 vs genuine published backup e1c6e10b | pass | Root −122, BackendMemoryAPI −8, other three zero; index 33,502 lines |
| YAML / diff | pass | Both workflow mappings checked for duplicate keys; scoped diff clean |

Backend skips: four PostgreSQL-URL-dependent cases and one preview-header case; earlier dedicated PostgreSQL/Redis persistence proof is retained separately and not represented as a new run. All native artifacts, earlier reds, hashes, conflict stages and manifests are preserved in `../_proof/T-1419-onboarding-integration-20261112/proof.json`; export evidence in `../_proof/T-1418-external-export-20261112/proof.json` and inherited backend in `../_proof/T-1411-combined-writer-20261112/proof.json`. Root's CI Node20 18/0/0 proof is in `../_proof/T-1421-ci-provider-approval-20261112`.

## Short adversarial check

- Answered locally: stored credentials outrank fixture fallback; epoch/deletion checks remain inside the auth queue; stale action callbacks cannot consume replacement intent; queue recovery restores exact words through tested reconnect/auth/conflict paths.
- Partially covered: normal cancel/relaunch and once-only first-run UI pass, but a held old network login completing during a replacement action is policy/source proof rather than injected UI proof.
- Not covered: successful real device authentication/unlock and recovery resume. A native passcode challenge was observed and cancelled without entering credentials or revealing protected input. No bypass or successful-unlock claim.
- Not covered: physical iPhone speech, relevant complete real-model reply, precise live rewrite, intended shipping backend or production deployment. These remain goal requirements.

## Files and next work

Application: `them/AppShell.swift`, `them/BackendAuthDebugSessionPolicy.swift`, `them/BackendMemoryAPI.swift`, `them/IOThemRuntime.swift`, `them/MagicMomentOnboardingFlow.swift`, `them/RootExperienceView.swift`.

Native checks: `themTests/BackendAuthDebugSessionPolicyTests.swift`, `themTests/IOThemRuntimeTests.swift`, `themTests/ThemWorkspaceNavigationCommandTests.swift`, `themUITests/V1SmokeUITests.swift`.

CI: `.github/workflows/quality-gate.yml`, `.github/workflows/eval-gate-postgres.yml`, `scripts/ci_merge_safety.test.mjs`; proof docs and TASKS only otherwise. No dependency, key, signing material, unrelated cache link or accepted decision was changed.

Next: publish the coherent backup normally; carry the same fence into prepared original #997 and require its fresh hosted checks; retain the human's deferred non-author #964 review and all branch protections. Prepare the physical phone with an explicitly identified authorized backend, and request fresh, narrow paid-call authorization only when that observed journey is ready. Preserve Clementine, the orb, D017 and the production hold. The goal remains active, not complete.
