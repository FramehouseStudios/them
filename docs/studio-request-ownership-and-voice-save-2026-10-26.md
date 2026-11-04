# T-1165 — Studio ownership and the missing first voice save

October25–26,2026. Branch `codex/T-1165-studio-request-owner`.
Parent eab6787. Red695ae22; ownership runtimef5c5660; voice runtimef3771d1;
preserving green646 parent mergec2bd5be. Overall product goal remains active.

## 1. Completed / root issues

VERIFIED current signed activation/outline red **0/2/0**,6 assertions: an account
switch during bootstrap did not stop old work from submitting or publishing sync.
Reused08b92cd's existing canonical request ownership across15 Studio methods,
not a second auth/HTTP framework. Capture initiating login intent before actor
admission; validate across bootstrap/HTTP, pin headers to the checked snapshot,
and reject stale read/write/sync. Same-login token rotation still works.
Common existing response fields now have one `BackendScreenplaySyncEnvelope`
contract and guarded decoder; preserve companion ISO8601 dates, raw words,
genuine version409 and typed outline errors/revision/replay/Retry-After.

Existing redirect guard is wired on those15 requests plus shared auth/bootstrap
transport. No new origin policy or automatic retries of non-idempotent writes.
Guard tests characterize actual delegate decisions, not a new actual HTTP
cross-origin or production leak reproduction. Remaining unconverted requests
and deferred notifications are not claimed globally isolated.

Then the stronger raw-audio Home journey failed **0/1/0** despite intercepted
ASR1/chat2/TTS1 and1064characters on the page: no project, `Create project to
save`. Green existing-project recovery was not substituted for this first red.
Source retained a UUID-only committed-write trigger; its correct exact-byte
guard could run before editor binding and never be reconsidered. This matches
the preserved7b6b298 correction/historical reproduction. Today's red did not
instrument internal publication timing; do not invent those timestamps.

Reused7b6b298: observe the complete committed value and actual draft publication,
defer past Published willSet, then use the same exact-document promotion owner.
Capture login context in the existing committed-write value, extracted by
capability. Reject changed login/bytes, placeholders and bound writes; exit
bound projects before repeated byte comparisons. No polling/sleep/timeout or
second creation path. The raw-audio test's original save/restore assertions
remain; add exactly-one-project assertion and read-only DEBUG count diagnostics.
Production lifecycle hooks are outside the DEBUG-only diagnostics block.

## 2. Verification ledger — exact source boundaries

- Atf5c5660: full signed erased native **810/0/0**; ownership matrix covers13
  newly protected routes across6 boundaries (78 route/boundary combinations):
  changed account, same-user new login, late success/outline conflict, checked
  headers, admission and legitimate rotation. Existing tests retain real outline
  error semantics, cancellation, version retry and conflict envelopes.
- Atf5c5660: actual required-auth local recovery **3/0/0**: offline exact queue/
  relaunch, conflict decision/resolution and real version401 -> refresh200 ->
  returned-bearer201 -> exact words/version after another relaunch. This is
  BEFORE the later Root trigger fix, not relabeled a fresh final-source run.
- Atf5c5660: raw-audio **0/1/0**, first-project failure retained, not hidden.
- At final runtimef3771d1: previously failed raw-audio journey **1/0/0**,
  one project/version and restored text; fixture ASR1/chat2/TTS1. Original
  failure assertions/timeouts unchanged; additional one-project check passed.
- Atf3771d1: final full signed native **813/0/0**, erased owned91693AF0-AE2C-
  4FAD-9F4C-EC4C92AA382A, iPhone17Pro/iOS26.2. Three additional cases verify
  exact CRLF/trailing/decomposed bytes in either publication order, same writeID
  with final content, and changed login/placeholder/bound rejection.
- Atf3771d1: real held-create response + actual native edit **1/0/0**. No stale
  Root-source version submission or stale project binding; edited page retained.
  This is not rollback of already-created server metadata/orphan proof.
  Provider fixture ASR/chat/TTS **0/0/0** for this case.
- Atf3771d1: macOS scaffold **BUILD SUCCEEDED**; not a macOS UI journey.
  Existing compiler/actor/Sendable warnings remain, not suppressed.
- After all native handles terminal: preserve no-ffc2bd5be of original646's
  exact hosted-greenacfe2d8. Only TASKS conflict; retain both complete histories.
  Tracked runtime/unit/UI/backend/script/package/project diff vsf3771d1 is
  **zero bytes**, archived. No unchanged native rerun invented after this merge.
- D009 vs actual fetched saved parenteab6787: MemoryAPI10754->10592(-162),
  Root14955->14953(-2),bridge12926->12864(-62); index33557/Studio17345 unchanged.
  Final diff check passes, no padding/count exception or new framework.
