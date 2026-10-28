# T1202 — required writer-save gate and missing drain handoff

## Scope and original work

Base: exact published36f07bef00d7af00f64ea38c81fe656428ce2ca3 (#976).
Isolated `/Users/halfmutantfilms/io.them-worktrees/codex-required-writer-save`,
branch `codex/T-1202-required-writer-save`. No merge in progress or changes to
original PR heads, main, protections, credentials or production.

VERIFIED: original #962 remains at856d76243ae53b34e3e24f0150ceaf9373495c3d,
based on codex/T-979-mentor-ending-integration ate68957fe. Its existing
50d04ae51e6ff92b22451d12a0b9e934aca5e267 implements a background-drain handoff;
that commit is not an ancestor of36f07be. This patch ports that specific
capability into the newer immutable save-completion design. It does **not**
claim the original retention/conflict-authority/blank-draft work is integrated.
All original commits/branches remain intact. A non-mutating merge-tree preview
of the actual T979 parent exposed broad conflicts; no wholesale merge was begun,
no ours strategy hid changes and no replacement PR was opened.

## Hosted and local evidence

- Exact #976 head36f07be Quality Gate failed in required writer Save Now,
  job122688764797/run40650362482. Manual trigger count1, dirty native text,
  no saved version and empty save queue. #977 also failed Quality Gate at its
  published head; backend tests and D009 passed for both. No merge is allowed.
- Downloaded exact #976 artifact12800592817. Its unit bundle (despite the
  v1-ui-smoke path label) proves **1107/0/0**, not a full UI suite.
- The exact canonical runner `run_studio_ios_writer_loop_contract_smoke.mjs`
  at36f07be **passed locally**,55.738s. This is stronger harness fidelity than
  the prior intercepted Home-voice runner, but it does not erase the hosted red.
- Native baseline921b445 uses actual VM -> held version HTTP -> durable outbox:
  **6 pass /2 fail /0 skip**. Both new cases drop a manual save submitted while
  background draining owns the flight; only the earlier request is sent.
- First corrected c65035e same unchanged focused cases: **8/0/0**.
- Final e7a4730 adds explicit captured-base, conflict and offline controls and
  is frozen for a signed full-unit checkpoint. Result pending.

All iOS proof erases only owned91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A and keeps
signing enabled. Authenticated canonical local server uses a synthetic test key;
no paid model/provider call or microphone/physical-phone claim.

## Root and fix

A manual save arriving during `resumeQueuedDraftSavesIfNeeded` enters the
existing pending slot. The drain used to clear its busy flag without consuming
that slot. This is a concrete additional source of missed Save, although the
hosted failure's exact scheduling has not been captured; fresh CI must prove it.

The background drain now hands its captured request back to the same canonical
dispatcher used by ordinary saves. It follows an acknowledged base only for the
same owner/project/origin and matching original base, and never changes an
explicit conflict-resolution or newer captured base. The exact acknowledged
version is retained locally, rather than copied from another project's current
UI. Both manual and background flights use one existing failure-retention rule:
a failed earlier same-scope save keeps the newer text queued/parked, while a
newer other-project request keeps its own identity and base. No new store,
framework, product state or Root/Screen edits.

## Exact files

- them/ScreenplayDraftSaveOutbox.swift
- them/ScreenplayStudioViewModel.swift
- themTests/ScreenplaySaveCompletionOwnershipTests.swift
- TASKS.md
- docs/required-writer-save-handoff-2026-10-28.md

## Separate work preserved

T1200 one-Send source is local only oncodex/T-1200-single-studio-send ata930a94.
Its first0/1/0 run proved a native key labeled Send did not submit the multiline
field. da79ac1 keeps honest paragraph Return and one explicit Send; the next
0/1/0 got through A, then exposed the test's triple-tap clearing only one
paragraph. a930a94 uses the native Select All edit menu; that helper is UNRUN.
No passing/completed claim for T1200 and no push while the lower hosted gate is red.

The human explicitly authorized communication with ZORA - THEM. Zora's initial
read-only custody review found pre-history Voice Pin retirement. Her isolated
T1201 source bb1ca4e is preserved and not integrated/native-tested. Jarvis
review found unstable history partition keys and same-process UserDefaults
cache readback being mistaken for durable proof. Zora is correcting both in
her separate lane with no native/resource contention. This is bounded visible
coordination, not an autonomous background conversation.

## Next proof

Complete the frozen full-unit checkpoint, required canonical writer journey,
macOS scaffold and D009/diff/source identity. Retain every failure. Only then
advance #976 through an ordinary preserving push and require fresh hosted
checks. Reconcile #977 and T1200 afterward without force/squash or lost history.
Zora's pin change still requires separate review and full native/integration
proof. Main and the real-phone shipping journey remain incomplete.

## Broad-check conflict finding and original retention port

`full-save-handoff-units` ate7a4730: **1111 passed /1 failed /0 skipped**.
The new conflict control expected both immutable drafts to remain, but only
the newer pending row survived. Source confirmed both version-conflict paths
removed every queued save for that owner/project. This is a distinct real
retention defect; the test expectation was not weakened.

dd25bc0 ports #962's existing `retainConflict` capability into the canonical
outbox, adding exact delivery-origin matching to its owner/project boundary.
Both actual conflict paths now park original rows before checking UI ownership,
keep their raw text and request identity, and never treat a server conflict as
delete authorization. File persistence rolls back in-memory updates on error.
The existing explicit Load Server/delete paths are outside this source change.
No new persistence format or second store. Updated focused and final broader
proof remains pending; no passing result is inherited frome7a4730.

