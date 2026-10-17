# T-936 — Fresh, byte-safe Load Server

Goal items 1 and 4. Base: #933 `25231907d5ed308a620b22809429f043940d242a`.

## Reproduced roots

The real Load Server action applied nonempty cached conflict text without making
its canonical authenticated project request. With displayed v2 and current v3,
the retained signed baseline failed one test in three assertions: no fetch,
wrong text and wrong version. `/tmp/them-936-cached-head-red.xcresult` and `.log`.

The existing asynchronous fetch guard used Swift String equality. During a
delayed response, precomposed `café` changed to decomposed `cafe\u{0301}`;
canonical equality treated the new bytes as unchanged and overwrote them.
Retained signed baseline: one test, three failed assertions (bytes, conflict,
dirty state). `/tmp/them-936-unicode-red.xcresult` and `.log`.

## Fix and trust boundaries

Every explicit Load Server choice now fetches through the existing authenticated
project client; the old cached-text bypass is removed. It captures account,
project, conflict, exact editor bytes and the original choice time. It rechecks
those boundaries after the request, preserving new typing or a newer choice.
Only one request runs at a time; the actual button is disabled while loading.
Keep Mine remains available and invalidates the pending server choice.

Destructive selection is stricter than ordinary hydration: require the explicit
active head (legacy last pointer only if no active pointer), its actual draft
field, and matching project if supplied. A missing active record cannot fall
back to a historical version. A blank string is valid; missing text is not.
Known immutable versions are accepted even with sparse timestamps. A different
head must pass the established newer-version policy; old or unorderable heads
fail closed with the local choice retained. Opaque IDs are never sorted.

Queue removal retains the existing original-time and owner/project cutoff;
later or another owner's copies are not discarded. Failures retain writer text,
conflict, local recovery and parked copies. The existing no-backend Ferry UI
fixture uses an explicit loader test double guarded by DEBUG, UI-test mode,
the exact fixture argument and fixture project ID. It is not live network proof.
The separate required authenticated localhost journey creates v3 after a real
v2 conflict, taps the production action, then checks page, queue, relaunch and
server. Cross-device polling may observe v3 before the tap; the deterministic
real-action unit regression independently proves the nonempty cached path
must fetch. No provider call, timeout increase, retry or weakened assertion.

## Files changed

- `them/ScreenplayStudioViewModel.swift`: fresh serialized canonical choice and guarded DEBUG fixture seam.
- `them/ScreenplayStudioRecovery.swift`: strict destructive-head selection.
- `them/ScreenplayStudioScreen.swift`: disabled in-flight action and fixture wiring; no line growth.
- `themTests/ScreenplayDraftSaveOutboxTests.swift`: exact-byte/action/durable-head regressions.
- `themTests/ScreenplayStudioDraftRecoveryTests.swift`: asynchronous real-action contract.
- `themUITests/V1SmokeUITests.swift`: authenticated fresh-head/relaunch/server journey.
- `scripts/run_screenplay_save_network_fault_smokes.sh`: require the new fifth case.
- `scripts/run_screenplay_save_network_fault_smokes.test.mjs`: pin its required invocation.
- `backend/evals/run_screenplay_save_network_fault_ui_smoke.mjs`: enforce all five executed cases.
- `TASKS.md` and this audit: scope, retained proof and limitations.

## Verification

Focused signed outbox run: 40 pass, zero fail/skip,
`/tmp/them-936-focused.xcresult` and `.log` (before the final boundary additions).
Four runner tests pass; evaluator syntax and diff checks pass. Initial full
Node 20.20.2 suite with networking disabled: 2,744 pass, zero fail, two skip,
`/tmp/them-936-node20.log`. Final full backend re-run on the evaluator changes:
**2,744 pass, zero fail, two skip**, `/tmp/them-936-final-node20.log`.
Final full signed units: **679 pass, zero fail/skip**,
`/tmp/them-936-full-units.xcresult` and `.log`. macOS scaffold build **exit 0**,
`/tmp/them-936-mac.log`; unsigned build-only, never unsigned tests. Expanded
authenticated signed recovery UI: **five pass, zero fail/skip**,
`/tmp/them-936-recovery-ui/screenplay-save-network-fault-50353.xcresult` and
`/tmp/them-936-recovery-ui.log`. The fresh-head case executes and passes;
existing offline/relaunch/reconnect, auth/conflict/Keep Mine, delete-all,
blank Snapshot/Restore cases remain required. Original Ferry UI: **one pass,
zero fail/skip**, `/tmp/them-936-ferry-ui.xcresult` and `.log`. Integrated
authenticated writer: **one pass, zero fail/skip**,
`/tmp/them-936-integrated-writer.log`; strict evaluator summary passed. The
existing writer evaluator removes its bundle on completion; output is retained,
not a claimed persistent xcresult. Full V1 UI is not rerun locally for this
slice; required hosted checks must still run on the exact head. Read-only
adversarial review found no additional blocking source defect; it is not a
GitHub approving review. All signed iOS runs erase the owned
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93` simulator first, iOS 26.2, signing on.

## Not covered / landing

Physical microphone, paid providers, shipping configuration, production
Postgres, immediate power-loss fsync, unsynced uninstall, export parity and
120-page performance are not proved. Same-project hydration request generation,
save-entry conflict guards and T-933 actor teardown remain tracked separately.
The exact #929 hosted false-clean interleaving remains unestablished.

#766 then #770 still land first after mandatory review and green gates; no
approval bypass or main write. Required hosted gates must run on this exact
final head. The human-approved pre-stack index count remains 33,626; no protected
god file grows in this change. Main is unchanged.
