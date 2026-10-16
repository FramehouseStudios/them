# T-953 — Required gates and queued-draft recovery

Advances goal1 (preserved words), goal6 (account/project boundaries) and goal7
(honest integration proof). This is rehearsal evidence, not merged-main,
production-provider, physical-phone or release readiness evidence.

## Preserved provenance

- Parent: T-952 `bd82781e5119446cd85ae9292e440eeca12414f7`.
- Original #904 complete head: `a27c75a85309e8557163b009baf6e1573d403a0d`.
  Preserved with conflict-free `--no-ff` merge `08d0f38b`. No original-head
  rewrite, replacement PR, squash or main merge.
- #904 owns the required signed smoke gates and recovery fixes. Its complete
  follow-ups are retained, including queued hydration before server loading,
  conflict-copy preservation, auth-ready fixtures and exact original-line checks.

## Root causes and corrections

- The #942 hosted success badge hid a V1 profile failure and an exit65 voice
  fault command behind `continue-on-error`. Original #904 makes those steps
  required. Preserve their failed logs; do not promote the old badge to proof.
- Actual queued hydration could resume after the writer switched project or
  advanced auth intent, and adopt project A's queued words into the new context.
  A suspended real-view-model test reproduced that insertion (0pass/1fail).
  The production method now captures and rechecks auth generation, actual
  selected project and entry owner after lookup. Its injection seam defaults
  to the existing shared outbox; no second persistence implementation.
  Verified app/test correction committed locally as `c9028731`.
- Local smoke discovery could erase an arbitrary first iPhone. Outside CI the
  canonical runner now requires an explicit owned simulator before any erase.
  A fake-tool regression initially failed because the old runner returned0.
  Boot failure now stops proof rather than continuing with unknown state.
- Voice/save wrappers now delegate their signed iPhone execution, erase,
  timeouts and bundle handling to the same existing V1 runner. Failure exit
  codes propagate. No unsigned iPhone tests or retries were introduced.
- The recovery orchestrator no longer blocks its backend pipe-draining event
  loop for a multi-minute synchronous Xcode call. It checks authoritative
  xcresult totals, rejects skips/empty selection, and retains unique bundles
  under ARTIFACT_DIR, RUNNER_TEMP or the local temp directory. CI uploads that
  same location. The Mac bundle is checked too when that optional path is run.
- The required writer-loop orchestrator had the same blocking wait and deleted
  its result bundle even on failure. It now drains output asynchronously,
  retains unique result bundles and uploads them in CI. Fixture database/cache
  URLs are unset and embeddings/Muse disabled; no shipping credentials change.
- Final writer test removes the inherited fallback second Save tap. If the
  keyboard accessory is unavailable, dismiss the keyboard before the sole
  page-header tap; still require exactly one delivered action and one version.
  The final source passes without retrying a swallowed save action.

## Verification record

- Runner contracts: **15pass/0fail/0skip**; `/tmp/them-953-runners-final.log`.
  Negative cases use fake tools and did not erase any user simulator.
- Writer-loop summary/failure helpers: **6pass/0fail/0skip**;
  `/tmp/them-953-writer-helper.log`. Not a substitute for the UI journey.
- Signed full units: **695pass/0fail/0skip**;
  `/tmp/them-953-units.xcresult`. Earlier reproduced hydration failure remains
  in `/tmp/them-953-hydration-red.xcresult`; do not overwrite it.
- Authenticated localhost save recovery: **2pass/0fail/0skip**;
  `/var/folders/27/kqhcss0n7t1dh_fj2wn98ynm0000gn/T/them-save-recovery-3TNNEq/recovery-ios.xcresult`.
  Checks complete saved draft, idempotency key and exactly one recovered
  version after offline queue/relaunch; separately refreshes expired auth,
  holds a genuine competing version and applies explicit Keep Mine once.
  REQUIRE_USER_AUTH=1; synthetic localhost account; no model calls. Offline is
  an injected notConnectedToInternet at the DEBUG save boundary, not physical
  Airplane Mode. This does not prove OS termination timing or production DB.
  Fixture process uses host Node26.7.0; the full backend regression uses the
  separate pinned Node20.20.2 container. Do not conflate those environments.
- These signed tests used erased task-owned iPhone17Pro simulator
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS26.2/23C54, Xcode26.3.
- macOS scaffold **build** passed; `/tmp/them-953-mac.log`. This is not Mac UI
  proof. Its existing build-only signing configuration is unchanged.
- Final frozen-backend Node20.20.2: **2810pass/0fail/2skip**, offline mentor
  golden pass; `/tmp/them-953-backend-locked-node20.log`. Network disabled at
  Docker boundary. Skips: real PostgreSQL without DATABASE_URL, and opt-in
  live page-response fixture with RUN_LIVE_PAGE_TESTS=0. No paid live eval.
- Full signed V1 UI: **29pass/0fail/11skip**, 40 total;
  `/tmp/them-953-v1.xcresult` and `.log`, exit0. The remembered-login Keychain
  and realtime-fault cases both pass inside this full suite. Skips require
  their fixture orchestrators: seeded project restore; Home confirmed/raw
  audio pair; three cross-platform restore/canon/memory cases; integrated
  writer loop; two-device live sync; two outbox recovery cases; writer-block
  backend fixture. Recovery's two cases separately passed above. The writer
  fixture separately passed below; do not count its default-suite skip as proof.
- Authenticated writer journey: initially1/0/0, then final single-tap source
  **1pass/0fail/0skip**, separate erase, `/tmp/them-953-writer-single-tap.log`
  and `them-writer-loop-spRdN8/writer-loop.xcresult` under local temp. Creates
  a project through UI, types exact text, saves one server version, reports a
  Markdown export filename and restores exact text on relaunch. The final
  test-only change affects a case skipped by the earlier full V1 default run;
  other UI cases and production Swift source are unchanged. Hosted full-head
  proof still required. No real speech generation is in this fixture.
