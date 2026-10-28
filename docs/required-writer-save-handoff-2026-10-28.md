# T1202 — required writer-save gate and missing drain handoff

## Current checkpoint (2026-10-28)

VERIFIED on the final typed-projection source: focused signed units **57/0/0**,
authenticated recovery UI **3/0/0**, macOS scaffold build, D009 and diff checks
pass. The UI proves one recovered version across reconnect, real401/refresh/
fresh-bearer save, and explicit Keep Mine. Source SHA recheck found0 mismatches.
The earlier broad1126/0/0 checkpoint predates the final projection refinements
and is not presented as a full-unit run of the current head. All earlier
failures and the Accessibility initialization error remain recorded below.

No paid model calls, GitHub head advancement, main merge or deployment. The
backend is unchanged from published #976; no unchanged backend suite was
rerun in this pass. Full current gates remain required before publication.
Explicit Load Server retirement is the next implementation task. This is a
verified local recovery component, not integrated-main or real-phone proof.

Actual chat ZORA - THEM reviewed the code and challenged unsafe assumptions;
Jarvis implemented the corrections and owns integration. Her separate T1201
f826edd source stays frozen, preserved and not integrated/native-proven.

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

## Root cause confirmed by identity transitions

The metadata-only trace supersedes the earlier remaining-row-only hypothesis.
It captured the original queued manual row with document65cab9e0, followed on
relaunch by a passive row with documenta65fd748 for the same project/base before
the original acknowledgement. The true-conflict fixture likewise changed
documents63e2ed2c -> eb40ce72. Comparing only the final row to final Bridge
identity had hidden that transition; it did not disprove a restoration defect.
Strict passive readback alone also failed **0/3/0** and is retained separately.

The root patch restores the validated queue entry's exact document/base before
Bridge publishes its words. Owner/session, ordinary pending/inflight status,
raw bytes, project and backend must match. VM restoration accepts the queue
only when persisted words match it or a fetched saved base; differing newer
words remain untouched. The initial no-baseline pass defers to the project
read. Existing legacy nil-origin behavior is unchanged and has no new exact
provenance guarantee; it remains a separate compatibility boundary.

The redundant Bridge restore wrapper was removed in favor of its existing
canonical origin policy. Bridge shrinks5 lines; no god file grows. Zora's final
read-only review found no critical flaw and checked the preferred-context
didSet hooks and outer load guards. She requested retaining publication-order
and newer-word negative regressions; both are included.

First root checkpoint failed to compile because a new test omitted the
required local recovery-store dependency. It executed no tests; this is not a
product test failure or a passing result. Corrected fixture uses an isolated
UserDefaults suite. Fresh signed unit/recovery proof is still pending.

### Exact origin restoration results

Corrected signed full units: **1118/0/0**. Actual recovery improved to
**1 passed /2 failed /0 skipped**. Reconnect passed. Real-auth refresh now
reached saved/empty-queue state but exposed two server versions for the same
exact draft, so the exact-once assertion correctly failed. True conflict
retained a manual row plus identical passive autosave under the **same**
original document ID; the exact-one pre-choice assertion correctly failed.
This confirms the identity root fix while exposing a separate missing #962
passive-housekeeping capability. No count assertion was weakened and no
recovery-ready claim is made. Next: prevent passive work from duplicating
explicit saves and writing while a conflict choice is unresolved.

## Passive duplicate fix and atomic delivery review

After exact origin restoration, authentic refresh still created two byte-identical
versions (manual and passive), and true conflict retained an identical passive
copy beside the manual request. These are independent duplicate producers,
not justification to weaken the exact-one assertions. The first housekeeping
checkpoint passed signed1121/0/0; the final atomic-outcome refinement is not
covered by that earlier count.

