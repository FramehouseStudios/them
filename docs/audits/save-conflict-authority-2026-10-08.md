# T-937 — Save responses cannot overrule a newer writer choice

Goal items 1 and 4. Base: #934, `60e7ad1d2e77f56e48b07cf522a9e9772dcc624c`.

## Problem and retained baseline

VERIFIED: two real-model tests failed in twelve assertions before the fix.
Save Now posted through a visible conflict. A delayed ordinary save response
cleared a newer conflict, rebased and dispatched a pending edit, and retired
parked copies. Retained proof: `/tmp/them-937-authority-red.xcresult` and `.log`.
These are controlled fictional transport responses, not paid provider calls.

## Fix and binary criteria

An immutable save captures account, project, conflict generation and creation
time. Dispatch, acknowledgements, awaited follow-up work and pending-edit
rebasing revalidate that authority. Ordinary Save Now is not an implicit
Keep Mine. Stale responses retain exact local recovery and parked copies;
they cannot clear a newer choice or rewind explicit Load Server locally.
Fresh Keep Mine retains its captured server base and remains functional.

The existing queue actor rejects ordinary acknowledgement of a conflict-parked
request. Load Server records an owner/project/model-scoped generation fence
after successful queue persistence. Late conflict-copy admission cannot revive
that discarded generation. New generations, another owner and a new model
remain independent; the fence does not rely on wall-clock ordering. Existing
queued-copy deletion retains its original-time cutoff. The transient fence
does not survive process death because its waiting tasks do not either.

Existing API clients gain default-preserving injection for controlled tests;
production still uses the same canonical client. No backend route, provider,
framework, protected god file or release configuration changes.

## Files changed

- `them/ScreenplayStudioViewModel.swift`: immutable request authority, post-await
  checks, exact local retention and explicit-choice queue fence.
- `them/ScreenplayDraftSaveOutbox.swift`: actor-serialized parked acknowledgement
  guard and generation-scoped late-copy admission.
- `themTests/ScreenplaySaveConflictAuthorityTests.swift`: five real-model action
  tests (ordinary save, pending edit, superseded/current Keep Mine, Load Server).
- `themTests/ScreenplayDraftSaveOutboxTests.swift`: durable parked acknowledgement
  and logical-fence scope/clock regressions.
- `TASKS.md` and this audit: evidence, limits and continuation.

## Verification

VERIFIED: focused expanded signed suite five pass, zero fail/skip:
`/tmp/them-937-authority-expanded.xcresult` and `.log`.
Final full signed units **686 pass, zero fail/skip**:
`/tmp/them-937-full-units.xcresult` and `.log`; xcresult summary checked.
Node 20.20.2 full backend, networking disabled, **2,744 pass, zero fail,
two skipped**, `/tmp/them-937-node20.log`. macOS scaffold build exit zero,
`/tmp/them-937-mac.log`; unsigned build-only, never unsigned tests.
Four recovery-runner contract tests pass. God-file and diff checks pass.
All iOS proof runs use the owned erased simulator
`11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS 26.2, signing enabled.
Authenticated recovery UI **five pass, zero fail/skip**:
`/tmp/them-937-recovery-ui/screenplay-save-network-fault-58821.xcresult` and
`/tmp/them-937-recovery-ui.log`; exact summary checked. This runs the real
authenticated localhost backend, not the permissive URLProtocol fixture.
Integrated authenticated writer UI **one pass, zero fail/skip**:
`/tmp/them-937-integrated-writer.log`; the evaluator enforces the exact
single-case summary and removes its result bundle on completion. It proves
the deterministic local writer contract, not paid live speech generation.

## Adversarial review / not covered

Read-only second-agent review found no additional deterministic blocking source
defect; it is not a GitHub approval. The delayed Load Server transport fixture
deliberately returns success regardless of base, so it proves local choice
preservation, not rejection of a stale server write. Existing backend route
test `POST /version rejects stale base_version_id with 409` separately passes
in the full suite; production sends `reject_if_stale`. This is not proof of
every database concurrency ordering. Post-actor generation checks cannot undo
already completed queue mutation; the parked-request guard and durable local
recovery remain important boundaries, not a claim of exhaustive race freedom.

Not proved: the exact hosted #929 false-clean interleaving, same-project
hydration generation ordering, T-933 actor teardown, production Postgres,
physical microphone, paid providers, shipping configuration, export parity,
120-page responsiveness, immediate power-loss fsync or unsynced uninstall.
Full V1 UI is not rerun locally in this slice; required hosted gates must run
on the exact published head. Main stays unchanged; #766 then #770 still require
independent approval and green checks before landing.
