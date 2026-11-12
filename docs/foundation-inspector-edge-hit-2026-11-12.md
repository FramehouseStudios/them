# Correct inspector pointer routing — 2026-11-12

**VERIFIED local source:** c04886f9 on `codex/T-1438-foundation-hitbox-proof`, based on original #964 at `831de836`. All original commits and failed candidates remain preserved. This is not integrated-main or phone proof.

## Reproduced cause and working behavior

The one-action native case began with Draft selected, with Them visible and contained. The requested point `(273.5, 198)` arrived at `(273.6667, 198)` after pixel rounding. Actual settled label rectangles were Them x=170…274 and Saved x=280…384; the touch lay inside Them. Its reported radius was 23.598 points, and the Saved action ran directly. There was no Them-handler receipt and no later overwrite of a successful Them selection. This establishes the wrong action at the input boundary; it does not prove SwiftUI's internal arbitration algorithm. UIKit documents the radius as an approximate touch-size measurement. [Apple UITouch](https://developer.apple.com/documentation/uikit/uitouch/majorradius).

Original commit `909f9e90`'s rectangle content shape and original commit `5119360c`'s explicit-row layout were each reused without discarding history. Neither alone repaired this edge case. The working fix routes a pointer centre to the unique measured visible tab rectangle in the existing child, then uses one shared selection action. Gaps, ambiguous or invalid geometry select nothing. Rendering and input share the same 1-point outline width, including its half-width outside layout bounds; no guessed finger-radius inset or hard-coded screen coordinate is used.

