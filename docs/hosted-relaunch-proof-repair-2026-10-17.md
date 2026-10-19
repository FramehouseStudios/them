# Resume — recovery merge and hosted relaunch proof

## Verified recovery landing

Human resumed2026-10-17. #906 exact head
`b2994b001ae815d6ab6353c5ac0c59cb31324492` had current independent approval
from halfmutantpro-tech, no blocking labels and CLEAN merge state against
main4d788975. Required run39006472727 raw log audited: backend2739/0/2,
signed units624/0/0, integrated writer passed, V1 UI28 passed/9 skipped/0 failed,
voice-fault1/0/0 and macOS compile/D009 passed. Required steps did not soft-fail.
Read the actual recovery/store/ViewModel regressions again. The acknowledged
ordinary draft is cleared without removing the distinct owner/project-scoped
preserved conflict; restore remains available. This does not establish broad
production security or physical-device correctness.

Normal merge under human authorization and D005, head matched explicitly:
`deac1a6d54a65dbf5f849f0f35476ad4ff07e1f0`. Original head/branch retained;
no squash, direct-main push, admin bypass or deletion. Read back strict three
required checks, one independent review, stale-review dismissal and enforced
admins. Comment: #906 issuecomment-6242230670. Main run39075059944 started;
backend/D009 passed at this checkpoint, required signed/client gate running.
Do not claim integrated main green until that exact run is inspected.

## First hosted red on #961

Exact head6ba473a5, required run39010350710: backend and D009 passed,
signed units852/0/0; V1 UI28 passed/15 skipped/1 failed. Failure at line491
in test_sequential_screenplay_batches_insert_once_and_survive_relaunch.
Voice-fault/macOS subsequent required step did not run after this red.
Downloaded original artifact12095225369 (quality-gate-failure-logs), retained
private at `/tmp/them-961-hosted-failure-39010350710`. Actual failed bundle:
`Users/runner/work/_temp/them-v1-ui-smoke/v1-ui-smoke-39010350710-1-59425.xcresult`.
Recording53DB9119 shows a blank app launch screen after relaunch when the
draft-presence timeout expired. Its logs do not reproduce the old publishing-
changes storm. This is not proof of lost text or proof that startup is healthy.
Underlying startup latency remains a product/performance gap to investigate.
The exact old line491 is the SECOND anchor assertion; the blank frame alone
must not be used to dismiss a persistence defect, as subsequent proof shows.

One local baseline reproduction on erased owned simulator11CF5EFB/iOS26.2
failed earlier at line467 (first page). Its recording17BDBD06 shows Apple's
first-use keyboard typing tutorial covering Send while AX reports the toolbar
button hittable. The prompt was typed but not submitted. Not the same failure
as hosted relaunch, and not a live-provider or data-loss reproduction.
Bundle `/tmp/them-980-sequential-before.xcresult`, log `.log` of the same stem.
Both actual recordings were inspected; no placeholder screenshots used.

## Narrow test repair

Before submitting, dismiss only the identified Apple typing tutorial using its
Continue action; require it to disappear. Never press an arbitrary Continue,
repeat a submitted prompt, or add a general retry loop. On sequential relaunch,
separately require studio.surface readiness before starting the existing10/5s
content deadlines. Readiness uses the existing bounded writerLoopWait budget.
Exact text/occurrence assertions remain unchanged and still fail on loss or
duplication. A blank startup now fails with its own hierarchy diagnostic rather
than being mislabeled as missing screenplay text.

## Reproduced production persistence defect

The corrected local run still failed0/1/0, now at the second-anchor assertion
after Studio readiness succeeded. First batch restored, second did not. Its
actual anonymous-owner fixture draft journal contains both headings, but its
scoped UserDefaults draft contains only the first. Inspected only these known
synthetic draft entries, not credential values or unrelated preferences.
Bundle `/tmp/them-980-sequential-after.xcresult`, log of the same stem.

