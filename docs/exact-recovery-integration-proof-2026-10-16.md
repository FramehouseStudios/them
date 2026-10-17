# T-956 — Exact-text recovery integration

## Contract and preserved history

Goal1/7: no lost/duplicated writer text, with honest integration evidence.
Parent: T-953 `af034900004bed0ed44406ad443cd384014f3e9b`.
Branch: `codex/T-956-exact-recovery-integration`.
Task claim: `4f6be4da`; preserving merge: `8de1561d`.

Read the current bodies and heads of original #919, #923, #924, #925 and #927
before changing their seams. Preserved all seven original commits through
#927 `1f7c6061c99d04393f1cb0daed4dbafb54e4e666`:

```text
5bef4dc8 focused-editor stale echo guard
fc7a5571 stacked Studio D009 correction
1f04f048 authoritative recovery counts / readable failure evidence
cead6673 unresolved live-conflict choice protection
9cc7de0e immutable durable save-conflict recovery
2d054772 original ephemeral-server helper port (provenance #918)
1f7c6061 raw UTF-8 save/replay/acknowledgement/recovery identity
```

No squash, original-head rewrite, main merge, replacement PR or paid provider
call. The later T-954/T-955 design branches stay intact and separate; do not
pull their full later product ancestry into this earlier safety boundary.

## Merge decisions

- Preserve T-953's asynchronous Xcode child, which allows the fixture backend
  pipes to drain, and #923's bounded actionable xcresult diagnostics. Retain
  exact authoritative counts for every requested platform and unique bundles.
- Keep both shell-runner regressions: refuse unspecified local simulator and
  forward an evaluator-supplied result path containing spaces.
- Retain T-953's captured-auth-generation/owner/current-project checks around
  queued hydration, with the injectable real-outbox lookup and regression.
  Keep #925's newer unsaved recovery precedence and immutable conflict copies.
  The first full combined run then exposed that the default lookup still used
  the global shared outbox, ignoring #925's ViewModel-owned injected outbox.
  Use that owned outbox by default and keep the optional suspended-lookup seam
  solely for the actual asynchronous context-race regression.
- Preserve both native-editor protections: stale model echoes and pending
  native/streaming text. An actual document switch must bypass the old
  document's pending-text block. Capture prior model text/ID as values, not
  as a Binding that might later read different state.
- Original #919 moves publication policy into ScreenplayStudio. T-953 already
  extended its earlier app-local owner. Move those existing additions verbatim
  into the package and remove the superseded app file, not duplicate its types.
- Keep the iOS native editor composition seam owning the combined application
  rule and existing Courier helper. No god-file growth or new framework.

## Reproduced identity gap and root correction

VERIFIED after preserving the originals: the new editor-binding policy still
used Swift canonical String equality. Two package regressions failed2/2:
a byte-distinct NFC/NFD model revision could be mistaken for already applied
text or for an old model echo. `/tmp/them-956-identity-red.log`.

A separate real deferred-policy regression failed two assertions in one test:
canonically equivalent but byte-distinct binding/native text was accepted for
publication. `/tmp/them-956-deferred-identity-red.log`.

Move #927's existing `ScreenplayDraftTextIdentity` verbatim in behavior into
the package so persistence and native/editor policies import a single owner.
Use it for editor matching, deferred publication baseline checks and metadata
generation acceptance. Do not normalize writer text or invent another hash.
The regression assertions remain unchanged.

Final package proof:11XCTest +6SwiftTesting formatter tests passed,0 failures;
`/tmp/them-956-package-final-v2.log`. Tests include pending-native protection,
document-switch bypass, byte-distinct fresh revisions and stale metadata.
The prior first-green package checkpoint is retained separately.

## Integration proof in progress

- Initial runner/helper contracts22passed; expanded final set including voice
  fault runner23passed,0failed:
  `/tmp/them-956-runner-contracts-final.log`.
- First Node20.20.2 container run mounted the fresh source read-only and
  prevented required ignored `backend/data/persistence` fixture creation.
  Terminal result2679passed/9failed/2skipped. All9 failures show that same
  ENOENT startup/setup error. Retained `/tmp/them-956-backend-node20.log`;
  not a passing result and not evidence of a product regression.
- Corrected setup permits fixture writes only in this isolated worktree;
  Docker external networking remains disabled. Full Node20.20.2 suite:
  **2811passed/0failed/2skipped**,2813total; offline mentor gate passes.
  `/tmp/them-956-backend-node20-v2.log`, exit0. Skips: real Postgres query
  without DATABASE_URL and opt-in live page-preview/sync-header fixture.
- First signed full units:720passed/2failed (722total; five failed assertions),
  plus exact direct typing1passed. Authoritative xcresult:721passed/2failed,
  no skips. `/tmp/them-956-units.xcresult` and `.log`. The two failures were
  newer ordinary recovery precedence and boundary-whitespace conflict-copy
  preservation; both failed because hydration read the wrong outbox instance.
  Fix the production lookup owner, not these assertions.