The outbox now preserves an existing explicit request's ID/source/notes when
identical incoming passive housekeeping targets the same valid origin/base
and all desired payload fields. The exception applies only to active rows,
never parked. Explicit incoming intents or changed bytes/bindings remain
distinct. A returned current project/version can satisfy a passive retry only
when its exact words/title/phase/anchors/bindings and base all match, adapting
original #962's satisfied-autosave capability. Only that ID is retired.

Zora identified a concurrency gap before publication. Actor-atomic delivery
now has explicit deliver/already-inflight/parked dispositions. Only the queue
drain can continue its exact prior beginNext claim; another caller joins
inflight work without dispatching again. VM saved/waiting/needs-decision
outcomes prevent terminal attention from entering generic failure retention.
Inflight transition rolls back if persistence fails. Passive submission is
rechecked while a conflict choice is unresolved, including pending handoffs;
identical passive work cannot manufacture another rejected copy.

Final signed proof and actual recovery remain pending. Explicit Load Server
retirement/relaunch authority is still a separate known task before any
publication. No source push, main merge, paid call or production change.

### Adversarial corrections before publication

Atomic-outcome signed units passed **1122/0/0**, but Zora then found three
remaining risks; that count does not prove the corrected source:

1. A cached selectedProject was being treated as a fresh receipt. That shortcut
   and its policy were removed entirely. Passive pending work can now be
   absorbed only against the same flight's freshly returned acknowledgement,
   exact target/origin/base and matching auth. A clean background task simply
   creates no new save intent; explicit Save still executes.
2. Failed-request equality alone did not prove retention. Failure absorption
   now checks the exact stored manifest row/ID/target and rechecks current auth
   after the actor wait. Otherwise it preserves the passive request.
3. Failed queue insertion could leave an undurable actor-memory row. Append/
   sort now restores the previous actor state if persistence throws.

Focused signed four-class proof is running on this corrected source. Zora's
review lane is frozen; she has not run native/backend jobs, edited this checkout,
used provider credits or published anything. Direct coordination and accepted
findings are recorded in her actual chat, not attributed to an imaginary
independent reviewer. Her separate T1201 commit remains preserved/unintegrated.

### Current corrected checkpoint

After removing cached-project confirmation and requiring exact manifest-backed
retention, focused signed Outbox/Completion/Evidence/Origin checks passed
**65/0/0**. These are current focused counts; the1122/0/0 broader run was on
the earlier atomic source and is not relabeled as current. The three actual
recovery workflows are now running on the corrected source.

Jarvis self-review also identified a pending-slot ownership hazard in the new
dispatch wrapper: a request consumed by the inner coalescing loop must clear
its pending slot, or the outer wrapper could dispatch it again. A same-words
manual pending regression and the canonical one-line consumption fix are next.
This finding will be resolved before any publication, even if the current
three recovery scenarios pass.

## Binding-clock duplicate root and pending-slot consumption

Fresh-ack recovery improved to **2/1/0**. Auth-refresh's remaining failure was
exact-one-version: the two saved versions had identical raw draft and all
binding fields except `screenplayBindings[].updatedAt`. A read-only comparison
recorded changed field names only, without exposing script or credentials.
Source currentScreenplayBindingPayload assigned every row the refreshed whole
project snapshot timestamp, so an observation refresh manufactured a payload
change and therefore another screenplay version.

The producer moved into `them/ScreenplayBindingPayload.swift`. It preserves a
prior record only when every mapping field matches; real changed mappings get
the new timestamp. It emits empty optional strings in the backend's existing
normalized form (backend/index.js normalizeStoredScreenplayBinding) so the
server round trip does not manufacture a nil/empty-string difference. Strict
queue/evidence comparisons remain intact. Screen shrinks19 lines; Bridge
remains5 lines smaller. No new persistence system, framework or dependency.

The inner dispatcher now clears a consumed pending intent before deciding
whether to coalesce it; the outer wrapper cannot redispatch that same slot.
An actual VM/HTTP regression asserts an identical pending manual intent causes
only one request and leaves no queue row.