Root: syncStructuredDraftSnapshot persisted its text argument. Representable
paragraph-metadata updates can describe an older frame without changing the
authoritative bridge draft. Those updates therefore overwrote newer durable
text while the atomic committed-write journal retained both batches.
Added testStaleEditorMetadataCannotOverwriteNewerPersistedDraft: authoritative
first then combined draft, followed by an old metadata snapshot. On unchanged
production code the bridge still holds both batches but its saved preference
contains the first only: signed regression0/1/0, exit65, authoritative bundle
`/tmp/them-980-metadata-before.xcresult` and `.log`.

Fix: move persistDraftText to draftText.didSet, retaining metadata computation
without durable text side effects. Same canonical persistence function, owner
partitioning, storage format and authoritative commit journal. No new storage
system or blanket preference for the journal, which could discard newer typed
edits. Bridge line delta0. This does not prove every abrupt-crash/manual-edit
or physical-device case; those remain explicit goal proof boundaries.

Intermediate signed pipeline45712 terminated exit65: full units853/0/0,
including the new metadata regression, but sequential UI still0/1/0 at the
second restored anchor. Home/writer/macOS stages did not run. Do not call the
metadata fix the full relaunch fix. Fresh owned simulator erased per proof,
signing on. Logs/bundles have stem
`/tmp/them-980-final-{units,sequential,home,writer}` and macOS log
`/tmp/them-980-final-macos.log` (latter stages absent, not green).

Observer experiment82434 also failed0/1/0. Removed both guards and restored
Studio byte-for-byte to HEAD; do not retain an unproven extra change. Temporary
byte-count-only tracing16469 then failed at the same second anchor but proved
both cached draft and journal restored402 bytes, not173. No later stale draft
write appeared. Removed both trace lines before proceeding. This refines the
remaining cause: durable live text is intact after the metadata fix, but a
different restore owner replaces the ViewModel's displayed draft.

## Second reproduced cause: stale project-creation recovery

restoreProjectCreationIfNeeded loads a seed from a pending project intent.
Root's isolated creation worker can write that intent after Studio initialized;
later generated batches did not call noteManualDraftEdit, and the retention
helper consulted only its cached intent. The older seed could therefore
replace the newer live draft at launch. New real shared-store/two-ViewModel
regression testGeneratedBatchUpdatesCreationIntentWrittenByAnotherModelBeforeRelaunch
fails0/1/0 on the old retention code, exit65; `/tmp/them-980-creation-before.xcresult`
and `.log`. No model/network fiction needed for the failure.

Fix at the existing owner: non-hydrating fountainDraft changes retain pending
creation text synchronously; retention reads the current owner-scoped intent
from the shared store rather than relying on a stale private cache. Existing
authentication, project, seedsLiveDraft and restoreAsCurrent guards remain.
Do not overwrite another project's creation or mistake hydration for writing.
Added actual ViewModel/store tests for both adverse cases. No new storage
format, journal-priority override or framework. All five protected deltas0.
First retention suite31072 failed20 passed/4 failed, not the partial11-pass
console summary. The hook also ran during initialization's pre-restoration
empty draft assignment, overwriting pending text. Put initial bridge copy and
creation restoration inside the existing hydration boundary. Retain all old
regressions rather than weakening their assertions.

Corrected suite48738:24 passed/0 failed/0 skipped, then sequential relaunch
1/0/0, both exit0. Authoritative bundles/logs:
`/tmp/them-980-creation-after-v2.xcresult` and `.log`,
`/tmp/them-980-creation-sequential-v2.xcresult` and `.log`.
This proves the original relaunch requirement locally after addressing both
causes. It does not prove hosted iOS26.5 behavior or physical-device safety.

