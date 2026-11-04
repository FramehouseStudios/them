# T-967 — Preserve script-read coverage and its isolation repairs

Parent T-966/#949: `feeff7de`. Branch `codex/T-967-coverage-integration`.

## Original inputs and preserving merges

- #644 `047672ac1f190c78c1861ff51c636865140c81b4`:
  merge `dbb88c81`; deterministic script-read route, Craft card, speech request
  and conversational summary. Original body and follow-up commits read.
- #880 `b619d7d0d4d7539ca02140cdeb273e32e94fba2f`:
  merge `e4fd305d`; existing Craft capability extraction, speech delivery owner,
  authenticated route regression and canonical large-body-safe HTTP fixture.
- #881 `b7a0ea528fcc2163a0d79b2bec0336a46a408e65`:
  merge `890dca42`; request/account/project/draft guards for delayed results,
  scoped shared summaries and macOS Pages modifier guard.

No replacement implementation, squash, original-head rewrite or main mutation.
Conflicts retained both action document-authority and coverage summary types;
both project-selection guards; existing recovery/creation/collaboration helpers;
and initializer injection for both recovery and coverage tests. The headless
creation worker still returns before subscriptions/network side effects.
The duplicate auth-context constructor had identical behavior; retained the
existing compact canonical owner. #880's HTTP helper supersedes the shorter
same-capability fixture with its existing large-body rejection correction.

## Proof on the combined tree

- Full backend in tracked-files-only temporary snapshot, existing Node20.20.2
  image: **2,835 passed / 0 failed / 2 skipped** (2,837 tests), exit0.
  `/tmp/them-967-node20-backend.log`. No credential files were tracked/copied;
  no provider credentials passed or present in the proof image. No paid call.
  Checked all136 installed package versions against the archived lockfile:
  zero mismatches; `/tmp/them-967-dependency-match.log`.
  Skips: real PostgreSQL prefix query (DATABASE_URL missing), opt-in live page
  response. This is not real database or live-model proof.
- Initial combined full signed `themTests` on erased task-owned iPhone17Pro/iOS26.2:
  **833 passed / 0 failed / 0 skipped**, exit0.
  `/tmp/them-967-coverage-units.xcresult` and `.log`.
- First extended authenticated writer test: **0 passed / 1 failed / 0 skipped**.
  `/tmp/them-967-coverage-writer.xcresult` and `.log` retained. The Read it button
  was visible, but its parent VStack identifier propagated onto the button and
  grade, replacing their dedicated identifiers. The exported AX hierarchy shows
  Read it at x290/y124.7 with `studio.craft.coverage`, not `.refresh`.
  Screenshot exports for this failure are pending-attachment placeholders, not
  valid images; diagnosis relies on the actual AX hierarchy, not claimed pixels.
- Source correction: use `.accessibilityElement(children: .contain)` before the
  card identifier, matching the existing Reader Preview owner. Do not switch to
  a label-only test or retry the unchanged failed source.
- Corrected connected authenticated writer/Craft/MD+FDX native-share/relaunch:
  **1 passed / 0 failed / 0 skipped**, `/tmp/them-967-coverage-writer-v2.xcresult`
  and `.log`. Taps Read it once; verifies grade and current1-page/0-scene counts
  against the real deterministic backend; exact saved text survives relaunch.
  STT0/chat0/TTS0. The synthetic action marker is not a professional script.
- Final full signed units after the AX correction: **833 passed / 0 failed /
  0 skipped**, `/tmp/them-967-coverage-final-units.xcresult` and `.log`.
- Final macOS scaffold Debug compilation exited0, `/tmp/them-967-macos.log`.
  Actor-isolation/Sendable and deprecated-API warnings remain. This proves
  compilation, not audible playback, macOS UI or release signing.
- Offline mentor golden passes under Node20 with external networking disabled;
  `/tmp/them-967-offline-golden.log`. Not live-model output.
- D009 passes vs main. Relative to parent T-966: Studio -50, API -1,
  Root/bridge/index unchanged. `git diff --check` passes.
