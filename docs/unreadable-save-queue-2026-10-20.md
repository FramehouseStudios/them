# T-1068 — A queue-read failure must not authorize remote hydration

Owned branch `codex/T-1068-unreadable-save-queue` starts at original #904
0209a1263cde76e7d57227fcee913ff7df59aec2. No reset, stash, unrelated stage,
new PR, whole-stack import or main mutation. Preserve all original heads.

## Contract / evidence before correction

**VERIFIED source:** the actor correctly throws and retains unreadable
`queue.json`; its existing corruption test proves those bytes survive.
Studio's restore method catches that error and returns void. Bootstrap and
the newly canonical guarded detail wrapper continue loading server content,
conflating an unreadable queue with a valid queue containing no local saves.
The later preserved #962856d7624 restore catch also returns nil; its richer
retention work does not establish fail-closed handling of this error here.

Binary success: a real model with a corrupt owned manifest must return false
from hydration, keep the visible raw page/newlines and version unchanged,
leave manifest bytes untouched across repeated read attempts, and explain
the blocked refresh. A repaired valid test fixture must permit normal
hydration again and clear only the dedicated read warning, not an unrelated
failure. Production must never automatically replace the unreadable queue.

Characterize with the actual Studio ViewModel and existing injected actor,
not fake page logic, raw source-regex assertions or a missing-method compile
failure. First permission review timed out before any edit/process; read-only
checks confirmed no change, log or process. One authorized retry applied the
test and started native proof. This administrative timeout is not a failing
app test or evidence that the edit is unsafe.

Then use an explicit result from the existing restore owner; both bootstrap
and detail wrapper must stop on failure. Extend the existing recovery
presentation policy for one warning owner, revalidate identity before
publishing it, and preserve all healthy/dirty queue restoration behavior.
No new store, dependency, framework, data deletion, hidden successful save,
weaker assertion, paid provider or unsigned iPhone test.

Proof scope: signed failing-first actual-model, signed units including
healthy outbox/recovery, authenticated native relaunch/reconnect/conflict,
actual-base D009/diff. Use existing unchanged backend proof only after source
identity check. Keep old reds and skips, fresh hosted checks and independent
review. Physical microphone/intended-backend/export-open journey remains
unverified; production hold and active goal remain unchanged.

## Executed correction

**VERIFIED before:** frozen tree9879c74007ea26698a39ee81ee5d50ea0805e593,
signed erased owned375pt SE/iOS26.2,0 passed/1 failed/0 skipped, native65.
Actual model reports hydration accepted despite the corrupt manifest;
the first failure is the explicit rejection assertion. Full bundle:
`/tmp/them-1068-before/v1-ui-smoke-local-1-4021.xcresult`.
One summary lookup guessed an incorrect suffix and exited64; corrected to
the discovered4021 bundle without rerunning the actual test. Do not count
that diagnostic typo as a separate app failure or a passing reproduction.

The same private restore owner now returns whether reading was safe. Its
catch revalidates account/project before publishing the dedicated warning
and returning false. Both bootstrap and the canonical detail wrapper stop
before server hydration on false. A healthy read still restores eligible
queued text, or continues normally if there is no applicable queued copy;
the warning is cleared only by exact identity with this owner's message.
The presentation copy lives once in the existing recovery policy, not a
new alert/auth/persistence architecture. No queue bytes are altered on read
failure. Only the test repairs its deliberately malformed owned fixture.

After executable source is frozen at47339d87aa8214faab998c46b7eabc5b4cdf945a;
the first actual-model assertion and all subsequent raw page/base/manifest,
valid retry and unrelated-error checks are unchanged. Signed full units,
authenticated recovery and macOS compile are running serially, not claimed
green before terminal results.

Adversarial limits: this correction covers queue-read failure at the two
server-hydration entries, not disk repair, every other live/stream mutation,
physical device file-protection transitions or a corrupt recovery store.
It does not prove that arbitrary damaged queues can be reconstructed. An
unreadable manifest is retained, not silently interpreted as an empty queue.
When later #925/#928/#962 restoration contracts are integrated, retain this
explicit error distinction rather than collapsing it back into nil/no copy.

## Verified final proof / publication boundary

**VERIFIED:** signed full units654 passed/0 failed/0 skipped, native0,
same erased task-owned375pt SE/iOS26.2. Actual bundle
`/tmp/them-1068-after-units/v1-ui-smoke-local-1-4667.xcresult`.
The original failing rejection assertion and subsequent page bytes, version,
manifest, valid retry and unrelated-error assertions are unchanged. Existing
T1067 queued Unicode/newline preservation also passes in this full bundle.

**VERIFIED:** existing authenticated native offline/relaunch/reconnect and
expired-auth/conflict/Keep Mine recovery2/0/0, native0, same erased owned SE:
`/tmp/them-1068-recovery/them-save-recovery-NkaFXX/recovery-ios.xcresult`.
Native summary read independently, not accepted from stdout alone. Dummy
provider and controlled DEBUG faults, not real radio/provider behavior.

macOS scaffold compile native0. Existing concurrency/deprecation warnings
remain. Backend/scripts/workflow/packages compare identical to0209a126;
reuse recorded Node20.20.2 full backend2753/0/2, not a new backend run here.
No fresh writer/export UI or whole V1 cohort: T1067's1/0/0 writer proof is
historical at0209a126, not this head. Required hosted gates still must run.
Actual-base #96481b05e44 D009/diff pass; no protected file grows in this slice.
The33626 index early-stack exception remains unchanged.

Complete native before/units/recovery bundles, logs and frozen tracked source
are retained privately under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1068-20261020.3sxeJi`.
All three native directories byte-compared after copying; nothing moved or
deleted. Owned backend stopped, exact temporary dependency symlink removed,
no private environment introduced/read/staged, no paid call.

Source inspection confirms existing `studioRailStatusStrip` renders the
published error through multiline `studioRailStatusRow`, identifier
`studio.error.text`; no parallel alert or disconnected action was created.
The compact header remains single-line. This is source-binding evidence,
not a new rendered warning/accessibility/UI proof for the corrupt fixture.

## End-of-session record

1. **Completed:** reproduced unreadable-queue acceptance and corrected
   both server-hydration entry points to stop rather than interpret it as empty.
2. **Files:** `them/ScreenplayStudioViewModel.swift`,
   `them/ScreenplayStudioRecovery.swift`,
   `themTests/ScreenplayDraftSaveOutboxTests.swift`, `TASKS.md`, this document.
3. **Root:** queue read errors were swallowed by a void restore contract;
   callers could continue over the visible page. One explicit result and one
   existing presentation owner now preserve the error distinction and retry.
4. **Proof:** before0/1/0 retained; after654/0/0 signed units, recovery2/0/0,
   macOS0, actual-base D009/diff pass. Historical backend/writer and all
   unperformed live/UI/physical evidence are explicitly separated above.
5. **GitHub:** same original #904, normal descendant of0209a126; preserve
   original base #964 and every commit. Fresh checks/review required; no
   main merge, replacement PR, force/squash or approval impersonation.
6. **Next:** carry the corrected original parent into retained #919 and
   #973, preserving all histories; inspect the first new hosted failure.
   Preserve later original recovery contracts and explicit error semantics.
7. **Continue:** READY FOR CONTINUE; goal active and production held. Real
   physical-phone microphone/story/reply/line rewrite/save/offline/relaunch/
   external-open export against the intended backend remains unverified.