Final combined production/test checkpoint
`960258a84ad0b93a7c1db06f2f6c31a395bbe4db`; backend subtree remains
`a75429c373c31d5c097e26f7b80683f47ba04ac4`, identical to the exact old #961
head whose hosted backend passed2886/0/2. Source inspection found some Node
contracts also read the changed Swift UI-test source, so backend identity
alone is insufficient to reuse that entire suite. A fresh pinned Node20.20.2
run used tracked-only snapshots, no local env files copied, network disabled,
source/dependencies read-only. Initial container exit125 was a missing nested
mountpoint, before any test ran. The next run without writable test data failed
2754/9/2: all nine errors were ENOENT creating backend/data/persistence.
Adding a disposable writable backend/data tmpfs resolved that setup defect;
the v3 log records2886/0/2. A later archive typo produced npm exit254 before
tests; corrected with an explicit staged tree and fail-closed package check.
Final checkpoint `2ffabaf97c80f05124e1ceddeedc05b4421e4a9e`, snapshot
`/tmp/them-980-final-node20.yGQNQv`, passed2886/0/2 under Node20.20.2.
Authoritative log `/tmp/them-980-node20-final-v2.log`; failures are retained,
not hidden as flakes. No backend code changed.

Combined pipeline94156 completed exit0: full signed units856/0/0,
authenticated Home2/0/0, writer/save/native MD+FDX export/relaunch1/0/0,
macOS scaffold compile. Bundles/logs `/tmp/them-980-combined-*`.
Home fixed-provider counts STT1/chat4/TTS24, external provider calls blocked.
Existing macOS concurrency warnings remain. Compile is not Mac interaction.
The earlier853-unit result predates retention changes and is not final proof.

After that pipeline, strengthened the sequential test to require the native
editor reachable and both restored batches present exactly once in its value,
not only a debug snapshot. Final signed case passed1/0/0 in31.613s:
`/tmp/them-980-native-paper.xcresult` and `.log`, TEST SUCCEEDED.
The final checkpoint differs from960258a8 only in that UI assertion and docs;
app tree af0fd1a02477e217342eba5afd29c7434b607265 and unit tree
419ea8583b89302f0b543c4c71b8316e7c512407 are identical. This scopes the
combined proof accurately; it was not rerun wholesale after the assertion.
All five D009 deltas0, whitespace clean. Original Studio observer code and
temporary trace code are restored/removed entirely.

Shipping check2026-10-17: unauthenticated https://api.them.io/healthz returned
HTTP302 to https://introvert.com/?domain=them.io (no redirect followed).
That hostname is not a verified shipping API. Main run39075059944 still has
backend/D009 success and Quality Gate in progress at this checkpoint; do not
claim a terminal client result or production readiness.

Remaining verification includes shipping backend/revision and real PostgreSQL
writer restart, physical voice/rewrite/offline/external-file-open journey,
generated120-page craft/print parity, hosted startup performance, and exact
canonical-equivalent Unicode edits at the existing bridge equality guard.
The latter is a suspected coverage gap, not a reproduced defect in this pass.
Frozen intermediate tree before observer change:
`d48a5593c1ec90e9e3fcffdf6f5b7154842c291f`. Backend subtree is unchanged
from #9616ba473a5, whose hosted backend passed2886/0/2. No new backend code.
Private before proofs:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-979-hosted-repair-20261017.3VDIO3/`.
Do not edit Swift during xcodebuild, restart on quiet output, retry red
unchanged or advance #653 first.
No paid calls, secret access, deployment mutations or physical-phone claims.

## Exact files in this append-only repair

- `themUITests/V1SmokeUITests.swift`
- `them/ScreenplayLiveDraftBridge.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/ScreenplayStudioDraftRecoveryTests.swift`
- `themTests/ScreenplayProjectCreationTrustTests.swift`
- `TASKS.md`
- `docs/hosted-relaunch-proof-repair-2026-10-17.md`

Keep #961 and original preserving parents; append a repair commit, not a
replacement PR or rewritten head. No next-original integration has begun.
