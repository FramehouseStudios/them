# T-961 — Recover a project after its creation reply is lost

Branch `codex/T-961-durable-project-creation`, parent `d140c703` (T-960).
Original source heads remain ancestors. No main merge, history rewrite,
replacement of an original PR, credentials or paid provider calls.

## Root issue and connected fix

An in-process duplicate-tap guard cannot reconcile a server creation whose
response never reaches the phone. The next process needs the same identity
and exact scene before making another request.

- Persist an owner-scoped UUID, original title and exact scene before transport.
  Update the retained scene when the writer edits. Read failures fail closed;
  another pending identity cannot replace the record.
- Add authenticated atomic `PUT /screenplay/projects/:id/creation`. First
  admission creates the project; replay returns it without overwriting later
  metadata or reactivating it. Existing POST clients are unchanged.
- Restore the local pending page after relaunch, with an explicit named Retry.
  A local placeholder does not claim remote hydration. Ordinary autosave cannot
  bypass pending creation. Current owner/selection/operation guards remain.
- Hand the first version to the existing durable outbox before retiring the
  creation record. Reuse an existing queued identity. A different existing head
  requires conflict resolution, not a new unbased seed. The existing server
  missing-base and exact request replay rules remain canonical.
- Initial-seed requests omit metadata changes so a retry cannot rewind later
  title/phase edits. Preserve a newer title the writer has entered meanwhile.
- Opening Projects now ends compact-screenplay editing through the existing
  inspector responder path; the keyboard must not obscure creation controls.
- A confirmed detail refresh establishes the matching pending page's identity
  even outside bootstrap. Suppress the ordinary recovery overlay only when
  its non-conflict copy, the pending intent and current editor match exactly.
  Keep distinct recovery/conflict choices; the existing pending Retry owns
  recovery of this same copy instead of competing with a second prompt.
- Block the older Root restored-draft auto-create path when this owner has a
  pending creation, including an unreadable record. That path otherwise races
  Studio bootstrap and creates another project/version behind the Retry UI.

Deployment ordering: additive backend route first, updated client second.
Against an older backend the new client retains its local intent and reports
the error; it must not fall back to an unsafe new legacy POST identity.

## Proportional checkpoint

DECIDED: batch related fixes and use focused checks while implementing; full
suites at meaningful integration checkpoints, not at every original PR.

