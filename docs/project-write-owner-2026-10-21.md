# T-1107 — Keep screenplay writes with the initiating login

October21,2026. Branch `codex/T-1107-project-write-owner`.
Parent `e0adbdbce8f517eaed8cf7fbebc198ab7ae0cb9a`.
Runtime checkpoint `8fba5bbdccd1946c084fc9a8690293379d5347a0`.

## Actual failure and fix

VERIFIED: four signed native regressions failed against the original production
client (**0 pass /4 fail /0 skip**). With intercepted URLSession transport,
change the supplied identity during `/session`: project metadata/version writes
continue instead of cancelling. Change identity while a metadata success or
version409 response returns: stale sync state is applied. This proves the client
boundary failure, not a leak observed between real production accounts.

Root's prior callback guard cannot prevent a request being constructed from a
different account during the networking client's own awaits. The canonical
`BackendAuthRequestIdentity` now includes login-intent generation, read under the
same auth queue as credentials/user. Its ownership comparison reuses the
existing `ScreenplayStudioAuthContextPolicy`, ignores ordinary token/epoch
rotation, and checks cancellation. Existing captured intent/lease value types
were extracted with this request-ownership capability, not duplicated.

Both metadata and version upsert capture identity in a nonisolated default
argument at the **caller**, before a potentially queued actor admission. They
verify it at admission, after bootstrap, and after HTTP awaits. Requests use
the checked credential snapshot, not another mutable identity lookup while
building headers. Version retry checks the same original login intent; its
default refresher passes the expected owner to the existing auth client, which
checks before accepting cached state or starting refresh for a captured lease.
Late successes, conflicts and failures cannot become accepted current-owner
results at these guarded async boundaries.

Existing `auth_request_superseded`409 is retained; it is not a server screenplay
conflict. Real same-owner409 version envelopes still return their server version
through the existing path. Duplicated conflict/success decoding was unified
without changing payloads or server behavior. No second auth/network framework,
new dependency, token log, production setting or accepted decision change.

An already submitted request can still be accepted by the server under its
original valid account. This change pins its scope and rejects stale application;
it does not promise rollback of a server write accepted before cancellation.

## Evidence and correction of a misleading proof

- Full signed **856/0/0**, erased owned iPhone17Pro/iOS26.2(23C54),
  `7F1A14C1-B379-4417-AFE9-331810CD9CD3`. This precedes only final caller-side
  capture/admission checks and two added regressions. Do not claim a final
  full858-test run. Later changes are covered by final focused/UI/macOS evidence.
- Final signed ownership cohort **13/0/0**: both bootstrap-switch writes; late
  success/conflict sync; same-user new login intent; token rotation within one
  login; header-construction race; factory generation wiring; caller admission;
  cancellation during refresh; same-owner retry versus changed-owner retry;
  preserved real conflict envelope. Retry cases use an injected refresher and
  intercepted HTTP, not real `/auth/refresh` proof.
- Installed Swift5 compiler experiment independently checked that the
  nonisolated default expression runs before entry to a deliberately occupied
  actor. Actual native caller-context cases and connected promotion additionally
  exercise the resulting API. This is a local compiler check, not web research.
- Final authenticated real-local promotion UI **1/0/0**: Root creates/saves the
  project, exact raw UTF-8 and writer title survive terminate/relaunch, with one
  project/version. STT/chat/TTS fixture calls0/0/0, no paid model calls.
- Existing outbox/conflict/relaunch/resolve UI **1/0/0** with required local
  user auth. **Correction:** despite its name, this does NOT establish real
  expired-auth refresh. Source audit after the run found that
  `requestIdentitySnapshotLocked` prefers an immutable automation environment
  token while the expire-once hook changes a defaults token. The fault can be
  masked; automation session state also reports no refresh token. No observed
  real401/refresh counter was collected, so do not assert that step happened.
  The earlier conversational refresh claim is withdrawn. T-1110 must repair
  this existing DEBUG seam, assert actual401 -> refresh200 -> changed-bearer
  retry, and fix any resulting production failure. Save/conflict/relaunch proof
  remains valid; stronger authentication proof remains required.
- Final macOS scaffold build, D009 and `git diff --check` pass. Existing actor/
  Sendable warnings remain, not suppressed. MemoryAPI10845 ->10839 versus
  actual parent; other monitored counts unchanged: index33557, Studio17337,
  Root14961, bridge12934. No line-count waiver or padding.
- Backend runtime unchanged. Prior Node20.20.2 full2900/0/2 is reused for that
  unchanged tree, not falsely reported as a new run. Connected UI used host
  Node24.19.0, isolated local stores and frozen public source. All external
  providers intercepted; no private environment files loaded or credits spent.

## Adversarial scope and remaining work

- **Answered at the exercised client boundaries:** changed user, same-user new
  intent, stale success/conflict, same-owner rotation, queued actor admission,
  cancellation, pinned-header construction, one retry and existing conflict
  decoding. Exact writer text survives the connected promotion journey.
- **Partially addressed:** real auth refresh uses the existing lease/coordinator
  plus expected-owner admission, but actual new-bearer HTTP proof is missing
  because of the masked DEBUG injection. T-1110 is next, not waived by green CI.
- **Not covered:** app-wide isolation. Activation, outline/scene/beat/transition,
  collaborator/comment and companion mutations still use older await/header
  patterns. T-1109 extends this canonical rule and audits read/cache sync;
  do not characterize two protected methods as all routes being protected.
- **Not covered:** crash-atomic/idempotent initial project creation and orphan
  reconciliation (T-1108); concurrent real devices; real Postgres; physical
  microphone/iPhone; paid-model quality; production hosting or deployment.

Order before original #648: T-1110 real-refresh proof/fix -> T-1109 remaining
transport ownership -> T-1108 interrupted initial creation. Preserve original
heads/history and required reviews. Orb, Clementine and the visual identity are
unchanged. The overall product/integration goal remains active, not complete.

## Files and retained artifacts

- `them/BackendAuthRequestOwnership.swift`
- `them/BackendMemoryAPI.swift`
- `themTests/BackendProjectWriteOwnershipTests.swift`
- `TASKS.md` and this report

Permanent folder: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1107-20261021.alybK1/`.
Includes actual red/full/final-focused bundles, both connected UI bundles,
build logs, final public-source archive and runtime patch. The original four-case
red test file was later expanded; the bundle/log and original production parent
are retained, not a falsely claimed immutable pre-run test-source snapshot.
Frozen final native/UI source:
`/tmp/them-1107-source.VfgYtU/source`; all three committed code/test files compare
byte-for-byte to it. Later task/report edits do not change runtime source.

Readback before publication: main remains
`78b8c94f43b4a11f18c2e61df556b9cd7370e735`; backup was the parent above.
No original PR head, main, branch protection, secret, production or deployment
was changed by this checkpoint. No independent review was supplied on the
human's behalf. Production hold and real-phone completion criteria remain.
