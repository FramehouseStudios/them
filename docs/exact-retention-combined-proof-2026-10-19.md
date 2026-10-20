# Combined exact-retention and database restart proof

Previous goal turn: progress (existing #961 repair cbb2d2fa committed/pushed).
Goal remains active; no shipping or120-page completion claim.

## Preserved integration

Clean worktree, original child783fbc9975641158f766deeacf544cdd51e9aa6d and
parent cbb2d2fa68885902b866a0d13e81527024a87fb8 matched GitHub. Normal no-ff
merge1c79c38a71cee41389bef7a4dcaf28d234cd5176 has exactly those parents, no
conflicts. Both ancestor checks pass. No replacement PR, rebase, squash,
force-push, main merge, protection change or branch deletion. Child's byte-
exact persistence correction is unchanged; parent readiness/unit isolation
repairs are incorporated. Source frozen at1c79c38a; only docs edited afterward.

## VERIFIED combined client/backend evidence

All simulator cases erase only task-owned11CF5EFB-D8C3-4F19-8062-28AF37F27D93,
iPhone17Pro/iOS26.2, normal signing. No unsigned test builds.

- Signed full units858 passed/0 failed/0 skipped:
  `/tmp/them-982-combined-units.xcresult` and `.log`.
- Required five-story offline/auth/conflict/relaunch recovery5/0/0:
  `/tmp/them-982-combined-offline/them-save-recovery-GDAmZV/recovery-ios.xcresult`,
  `/tmp/them-982-combined-offline.log`.
- Authenticated fixed-provider Home2/0/0, STT1/chat4/TTS24:
  `/tmp/them-982-combined-home.xcresult` and `.log`.
- Authenticated fixed-provider writer/save/native MD+FDX export/relaunch1/0/0,
  no STT/chat/TTS calls: `/tmp/them-982-combined-writer.xcresult` and `.log`.
- macOS scaffold compile, pipeline87567 exit0:
  `/tmp/them-982-combined-macos.log`. Existing concurrency warnings remain;
  this is not Mac interaction or warning-free Release proof.
- Node20.20.2 full backend2886 passed/0 failed/2 skipped, exit0:
  `/tmp/them-982-node20.log`, tracked-only snapshot
  `/tmp/them-982-node20.sdBKui`, read-only source/dependencies, writable test
  data tmpfs, no external network or local env files. Skips remain the normal
  suite's unconfigured live-Postgres adapter and opt-in live-provider page case.
  The separate real-database proof below is not miscounted as those suite tests.

Native sequential-page recovery on this same source passed1/0/0, exit0,
including both batches exactly once in the reachable native editor:
`/tmp/them-982-combined-sequential.xcresult` and `.log`.
All five D009 deltas0 against current parent cbb2d2fa; working/staged whitespace
checks pass. No source changed after the frozen merge during these proofs.

## VERIFIED real PostgreSQL restart, not a JSON-backed fake

One-off assertion harness `/tmp/them-982-pg-writer-proof.mjs`, SHA256
6bfa471542d26eeb319b1aeb115e9f59b042d81ed3d2fa19bc88ee8f0cff4f8e.
Retained with all logs privately below. It imports the actual backend test
server helper, runs actual routes with NODE_ENV=production and REQUIRE_USER_AUTH
enabled, uses real password/JWT handling and the canonical PostgreSQL adapter.
All accounts, app/JWT/provider/IAP values are synthetic fixture-only; no human
secrets read, no Apple/provider verification or purchase claim. Docker internal
network has no external access or published database port. Cached immutable
image cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685
reports PostgreSQL16.15; Node image reports20.20.2.

Canonical render_predeploy applied all12 migrations and initialized only this
new empty auth store. Phase1: two local accounts; sign in/session; create script;
save exact leading/trailing whitespace, CRLF and decomposed Unicode; rewrite;
read exact bytes/version; deny another signed-in user's read; query actual
PostgreSQL rows. Stop backend. Restart the disk-backed database container,
verify network readiness, then start backend with a different empty local-data
directory. Phase2: old access plus new client session reads exact rewritten
bytes; replay the original request returns the same version without increasing
version count; persisted password sign-in works; other user still gets404.
All assertions passed, exit0: `/tmp/them-982-pg-writer-v3.log`.

Database SQL verification returned auth_users2, screenplay rows1, migrations12.
Restart metadata:2026-10-19T16:37:56.805270333Z;5432/tcp has no published port.
Logs `/tmp/them-982-pg-counts.log`, `/tmp/them-982-pg-container-proof.log` and
`/tmp/them-982-pg-predeploy-b.log`.

Negative evidence retained: initial probe incorrectly bootstrapped /session
before sign-in and expected200, got401. Source contract requires authenticated
session with201; corrected probe, not application auth. Second probe completed
phase1 on tmpfs; explicitly stopped exit137 after noticing container restart
would discard that mount. Replaced only this synthetic environment with a
new dedicated disk volume before the actual successful restart proof. Never
relaxed authentication or called either attempt a full pass.

After evidence capture, removed only the exact disposable database containers,
disk volume and internal network created here. Their data was synthetic and
discarded intentionally; no production/user data removed. The Node proof
containers used --rm. This one-off probe is not yet a maintained automated gate.

## Remaining gaps and manifest

Canonical live health checker on2026-10-19 still fails both shipping endpoint
checks: api.them.io redirects to a parked domain. Render login/domain/deployment
remain operator surfaces. No paid model calls, real-phone acoustic journey,
production/managed-DB restore, power-loss/fsync test, refresh-token/revocation
restart test, external-app file-open, or generated120-page craft/print proof.
Main configured gate green is not proof of these. Fresh hosted child required;
no original #653 integration before red boundaries clear.

New edits: `TASKS.md`, this document. Preserving merge incorporates parent's
five files: TASKS, its triage document, ScreenplayStudioViewModel.swift,
ScreenplayDraftSaveOutboxTests.swift, ScreenplayProjectCreationTrustTests.swift.
Original child bridge/recovery test and its proof document remain untouched.
Private retained artifacts:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-980-combined-pg-20261019.JjHcJo/`.
