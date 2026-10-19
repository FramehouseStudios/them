# Required offline-save gate triage

Previous goal turn: progress, actual byte-retention repair committed and
published as #962. No completion claim. On resume, authoritative GitHub
results supersede the earlier running-state notes.

## VERIFIED baseline

- Clean worktree initially on T-980,783fbc99. Returned to parent T-979,2fcdc772
  without resetting/stashing/deleting anything so the first red is fixed there.
- Main deac1a6d, run39075059944: all configured required jobs green. Raw log
  audited: backend2739/0/2; signed units624/0/0; writer contract passed;
  V1 UI28 passed/0 failed/9 skipped; voice-fault1/0/0; macOS compile passed.
  That older main did not enforce the new five-story offline recovery gate;
  its skipped offline tests are not positive durability proof.
- #961 run39077888031, head2fcdc772: backend2886/0/2, D009 and856 signed
  units passed. V1 UI29 passed/0 failed/15 skipped, including the repaired
  sequential-page relaunch case. The separate required five-story recovery
  run failed `test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once`
  at line2310: marker present/dirty, queue0, parked0, no error, no conflict.
  Later required voice/macOS stage did not run. Raw log:
  `/tmp/them-961-hosted-39077888031.log`.
- #962 run39078694476, head783fbc99: backend/D009 passed. Full signed units
  856 passed/1 failed at `testCanonicalHydrationRetiresExactMatchingParkedCopyWithoutAnotherWrite`,
  line625, expected empty parked queue after an unstructured hydration task
  and a fixed1.1s delay. Do not dismiss as a flake or weaken the assertion.
  Later UI stages did not run. Raw log:
  `/tmp/them-962-hosted-39078694476.log`.

## Local investigation, not a green-hosted claim

The exact failing #961 story on unchanged2fcdc772 passed1/0/0 on erased owned
iOS26.2, signing on: `/tmp/them-981-offline-before.log`, bundle
`/tmp/them-981-offline-before/them-save-recovery-8OGes9/recovery-ios.xcresult`.
This does not clear hosted iOS26.5. Full five-story ordering/state reproduction
also passed5/0/0 on the unchanged head, bundle
`/tmp/them-981-offline-suite-before/them-save-recovery-Ixwsr6/recovery-ios.xcresult`.
This changed the scope/order, not an unchanged retry for green. Hosted artifact
12119705879 completed and is retained at
`/tmp/them-961-offline-hosted-39077888031`. Exported the actual failed story's
recording3440B4B5-D250-407F-AECC-2C42E3B131E0 under
`/tmp/them-981-hosted-recovery-all/`. Inspected actual20s/75s frames: initially
blank paper with the target title, later dirty marker text and local recovery.
This establishes delayed page readiness, not proof of the exact timing cause.

## Reproduced readiness defect and bounded fix

New real-model/queue/isolated-transport regression
`testOfflineSaveFixtureWaitsForTheSelectedProjectsHydratedPage` presents a
target selection while the detail still belongs to the previous project;
then completes target hydration asynchronously. On unchanged hook code it
reported completion with no queued target save:0 passed/1 failed, three exact
queue assertions, exit65. Evidence `/tmp/them-981-readiness-before.xcresult`
and `.log`. It had edited the page before the existing save-authority guard
could admit its request. This is a proven fixture defect, not conclusive proof
that it was the only cause of the hosted failure.

Use the existing10s readiness budget to wait for selectedProject.id and
loadedDraftProjectID to match the selected identity before inserting the
marker; recheck the same conditions and cancellation before submission.
No prompt resubmission loop, deadline extension or weaker queue assertion.
Change is within the existing DEBUG helper; no shipping storage/HTTP change.

Also isolate exactly the failed parked-copy unit model with the existing
connectsToLiveWorkspace:false seam. It needs its own queue, not global bridge
listeners/network monitoring. Replace its unconditional1.1s sleep with a
bounded condition wait for that real queue, retaining the same1.1s maximum
and all exact words/version/dirty/empty-queue assertions. No mutation retry.
Hosted source showed unrelated localhost connection churn during units; this
is not by itself proof that churn caused its assertion. New full proof and
fresh hosted results remain required.

## After-fix proof checkpoint

Frozen staged production/test tree f937636a225171e983c083eac0901655502ae10e.
Full signed units completed857 passed/0 failed/0 skipped, exit0:
`/tmp/them-981-after-units.xcresult` and `.log`. Readiness regression passed
in0.268s; isolated parked-copy confirmation passed in0.018s. All old assertions
remain. This does not establish a universal timing guarantee under hosted load.

Pinned actual Node v20.20.2, network-disabled tracked-only snapshot
`/tmp/them-981-node20.kmxlKs`: full backend2886 passed/0 failed/2 skipped,
exit0, `/tmp/them-981-node20.log`. Source/dependencies read-only and test data
uses disposable tmpfs. Skips remain real-Postgres without DATABASE_URL and
the opt-in live-provider page-write case. No environment files copied.

After-fix pipeline96664 completed exit0:

- Required five-story offline/auth/conflict/relaunch recovery5/0/0, including
  the exact failing hosted story. Bundle
  `/tmp/them-981-offline-after/them-save-recovery-Bvh3WI/recovery-ios.xcresult`;
  log `/tmp/them-981-offline-after.log`.
- Authenticated fixed-provider writer/save/native MD+FDX export/relaunch1/0/0;
  `/tmp/them-981-writer-after.xcresult` and `.log`, STT/chat/TTS calls0/0/0.
  This is not acoustic recognition, live model quality or opening the file
  outside THEM. Home was not rerun in this pass.
- macOS scaffold compile exit0, `/tmp/them-981-macos-after.log`; existing
  concurrency warnings remain, not Mac interaction or a warning-free release.

Protected-file gate against T-978 reports all five line deltas0; working/staged
whitespace passes. Only this document/TASKS changed after frozen source.
Private retained evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-979-offline-repair-20261019.ixiyCP/`.

## Adversarial scope

- Answered locally: wrong selected detail cannot consume the offline-write
  fixture before canonical target hydration (failing-first exact queue proof).
- Answered locally: matching parked copy is retired only after the existing
  exact-text confirmation; no queue-empty assertion was removed or softened.
- Partially addressed: hosted scheduling, UI readiness and lifecycle timing.
  The10s hook and1.1s unit budgets were not increased; fresh hosted CI is still
  required. Do not call every historic red explained by these two changes.
- Not covered here: real PostgreSQL writer restart, physical microphone and
  external-file-open, production domain repair, generated120-page craft/print
  fidelity. Continue those unblocked proofs after this gate boundary.

## Exact scoped repair files

- `TASKS.md`
- `docs/offline-save-hosted-triage-2026-10-19.md`
- `them/ScreenplayStudioViewModel.swift` (existing DEBUG hook only)
- `themTests/ScreenplayProjectCreationTrustTests.swift`
- `themTests/ScreenplayDraftSaveOutboxTests.swift`

Append to existing #961. Preserve2fcdc772, original #652 and child #962 heads.
No replacement, squash, force-push, deletion or main/protection bypass.

No paid models, secret access, deployment mutation, production/physical-phone
or generated120-page quality claim. Render login remains human-owned.
