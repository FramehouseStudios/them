# Studio request ownership — T-1109 checkpoint, 2026-10-21

## Outcome and scope

VERIFIED: on parent `fd8dbf28`, activation and outline requests could continue
after the identity provider switched accounts during the actual session bootstrap
await. Both new signed regression tests failed (0 passed / 2 failed / 0 skipped).
This is a production-client URLSession interception reproduction, not evidence
of a production-account disclosure or a physical-phone reproduction.

The implementation extends the existing T-1107 ownership rule across these
15 Studio methods, without replacing the HTTP/auth clients:

- Existing metadata and version upserts retain caller ownership.
- Activation, outline, scene, beat, collaborator, comment and companion writes
  now capture caller ownership before actor admission, check across bootstrap,
  pin outgoing headers to the checked snapshot, and reject stale responses.
- Project list, project detail, outline, collaborators, comments and companion
  reads now follow the same rule before returning data or publishing sync state.

The caller-default identity captures the existing canonical login-intent
generation. A new login, including a new login by the same user, invalidates old
work; ordinary access-token/session-epoch rotation does not. Task cancellation
continues through the canonical ownership check.

One small `BackendScreenplaySyncEnvelope` contract describes fields already
present in the existing DTOs. The actor decodes each payload once and performs
the shared sync application only for its initiating owner. Conformances are
explicitly nonisolated, matching the nonisolated DTOs and protocol. No new
credential store, persistence format, HTTP layer or dependency was introduced.

Preserved behavior: request paths/methods/query parameters and bodies; raw
writer text; include/strip owner-header options; the outline's typed error,
revision, replay and Retry-After behavior; the version's genuine409 envelope and
one existing same-login401 refresh attempt; companion ISO8601 dates. Other
mutation routes do not gain automatic retries of potentially non-idempotent
writes. Server-side project authorization is unchanged and remains necessary.

## Verification ledger

- RED: signed, erased owned simulator; activation/outline bootstrap-switch
  regressions, 0/2/0. Failures were the expected superseded-owner assertions.
  `/tmp/them-1109-red-native/`, log of the same name with `.log`.
- First GREEN: ownership and safe-outline API suites, 28/0/0. Six matrix tests
  exercise 13 newly protected methods across changed user, same-user new login,
  late success/outline conflict, header-construction race, valid token rotation
  and owner change before actor admission (78 method/boundary combinations).
  They assert actual bootstrap/request counts, headers and sync application;
  the two companion cases also verify ISO8601 analytics dates. Earlier ownership
  tests retain version refresh, cancellation and real conflict coverage.
  `/tmp/them-1109-green-native/`.
- The first GREEN build exposed new default-isolation conformance warnings.
  These were corrected with nonisolated extensions, not suppressed. The
  installed Swift compiler accepted that syntax. Final native/macOS proof is
  recorded below after completion; unrelated pre-existing warnings remain.
- Final source snapshot: `/tmp/them-1109-final-source.XApksC/source`.
  Public tracked files only; no environment credentials were copied.
- Final full signed units: **869 passed / 0 failed / 0 skipped**, erased owned
  iPhone17Pro/iOS26.2, signing on. `/tmp/them-1109-final-native/`.
- Final macOS scaffold: **build passed**, `/tmp/them-1109-final-macos.log`.
  New sync-contract isolation warnings are absent in both final build logs;
  unrelated pre-existing warnings remain, so this is not a warning-free claim.
- Authenticated local-backend UI recovery: **3/0/0**, actual auth-required HTTP
  backend, external providers intercepted. Offline exact save/relaunch,
  stale-version conflict choice/relaunch/resolve, actual version401 -> refresh200
  -> changed-bearer save201 -> exact words restored/one new version all passed.
  `/tmp/them-1109-recovery-ui/them-save-recovery-aoaEB6/recovery-ios.xcresult`.
- Integrated writer/create/save/export/relaunch: **1/0/0**, same final runtime,
  auth-required local backend. Includes actual native Files Cancel/Save and
  restored screenplay checks. Provider counters: intercepted chat1, STT0, TTS0.
  This is not a microphone, live-model or outside-app file-open observation.
  `/tmp/them-1109-writer-ui.xcresult`, `/tmp/them-1109-writer-ui.log`.
- D009 passes versus actual parent `fd8dbf28`: MemoryAPI10754 -> 10592 (-162);
  index33557, Studio17337, Root14961 and bridge12934 all unchanged. Gate also
  passes versus origin/main. `git diff --check` passes.
- Backend production and tests are unchanged. No repeated full Node suite is
  claimed; the inherited Node20 backend proof remains 2900/0/2 from T-1104.
- No paid provider calls, deployment, real-phone/microphone or live-model claim.
- Retained evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1109-20261021.9CLHFr/`.

## Adversarial review and remaining work

Answered within the listed routes: account switch at admission/bootstrap,
same-user new login intent, late successful response or outline409, immutable
checked header scope, valid token rotation, and unchanged typed outline errors.
Existing version cancellation/refresh guards remain intact. A local rejection
cannot undo a request already committed by the server; this fix prevents that
operation from becoming new-owner work or publishing its stale result locally.

Not covered by this checkpoint: full app-wide account isolation, production
Postgres/collaborator authorization, physical-device races or latency, atomic
initial project creation, or all user-facing error recovery. Shared bootstrap
still uses its existing epoch-checked commit/cache owner; this change does not
claim to redesign or globally prove that cache.

T-1109 remains active for the follow-through audit/fix of question resolution
(including the offline enqueue/replay boundary), rendered character-memory
batches, realtime commit/history annotation, first-page telemetry, and derived
coverage/pagination/revision/import/export requests. These also await networking
and must not adopt a newer login. Batch ownership must span the entire loop;
queued work must keep its original owner rather than be silently deleted.
Audit deferred main-queue notifications as well as immediate sync publication.
This is the next implementation target, before T-1108 crash-safe initial
creation and before original #648; it is not a claim that every mutation is fixed.

## Git and human boundaries

Work is on `codex/T-1109-owned-screenplay-transport`, descended from the existing
integration rehearsal. Runtime checkpoint:
`08b92cd89e095d2b12b9da8132506f29cc18ed62`. Original PR heads/history remain intact. No main merge,
replacement PR, force push, protection change, secret change or production
promotion belongs to this checkpoint. Production remains held under the human's
App Store-credentials decision. The overall working-product goal remains active.

Files changed: `them/BackendMemoryAPI.swift`,
`them/BackendScreenplaySyncEnvelope.swift`,
`themTests/BackendProjectWriteOwnershipTests.swift`, `TASKS.md`, and this report.

Copy/paste handoff: T-1109 checkpoint `08b92cd89e095d2b12b9da8132506f29cc18ed62`
fixes caller-login ownership for 15 regular Studio methods. Original activation/
outline reproduction failed0/2; final signed units869/0/0, recovery UI3/0/0,
writer/Files/relaunch UI1/0/0, macOS/D009/diff pass. MemoryAPI shrank162 lines;
backend unchanged, no paid calls. Continue T-1109 with question/outbox,
character-memory batches, realtime/history/telemetry and derived/export scope;
then T-1108 crash-safe initial creation, then preserved original #648. Do not
claim app-wide isolation, integrated main or physical-phone readiness yet.
