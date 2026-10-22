# T-1116 — Canonical decoding and in-app received-reply review

Parent `148f697edfeefa6f06294067e46c5b1369084c93`.
Branch `codex/T-1116-offline-reply-handoff`.
Runtime `4943017f01769a946f45284bfc21a8d222613995`.
Follow-up to `offline-talk-reply-retention-2026-10-21.md`.

## Status: core delivery task remains active

The retained response can now pass through the same successful-talk decoder
used by live requests, and Data Controls has a connected **Read reply** action.
Reading is not playback, insertion, saved-page acknowledgement or completion of
T-1116. The response stays in the existing durable outbox. No paid calls,
production changes, main merge, original-head changes or new conversation store.

## Exact files changed

- `them/BackendClient.swift`: extract the existing successful-response parser
  into `decodeTalkSuccess`; add owner/backend-bound retained-result entry point.
- `them/OfflineTalkReplyReview.swift`: transient review of that existing packet.
- `them/DataControlsScreen.swift`: Read reply action and scoped sheet.
- `them/OfflineTalkOutbox.swift`: DEBUG review fixture gains an ID3 prefix only.
- `themTests/OfflineTalkReplyDecodingTests.swift`: decoder/scope/no-network cases.
- `themUITests/V1SmokeUITests.swift`: actual review/close added to held-result UI.
- `TASKS.md` and this proof report: honest current state and next target.

## Root behavior and boundaries

One decoder owns live and retained metadata, audio signatures, authoritative
page text and result construction. Live requests retain their existing bounded
retry/bootstrap/metadata lookup behavior. Recovery disables all three: no
generation retry, session bootstrap, or volatile turn lookup. A rejecting
URLProtocol in the retained-result tests fails any attempted HTTP request.

Recovery validates its stored receipt, initiating/current account and login
intent, original endpoint and backend origin before decoding and rechecks scope
afterwards. It refuses omitted audio and missing advertised/authoritative page
text without acknowledging or deleting the packet. It does not convert a partial
preview into a completed screenplay. Late scope loss removes only its temporary
decoded audio, leaving the original durable recovery files untouched.

The review renders retained words, explains their undelivered state, and closes
on identity changes or a changed backend scope. Closing/reading/exporting does
not acknowledge delivery. No new state was added to Root/Studio god views.

## Verification

- Focused signed decoder/retention/metadata suites: **10/0/0**.
- First full signed units **925/0/0**; then added cancellation/nonempty-owner,
  authoritative-page and backend-change presentation guards. Final full signed
  units on those final files: **925/0/0**.
- Actual existing Home raw-audio → server transcript → formatted page → saved
  restoration UI: **1/0/0**. Real local auth/client/server/store, intercepted
  STT1/chat2/TTS1. No physical microphone or live model-quality claim.
- macOS scaffold compile exits0 on final guarded files. Existing Swift
  concurrency/deprecation warnings remain; no Swift6/warning-free claim.
- Fresh isolated Node20.20.2 source contracts **7/0/0**. Backend runtime and
  dependencies unchanged; full backend **2912/0/2** is inherited from the
  earlier runtime proof, not a newly executed full backend gate.
- D009 against exact parent148f697: all five deltas0; index33538,
  Studio17337, Root14937, bridge12860, MemoryAPI10463. Diff checks pass.
- Actual held-reply Read/Close/relaunch/native Files export UI: **1/0/0**.
  It asserts the retained words are rendered inside THEM, closing leaves the
  Read action available, relaunch keeps the response, and export does not
  consume it. The UI assertion passed without selector or expectation changes.
- Independently verified the saved742byte Files-provider JSON before any next
  erase: SHA256
  `1f7daebd80295c4a528e89856c359996c9d251f79d638cffc0357de37d9132dc`.
  Request CRLF/tab/trailing whitespace and signature-only response bytes match;
  the fixture session credential is absent. This is not proof of playback.
- Logs, signed bundles and the synthetic exported JSON are retained at
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1116-review-20261021.GEzLIZ/`.

All native proof uses normal signing and erased task-owned simulator
`7F1A14C1-B379-4417-AFE9-331810CD9CD3`, iPhone17Pro/iOS26.2. Source frozen at
`/tmp/them-1116-review-source.ztlbnL/source`. Existing other simulator/user data
is not erased. The DEBUG held-response fixture is signature-only synthetic audio,
not evidence of playback; the new screen has no disconnected Play/Apply action.

## Remaining work and adversarial disposition

Answered by focused cases: canonical authoritative-page decoding; exact stored
audio bytes; no HTTP/model retry on retained decode; no session credential
adoption; wrong current account/backend/login intent refused; missing advertised
page/invalid audio held; decoding itself does not consume the durable receipt.

Presentation identity/backend invalidation is source-guarded; the UI story does
not exercise a live account switch. Physical-device file protection, feature-
length decoding IO and real-network conditions remain unmeasured. Retention's
32MiB audio bound, disk-failure and downgrade limitations still apply.

Next, finish the actual delivery boundary: preserve full canonical turn metadata
when response headers omit it; route the retained result to existing Clementine
playback and the intended Studio document, with an explicit review when context
has changed. Preserve newer writer edits. Persist delivery identity with the
saved document so a crash between insertion and receipt acknowledgement cannot
insert twice. Prove one authenticated queued result, reply/page delivery, saved
version, relaunch and exact restored words before acknowledging T-1116 complete.
