# T-994 — One preserving writer-safety rehearsal

## Combined source, not separate green islands

Initial runtime source0d4b5d5912bc27883573e76b004022a185e1bca2.
Final UI validation head65eeb95652cc7b5c433bb24fd38ae606ead332cd preserves
the verified drawer-helper correction6a57ff9 with a normal merge. Backend,
scripts, app/unit/package/project sources remain byte-identical to0d4b5d5;
only UI-test navigation and docs changed. Do not relabel initial unit proof
as a new-head run: fresh final units/full UI are explicitly running below.

- Mergef5e85a40d3112a4f84f689bf1253696b9e75215d preserves compatibility/
  recovery46de00f08d6cba9ac8c703bf6aa5e882df8b769b and original billing
  PR625 head78430decbc6294481f562c15aa3b02f3a9bfd87c.
- Merge16debf355573ce5f2a0391be4e8766fb348c3821 preserves that combined
  parent and PostgreSQL/cleanup1ed27b9a5897212fbe3ba20fdb8f3e742a8e5533,
  which retains original PR963 head7459a8fa.
- Merge0d4b5d5 preserves that tree and completed recovery evidence
  1924b1691da0cec8f3d6d9b5b962a247bece0aa6.

Only TASKS.md conflicted in the first two merges; all ledgers retained.
The billing adapter auto-merge was inspected: newer routing context remains,
original completion-based settlement is intact. The PG workflow addition
keeps all newer required UI gates/artifact paths. No replacement PR, squash,
force push, original-head mutation, main merge or production change here.
Swift, packages, resources, project and UI-test files match46de00f exactly.

## VERIFIED exact combined proof

- Full pinned Node20.20.2 scripts231/0/0 and backend2929/0/2, exit0:
  `/tmp/them-994-node20.log`. External networking disabled, actual locked
  dependencies, read-only source, disposable fixture writes only. The sum
  includes original billing and cleanup regressions; not a live-model claim.
- Full signed units865/0/0, exit0, actual summary confirms erased owned
  Pro11CF5EFB-D8C3-4F19-8062-28AF37F27D93/iOS26.2:
  `/tmp/them-994-units/v1-ui-smoke-local-1-91010.xcresult`,
  `/tmp/them-994-units.log`.
- Actual PostgreSQL restart gate PASS, exit0: `/tmp/them-994-postgres.log`.
  Canonical Node20.20.2/PostgreSQL16.15; all12 migrations; 422,201 synthetic
  bytes/6,600 lines; authenticated rewrite/read, real disk-backed restart,
  fresh backend files, persisted auth, ownership denial and replay dedupe.
  New UUID-owned fixture resources removed before PASS. Synthetic fixture
  data intentionally discarded; no human/production data deleted. Not a
  generated120-page screenplay or production database restore certification.
- D009 all five deltas0 versus fetched #961 head8b19d86; syntax/diff pass.
- Completed unit bundle/logs privately retained and bundle compared identical:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-994-20261019.DRcCTn/`.
  Same-computer retention, not off-device backup.

Automatic review initially rejected the PG command because database ownership
was not established. No rejected process was started. Read-only checks then
proved local Docker socket, no DOCKER_HOST/DATABASE_URL/image overrides,
orchestrator/worker byte-identical to reviewed1ed27b9, newly created UUID
network/volume/containers, no host DB mounts or published ports, fixed fixture
DSN refusal and cleanup only for resources created by this invocation. The
same direct command was accepted after that evidence. No indirect bypass.

## Actual red boundary, not erased by passing component checks

Pre-integration compatibility SE3 full UI completed27 pass/2 fail/15 skip,
bundle `/tmp/them-992-se-v1/v1-ui-smoke-local-1-88943.xcresult`.
Failures: Pages shortcut route and Creative Partner metrics reveal.
Original screenshot/video/hierarchy exports were inspected: Pages target
y744.8 lies below viewport y100...635.5, while its helper always swipes down.
The metrics recording ends past the target after repeated upward swipes.
Targets exist; caller-fixed scroll direction depends incorrectly on tall
screen height. Do not claim a production layout fix from this evidence.

T-992 changes only the shared test reveal helper to follow actual target
geometry, retaining the same selectors, hit-test requirements, swipe limits
and timeouts. First direction-only correction1/1/0 exposed full-height fling
overshoot at mode controls; its failure remains retained. Bounded slow target-
relative drags then passed both original failing routes2/0/0 on the erased
SE, actual summary checked:
`/tmp/them-992-se-drawer-bounded/v1-ui-smoke-local-1-92800.xcresult`.
Preserved source6a57ff9 is now in final65eeb95; no unchanged retry or skip.

## Final combined workflow in progress

Native session68131: fresh signed full units on exact erased owned Pro,
then erased owned SE3 authenticated five-story recovery, writer/Craft/native
export/relaunch, fixed-provider Home, full V1 and voice-fault/macOS. Stops at
first red. Logs `/tmp/them-994-final-units.log` and
`/tmp/them-994-se-{recovery,writer,home,v1,voice}.log`.
Only the two task-owned IDs already recorded are erased. Temporary wrapper
`/tmp/them-994-xcodebuild` injects cached separate DerivedData plus two jobs;
it does not alter test assertions, signing, selectors or simulator selection.
No final combined UI success is claimed yet.

## Next and release limits

Exact file inventory versus original #961 head8b19d86:

- .github/workflows/quality-gate.yml
- TASKS.md
- backend/evals/postgres_writer_restart_scenario.mjs
- backend/lib/clementine/page_lane_adapter.js
- backend/lib/clementine/short_film_lane.js
- backend/lib/talk_generate.js
- backend/tests/empty_generation_billing.test.mjs
- backend/tests/helpers/billing_provider_stub.mjs
- backend/tests/postgres_writer_gate.test.mjs
- backend/tests/talk_empty_billing.integration.test.mjs
- docs/billing-main-proof-2026-10-19.md
- docs/empty-generation-billing-proof.md
- docs/exact-live-draft-retention-2026-10-17.md
- docs/exact-retention-combined-proof-2026-10-19.md
- docs/integrated-writer-safety-2026-10-19.md
- docs/iphone-compatibility-2026-10-19.md
- docs/postgres-cleanup-safety-2026-10-19.md
- docs/postgres-writer-gate-2026-10-19.md
- docs/retention-parent-forward-2026-10-19.md
- scripts/run_postgres_writer_gate.mjs
- them.xcodeproj/project.pbxproj
- them/ScreenplayLiveDraftBridge.swift
- them/ScreenplayStudioKeyboardSaveAccessory.swift
- themTests/ScreenplayEditorBindingIntegrationTests.swift
- themTests/ScreenplayStudioDraftRecoveryTests.swift
- themUITests/V1SmokeUITests.swift

Finish the exact active combined authenticated narrow workflow. Original
PR625 and parent961 hosted gates remain separate exact-head requirements;
do not transfer earlier-head green or fabricate independent approval.

Production remains held until App Store credentials exist. Candidate minimum
17 compiles, but actual17 runtime was unavailable and remains unproven.
Physical microphone, shipping-backend journey, live generated120-page craft/
format continuity and external consumer opening export remain unproven.
No paid model calls. Goal remains active, not complete.
Continue status: READY FOR CONTINUE.
