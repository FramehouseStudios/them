# T1182 live-client continuation — not complete

Published prerequisite head: `18d27c37142daf1ef95e4616257e722b1e8fd547`.
Worktree/branch remain `codex-interrupted-talk-recovery` /
`codex/T-1182-live-reply-custody`. Current continuation is uncommitted.

The real BackendClient now captures initiating identity before waits, admits
one exact multipart body before transmission, and preserves that body across
unaccepted auth retries. Completed HTTP200 response custody runs before
cancellation, decoding, metadata GET or owner rejection. Shared/fallback
transports carry the same retention callback and injected session.

The decoder no longer has a callback that can generate another turn. Failures
after acceptance carry `BackendTalkAcceptedReplyError`, outside Root's transient
BackendError/URLError retry policy. Results carry the current enriched receipt.
Metadata GET freezes the original owner's bearer and checks scope around waits.
Session bootstrap persistence retains its existing conditional epoch write.

Explicit Stop and definite rejection can retire only an unaccepted ready
admission. Accepted responses are never erased by that cleanup. A more subtle
race found by Zora is fixed: cancellation previously normalized a completed
response-write failure, allowing its ready held request to be retired. Custody
failure identity now wins before cancellation checks at every transport catch
and the client cleanup. No new persistence store/framework was introduced.

## Verification so far

`/private/tmp/them-1182-live-client-proof/client-custody-first.xcresult`:
signed erased owned iOS simulator, **40 pass / 0 fail / 0 skip**. This includes
nine actual-client URLProtocol cases plus existing transport, live storage,
metadata and retained-decoding cases. Synthetic audio/signatures only, not
model quality, physical microphone or playback-quality evidence. No paid calls.

Actual client cases cover durable return, three malformed accepted-audio
variants without another POST, same-byte/same-boundary auth retry, A→B custody
without B metadata lookup, GET-only metadata repair after reopening, explicit
pre-response Stop, genuine offline held requests, and204 continue-listening.
The cancellation/write-failure case pauses the actual actor response write,
cancels the actual client task, makes its blob directory unwritable, releases
into the real atomic write, and verifies the original request remains parked,
exportable and unable to auto-regenerate. The synchronous optional pre-write
hook is nil in production, accepts no private data, and adds no actor reentrancy.

The subsequent `live-intent-first.xcresult` passed **46/0/0**, including the
cancellation-cleanup placement, local-only decoding, optional metadata429
notice, and version4 pending page intentions. It preserves legacy append
validation, binds completion/enriched metadata to the same mutation, and keeps
interrupted intentions exportable without permission to generate again.

## Native connection in progress

Safe admission identity now flows through response metadata/result into Root's
captured document, staged playback and native insertion requests. Credentials
stay in the network client. Ordinary text edits preserve the document lease;
accepted project loads, explicit Clear and auth-intent changes revoke it. Only
the existing verified first-project receipt can authorize unbound promotion.
The original backend origin is checked as well as account/document identity.

Both native editors gate standard insertion and voice-reveal prepare before
their actual text assignment. The existing outbox must first retain exact
before/range/insertion/after. After that await, only the latest compatible
request may resume; a changed selection/text cannot reuse old authorization.
The immediate voice fallback uses the same custody-aware insertion path.
No new Root @State, storage framework or generation retry was introduced.
Editor request/playback value types moved cohesively to
`ScreenplayInsertionContract.swift` to keep the bridge within D009.

Initial `native-placement-first.xcresult`: **49 pass /9 fail /0 skip**.
Six new cases omitted the fixture Authorization header and never reached the
write; two host crashes resolved to the new gate's generated isolated deinit
(`TaskLocal::StopLookupScope` / `swift_task_deinitOnExecutorImpl` / malloc abort),
including destruction through the actual iOS coordinator. Another case failed
with a host InvalidTransition after the restart. The header is corrected and
the gate/attempt use explicit stateless nonisolated teardown, matching the
existing telemetry precedent. Corrected `native-placement-corrected.xcresult`
passed **58/0/0**, signed on the erased owned simulator. All native jobs are
terminal. This includes nine new gate/native cases plus client/storage/origin
and Stop regressions. The native fixture injects a task-owned real disk queue
and identity to isolate ordering from host authentication; it does not establish
the default signed-in Home journey. Conflict feedback is emitted once asynchronously so an
incompatible pending request cannot publish a SwiftUI update storm.

Full units/UI/macOS remain a coherent integration checkpoint after these
changed boundaries, rather than repeated unchanged gates.

Preserving integration merge `f642023` passed signed full units **979/0/0**
on the erased task-owned simulator, including Zora's six held-save cases.
That is the intermediate checkpoint before the following review fixes.

Zora's bounded source review then established two real gaps: Stop did not
revoke a queued standard live fallback during its held disk write, and
anonymous transport identity could fail document staging then silently reach
the legacy nil-context insertion path. Cancellation now revokes pending live
standard insertion while preserving its held intention. A live-context
requirement follows Root's preparation through playback and native clones;
missing evidence fails closed instead of downgrading to legacy. Related
reveal/render value types remain in the same extracted insertion contract.
The first follow-up `stop-required-context.xcresult` ran **30/1/0**: the
missing-context case correctly performed no write but left its intentionally
unused `native stored` XCTest expectation unwaited. That expectation is now
inverted and waited alongside the no-write signal; no assertion was removed.
Corrected `stop-context-corrected.xcresult` passed **42/0/0**, including the
six save cases, pending-origin check, held native fallback Stop, missing native
context and mismatched-owner plan rejection. A pending document capture now also ends
thinking, reports an actionable page/account transition and resumes the mic,
instead of silently returning with the voice turn stuck. Its existing pure
prompt-detail helper moved to the confirmed-turn preparation owner.

