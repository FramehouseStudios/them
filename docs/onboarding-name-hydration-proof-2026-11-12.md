# Unfinished onboarding input survives account hydration — 2026-11-12

**VERIFIED:** source fix `1a96f142e039436010e0d3b05e1d2f928ddb61a8`; preserving CI merge `71693e0ad4b379cbf248a325a7457b7f95d6ceba`. Neither is a main merge or deployment. This supersedes the named-account/held-login uncertainty in the earlier onboarding checkpoint; it does not establish the complete physical-phone journey.

## Root cause and connected fix

A cancelled action A could finish signing in while the writer was editing replacement form B. Action IDs correctly prevented A from submitting B, but account hydration independently published A's stored preferred name. Root treated that name as completed onboarding and removed B's unfinished form. A real held-login HTTP/UI sequence reproduced the removal after both the named 201 session response and independent hydration witness reached the app.

The existing evolution store now defers only remote preferred-name hydration while the form owns edited input. Both name and premise bindings register a stable weak owner before changes, including restored input. Authentication and other profile fields continue to hydrate; explicit writer completion remains connected. Untouched-account restoration still works, and abandoned forms cannot retain the hold forever. No new Root state or parallel auth/persistence store was added.

The isolated store cases exposed four deallocation crashes on this Xcode26.3/Swift6.2.4/iOS26.2 combination. The store now uses the same `nonisolated deinit {}` compatibility pattern already present in BackendClient/latency telemetry. The relevant crash stacks and all failed native results are retained; assertions were not weakened. The native keyboard helper also stops using a swipe across keys, which had entered QuickPath text during setup.

## Proof actually executed

Owned simulator `81F0FF38-9DAD-4011-907B-357DFADD094C`, erased before signed native runs. No signing-disabled test invocation.

| Boundary | Actual result | Qualification |
| --- | --- | --- |
| Causal held-login regression, before fix | 0 pass / 1 fail / 0 skip | Unfinished replacement form removed; named201 and independent cue consumed |
| Identical regression body, after fix | 1 / 0 / 0 | Exact replacement name/premise remain visible; named201 and cue consumed; no unexpected write or outbound provider attempt |
| Initial complete units | 1599 / 4 / 0 | Four new store-deallocation crashes, not suppressed |
| Complete units after compatibility repair | 1603 / 0 / 0 | Actual signed native result |
| macOS scaffold | build exit0 | Established ad-hoc Debug scaffold; compile only; timing profile captured in the same build |
| Combined CI contracts | 18 / 0 / 0 | Host Node26.7.0; fake shell/resolver propagation is not hosted/native proof |
| Syntax/YAML/Bash/diff | pass | Controller/contracts parsed; unique YAML keys; workflow shell syntax |
| D009 vs actual published backup96360f93 | pass, all five deltas0 | First command's unsupported `--base` compared main; retained separately and corrected via canonical GITHUB_BASE_REF |
| Backend regression | inherited3121 / 0 / 5 on Node20.20.2 | Core lib/index/deps/backend tests unchanged from T1411; new eval files mean no whole-backend-tree identity or rerun claim |

Five backend skips comprise four PostgreSQL-URL-dependent cases and one preview-header case. Earlier dedicated PostgreSQL/Redis proof is separate. Three UI setup failures are retained separately: unsafe keyboard gesture, keyboard-occluded field navigation, and an observer expecting200 instead of canonical201. Those are not counted as causal product regressions. Native navigation/observer were corrected before obtaining the causal red. The final regression body is byte-identical red-to-green. Other complete UI workflows were not rerun for the CI-only merge.

The required held-login CI step is connected after offline recovery and before voice/macOS. Local mode still requires the exact owned simulator and absolute DerivedData; CI may reuse the already warmed default DerivedData. Provider credentials remain excluded; required native assertions and the fixture are unchanged. New hosted execution of this step is not yet proven.

## Exact changed files

- App fix: `them/HerEvolutionStore.swift`, `them/MagicMomentOnboardingFlow.swift`, `them/RootExperienceView.swift`.
- Native regression/keyboard fix: `themTests/HerEvolutionOnboardingOwnershipTests.swift`, `themUITests/V1SmokeUITests.swift`.
- CI-only integration: `.github/workflows/quality-gate.yml`, `backend/evals/run_onboarding_hydration_owner_ui_smoke.mjs`, `scripts/ci_merge_safety.test.mjs`.
- Regression preparation inherited from816: `backend/evals/onboarding_hydration_owner_fixture.mjs`, the controller and the new held-login UI case. Original Zora and Luna commits remain ancestors.
- This proof document, previous-checkpoint pointer and TASKS are documentation only. The unrelated untracked `backend/node_modules` link is preserved and excluded.

## Adversarial review and limits

Answered locally: late old login cannot remove replacement fields; weak ownership survives replacement/release; untouched account restore and explicit completion remain effective; other metadata hydrates. Outbound evolution payloads omit an empty preferred name, and the backend retains the previous server name rather than clearing it. Zora performed read-only source review; no human review is implied.

Not proven: all-field onboarding durability after post-auth close/relaunch; separate talk-result name ingress; existing cross-window explicit-completion coupling; real Apple sign-in, microphone/model/generated page/rewrite, physical iPhone or the intended shipping backend. The deterministic HTTP fixture does not prove these live behaviors. No paid model calls were made. Production hold is unchanged.

## GitHub frontier and next action

Original#964 ca019af2: backend2752/0/2, D009 green; signed units633 executed/0 failures and V1 28/0/9 passed. Final voice stage exited70 before test execution because Xcode reported the exact erased/booted simulator unavailable; voice0 executed, macOS not reached. This is a red gate with an unproven host-service cause, not a voice assertion failure. Do not advance#979 while it remains red. Original#997 f68eb60f had backend3042/0/5, D009/units/writer/V1/offline recovery steps green; final voice/macOS still running at the last check. No all-green claim.

The earlier original#987 To Page assertion is still unresolved; Pin remained selected after Prepare for Page. Current metadata diagnostics do not identify whether delivery, exchange lookup or a later route write failed. The preserved1267 parent also has568 commits beyond main and no matching PR; do not replace or retarget that history wholesale. Details: `integration-frontier-2026-11-12.md`.

Preserved local evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1427-onboarding-name-hydration-20261112/proof.json`, `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1430-onboarding-gate-20261112/`, and `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1429-integration-frontier-20261112/`. The latter now retains the original#987 native artifact ZIP and ancestry classification as well as the logs. Source hashes bind the proof to the committed fix. Xcode human account sign-in and physical device/backend access remain external prerequisites; no credential entry, main push, force-push, replacement PR, protection bypass or production change occurred.