Zora's initial T1201 source review is acknowledged. Her corrected source must
separate stable history identity from document/login leases and distinguish
fresh-launch readback from process-cache visibility. It is not merged merely
because the helper reported a local commit or parse pass.

`conflict-retention-focus` atdd25bc0: **11 passed /0 failed /0 skipped**.
The two formerly lost saves now dispatch; captured newer bases stay exact;
conflict and offline controls retain both immutable drafts with correct parked/
retry status. Existing completion/project-switch tests pass unchanged.
Final signed full-unit checkpoint on this frozen source is running.
`final-frozen-source.json` identifies the three tested code files, all exact
committed matches. Backend/scripts/CI source is unchanged from #976; no
unchanged backend suite was rerun locally. Fresh hosted gates remain required.

## Final frozen native checkpoint

VERIFIED: `final-retention-full-units` atdd25bc0: **1112/0/0**, signed on an
erased owned simulator. `final-canonical-writer` on the same source: **1/0/0**,
58.171s, using the exact required runner. Save Now, deterministic Craft read,
native export and authenticated exact relaunch execute and pass. Backend and
CI scripts are byte-identical to the published backend-green #976 source.

The first broad1111/1/0 result remains retained; the failed conflict assertion
was fixed in production code, not loosened. Final recovery UI and macOS compile
are still pending. No hosted-green or main-ready claim until fresh checks pass.

## Zora coordination and recovery failure, 2026-10-28

The human explicitly renewed Jarvis/Zora coordination. Actual chat `ZORA - THEM`
(`01a161e3-d4ea-74f1-93c2-3c8a586a3c91`) supplied a bounded read-only audit.
Her independent T1201 remains frozen at f826edd; it has parse/static proof only
and is not integrated. Native, backend, publishing and simulator resources
remain exclusively owned by Jarvis. No paid calls or main changes.

The dd25bc0 recovery UI run failed **0 passed /3 failed /0 skipped**. Reconnect
and real-auth refresh saved the exact local words but left one parked request;
the conflict case retained two requests where the old test expected deletion.
All failures remain in `recovery-first-summary.json`. This invalidates any
recovery-complete claim from the earlier unit/writer results.

Read-only synthetic queue/server metadata shows the final parked row's document
ID matches persisted Bridge identity. Therefore an origin mismatch is not
confirmed. The first save was acknowledged under d08763fc and a later stale
request fea940df was created after it, then rejected. No screenplay or token
was printed; only fixture IDs, times and hashes were compared.

Zora independently confirmed a source bug: enqueue could coalesce another
request ID, but delivery continued using the caller's unretained ID. Jarvis
changed delivery to receive the actual durable entry and acquire the save
flight before its first actor suspension. Focused native proof is pending.
Zora's adversarial review correctly flagged that canonicalization must compare
all server-written metadata, and the pre-choice UI assertion must require an
exact retained-row count, not merely a lower bound. These are implementation
requirements, not grounds to weaken the recovery workflow. Explicit Load Server
cleanup and the next actual recovery run still need proof before publication.

### Independent review changed the implementation

Zora's two findings were accepted: content coalescing now compares all
server-written target metadata (title, phase, source, notes, anchors, bindings
and initial-project metadata), and the conflict fixture requires exactly one
parked local request before the explicit choice, zero afterward. The first
canonical-ID/flight checkpoint passed **27/0/0** before the metadata tightening.
That count is not inherited by the later source.

Runtime inspection on the subsequent recovery run still exposed a passive
`studio_autosave` using an old base after a manual save was acknowledged. Thus
request-ID canonicalization alone does not close the false-conflict defect.
Zora reviewed the proposed narrow server readback: only a passive retry with
no notes may be satisfied by the current exact server words, phase, title,
anchors and bindings. Embedded version ID must match both the response head
and returned project's active version. Retirement must remove only the exact
request, leaving other parked/queued copies untouched. Explicit saves and
resolution intent remain genuine conflicts. Implementation/proof is pending.

### Strict passive readback implementation checkpoint

The next signed full-unit run passed **1115/0/0**. This source includes the
canonical durable request-ID fix, pre-suspension flight acquisition, strict
all-target metadata coalescing, exact conflict fixture count, and the reviewed
passive readback factory. The factory requires the returned project's exact
title/ID/current active version, matching conflict envelope head, exact raw
words/phase/anchors/bindings, original backend/document origin and current auth.
Only `studio_autosave` without notes is eligible. Manual Save, snapshots and
Keep Mine are excluded. It retires only the acknowledged passive ID, and exact
removal now restores in-memory state if disk persistence fails.

The prior canonical-ID-only recovery remained **0/3/0**; those artifacts are
retained separately. The strict passive implementation's recovery run is now
active, not passed. No asymmetric parked-row coalescing was implemented: Zora
identified atomicity, relaunch reachability and legacy-origin risks. A bounded
metadata-only observer records synthetic queue identity transitions to locate
any remaining duplicate producer. No screenplay or credentials are collected.

Exact additional files in this checkpoint:
- them/ScreenplayDraftSaveEvidence.swift
- themTests/ScreenplayDraftSaveEvidenceTests.swift
- themTests/ScreenplayDraftSaveOutboxTests.swift
- themUITests/V1SmokeUITests.swift

D009 passes against current local origin/main; all five gate files are unchanged
by T1202. `git diff --check` passes. Mac scaffold and strict recovery completion
remain pending; no GitHub advancement or main change has occurred.
