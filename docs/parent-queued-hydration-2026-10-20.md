# T-1067 — Queued writer authority at independent hydration entries

Original #90410167e322d432df9bd0d6bc5324cd49ccfdae28f, owned clean
worktree switched to `codex/T-1067-parent-queued-hydration`; no reset, stash,
replacement PR, source overwrite or main mutation. #972's separate owned
navigation work remains preserved and uncommitted, not called merge-ready.

## Verified boundary and plan

Fresh original #904 hosted run39461247037 failed recovery with1 pass,
1 failure,0 skips; full units652/0/0 and V1 UI30/0/9 passed earlier stages.
Retained native artifact:
`/tmp/them-1066-parent-904-native/Users/runner/work/_temp/them-save-recovery-QhKfYU/recovery-ios.xcresult`.
The failed expired-auth/conflict snapshot shows the competing server marker,
dirty=false, manual=false, queue0, conflict=nil. Native screenshot
79B16B08 confirms the visible server page and clean/saved presentation.
This is a lost writer-choice presentation, not proof every disk copy vanished.

Read original #9259cc7de0e, #92834272775 and #93325231907 bodies and
diffs before deciding. They own distinct durable conflict retention,
independent queued hydration, and stale conflict-head ordering. Preserve
them and their remaining stack semantics. Do not silently claim them landed.

**VERIFIED source:** bootstrap restores the pending copy before loading a
project, but both independent detail/outline paths still call synchronous
`hydrateDraft` directly. They can apply collaborator text without consulting
the durable queue. Reuse #928's guarded async wrapper rather than adding a
parallel store, timeout, retry or editor-specific save convention.

Characterize this boundary by first extracting that wrapper as a delegating
no-op at both real call sites. Reuse only #925's existing default-shared
outbox injection seam. Adapt #928's actual-model regression to the active
queue available here, not its later parked-conflict API: an owned queued
Unicode/newline writer copy must survive a competing project response, keep
dirty/conflict state, and remain in the same queue. Missing-method compile
failure is not a reproduced product failure; require actual assertions.

Then port the original wrapper's queued restoration and post-await identity
checks, leaving the real-model assertions unchanged. Prove signed focused
before/after, full units and authenticated recovery on erased owned SE,
and D009/diff against actual #96481b05e44. Reuse backend proof only if source
identity is verified. Original #904 advance must retain10167e3 and
its base; fresh hosted checks and actual independent review still required.

No paid calls, user credentials, production-domain/secrets changes, actor
opt-out, weakened assertion, unsigned iPhone tests, new framework or claim
of physical-device/live voice/whole-app completion. Goal remains active.

## Executed before / root correction

**VERIFIED actual-model red:** frozen tree
`992206cec51184b09c659c67ce56e0aa5b353ee3`, signed erased375pt owned SE26.2,
0 passed/1 failed/0 skipped, native65. Its real model applies collaborator
bytes instead of the queued writer Unicode/newline bytes. Bundle
`/tmp/them-1067-before/v1-ui-smoke-local-1-319.xcresult` retained. This is a
thin delegating characterization seam on the two real detail/outline paths,
not a missing-method compiler failure or fake in-memory screenplay engine.

Ported #928's existing wrapper body unchanged, including both pre-restore
project check and post-await auth/project revalidation. Only #925's default
shared queue injection seam was reused; no new owner/store or dependency.
After source tree `4634fb9f2c1c3c87b988d879981dacc2936672fb` is under full
signed unit proof; no after result claimed until the process terminates.
The same real-model regression and version/conflict/queue assertions remain.

One D009 invocation used an incorrectly guessed ref and printed only counts
without base deltas. That is not accepted comparison proof. Resolved actual
base through GitHub, fetched explicit
`codex/T-984-main-simulator-proof` at81b05e44ab254cdd73e8d9d22d0d966cf6877e82;
actual comparison passes: Studio−4, bridge−23, other three0. No padding or
line-count exemption change. Accepted33626 index pre-stack exception remains.

## Verified after and remaining scope