Signed four-class focus before empty-string alignment: **67/0/0**. Current
Evidence/Completion focus after the contract alignment: **31/0/0**. Current
three-workflow recovery proof is running; source SHA identities are recorded
in stable-binding-source-identities.json. No broad count is inherited by the
new producer. Zora agreed with fixing the timestamp producer instead of
weakening payload equality and remains frozen.

## Full exact changed-file scope from published #976 base

- TASKS.md
- docs/required-writer-save-handoff-2026-10-28.md
- them/ScreenplayBindingPayload.swift
- them/ScreenplayDraftSaveEvidence.swift
- them/ScreenplayDraftSaveOutbox.swift
- them/ScreenplayLiveDraftBridge.swift
- them/ScreenplayStudioScreen.swift
- them/ScreenplayStudioViewModel.swift
- themTests/ScreenplayDraftSaveEvidenceTests.swift
- themTests/ScreenplayDraftSaveOutboxTests.swift
- themTests/ScreenplayLiveDraftOriginTests.swift
- themTests/ScreenplaySaveCompletionOwnershipTests.swift
- themUITests/V1SmokeUITests.swift

## Preserve queued metadata authority during hydration

Producer-only recovery remained **2/1/0**, with the same real-auth duplicate
assertion. The remaining root was earlier in restoration: queued text/base/
origin were restored, but queued anchors/bindings were omitted; hydrateDraft
then assigned old server metadata *before* applyServerDraft rejected the text
overwrite. A refresh could therefore replace unresolved local metadata and
force a new binding timestamp even with the stable producer.

Queued text, anchors and bindings now restore together. Server metadata is
adopted only after its exact project/version/raw draft was actually loaded
and is clean. The protected-local case keeps the queued payload intact.
A regression extends actual project hydration with queued annotations and
bindings and asserts both survive the server conflict. Versionless projects
explicitly clear old project metadata after their empty draft is accepted.

The first edit assertion matched two source regions and made no source change;
the shell nevertheless launched an unchanged-source focus. It is excluded
from corrected proof. The process had already exited before the verified
interrupt attempt, so no signal was sent. Subsequent commands use fail-fast
execution and scope the patch to exact methods. The applied metadata focus
passed; its raw summary is stored separately. Final broad signed checkpoint
and final actual recovery remain pending on the final versionless guard.

### Final broad native checkpoint and infrastructure interruption

Final-metadata full signed units passed **1126/0/0** on the frozen SHA-identified
source. The final recovery result bundle WhQfAa failed before XCTest initialized
Accessibility: no requested workflow executed, one runner error, start/finish
separated by approximately11 hours. No product timing claim or passing UI claim
is derived from that interval. Simulator's actual native AX tree was readable
afterward. One fresh run is active with a temporary keep-awake assertion bound
to that process; no security settings or login credentials were changed.

## Passive projections versus explicit writer intent

The responsive current-source recovery still exposed one extra auth version.
Its additional anchors were restored conversation-history projections (3 vs0),
not changed screenplay words. Screen derives these from the separately
persisted canonical history; bindings derive from the canonical outline and
parsed page. Creating another screenplay version merely for those passive
refreshes violates the existing exact-one writer-save contract.

DECIDED implementation distinction, reviewed by Zora: strict full-metadata
queue equality stays intact, and every explicit manual/snapshot/resolve/page
write or nonempty-note request stays independent. Only an empty-note passive
autosave may be absorbed after the SAME FLIGHT's fresh typed confirmation of
identical owner/project/document/backend/base/title/phase/raw writer words.
Only its exact passive ID is removed. No cached-project shortcut is restored.
The existing ScreenplayConfirmedDraftSave object must be present; a bare
version ID or incomplete legacy acknowledgement cannot authorize absorption.