- Corrected full signed units and exact typing:
  **722units+1UI passed,0failed,0skipped**, authoritative xcresult723total;
  `/tmp/them-956-units-v2.xcresult` and `.log`, exit0. The two original failing
  recovery cases pass without assertion changes. Explicit erased task-owned
  simulator11CF5EFB-D8C3-4F19-8062-28AF37F27D93, normal signing, Xcode26.3,
  iOS26.2/23C54. No human simulator/device is erased.
- Authenticated recovery:2passed/0failed/0skipped, exit0; full raw CRLF,
  boundary whitespace and NFD text, one recovered server version, relaunch,
  expired auth, stale competing version and explicit Keep Mine are asserted.
  `/tmp/them-956-recovery.log`; authoritative retained bundle:
  `recovery/them-save-recovery-pY6TRe/recovery-ios.xcresult` under the private
  proof directory below. The fixture runs on host Node26.7.0, with auth required,
  fake provider key, Muse/embeddings disabled and DB/cache inherited env unset.
  This is not the separate pinned Node20 regression environment.
- Frozen source checkpoint: `5b359a84`.
- Authenticated writer1passed/0failed/0skipped, exit0:
  `/tmp/them-956-writer.log`, bundle under
  `writer/them-writer-loop-Qx7x6x/writer-loop.xcresult` in retained proof.
  Creates a project through UI, types/saves once, checks one server version,
  exercises the existing DEBUG export path and restores after relaunch. It
  does not prove native share-sheet opening outside THEM or export parity.
  T-953's no-fallback-second-Save assertion remains intact.
- Deterministic authenticated Home handoff2passed/0failed/0skipped, exit0:
  `/tmp/them-956-home.xcresult` and `.log`. Confirmed transcript and raw-audio
  routes reach Studio, write and restore the full fixture scene. Provider
  interception recorded stt1/chat4/tts24 synthetic calls; not microphone,
  voice quality, paid provider or cost-optimality proof. Preserve #807's later
  transcribe-first path and reconcile raw two-generation cost there.
- Full V1 UI:29passed/0failed/11skipped (40total), exit0, authoritative
  `/tmp/them-956-v1.xcresult` and `.log`. Five skipped journeys are separately
  proven above (Home2, writer1, recovery2); the other six remain unproven:
  backend project restore, cross-platform project restore, cross-platform
  learned memory, cross-platform canon correction/restart, native two-device
  live following, and writer-block rescue. No skip is counted as a pass.
- macOS scaffold build passes, exit0, `/tmp/them-956-mac.log`; canonical
  `scripts/desktop_preflight.sh`, isolated `/tmp/them-956-mac-dd`, unsigned
  build-only. All iPhone proof is signed. No Swift edit occurred during any
  active Xcode build. Final checks were serial and stopped on nonzero exits.
- Parent-relative D009 passes: Studio17407 unchanged, bridge12926→12925;
  index33557, Root15024, MemoryAPI10846 unchanged. Diff check passes.
- Private retained proof directory:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-956-20261016.Tf4W76/`.

## External read-back / not covered

VERIFIED at this task start: protected main remains `647e01fc`; #766 is OPEN,
REVIEW_REQUIRED/BLOCKED. Do not manufacture a reviewer or skip #770's reproof.
T-953 hosted run38980652174 is still live in required V1 UI; its D009/backend,
required units and integrated writer stages passed, but later stages are not
yet terminal. Its status is not a badge for this different combined head.

Unauthenticated shipping-URL check: GET https://api.them.io/health returns302,
text/html, Location `https://introvert.com/?domain=them.io`. Redirect not
followed; no credentials sent. This proves the configured shipping URL is not
currently returning API health, not that the Render origin is down.

Fresh read-only follow-up: GitHub's latest deployment6414400584 reports success
for main647e01fc at2026-09-12T21:09:45Z and identifies the existing origin
`https://them-backend.onrender.com`. Its public `/healthz` currently returns
direct200 JSON. This is endpoint availability, not a proof of current deployed
revision, provider readiness, production isolation or this rehearsal's fixes.
No deployment/DNS/config change or credential access was performed.

