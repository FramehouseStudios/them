# T-1125 — Native talk ownership, 2026-10-24

## Scope and identity

Branch `codex/T-1125-talk-owner-fence`, parent
`8f8a66fab1f019bef8ad37444b0c1580b78f8ef3`, worktree
`/Users/halfmutantfilms/io.them-worktrees/codex-mentor-current-parent`.
This is a native reliability change, not a main merge or deployment.
Runtime commit: `d184e3e` (four source/test files); full-bundle fixture isolation
correction: `2409673` (three test-only lines).

VERIFIED by call-site inspection: the actual Page caller already creates one
stable idempotency key and retains it across outer/transport/auth/audio retries
and offline replay. An optional API parameter alone was not evidence of a
missing production key. Zora's read-only audit instead identified an account
ownership gap: recursive retry could attach the current global bearer rather
than the initiating account, and enqueue omitted its existing owner argument.

## Smallest connected fixes

- Capture `BackendAuthRequestIdentity` before asynchronous dispatch/bootstrap.
  Preserve it through speech and text entry, session/auth/audio/transport retries,
  metadata reads and offline admission. Compare user plus login-intent generation,
  not token epoch alone: same-login refresh remains allowed; a new login does not.
- Build bearer headers from a checked current snapshot of that same owner. Use
  canonical `refreshAuthSession(expectedOwner:)`, not an unrestricted refresh.
- Check ownership after transport/decoding and before streamed/main-queue reply
  callbacks. Remove undelivered temporary decoded audio when the owner changed.
- Pass the captured owner into the existing outbox admission contract. No second
  queue, storage schema, identity policy or auth framework is introduced.
- Remove talk retry's shared-token deletion. Direct `refreshClientToken` already
  bypasses cached tokens and persists through the existing epoch compare-and-set.
  Deleting first was unnecessary and could erase a successor account's token
  before a later owner check. No check-then-unconditional-clear race remains on
  these two talk retry branches.
- Track Page activity with per-attempt leases in `BackendTalkPageActivity`.
  Nested retries/overlapping same-owner requests cannot clear a remaining lease;
  a new login removes old leases. A recursive lock serializes dictionary mutation
  and synchronous publication, including reentrant callbacks. Companion requests
  with no lease do not emit an unrelated Page completion.

The injected auth-refresh hook has explicit main-actor isolation and returns the
canonical auth session state. Streaming transport honors injected URLSession
protocol classes, and fallback transport uses that same injected session. Default
production routing/redirect protection is retained; tests contact no providers.

## Review and proof ledger

Zora performed read-only call-site and adversarial source review, with zero native
runs or edits. Her stale-clear and unscoped-activity findings were upheld. A later
review found the first activity dictionary needed synchronization; the lock-backed
capability replaces that intermediate implementation.

Early proof failures are retained, not counted as passing:

- `/tmp/them-1125-focused.log`: my invalid comma-combined test selector; exact owned
  xcodebuild process was intentionally interrupted, exit75. No passing claim.
- `/tmp/them-1125-owner.xcresult`: 7 pass / 1 crash / 0 skip. The custom asynchronous
  refresh closure crashed; this was not a successful same-owner-refresh proof.
- `/tmp/them-1125-owner-v2.xcresult`: 9 pass / 3 fail / 0 skip. Two refresh-hook
  crashes remained, and the metadata fixture omitted `x-turn-meta-available`, so
  it never exercised its intended GET. Both were corrected before another run.
- `/tmp/them-1125-units.xcresult`: 946 pass / 1 fail / 0 skip. The new session
  bootstrap test inherited a cached fixture credential in the full bundle and
  skipped its intended `/session` boundary. Its setup now explicitly clears the
  synthetic shared token in the erased test host; assertions/runtime unchanged.

VERIFIED: corrected focused suite `/tmp/them-1125-owner-v3.xcresult` reports
**13 pass / 0 fail / 0 skip**, signed, on erased owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3` (iPhone17Pro/iOS26.2). Covers changed
accounts/login intents on success/401/503/transport failure/bootstrap, same-owner
refresh preserving key/bearer ownership, change during refresh and metadata,
failed client refresh retaining shared credentials, overlapping/changed-owner
Page leases and100 concurrent lease attempts. A concurrent stress pass is evidence
for exercised schedules, not a proof of every possible interleaving.

Final native checkpoint, VERIFIED:

- Complete signed `themTests`: **947 pass / 0 fail / 0 skip**, including all13
  focused cases, `/tmp/them-1125-units-v2.xcresult`. Counts are not additive.
- Raw audio → page → save → exact native-editor relaunch UI: **1/0/0**,
  `/tmp/them-1125-raw-voice.xcresult`; intercepted STT1/chat3/TTS1.
- Queued accepted reply → playback → single append → save → exact relaunch UI:
  **1/0/0**, `/tmp/them-1125-queued-reply.xcresult`; intercepted STT1/chat2/TTS23.
- macOS scaffold build: exit0 (`/tmp/them-1125-macos.log`). This is the existing
  build-only scaffold configuration, not a signed release/macOS runtime proof.
- D009 and `git diff --check`: pass. Every watched file and all backend source
  are unchanged against parent8f8a66f. Existing Swift6/deprecation warnings remain.

Xcode26.3/17C529; each native runner erases only the task-owned simulator and
retains normal iOS signing. UI backends run on Node24.19.0 with real local auth,
synthetic funds and provider interception. No paid calls were made.

Retained local archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1125-20261024.xh7F2m/`.
It contains final focused/full-unit/UI bundles and logs, macOS log, failed-run
logs and compact failure summaries. The raw crash/device inventory is not copied
or committed. Old `/tmp` paths alone are not the durable proof location.

## Exact changed files

- `them/BackendClient.swift`
- `them/BackendTalkPageActivity.swift`
- `themTests/BackendTalkOwnershipTests.swift`
- `themTests/OfflineTalkMetadataCustodyTests.swift`
- `TASKS.md`
- `docs/talk-owner-fence-2026-10-24.md`

## Boundaries not established here

No paid provider, physical microphone, physical-iPhone journey, production health,
StoreKit purchase validation, deployment or main/hosted-check claim. An A request
already accepted by the server may still complete there as A after a local account
switch; this fence prevents adopting it as B, not automatic original-document
delivery. Original-context/unbound/precise-rewrite recovery remains unfinished.
Post-completion replay still has its documented bounded retention window.
Root still forwards Page activity/reservation notifications through asynchronous
main-actor tasks; complete real-device interruption timing is not established by
the tracker stress case or these two writer workflows.

No backend source changes in this slice. The parent T-1124 backend results are
historical evidence, not a newly executed backend suite for this task. Accepted
decisions, original PR heads/history and the production hold remain unchanged.
