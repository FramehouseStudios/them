# Initial project draft preservation — 2026-10-08

Branch `codex/T-940-project-creation-trust`, based on #938 head
`b882184880bfc37c31b154d63decc5a26a9ce193`. Goal items 1, 4 and 6.
Main is not changed; no paid provider calls or production credentials.

## Characterization

VERIFIED: `/tmp/them-940-creation-red-v2.xcresult` and matching `.log`
report four tests, zero pass, four fail, zero skip against original creation
behavior. Only the default-preserving injected API seam changed for this proof.
Raw seed whitespace is removed; typing during project/first-version requests
is overwritten; a late create reselects the project and clears new title input.
The first attempt (`creation-red`) did not compile because the test used a
nonexistent recovery helper; it is not product-failure proof.

VERIFIED: `/tmp/them-940-creation-focused.xcresult` reports the initial four
regressions green after the first implementation. Expanded adversarial v2
reported 10 pass, one fail: the test wrongly expected automatic draining of a
deliberately parked bad server echo. Corrected to the public Save Now action,
with parked-copy and exact recovery assertions retained. The first expanded attempt did not compile because the
test called `saveDraft` rather than the existing `manualSaveDraft` action.

## Fix and Claude reconciliation

- Read #702 body and exact `f4983b2d` helper/tests. Port its
  `StudioNewProjectSeedPolicy` and tests, retaining the selected-project guard
  and whitespace-only validation; strengthen live-only adoption to exact UTF-8.
  A selected summary **or** selected ID identifies an existing project.
- Read related #647 title and #672 guest-page handoffs; neither flow is replaced.
- Reserve the existing save lane before awaiting creation. Duplicate taps and
  old saves cannot mix project versions. Saves during creation retain local words.
- Capture auth and monotonic selection epoch, including away/back selection.
  Only a valid current response binds the project; clear only unchanged title.
- Preserve the previous project's dirty page before opening a blank new project.
  Live-only words typed during creation enter the new project's first request.
- Reset the new project's version, anchors, bindings and draft context. Use
  canonical `performDraftSave`: durable immutable request, exact echo, recovery,
  honest dirty state. Partial seed failure keeps the created project for Save Now.
- Interrupted initial seed retries retain request identity and transition only
  an in-flight entry, never revive a parked/discarded conflict copy.
- Creation waits if the selected summary/ID and displayed draft owner disagree,
  preventing old-page recovery from being attributed to a newly selected project
  whose detail has not loaded. Final inspection added this regression after the
  first green full/UI runs; those earlier runs are not final-code proof.
- Saves requested during creation use captured auth and the displayed project
  for recovery, never the next selection or a new auth intent. Before an ID
  exists, the status says edits remain on the page, not that a disk save exists.

## Proof / boundaries

VERIFIED: full Node 20.20.2 suite with Docker network disabled:
`/tmp/them-940-backend-final.log`, 2,744 pass, zero fail, two skip. Lockfile identical to
#938; reused its generated dependencies, no manifest changes. Four smoke-runner
tests, god-file gate and diff whitespace check pass.

VERIFIED: signed owned simulator `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, erased
before each run, iOS 26.2 / Xcode 26.3, signing enabled. Final full units:
730 pass, zero fail/skip, `/tmp/them-940-final-proof.xcresult` and matching `.log`.
Includes 15 creation transport tests, three seed-policy tests and actor admission.
macOS scaffold build-only succeeds, `/tmp/them-940-mac-proof.log` (exit zero).
Initial authenticated recovery UI: five pass, zero fail/skip,
`/tmp/them-940-recovery-ui/screenplay-save-network-fault-88334.xcresult` and
`/tmp/them-940-recovery-ui.log`. Initial integrated writer: one pass, zero fail/skip,
`/tmp/them-940-integrated-writer.log`; the evaluator verifies exact counts before
removing its bundle.

VERIFIED final-code authenticated recovery: five pass, zero fail/skip,
`/tmp/them-940-recovery-final/screenplay-save-network-fault-92844.xcresult` and
`/tmp/them-940-recovery-final.log`. Final integrated writer: one pass, zero fail/skip,
`/tmp/them-940-writer-final.log`; exact-count evaluator exits zero after real
local-auth creation, typing, save, Markdown status and relaunch. This does not
prove export contents/share handoff or physical speech. Four runner tests:
`/tmp/them-940-runner-proof.log`; final god-file/diff gates pass.
Read-only review found no blocker in canonical retry admission; that is not an
independent GitHub approving review. Only these eight scoped files are committed:
VM, outbox, seed policy, three corresponding test files, TASKS and this audit.

Not covered: server activation ordering (create still activates), durable
create-request identity after ambiguous POST failure/relaunch, an explicit pending
interrupted seed drain after returning to its project, live creation against the
production database, shared global
`isSaving` ownership, shipping provider/physical microphone, production database,
export parity, 120-page performance or release readiness. Claude's #702 is retained,
not closed/squashed/reimplemented wholesale. Required checks/review remain gates.

## Hosted landing hold

VERIFIED: #938 run `37874741945` finished red during this pass. Backend and
D009 passed; required unit step passed; integrated writer failed at
`V1SmokeUITests.swift:600`, "Markdown export did not report its .md artifact."
Retained `/tmp/them-938-hosted-failed.log`. Downloaded
`/tmp/them-938-hosted-artifacts` contains the unit bundle (711 pass, zero fail/skip),
not the failing integrated writer bundle. Export failure vs hidden/mismatched UI
assertion is **not established**. Next priority: retain writer failure evidence,
reproduce and fix the real export path/assertion; do not rerun unchanged to green.
Main remains `647e01fcf17730d301aaa8a5072255ca7494c53c`.
Code inspection also confirms iPhone `writeExportArtifact` returns a temporary
file URL and reports a message, without presenting a share sheet. This is a
separate writer-visible handoff gap, not proof of the hosted assertion's cause.
Public `https://api.them.io/health`: initial 302 HTML, terminal redirect-following
response 200 `text/html; charset=UTF-8`; not verified API JSON. OpenAI credit
top-up remains unconfirmed; no live provider calls were attempted.