The exact final runtime also passed authenticated local UI:

| Artifact | Pass / fail / skip | What it establishes |
| --- | --- | --- |
| `live-client-writer.xcresult` | 1/0/0 | Raw audio reaches intercepted server ASR, formatted page appears, save and exact relaunch |
| `live-client-stop.xcresult` | 1/0/0 | Actual Studio Stop ends capture and cancels the authenticated Page reservation |
| `live-client-macos.log` | build exit0 | macOS scaffold compiles; no signed release or interactive macOS claim |

Each UI run used signing on and an erased task-owned simulator, real local
authentication with REQUIRE_USER_AUTH=1, synthetic funds and intercepted
provider responses. Each observed STT1/chat2/TTS23; **zero paid model calls**.
Stop observed HTTP200, cancelled=true, dropped1, byReservation=true.
D009 passes against the T1181 parent: Root14930→14919, bridge12784→12774;
other protected files do not grow. Diff check passes.

Backend/scripts are byte-unchanged from published18d27c3. The earlier Node20
full result2996/0/5 is inherited, not a new backend run. Full units979/0/0 belong
to intermediate mergef642023; the later42 focused and two UI cases cover the
final review fixes. Do not present these as a new final full-unit run.

Final runtime commit: `be05f16e43aa0de450b003ef8c10baa515cf3e77`.
Permanent local evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1182-client-native-20261027-g6og7pmv`.
VERIFIED6480 files hashed, zero mismatches; all17 changed Swift files match
that committed runtime. Manifest SHA256:
`284546fbcc62b688684a913444928d9796f19dfeedc44d53128bf535ee10ace0`.
All native/backend helper jobs are terminal; only the exact task-created
dependency link was removed, with its target preserved. The evidence source
snapshot precedes this final publication metadata; runtime bytes are identical.

## End-of-session report

1. **Completed:** live-client accepted-response custody connected; native
   before-write intention connected and checked; preserving T1183 integration
   proves stale save ownership; held Stop and missing-context gaps fixed.
   T1182 and the product goal remain incomplete.
2. **Files changed:** `them/BackendClient.swift`,
   `them/BackendTalkStreamingTransport.swift`, `them/OfflineTalkOutbox.swift`,
   `them/OfflineTalkPageDelivery.swift`, `them/OfflineTalkRecovery.swift`,
   `them/ConfirmedStudioTurnPreparation.swift`, `them/RootExperienceView.swift`,
   `them/ScreenplayLiveDraftBridge.swift`, `them/ScreenplayInsertionContract.swift`,
   `them/ScreenplayLiveTalkPageContext.swift`, `them/ScreenplayStudioViewModel.swift`,
   `themTests/BackendTalkLiveCustodyTests.swift`,
   `themTests/OfflineTalkLiveCustodyTests.swift`,
   `themTests/OfflineTalkLivePageIntentTests.swift`,
   `themTests/ScreenplayLiveDraftOriginTests.swift`,
   `themTests/ScreenplayLivePageMutationGateTests.swift`,
   `themTests/ScreenplaySaveCompletionOwnershipTests.swift`, `TASKS.md`,
   this report and `docs/save-completion-owner-2026-10-27.md`.
3. **Root issues fixed:** acceptance/cancellation/decode ordering; one immutable
   request through auth retry; original-owner metadata reads; early native
   mutation before durable intention; stale project save publication; queued
   fallback after Stop; missing ownership silently using legacy insertion;
   generated isolated deallocation crashes; unavailable target leaving voice
   thinking. The two fixture failures are recorded above, not hidden.
4. **Verification:** exact scopes/counts/failures are above. Physical microphone,
   natural voice/model quality, shipping backend and production remain unproven.
5. **GitHub status:** scoped T1182 backup only. Original heads and helper commits
   are preserved; no replacement PR, main merge, force push or deployment.
6. **Next active task:** complete real delivery settlement and distinct live
   mutation recovery. Existing append-oriented recovery must not be represented
   as completed replacement recovery. Bind unbound promotion to the existing
   first-project receipt; finish typed/render ownership afterward.
7. **Continue status:** READY FOR CONTINUE. No new human action is required for
   this local work. Production hold and independent review remain in force.

## Remaining live contract

Root voice publication and before-mutation intent now have a source connection;
the focused native/transport contract passed58/0/0. Typed/render routes and normal
delivery settlement remain unfinished. Ordinary successful receipts currently
remain held. This working tree must not be deployed or called a completed
workflow. Original PRs/main/production stay unchanged; no replacement PR.

Zora's source audit established that native voice-reveal prepare already
installs the entire after-draft. Persisting only at finalize/lastCommittedWrite
is too late. Preserve real-time behavior using an explicit version4 live
mutation intent in the existing admitted blob, not another store or a permanent
wait-for-all-audio workaround.

The intended value path is admission → response metadata → Root's captured
owner/document/turn → staged playback value → insertion request → native prepare.
Persist exact before/UTF16 range/insertion/after before native mutation, then
revalidate after the actor await. Existing append recovery keeps its strict
prefix rule; live replacements get explicit validated transformation evidence.

A ready+live intent is an interrupted operation, never permission to generate
again or a falsely completed response. Export/recovery must expose it. Completed
response capture atomically binds its receipt and digest. Metadata enrichment
must also rebind live intent instead of being blocked by pageDelivery!=nil.
Cancellation cannot retire a live intent without actual native rollback/no-write
evidence. Received response custody remains held even if its page was rolled back.

Conversation-only delivery acknowledges after full owned playback. Page delivery
acknowledges only exact saved project/version/draft evidence; save-before-ack
recovery finishes the same mutation/save and never appends again. Unbound Home
pages use the existing verified initial-project receipt/document mapping.