**VERIFIED after:** full signed units653 passed/0 failed/0 skipped, native0,
same erased owned SE/iOS26.2. Actual retained bundle:
`/tmp/them-1067-after-units/v1-ui-smoke-local-1-1323.xcresult`.
The previously red Unicode/newline writer-copy regression is unchanged.

**VERIFIED authenticated recovery:**2 passed/0 failed/0 skipped, native0,
`/tmp/them-1067-recovery/them-save-recovery-12YlIX/recovery-ios.xcresult`.
Unchanged offline/relaunch/reconnect and expired-auth/stale-conflict/Keep Mine
UI, exact full-draft and exactly-one saved version assertions. Local dummy
provider and controlled DEBUG faults, not paid speech or physical networking.

Backend, script, workflow and package source compare byte-identical to10167e3
(`git diff 10167e3 -- backend scripts .github Packages` empty). Reuse the
recorded Node20.20.2 full backend2753/0/2 at that executable boundary; no new
full backend run is claimed for this four-file Swift/docs slice. Exact-head
hosted checks still must run. New whole V1 cohort and interactive macOS were
not run here. Writer regression/macOS compile are tracked separately below.

Complete before/after native units/recovery, logs and frozen tracked source:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1067-20261020.TZGDCz`.
After-unit/recovery copies byte-compared; parent hosted red is retained under
T1066's private evidence owner. No artifact/source moved or deleted.

Adversarial scope: actual queued writer versus competing detail is answered
by failing-first real-model and native recovery evidence. The explicit
wrapper rejects a changed project before restoration and auth/project change
after suspension; paused-actor race injection was not newly performed. Queue
corruption/read failure still follows the existing restore catch and is not
proved fail-closed here: inspect/fix that owner next rather than claim this
patch covers every persistence failure. Parked immutable conflicts, stronger
head ordering, raw boundary-whitespace retention and failed Load Server fetch
remain owned by later originals #925/#928/#933. Their full work is not ported
or discarded. No claim that every possible cause of the hosted failure is
solved, or that the current old run became green retrospectively.

**VERIFIED writer regression:**1 passed/0 failed/0 skipped, native0,
`/tmp/them-1067-writer/writer-loop-30d9d827-b39a-4928-ab89-050e99424841.xcresult`.
Authenticated local fixture creates, saves, exports Markdown and restores
the project after relaunch. This is not microphone/model output or opening
an export in an external physical-phone app. macOS scaffold compile native0;
existing Swift concurrency/deprecation warnings remain, interactive macOS
not proved. Writer bundle byte-compared after private retention too.

## End-of-session record

1. **Completed:** reproduced independent hydration bypass of an existing
   queued writer copy; ported #928's single guarded wrapper into original
   parent #904, preserving all original commits and later recovery work.
2. **Files changed:** `them/ScreenplayStudioViewModel.swift` (canonical
   wrapper/two calls and #925's default-shared injection seam),
   `themTests/ScreenplayDraftSaveOutboxTests.swift` (adapted original real-model
   regression), `TASKS.md`, this document. No accepted decision changed.
3. **Root issue fixed:** detail/outline refresh must restore the current
   owner's queued draft before server text, not rely on startup having run.
4. **Verification:** before0/1/0 retained; after653/0/0 signed units,
   recovery2/0/0, writer1/0/0, macOS compile0, actual-base D009/diff pass.
   No repeated unchanged run, paid call, new full V1 cohort or fresh full
   backend run; reuse unchanged backend's recorded2753/0/2 explicitly.
5. **GitHub:** scoped branch `codex/T-1067-parent-queued-hydration` from
   original10167e3. Normally advance original
   `codex/T-truthful-required-ios-smokes` / #904, base #964 unchanged.
   Fresh hosted checks and independent review required; no main merge,
   force/squash, replacement PR, auto-merge or approval impersonation.
6. **Next:** verify fresh original parent gate, preserve-merge into original
   child #919 then its security child #973; investigate queue-read failure
   before declaring all recovery fail-closed. Preserve separate #972 WIP.
7. **Continue:** READY FOR CONTINUE; goal active. Physical-phone/live speech,
   intended shipping backend, external-open export and release configuration
   remain unverified. Production hold unchanged. No app-complete claim.