- Backend production/tests unchanged vs eab6787; no repeated full Node suite.
  Last source-equivalent production full evidence remains explicit T1158
  Node20.20.2 **2869/0/2**, with T1163's15 focused proof checks separate. No
  invented current full total. UI servers used pinned Node20, isolated stores,
  required auth, fake key and intercepted providers. No paid provider call,
  real microphone, audible/relevant model-quality or physical-phone proof.

## 3. GitHub and interruption handling

Freshly revalidated original646 exactacfe2d8 required-green and audited terminal
run40266652898: backend2867/0/2; signed units758/0/0; strict writer contract pass;
V1 **29 pass /0 fail /16 skip** (45 total); voice-fault1/0/0; Mac build pass.
These are that lower prefix's results, not substitute counts for this runtime.

Tool-approval workspace-credit error stopped an archive command before execution.
Did not bypass it, buy credits, change keys or use another agent/account. Safe
read-only inspection found the actual first-project red and prepared the existing
patch in permitted temporary storage. Later explicit read-only approval recheck
succeeded; only then applied and proved the fix. No claim about which billing
balance changed or why the service recovered. Historical temporary handoff
predates this recovery; this report supersedes its pending/block status.

Main last read78b8c94f43b4a11f18c2e61df556b9cd7370e735; original647848e59d0,
base`claude/coverage-follows-draft`, draft, unchanged. No main/original647 merge
or advancement, review/protection bypass, force/squash/replacement PR, deletion,
deployment, DNS, secret or accepted-decision change. Normal scoped backup only;
all original647 and verified646 histories remain reachable.

## 4. Exact changed files versus eab6787

- `TASKS.md`
- `them/BackendMemoryAPI.swift`
- `them/BackendScreenplaySyncEnvelope.swift`
- `them/RootExperienceView.swift`
- `them/ScreenplayCommittedWrite.swift`
- `them/ScreenplayLiveDraftBridge.swift`
- `them/ScreenplayProjectPromotion.swift`
- `them/ScreenplayProjectPromotionDiagnostics.swift`
- `themTests/BackendProjectWriteBoundaryRegressionTests.swift`
- `themTests/BackendProjectWriteOwnershipTests.swift`
- `themTests/ScreenplayProjectPromotionTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `docs/original-646-parent-refresh-2026-10-25.md` (preserved parent evidence)
- `docs/studio-request-ownership-and-voice-save-2026-10-26.md` (this report)

## 5. Evidence and remaining scope

Permanent archive `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1165-20261026.hzdPRW/`:
**5930 files SHA256-readback verified**; both failing native/voice bundles, prior
810/recovery3, final813/voice1/held1 bundles, logs/summaries, public source patches,
Mac/D009/hosted646 and zero-runtime-change evidence. No ignored environment,
credential or build cache. Producer `/private/tmp/them-1165.ce5BEx`.

Answered within exercised boundaries: caller-login/account/bootstrap/response/
header/admission/rotation, exact committed editor publication, one first project,
and stale-create edit rejection. A request already accepted by the server cannot
be rolled back by a local owner rejection. No app-wide isolation guarantee.

Still open before648/phone: canonicalac81718 queued/derived/character-batch/cache/
deferred-notification ownership; T1111 owner-safe outbox presentation/deletion and
changed-payload idempotency; T1108 crash-atomic initial project/version creation.
No fresh external export opening, concurrent real devices/Postgres/collaborator
authorization, shipping backend, physical microphone or paid-model quality proof.
Orb/Clementine/aesthetic and flexible120-page/chosen-title intent are unchanged.

## 6. Next active task / copy-paste briefing

Next extend the SAME canonical ownership through queued questions, character
batches, derived routes/cache and main-queue notification delivery usingac81718.
Then owner-safe Data Controls/outbox cleanup/payload identity (T1111), then
interrupted initial creation (T1108). Keep current passing voice/held-create
assertions and public original heads/history. Original646 is now green and
preserved here; do not advance original647 until required safety repairs/proof
are finished, and never infer main or physical-phone completion from these
synthetic local results. Production credential hold remains explicit.

Copy/paste: T1165 fixes current activation/outline account-switch failures and
the actual Home voice page that never became a saved project. Canonical15-route
ownership plus settled-editor/owner-qualified promotion, final signed813/0/0,
raw-audio one-project/save/relaunch1/0/0, held-create/edited-page1/0/0, Mac/D009/diff
pass. Earlier ownership-stage recovery3/0/0 stays separately scoped. No paid
calls. Preserved green646acfe2d8 by no-ffc2bd5be; runtime unchanged after merge.
Nextac81718, owner-safe outbox T1111, atomic creation T1108 before648/phone.

## 7. Continue status

**READY FOR CONTINUE.** Overall product goal is active, not complete.