Not proven: shipping backend deployment, physical microphone/provider journey,
reinstall, production Postgres soak,120-page phone performance, editor/export
parity (#80) or main landing. No completion/release claim from local fixtures.

Read the current original #928–#932 bodies while the frozen proof runs. The
next actual boundary is #928 `34272775`, based directly on #927. It restores
parked copies before both independent detail/outline hydration paths, not only
bootstrap. That existing follow-up is still required; this task must not claim
its caller-path fix from passing current local recovery cases. Then #929
`5302f23b` is the guarded blank server contract, #930 `fc8157df` its client
recovery, #931 `9dde9be5` blank snapshots/history, and #932 `bace7ae3` the real
visible-editor observation correction. Preserve those heads and actual bases.

Read-only inspection of `run_live_draft_two_device_smoke.mjs` shows its default
transport writes the shared `io.them.them` Mac defaults and shared `/tmp`
preference paths. Do not run it over human app/session state. Isolate the
existing transport/app session before attempting that native two-device proof;
the skipped case is not waived and is not claimed proven by backend tests.

## Adversarial review

- Answered by actual ViewModel/outbox tests: stale account/project/generation
  rejection after an await; immutable submitted conflicts; newer unsaved
  recovery precedence; failed atomic cleanup retaining copies; exact canonical
  acknowledgement without another POST. Tests are on this combined source.
- Answered by package regressions plus real direct typing: stale same-document
  model echoes, pending-native protection and true document-switch precedence.
  Canonically equal but byte-distinct revisions are not treated as receipts.
- Partially addressed: missing/lossy success text parks a save by policy; a live
  legacy-server mismatch journey and strict returned request-ID binding remain
  unproven, as documented by original #927. Do not claim those from pure tests.
- Not covered: physical airplane-mode transitions, abrupt power loss, unsynced
  app uninstall and production Postgres durability. A simulator termination or
  UserDefaults readback is not a power-loss/fsync or uninstall guarantee.

## Exact changed-file manifest versus T-953

```text
Packages/ScreenplayStudio/Sources/ScreenplayStudio/ScreenplayDeferredPublicationGate.swift
Packages/ScreenplayStudio/Sources/ScreenplayStudio/ScreenplayDraftTextIdentity.swift
Packages/ScreenplayStudio/Sources/ScreenplayStudio/ScreenplayEditorTextBindingPolicy.swift
Packages/ScreenplayStudio/Tests/ScreenplayStudioTests/ScreenplayEditorTextBindingPolicyTests.swift
TASKS.md
backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs
backend/evals/studio_ios_writer_loop_contract_helpers.mjs
backend/lib/screenplay_projects_routes.js
backend/tests/account_routes.test.mjs
backend/tests/helpers/ephemeral_server.mjs
backend/tests/screenplay_cross_device_persistence.test.mjs
backend/tests/screenplay_live_draft_routes.test.mjs
backend/tests/studio_ios_writer_loop_contract_helpers.test.mjs
backend/tests/trait_library.test.mjs
docs/audits/exact-save-identity-2026-10-08.md
docs/exact-recovery-integration-proof-2026-10-16.md
scripts/run_screenplay_save_network_fault_smokes.test.mjs
them/CrossDeviceSyncPolicy.swift
them/ScreenplayDeferredPublicationGate.swift
them/ScreenplayDraftSaveOutbox.swift
them/ScreenplayLiveDraftBridge.swift
them/ScreenplayStudioKeyboardSaveAccessory.swift
them/ScreenplayStudioPersistencePolicies.swift
them/ScreenplayStudioRecovery.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioViewModel.swift
themTests/ScreenplayDraftSaveOutboxTests.swift
themTests/ScreenplayStudioDraftRecoveryTests.swift
themTests/StudioThreadViewStateSupportTests.swift
themUITests/V1SmokeUITests.swift
```

The app-local publication-policy file is deleted after moving its methods into
the original package owner. Its former source remains recoverable in Git.

## Copy-and-paste briefing / end-of-session report

Completed: T-956 rehearsal preserves the complete original #919/#923/#924/#925/
#927 chain through1f7c6061 using merge8de1561d, atop T-953af034900. Source
checkpoint5b359a84 closes the reproduced native UTF-8 identity gap and the
merged lookup's failure to use the ViewModel-owned outbox. All original tests
and heads remain intact. The superseded app policy was consolidated into the
existing package; no second publication/persistence framework was introduced.

Files: the exact30-file manifest above includes preserved original work,
the integration corrections, task ledger and this proof. No unrelated checkout,
secret, production setting, orb or Clementine identity was modified.

Root evidence: two editor identity regressions failed; one deferred-publication
test failed two assertions; first combined units had two failing cases/five
assertions. Fix the actual comparisons and lookup owner, retain assertions.
All corrected signed/package proof passes. The initial read-only backend setup
failure is retained separately, not disguised as a product defect or a pass.

Verification: Node20.20.2 backend2811/0/2 plus offline mentor; signed units722/0/0
and exact typing1/0/0; signed authenticated recovery2/0/0, writer1/0/0 and mocked
Home handoff2/0/0. Full V1 UI29/0/11, with five skipped journeys separately
proven and six still unproven. Package11XCTest+6formatter tests, runner23,
Mac scaffold build, parent-relative D009, syntax and diff checks pass. All
result bundles/logs and red evidence are retained at the private proof path.

GitHub: scoped branch `codex/T-956-exact-recovery-integration`; no main merge,
original-head rewrite, replacement PR, self-approval or paid provider call.
Hosted proof must identify this exact new head; do not transfer T-953 badges.
The original #766 still requires independent non-author approval.

Next active task: preserve/re-prove original #928's independent hydration
callers, then the existing guarded blank-save/history chain. Isolate the
shared-preference two-device runner before using it. Shipping api.them.io
still redirects to parking while the documented Render origin returns200JSON;
deployed revision/configuration and physical iPhone journey remain unproven.
This is not app completion or release readiness. READY FOR CONTINUE.
