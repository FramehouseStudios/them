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

## Latest checkpoint — explicit page delivery, 2026-10-21

Runtime **3784636**, parent **dc16c41**; branch
`codex/T-1116-page-recovery-handoff`. This supersedes the earlier read-only
capability description above, not its historical results. T-1116 remains active.

### Connected product change

Studio's Document card now discovers received replies from the existing
owner/backend-scoped outbox. Review stops active Talk; Play/Stop use the existing
audio player. An authoritative page result offers **Append & save scene** in the
selected, loaded project. It does not silently replace a passage or create a
project. An empty output string no longer hides a nonempty spoken reply.

Before touching writer text, recovery atomically stores a version3 delivery
intent in that same received record: stable UUID, receipt/project/document,
exact before/after bytes and integrity digest. The canonical native editor's
paragraph separators are shared rather than duplicated. Existing words remain
the raw prefix. A retry keeps the original plan and cannot append to newer text.
The existing committed-write/adoption/save path owns saving; recovery releases
the receipt only after an authenticated, origin-pinned project read returns an
exact matching version. Reading, playing, closing or an uncertain save alone
does not release it. A generic acknowledgement cannot consume a pending plan.

Account, backend, selected-project/document, conflict and active-stream checks
hold the reply instead of overwriting a different context. Metadata enrichment
cannot rotate the receipt once a delivery plan exists. Older version1/2 records
remain readable; older builds do not understand version3. Finish/export pending
deliveries before downgrading. Each journal draft is bounded to2MiB; retained
audio is still bounded to32MiB. A saved delivery older than the newest32 returned
versions is conservatively held, not appended again or silently discarded.

### Final evidence

- Full signed `themTests`: **932 pass / 0 fail / 0 skip**.
- `test_queued_talk_reply_plays_appends_saves_and_restores_once`: **1/0/0**.
  Real local signup/authenticated HTTP replay, metadata, storage and native UI;
  synthetic recording and intercepted STT1/chat2/TTS23. The request uses the
  canonical confirmed-voice generation-intent field, with server ASR active.
  Review/play/stop, exact existing-prefix preservation, full reviewed-scene
  append, exactly one matching saved version, receipt removal after confirmation
  and byte-exact full native-editor restoration all pass.
- Existing `test_home_raw_audio_uses_current_server_transcript_writes_and_restores`:
  **1/0/0**, intercepted STT1/chat2/TTS1. No live model/microphone claim.
- Final macOS scaffold build exits0; existing concurrency/deprecation warnings
  remain. No Swift6 or warning-free claim.
- Final source contracts under isolated Node20.20.2: **7/0/0**.
  Backend runtime/dependencies are unchanged: **2915/0/2** is inherited from
  dc16c41/T-1117, not a new full backend run. Actual UI host is Node24.19.0.
- D009 against exact parentdc16c41: bridge12860→12796 (**−64**); index33513,
  Studio17337, Root14937 and MemoryAPI10463 unchanged. Diff/syntax checks pass.

Native proof used normal signing and an erased task-owned7F1A14C1 simulator,
iPhone17Pro/iOS26.2. Public-source snapshot:
`/tmp/them-1116-page-proof-final.PbeN9O/source`.
Final bundles/logs and relevant recorded failures:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1116-page-delivery-20261021.Ot1lpd/`.
No paid provider calls, production/main changes, original-PR head changes,
replacement PRs or new conversation database.

### Failures retained and diagnosis corrected

Initial compilation caught a missing Combine import and four streaming callers
left behind by the separator extraction; all are corrected. The first UI run
did not reach a retained reply. The loader now has a persistent root container
and the test navigates to the actual Document card. Subsequent recordings
showed an empty Voice Pin output masking a nonempty reply. Initial commentary
attributed this to delay/metadata timing; that was not established and was
explicitly corrected. Numeric timing showed about20ms decoding in that run.
The UI now selects nonempty display text. A separate decoder guard refuses
missing advertised text so the existing metadata-only recovery can handle it.

The early queued fixture omitted the canonical generation-intent field and
returned non-authoritative Voice Pin output. It was corrected to represent
the actual confirmed-voice request; no non-page result was forced into a page.
The next run confirmed saving but incorrectly checked a1000-character debug
preview for its tail. The final test reads the full native editor and compares
all UTF8 bytes, including after relaunch. Red runs are not counted as passes.

### Exact files and remaining work

Runtime files: `them/BackendClient.swift`, `them/DataControlsScreen.swift`,
`them/OfflineTalkOutbox.swift`, `them/OfflineTalkRecovery.swift`,
`them/OfflineTalkReplyReview.swift`, `them/OfflineTalkPageDelivery.swift`,
`them/OfflineTalkPageRecoveryPanel.swift`,
`them/OfflineTalkPageRecoveryUITestFixture.swift` (DEBUG-only loopback fixture),
`them/ScreenplayLiveDraftBridge.swift`,
`them/ScreenplayStudioDraftToolsViews.swift`, `them/ScreenplayStudioScreen.swift`.
Proof: `themTests/OfflineTalkPageDeliveryTests.swift`,
`themTests/OfflineTalkReplyDecodingTests.swift`, `themUITests/V1SmokeUITests.swift`,
`backend/evals/run_home_voice_handoff_ui_smoke.mjs`; ledger/report:
`TASKS.md` and this file.

Answered locally: durable plan identity/relaunch, no re-planning on retry,
wrong document/project insertion refusal, missing/tampered digest rejection,
guarded acknowledgement, byte preservation, full bound-project UI delivery and
one saved copy. Account/backend invalidation is guarded in code and inherited
scope cases remain green; no interactive account-switch or physical crash
between individual filesystem writes was injected in this UI journey.

Next: investigate the separately reproduced raw `/talk` Page request without
generation-intent context degrading to Voice Pin, without repeating generation
or inventing permission. Then finish the server response durability window,
unbound/first-project and original-context automatic recovery, interrupted
delivery/rewrite behavior, and the physical-iPhone journey against the explicitly
identified shipping backend. A matching server GET is not proof of crash-durable
server storage. Physical file protection, live model quality and real network
conditions remain unverified. Current external-file observation was not renewed:
the screen-control tool reported the Mac locked despite the human's unlock reply.
Production remains held under the existing human decision. Main/review/hosting
and physical-device release gates have not been cleared by this checkpoint.
