# T-1469 — Verify the chosen writer version across retained recovery copies

## Completed and exact scope

Local test-contract candidate descends directly from original979 published
`7b9c3e21b27636b74cc4bcf2e0538bebbf0c2544`. Only the body of
`test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once`
changes in V1SmokeUITests.swift, plus this proof record and an additive TASKS entry.
All41 test identities and every other method remain byte-identical7b. Runtime,
actor, backend, native runner, fixture signup/auth, dependencies and workflows
are unchanged. Root owns review and all subsequent execution/publication.

## Verified red and artifact boundary

Required recovery in original979 run43389817387/job131766784963 failed at the
stale-conflict readiness wait:1 passed/1 failed/0 skipped, two tests total.
The ordinary relaunch/reconnect case passed. The stale-conflict case failed
before Keep Mine; none of its later resolution assertions is claimed passed.
Root verified official artifact14021413231 SHA256
`b53c58365f2d9c8e956ed32bb83122c7cd1da9657ab95223eb194327b4adec00`.

Read-only activity/diagnostic exports show the failing project's queued1/parked0
state at08:25:36.478799UTC and queued0/parked2 at08:25:44.199221UTC. Selected,
loaded and conflicted project match. The87-character writer copy retains the
same canonical fingerprint `cb5512ae4e0b7b88`. Opaque full-preview comparisons
across10,378 observations produce one SHA256
`2215f9bbf5f1b4db7414f2d0fa5c3842d35ff127173884a5dd5b3d2fe9cae7d4`;
no changed writer payload was observed. Dirty remains true and saving false.
The failed activity at08:26:59.300UTC reports parked2. These observations support
writer-copy retention; they do not establish the origin of the second entry.

The555 exported diagnostic files contain no queue/outbox manifest, and strict
outbox entry metadata was absent. Individual request IDs, owner/project membership,
source, base and creation times of the two records remain unavailable. Do not
claim two distinct drafts, a duplicate race, malformed storage or data loss from
the aggregate count. No writer text, credentials or raw headers are included here.

## Root issue and honored original work

The displayed count is owner-wide, not selected-project-only:
ScreenplayDraftSaveOutbox.snapshot(ownerUserId:) filters by owner; snapshotFor
counts every parked reason. ScreenplayStudioViewModel.refreshDraftSaveOutboxStatus
publishes that aggregate. retainConflict intentionally parks the entire matching
project/owner chain; enqueueConflictCopy can preserve another held intent.
Repeated retention does not add records, and admission of the same request ID
does not append another record. A stale pending follower can become a second
parked intent, but this mechanism is a source-supported possibility only here.

Existing actor/model test `testManualSaveDuringConflictRetainsWordsWithoutReplayingTheChoice`
explicitly requires TWO immutable parked intents with identical writer UTF8 bytes.
Keep Mine creates a new `studio_conflict_resolve` request using the captured server
base. Only server confirmation retires older same-project/owner copies; other
owners and later-created copies remain protected. Exact-one parked record is
therefore not the product contract.

Previously accepted original962 commit
`527c58d60f46d940da66484287a3fbbb51d56b8b` already corrected this assumption in
`test_screenplay_load_server_fetches_fresh_head_and_restores_after_relaunch` by
requiring the right project/head, a nonempty parked chain and stronger no-extra-save
version invariants. That commit remains preserved on its original branches,
but is not an ancestor of7b and its different case is absent from7b. This candidate
adapts its explicit-choice principle; it does not wholesale cherry-pick that case.
Later preserved1ffa52e3 only removes an exact satisfied UNPARKED autosave and
explicitly preserves parked copies; it is not authority to collapse this chain.

## Changed test contract

Both conflict-readiness checks now require a nonempty parked chain while retaining
zero queued saves, dirty state, blank error, correct project/conflict head and
marker. They add loaded/selected-project checks where absent, whole expected UTF8
fingerprint, character count and not-saving state. Initial queued-state and
post-Keep-Mine waits also verify the existing canonical fingerprint helper.

Before choice, versions must be exactly seed+competitor, count2, and still contain
zero writer-marker uploads. After Keep Mine, all existing exact-one local version,
whole draft, conflict-resolve source, idempotency key, active version and zero
queue/parked/dirty assertions remain. Versions additionally must be exactly
seed+competitor+chosen, count3. Server version-ID sets use exact case-sensitive equality.

One final launch with the same fixture authentication environment must restore
the chosen version, exact project/fingerprint/length, no conflict, no queued or
parked copy, no dirty state and no saving/error. One additional read-only GET using
the existing owner headers confirms the exact three-version set and active chosen
version after relaunch. There is no explicit owner-ID field in the existing UI
snapshot; no such runtime field or new authorization path was invented. New failure
evidence contains allowlisted IDs/counts/fingerprint/flags and error-is-empty only.