- Independent host read of the final simulator's exported Markdown verifies
  **59 exact bytes**, complete expected fixture, `/tmp/them-953-export-bytes.log`.
  This is the DEBUG local Markdown exporter, not shipping backend export,
  FDX/PDF, native share or a physical-phone external-file opening. Existing
  #868 `a6428e3d` and #941 `d59dac93` own native share/file-safety work; preserve
  them in order, do not build a competing export path. Current export UI only
  reports a temporary filename at this early rehearsal boundary.
- D009 and diff/shell/Node syntax checks pass. Current god-file counts:
  index33557, Studio17407, Root15024, bridge12926, MemoryAPI10846; none grew
  versus origin/main. Exact33603 is a later original-stack boundary, not a
  reason to insert filler or discard earlier safety fixes.
- Parent-relative D009 also passes: Studio17411->17407; other four unchanged.
- Completed red/green artifacts retained privately, outside Git:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-953-20261016.5wzSLK/`.

## Current external limits

Fresh GitHub check: main remains `647e01fcf17730d301aaa8a5072255ca7494c53c`.
#766 original head `f0c565c4` has successful required check conclusions but
still REVIEW_REQUIRED. #904 remains open at its original head. No approval
impersonation, protection change, remote deletion or main merge is authorized.

Shipping configuration points to `https://api.them.io` in BackendClient and
both production build settings. Fresh unauthenticated `/health` check returned
HTTP302, text/html, redirect `https://introvert.com/?domain=them.io`, not backend
JSON. No redirect was followed and no credential was sent. HUMAN_INPUT_REQUIRED
before shipping proof: the domain owner must route api.them.io to the intended
backend and confirm HTTPS health returns that backend's JSON; verify the actual
runtime/release configuration, not merely a healthy unrelated Render service.

The iOS26.2 local results do not clear the older hosted iOS26.5 failure's root
cause. A required exact-head hosted run remains necessary. No physical phone,
shipping backend, real microphone, paid-provider output, export parity (#80)
or full release is claimed here. Keep orb/Clementine intact. User currently
prefers local testing; do not repeatedly request their phone.

Source audit also confirms the early rehearsal still normalizes drafts for
queue identity. Existing #927 `1f7c6061` already replaces that with UTF-8 identity
and preserves exact returned save text; it is only seven original commits
beyond this rehearsal, via focused-editor/live-choice/#925 recovery work.
Review and preserve that safety chain next, ahead of #644. This is not a reason
to reimplement the existing fix or claim all exact-text paths safe today.

## Adversarial review

- Answered locally: switched project/auth intent during queued lookup rejects
  the delayed adoption; signed suspended-view-model regression and full units.
- Answered locally: queued save relaunch does not drop the seed text or create
  duplicate recovered versions; complete draft and idempotency assertions.
- Answered locally: actual competing server save is held until Keep Mine;
  expired-auth fixture refreshes before resolution; exact final version checked.
- Partially addressed: persisted-state launch, Keychain and network-fault
  workflows have local proof; hosted OS difference still needs exact-head CI.
- Not covered: physical Airplane Mode/crash timing, reinstall/server backup,
  real two-account/device journeys, production database, provider outage and
  real microphone replies. No broad data-safety/security completion claim.

## Changed-file manifest versus T-952

Includes the preserved original #904 implementation and these corrections:

```text
.github/workflows/quality-gate.yml
TASKS.md
backend/evals/run_live_draft_two_device_smoke.mjs
backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs
backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs
docs/required-recovery-integration-proof-2026-10-16.md
scripts/quality_gate.sh
scripts/run_screenplay_save_network_fault_smokes.sh
scripts/run_screenplay_save_network_fault_smokes.test.mjs
scripts/run_v1_ui_smoke.sh
scripts/run_v1_ui_smoke.test.mjs
scripts/run_voice_network_fault_smokes.sh
scripts/run_voice_network_fault_smokes.test.mjs
them/ScreenplayDraftSaveOutbox.swift
them/ScreenplayLiveDraftSync.swift
them/ScreenplayStudioInspectorChromeViews.swift
them/ScreenplayStudioPersistencePolicies.swift
them/ScreenplayStudioRecovery.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioSidebarViews.swift
them/ScreenplayStudioViewModel.swift
themTests/ScreenplayLiveDraftSyncTests.swift
themTests/ScreenplayStudioDraftRecoveryTests.swift
themUITests/V1SmokeUITests.swift
```

## Copy/paste implementation handoff

Codex now owns implementation; Claude's account is not required to preserve
the Git history. T-953 preserves complete original #904 on the T-952 rehearsal
and fixes a reproduced asynchronous queued-hydration project/auth race. Signed
units695/0/0, authenticated offline/relaunch/conflict recovery2/0/0, backend
Node20 2810/0/2 and runner contracts15/0/0 pass. Full V1 is29/0/11 (40total);
the separate authenticated final single-tap writer fixture is1/0/0. Its actual
DEBUG Markdown export was independently byte-checked (59bytes); native/phone/
shipping export remains unproven at this boundary. Retain #868/#941.
Original PR heads and main remain unchanged. Genuine independent approval is
still required for #766, then #770. Finish exact-head hosted proof and preserve
the existing safety chain through #925/#927 before #644/#880/#881. That fixes
known exact-text normalization and unresolved-conflict gaps without duplicating
existing work. The shipping API domain redirects away from the backend. Never
treat rehearsal success as shipping proof. No main or original PR head moved.