- Private retained evidence directory:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-967-20261016.7SVS5v/`.

## Adversarial scope and remaining gaps

Answered narrowly by the retained tests: cancelled and superseded reads cannot
publish; old errors cannot replace a newer success; switched writer/session/
project cannot receive the old read or speech; one view model cannot clear
another's newer summary. Submitted-page auth regression rejects signed-out
requests and returns only characters in the submitted synthetic script.

Not covered: actual audible playback, microphone/model quality, physical phone,
shipping backend identity/storage, full-length quality, external file opening
or arbitrary hostile upload/concurrent load. The grade is a deterministic
heuristic, NOT calibrated professional coverage or evidence of saleability.
The original UI/spoken wording needs an explicit heuristic-estimate disclosure
before production promotion; do not infer craft intelligence from these tests.

Additional seams found, not silently declared solved: title-page metadata is
still passed to coverage even though T-966 excludes it from story counts;
coverage context's synthesized String equality does not prove UTF-8 identity;
completed same-project reports are retained after edits without a snapshot
freshness indicator. Preserve original #646 refresh and #774 quiet-announcement
work while reconciling these, rather than duplicating or skipping them.
Original #648 owns prompt-trimming protection for the coverage/control blocks.
Presence of a block before trimming is not proof the model received it.

## Main and deployment checkpoint

#906 exact head44518082 remains approved and OPEN. Current exact-head hosted
run38998648618 backend/D009/units/writer passed; broader UI/voice not terminal
at this checkpoint. Main4d788975 run38998537356 also reached broader UI after
its writer passed. Do not call the earlier main export-status failure diagnosed
or bypass review/protection. Existing #904 owns required, signed, diagnosable
smoke repairs; #907/#888 retain further live-recovery protections.

Fresh public probes: `api.them.io/healthz` returns302 text/html to
`https://introvert.com/?domain=them.io`; existing Render `/healthz` returns200
application/json. These do not prove the shipping app reaches this rehearsal,
its persisted store or any particular deployed commit. Main still has16 open
dependency alerts; original #905/#612 and their preserved security follow-ups
must land with their independent gates. No production change in this task.
HUMAN_INPUT_REQUIRED before shipping-host proof: establish DNS ownership for
them.io, configure api.them.io as the intended Render custom domain, apply only
the api DNS record Render specifies (preserving unrelated DNS), verify TLS and
200 JSON health, and identify the deployed revision. If that domain is not
controlled, the human must select a controlled hostname. Do not silently
substitute a host, enter credentials or treat Render's `ok:true` as revision
proof: its public health response currently contains no revision.

## Exact file manifest relative to T-966

```text
TASKS.md
backend/lib/method_not_allowed_routes.js
backend/lib/screenplay_companion_routes.js
backend/lib/screenplay_coverage.js
backend/lib/studio_actions.js
backend/lib/talk_handler.js
backend/tests/block_signal_history_route.test.mjs
backend/tests/helpers/ephemeral_server.mjs
backend/tests/method_not_allowed_routes.test.mjs
backend/tests/screenplay_companion_routes.test.mjs
backend/tests/screenplay_coverage.test.mjs
backend/tests/screenplay_coverage_auth.integration.test.mjs
backend/tests/studio_voice_actions.test.mjs
docs/audits/coverage-context-2026-09-30.md
docs/audits/coverage-gate-2026-09-30.md
docs/coverage-integration-proof-2026-10-16.md
them/BackendMemoryAPI.swift
them/BackendMemoryStatsModels.swift
them/RootExperienceView.swift
them/ScreenplayCoverage.swift
them/ScreenplayCoverageCardView.swift
them/ScreenplayCraftRailView.swift
them/ScreenplayStudioScreen.swift
them/ScreenplayStudioThemRailCraftViews.swift
them/ScreenplayStudioViewModel.swift
them/StudioActions.swift
themTests/ScreenplayCoverageTests.swift
themUITests/V1SmokeUITests.swift
```

## Next original boundary

#645 `claude/mentor-structure-map` at8a7f367a, based on #644. #880 and #881
are preserved additive safety repairs, not replacements for the product stack.
No further feature integration until the first combined failure is resolved.
