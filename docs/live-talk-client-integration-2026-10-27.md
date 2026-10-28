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