Every existing timeout and the single Keep Mine tap are unchanged. The one added
relaunch uses the same12-second surface/75-second state limits already used by
this case; no action retry, enlarged limit or new skip was introduced.

## Verification and GitHub status

- `xcrun swiftc -frontend -parse themUITests/V1SmokeUITests.swift`: exit0, syntax only.
- Working/staged `git diff --check`: exit0.
- Structural source comparison: all41 test identities/every other file and method
  unchanged7b; required existing assertions retained; existing timeout sequence
  unchanged; Keep Mine remains one tap; exactly one added relaunch/read-only GET.
- Canonical `node scripts/check_god_files.mjs --json`: exit0 against exact main
  `71c637d886a9edd6a183048cd2feea0d00bfb143`, five zero deltas. Only temporary local
  ref `origin/codex/T-1469-base-main` was created and removed; no existing tracking
  or GitHub ref changed. Static Node v26.7.0.

At the preparation checkpoint above, no native, simulator, backend, npm, provider,
Docker or performance run had executed. The root execution below supersedes that
local verification gap; it does not change the original hosted result. The retained hosted red stays red. The published immutable auth
override still prevents treating the test name as actual401-to-refresh evidence;
root's separate real-auth fixture evidence does not become this candidate's proof.
Both held merges, root's Autosave first-red investigation and production hold remain.
Human review of published7b does not independently approve this changed descendant.

Private allowlisted findings and exports:
`/private/tmp/them-t1469-einstein-artifact/`.
Artifact findings SHA256:
`3347037ce57fa672f76618759aaff48f5a4e0b99a56f3c0596e6d86de829a6be`.
Candidate source/static receipts and original full method/file backup:
`/private/tmp/them-t1469-einstein-artifact/contract-candidate/`.
V1 source SHA256:
`4745c6416a08d0a8ec3eb17b63fa0b4c32b35eaaf2d98c856eb0189b071d5761`.
Patch SHA256:
`9855901d8b3dab141b60ddb3fec3540c5701d72c58c5386b64b3aa0d43069ab9`.

Next active task: root reviews this exact test diff before any focused native proof
or normal original979 advancement. No replacement PR or remote mutation.
READY FOR CONTINUE.


## Root review and focused execution — 2026-11-13

Root reviewed the exact9d test diff and canonical outbox ownership/immutable-chain
contract before execution. App/backend/dependency/runner sources remain exact7b;
no Autosave diagnostic is included in this recovery candidate.

The verified private npm-cache copy provided all136 locked tarballs. Root performed
one offline install with lifecycle scripts/audit/fund disabled, then npm ls and
installed-version verification:136 packages match the lock, including Multer2.5.0,
Express4.22.3, body-parser1.20.9 and qs6.16.2. Host Node26.7.0/npm11.19.0; this is
not a new Node20 full-backend suite or registry audit. Original cache was unmodified.

One canonical signed two-case iPhone recovery execution on erased owned81F,
iOS26.2/Xcode26.3, completed with native/producer exit0:2 passed/0 failed/0 skipped.
Both exact test identities occurred once. The corrected stale-conflict case passed
the full writer fingerprint/project checks, no unchosen server save, exact two
pre-choice versions, exactly one chosen version, three post-choice versions and
three unchanged versions after its final clean relaunch. The ordinary reconnect
case also passed. No extra waits, action retries or skips were added.

The disposable31337 fixture required real local user authentication; its live PID
and per-run nonce were verified before Xcode. No real provider key was forwarded;
the known Node HTTP/fetch/WebSocket guard recorded zero external attempts. This
is not an OS-wide network isolation claim. All1410 source files and driver hashes
remained unchanged throughout execution. The case's inherited DEBUG auth override
still prevents a claim that this run proves an actual401/refresh exchange.

Private exact result bundle:
/private/tmp/them-t1469-einstein-artifact/contract-candidate/native-preparation/native-run/them-save-recovery-8GEAMp/recovery-ios.xcresult.
Completion/source/ownership receipts are adjacent. Fullbackend2758/0/2 onNode20,
hosted709 signedunits and other7b results remain inherited with identical relevant
sources; none is represented as a new full run on9d. The hosted7b recovery1/1/0
remains red. New published-head checks and non-author review are required.

The first red on integratedmain71 remains the separate Autosave activation failure;
all main merges are held. No runtime freeze repair, paid model, microphone,
physical-phone, external-file-open or production deployment is claimed.
READY FOR CONTINUE.