Acknowledgements now replace editor anchors/bindings only if those values
still equal the submitted request. Newer restored projections remain in the
editor. An actual held-request test proves this preservation, and another
proves an explicit second Save with changed metadata still dispatches twice
on the first acknowledgement's version. The peer now echoes the real
immutable ID/project/draft/metadata contract instead of omitting those fields.
Current focused signed checks: **57/0/0**. Actual recovery remains running.

Not covered by this component proof: microphone/model quality, real phone,
shipping endpoint, Release/TestFlight, production, all original stack merges,
T1201 process-relaunch pin retirement, and explicit Load Server cleanup.
Canonical projection persistence/regeneration remains covered by its existing
source contracts; no new crash-durability claim for conversation history is
made by these save tests.

## Final current-source result and next action

The typed-projection recovery bundle A0NSUM passes **3/0/0**, on the same source
as focused **57/0/0**. It executes authenticated local backend writes and
strict exact-one-version/auth-refresh/Keep Mine assertions; no retry loop or
weakened cardinality assertion produced the result. All providers remain
intercepted; no microphone, paid model quality, physical iPhone or shipping
endpoint claim. Mac desktop scaffold build succeeds on this same source.

`typed-projection-source-identities.json` and its post-UI check prove unchanged
Swift files. D009 passes against locally recorded origin/main78b8c94; Screen
shrinks19 lines and Bridge5 lines relative to the #976 base. `git diff --check`
passes. Current backend, scripts and CI files are unchanged from the published
base; their earlier results are not relabeled as new local runs.

Next implementation: finish explicit Load Server retirement with exact owner/
project/backend/document scope, preserving newer edits and late in-flight
requests, using the preserved original #962 authority work as source. No broad
removeAll or premature deletion. Then run the current required publication
checkpoint and advance #976 normally only after the complete scoped workflow
is ready; reconcile #977/T1200 and review/prove Zora's preserved T1201 separately.
Main protections and the production hold remain intact.

## Permanent private evidence archive