All six Buttons, labels, hints, selected traits, identifiers, fonts, colours and actions remain. Pointer routing uses the platform [SpatialTapGesture](https://developer.apple.com/documentation/swiftui/spatialtapgesture) with [gesture precedence](https://developer.apple.com/documentation/swiftui/view/highprioritygesture(_:including:)). Keyboard/accessibility activation retains the Buttons. Those activation methods are source-preserved, not independently runtime-proven. Scroll and ordinary inspector navigation were exercised below. Child-local rectangle state adds no Root/Studio state or persistence.

## Actual verification

Xcode26.3; erased task-owned81F0FF38-9DAD-4011-907B-357DFADD094C; iPhone17 Pro/iOS26.2; normal signing.

| Check | Pass / fail / skip | Scope |
| --- | --- | --- |
| Tests-only8c5 | 0 / 1 / 0 | Correct edge delivered; wrong tab selected |
| Rectangle-only164, explicit rowsb4 | each0 / 1 / 0 | Preserved negative candidates; same unchanged case |
| Handler traced558 and geometrya25 | each0 / 1 / 0 | Actual Saved receipt and settled rectangles; no action/assertion/timeout relaxation |
| Pointer routing55d | 1 / 0 / 0 | One routed Them/applied Them/observed Them receipt, no Saved handler |
| Final c048 edge plus original ordinary rail/scroll workflow | 2 / 0 / 0 | Original rail runs without trace opt-in; exact named cases validated in xcresult |
| Five input-boundary units atcaa8 | 5 / 0 / 0 | Same final product/unit/UI source; only unused debug APIs removed afterward |
| Final Mac Scaffold Debug | build exit0 | Correct canonical configuration, ad-hoc compile; interactive Mac unproved |
| D009 versus actual fetched831 | five0 | Backend33626, Screen17435, Root15112, Bridge12952, Memory10865 unchanged |

The original UI cases and helpers are byte-identical to831. The added edge case gained opt-in metadata attachments only; its one tap, selection/panel assertions and budgets remain unchanged. The final test tree contains exactly `test_them_inspector_tab_right_edge_selects_its_panel` and `test_them_rail_routes_to_passive_overview_and_surface_mix`, both Passed.

Local editing also produced stray patch markers caught by parsing. A command-sequencing error wrongly launched one unit build despite the failed preflight; it failed65 before tests and is not proof. It is retained separately. Both markers were fixed; subsequent parsing/commit succeeded before the valid5-case invocation. No cancellation signal was sent because the invalid owned build had already ended. Existing compiler warnings remain.

The UI controller owns backend3000/fallback3001 and uses allowlisted parent environment, dummy/empty provider credentials, denied generation routes and known egress interception. It reuses controlled metadata backend source from preserved5f, not this older native parent's backend. Final2-case counters: blocked outbound0, fallback0, denied27. Session32/project9 retries are fixture-auth artifacts, not production idle-network evidence. This is not universal OS network isolation or backend/auth integration proof. All owned servers stopped.

## Scope, safety and handoff

Changed files: `them/ScreenplayStudioInspectorChromeViews.swift`, scoped `them/StudioUITestInputDiagnostics.swift`, `themTests/ScreenplayStudioInspectorHitTestingTests.swift`, added UI case in `themUITests/V1SmokeUITests.swift`, this document and current TASKS checkpoint. The existing diagnostic owner is reused; copied APIs with no callers on this parent were removed after repository-wide search. Its32-entry buffer records only typed metadata, with normal/Release no-op behavior. No logging of writer text, account IDs or credentials.

No backend/package/VM/auth/purchase source changed. No unchanged full backend or complete unit suite was rerun. Preserve the early-stack33626 exception; do not reformat index.js. Required full hosted/review gates remain before main. Ordinary pointer and scroll proof does not establish VoiceOver, physical microphone/model, the intended backend, exact save/relaunch or outside-app export.

Fresh observed GitHub state: original964 remains831, draft and RED (hosted V1 26/2/9; units 633 executed / 0 failures, writer/backend/D009 passed, voice/Mac skipped). Original997 remainsf68 with its three successful jobs; original904 remains909f. This fix is saved as a scoped branch, not a replacement PR or main merge. Genuine review remains deferred. Production hold and no-new-paid-call rule remain.

Next: carry this proven input fix into the full preserving rehearsal, and finish the parent editor-ownership port before original964 advancement. Private416's pending-echo policy can suppress an explicit restore matching an earlier pending value; keep it out of main until the preserved665 external-mutation distinction is connected. Private Zora account-formcbd likewise needs verified credential-origin authority before reveal can land. Neither private candidate is runtime-cleared.

Actual role participation: Luna supplied original/native evidence; Atlas supplied bounded source ports then hit Codex credits; Zora produced private recovery candidates; Einstein traced auth continuity/origin; Howard's attempt failed credits with no result; Alfred was idle. These are Codex roles, not independent human approvals. Jarvis implemented and executed this repair directly.

Permanent evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1441-inspector-pointer-routing-20261112/proof.json`, SHA256 b70429375726bf9c1bb920d4c130088305ba73e317c49e8ff808f15f443a6c79. All 7 UI runs, logs, retained negative attempts, fixture/controller, source hashes and metadata are included. Original hosted artifact remains separately preserved by Luna. READY FOR CONTINUE.

<details>
<summary>Retained initial candidate record — superseded by results above</summary>

# Foundation inspector edge-hit candidate — 2026-11-12

Base: original #964 `831de836e6becf76a97edf244188177d2a624619`.
Tests-first commit: `8c5e9bf0c80feb8030e5acb245ea6bdcaca5534a`.
Original source: `909f9e9075c5e074d45e93575b371a69f7e96ffb`, the existing
one-line `.contentShape(Rectangle())` fix in the inspector tab label owner.
No original head, PR base, main or history was changed.

## Evidence and scope

Hosted #964 run43260656345 failed two V1 cases. The rail event targeted Them
at x274.488586,y198, just inside its reported right edge274.5. Saved was selected
in the final native hierarchy and recording. This is not the older Saved-center
coordinate event and does not establish which handler or layout mechanism failed.
The same run's separate missing-h typing failure remains outside this change.

The dedicated `test_them_inspector_tab_right_edge_selects_its_panel` starts with
known Draft selection, obtains Them by its semantic identifier and verifies its
frame is contained in the drawer. It issues exactly one touch one point inside
the tab's right edge, then requires selected Them and the actual Them panel.
It uses existing readiness/selection helpers and budgets. All original cases and
helpers remain byte-exact; the ordinary rail tap test still exists unchanged.
This is a semantic edge contract, not an exact replay of the recorded fractional
coordinate. A baseline native pass would not establish a causal repair.

The product candidate copies only original909's content-shape line after the
full label frame. It deliberately retains the foundation's LazyVGrid. The earlier
original511 explicit-row layout is not imported here; whether contentShape alone
suffices is still a hypothesis until native before/after evidence is observed.

## Static proof and pending native work

Swift parser checks passed for the added test and edited view. D009 against the
verified actual fetched831 head passes with all five deltas0; diff checks pass.
Parser success is not iOS type-checking, a build, or executed UI proof. No native
test/build, backend/server/store, provider, paid call or GitHub mutation occurred.
Root owns the same-case native baseline/fixed comparison; do not retry to force
red/green or relax the selected-state/panel assertions.

Verified original native artifact SHA256:
`195b50e5edcc15f72982aa849abdeeea623a6f871bb78727b7cca3b33bae9e6b`.
Retained once at
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1436-964-831-v1-red-20261112-luna`.
The former private/tmp path is an owned compatibility symlink to that archive.
This candidate does not clear #964, prove the physical-phone journey, or lift the
production hold. Keep the private branch frozen for root's native proof.

</details>