VERIFIED: pinned Node20.20.2, external networking disabled, full backend
**2,827 passed / 0 failed / 2 skipped**, 75.692s. Offline mentor golden gate
passes separately; this is not live model quality evidence.
Targeted routes/restart/evidence/proxy checks **85/0/0**.
Logs retained under
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-961-20261016.kKgTAc/`.

Initial signed creation/seed unit run before the final small guards: **21/0/0**,
`/tmp/them-961-creation-v2.xcresult`. Earlier compilation failed (three scope
errors), then was corrected; neither run proves later source unchanged.

The first real-app fault journey failed before requesting creation: its
keyboard-dismissal helper could not dismiss native screenplay editing.
Retained `creation-ui/them-studio-ios-writer-loop/run-8IihTF/writer-loop.xcresult`,
**0 passed / 1 failed / 0 skipped**, assertion at V1SmokeUITests.swift:540.
Correct the product Projects responder path, remove the inappropriate Return
key helper from this journey, and assert actual keyboard disappearance instead.
Final signed run results are recorded below when available, not presumed.

The second app run restored the exact page, then failed at Retry hittability:
the ordinary same-copy recovery overlay intercepted the Projects button.
Retained `creation-ui-v2/them-studio-ios-writer-loop/run-zZs9Ml/writer-loop.xcresult`,
**0/1/0**. The trace also reports signal termination during teardown; this
does not erase the earlier assertion. The next compile failed because the
new unit regression called a private method; correct it to the existing public
refresh entry point. Retained `creation-ui-v3/` and its log. An incorrect
comma-separated unit selector was stopped before xcodebuild, not counted as
proof. These are implementation/command errors, not passing retries.

VERIFIED corrected signed creation and seed units **21/0/0** before the Root guard
source, `/tmp/them-961-creation-focused.xcresult`, 39.982s authoritative duration.
This includes actual detail refresh preserving bytes and leaving Retry free
of the duplicate prompt. Full iOS units, macOS and the broader recovery matrix
are not repeated in this batch; no full-matrix or integrated-main claim.

VERIFIED D009 against the actual T-960 base: backend/index33557 unchanged,
Studio17407→17405, Root15024→15023, bridge12925 unchanged,
BackendMemoryAPI10846→10836. Whitespace/syntax checks pass.

The fourth app run reached Retry without the overlay and retained the exact
words, but detected **one forbidden version attempt** before explicit retry.
Its proxy blocked that write. Source tracing found Root's legacy restored-draft
promotion as a second creation owner. Block it using the canonical pending
record, fail closed for corruption, and retain the assertion unchanged.
`creation-ui-v4/them-studio-ios-writer-loop/run-Fk6FsO/writer-loop.xcresult`
records **0/1/0**, not success. The next run includes this additional root fix.

VERIFIED final signed real-app journey **1 passed / 0 failed / 0 skipped**:
`creation-ui-v5/them-studio-ios-writer-loop/run-7pwANo/writer-loop.xcresult`.
The auth-required localhost backend commits creation; the proxy drops its
reply. The actual app closes/relaunches, retains the exact editor bytes,
exposes Retry without a competing prompt, makes no premature version write,
and retries the same identity to one project with one exact saved version.
The final assertion reads the actual backend project list/version. No response
or save result is simulated: only the network failure is injected.
Both original #939/#940 heads remain ancestors, and #939's current GitHub head
is still `08a0b1089d6fb12a6eda35a923df9aead3e07375`.
VERIFIED final signed creation/seed units, including Root's owner-scoped and
corrupt-intent automatic-admission guard: **21/0/0**,
`/tmp/them-961-creation-root-final.xcresult` (33.018s). Both final bundles and
logs are retained in the private proof root. Every proof erases only the owned
simulator above; signing remains on. No unchanged failed run was retried.

## Existing hosted failure and remaining limits

VERIFIED hosted run38985891535 at older head15cd7129 completed red in signed
offline-save recovery: the unresolved conflict copy was missing after relaunch.
Backend and D009 jobs passed. Later T-957–T-959 hydration/conflict/generation
fixes are in this tree, but that historical hosted red is not a current pass.
Do not rerun unchanged jobs blindly or relax the conflict assertion.

Not covered: shipping backend rollout, real microphone/model reply, physical
iPhone, external file-open, reinstall/keychain migration, two-device journey,
power-loss/fsync guarantees, and owner-data deletion of local recovery records.
UserDefaults readback is process-relaunch evidence, not a disk-flush guarantee.
The local fixture uses synthetic accounts and auth-required localhost storage;
it is not production PostgreSQL or a claimed live writer/model journey.
The older automatic promotion path without a pending explicit creation still
uses its legacy POST/version sequence. Migrating that separate admission path
to the canonical durable identity/outbox, including exact bytes and captured
auth generation, remains the next implementation target; this guard alone is
not proof of all Home/voice automatic creation recovery.

## Copy-and-paste briefing

T-961 extends the preserving integration, not a replacement for #939/#940.
Lost creation replies now retain owner-scoped identity and exact words before
transport, recover via explicit Retry, and use an atomic create-only backend
replay route plus the existing first-version outbox. Real app verification
found and fixed two blockers: Projects did not dismiss the screenplay keyboard,
and a duplicate same-copy recovery prompt intercepted Retry. It also exposed
Root auto-promotion creating another project during relaunch; a canonical
pending-intent guard now blocks that second owner, including corrupt records.
Final fault-injected signed iPhone journey1/0/0; Node20 full2827/0/2 and offline
mentor gate pass; final signed focused units21/0/0. Main is untouched; original heads preserved. No paid model
calls, production deployment or physical-phone proof. Historical hosted T-956
run is red on conflict-copy relaunch; do not call the current stack hosted green.

## Exact changed-file manifest

- `.github/workflows/quality-gate.yml`
- `TASKS.md`
- `backend/evals/creation_reply_fault_proxy.mjs`
- `backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs`
- `backend/lib/screenplay_projects_routes.js`
- `backend/tests/creation_reply_fault_proxy.test.mjs`
- `backend/tests/screenplay_cross_device_persistence.test.mjs`
- `backend/tests/screenplay_projects_routes.test.mjs`
- `backend/tests/studio_ios_writer_loop_evidence_contract.test.mjs`
- `them/BackendMemoryAPI.swift`
- `them/RootExperienceView.swift`
- `them/ScreenplayStudioRecovery.swift`
- `them/ScreenplayStudioScreen.swift`
- `them/ScreenplayStudioSidebarViews.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/ScreenplayProjectCreationTrustTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `docs/durable-project-creation-2026-10-16.md`