- Path: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1202-save-recovery-20261028-pc9bm8ix`
- Copied artifacts: 33537 files, 0 SHA-256 mismatches.
- Manifest SHA-256: `1dead6d9edb27a1d1de42e5750209afb3992a3ed7303ca02ac1e9b431c0125fc`

The archive contains the prior failures, runner initialization interruption,
final focused/unit/UI summaries, macOS build log and frozen source identities.
It is private local evidence, not staged or uploaded. Original temporary proof
was preserved; nothing was deleted or overwritten.

## Load Server investigation — next implementation boundary

VERIFIED by source review at 12e5a25: `applyServerVersionFromConflict` trusts
the cached conflict draft, clears the local recovery and conflict presentation,
and does not retire parked outbox rows. Its empty-draft fallback starts an
asynchronous load but still reports success immediately. `pendingEntry` excludes
parked rows, so the parked conflict choice cannot currently be reconstructed
from that lookup after relaunch. These are code findings, not a new live repro.

Zora independently reviewed the preserved original #962. Its current-head
fetch and edit-during-fetch guard are useful, but its project/owner-wide
cleanup and in-memory authority fence are insufficient for the current exact
document/backend boundary and relaunch. Do not port broad `removeAll` or use
`markSucceeded` for a writer's Load Server choice.

Next: capture immutable owner/project/backend/document and conflict authority;
fetch and validate the current head; recheck the exact page and identity after
the wait; durably retire only the selected pre-choice parked conflicts and
fence late pre-choice responses; then apply the server draft and clear the UI.
Keep nil-origin legacy rows conservative and preserve new post-choice edits.
A failed durable write must leave the page, recovery and conflict choice intact.
Test both choices through relaunch, delayed responses, scope changes, stale
heads and persist failure. The exact durable authority representation and
implementation have not yet been selected or validated.

## Interim Load Server safeguard

When the conflict contains no server draft, the action now keeps the current
page, dirty flag, recovery copy and conflict choice, and reports that the
server draft could not be confirmed. Previously it started an async load and
immediately cleared recovery and claimed success. This is an interim safety
guard: a genuinely empty server draft also cannot yet be selected. Fresh-head
fetch, scoped durable retirement, relaunch and late-response fencing remain
required before the full Load Server action is complete or published.
The signed ScreenplayStudioDraftRecoveryTests result is recorded separately in
`/private/tmp/them-load-server-empty-guard-summary.json`.

## T-1203 candidate review — do not integrate yet

Zora preserved candidate `1f03d3574b39768a016185ae9def9c572a5b6a9a` on
`codex/T-1203-load-server-fence`, based on4a3525c. It has static parse and
whitespace checks only; no native tests or integration proof. The earlier
array queue can be read forward, but after its first resolution the object
manifest cannot be decoded by the older array-only app on rollback. This
needs a reviewed migration/rollback solution before publication.

Jarvis source review found two additional critical design issues. First,
`isCoveredByLoadServerResolution` and `purgeResolvedEntries` cover every
ordinary scoped row before the timestamp cutoff, including pending/inflight
rows the writer did not choose to discard. That can delete distinct writer
edits. Second, `DraftSaveRequest.outboxEntry` materializes `createdAt` using
the current time each time it is created. A request captured before the choice
but materialized afterward can evade the timestamp fence. Thus wall-clock
cutoff is not a reliable immutable admission authority. These are verified
source findings; no simulated proof or claim of data loss in production.

Do not merge or use the candidate as-is. Next: design an immutable captured
request authority, exact explicitly selected durable row identities, a durable
late-admission fence and a reviewed rollback-compatible storage strategy.
Preserve the candidate and original #962 history for comparison. Retest
relaunch, newer pending edits, legacy data, persistence failure and actual
Load Server UI after the canonical VM integration exists.

## Stable save-request creation metadata

DraftSaveRequest now captures createdAt once, retains it when rebased, and
restores it from its durable outbox entry. Materializing an entry later no
longer silently moves the request's creation time. A focused signed outbox
regression covers repeated materialization, rebase and restoration. The first
compile attempt failed due to a duplicate argument; it executed no tests and
was corrected before the passing run. This timestamp is **not** an authority
generation or permission to discard any rows: the exact Load Server fence,
rollback compatibility and UI integration remain outstanding.

## Queue-claim persistence rollback

`beginNext` formerly changed the in-memory row to inflight before writing the
manifest, and retained that change if persistence failed. It now restores the
previous actor state on write failure. A signed regression makes the actual
queue directory unwritable after enqueue and verifies the in-memory row and
the prior disk copy both remain pending. This does not resolve Load Server
authority or prove the full app. Results: /private/tmp/them-save-claim-rollback-summary.json.

## Cached Load Server snapshot safeguard

A nonempty cached conflict snapshot does not establish the current server
head, and applying it previously cleared local recovery without retiring the
parked conflict requests. Until fresh-head validation and exact request
retirement are connected, Load Server reports that it is temporarily
unavailable and preserves the local page, recovery copy and conflict choice.
This is an interim safety hold, not a completed Load Server implementation.
On an erased task-owned simulator, signed ScreenplayStudioDraftRecoveryTests
passed 76/76, zero failures and zero skips; the focused regression checks
both empty and nonempty unverified snapshots. D009 and git diff --check passed.
Result bundle: /private/tmp/them-conflict-guard-20261028.xcresult.

## Revised T-1203 candidate review

Zora's candidate 2e2a39d5 is local and not integrated. Review found its
sentinel retirement markers retain full screenplay content outside the real
owner scope, and legacy parked conflicts without request authority cannot be
resolved. The existing account-deletion flow also does not purge the draft
outbox; the candidate must not compound that retention issue. Zora is
revising the candidate to retain only a deterministic digest, handle exact
durably parked legacy rows, and support scoped marker cleanup. Account
 deletion, already-in-flight server writes, fresh-head races, rollback and
actual conflict/relaunch UI behavior remain separate integration concerns.
No native proof is claimed for the candidate.
