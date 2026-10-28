# T1185 — Preserve Studio render output before rejecting obsolete delivery

Base: published `91ed7ebd24abb0ef86fea931a8e95dfd1d979748`.
Branch: `codex/T-1185-render-custody`.
Worktree: `/Users/halfmutantfilms/io.them-worktrees/codex-interrupted-talk-recovery`.

## Verified source problem and connected fix

Typed Studio uses `/realtime/studio_render` and `/realtime/studio_render_stream`,
not `/talkText`. Their output previously lacked canonical local custody, while
unconfirmed stream/timeout failures could trigger another generation. Adding a
blind late-result guard would protect the current page by losing the old result.

This phase extends the existing protected outbox and actual production clients.
It does not finish Root/Screen publication ownership or render settlement.

- Capture the initiating auth owner before asynchronous resolution. Verify it
  before sending; retain a completed old owner's response before rejecting its
  return to a new owner. Suppress obsolete SSE callbacks while continuing to
  keep the original incoming response where transport permits.
- Park an admitted render request before dispatch. Store original request JSON
  without authorization/client/app/cookie credentials. New endpoints never enter
  automatic enqueue/resume/drain/replay; an edited pending index is repaired to
  parked and also rejected by the drainer/request builder.
- JSON uses the canonical streaming transport's completed/interrupted custody
  hooks. Bytes actually observed by its delegate are kept before returning a
  failure or cancellation. All 2xx statuses accepted by the client use custody;
  voice's existing success contract is preserved.
- Keep SSE line/frame prefixes in the same record before preview callbacks.
  Prefixes cannot shrink, change headers/status, or replace a completed result.
  Keep the latest available bounded prefix on read failure. A malformed done
  payload cannot promote an earlier partial with passing trace into success.
- `x-them-render-complete` is product-owned, finite-allowlisted, and integrity
  protected with the stored response. It means complete transport framing,
  never approved page quality or delivery. Recovery checks those independently.
- Accepted, custody, deadline and post-admission unconfirmed outcomes are
  nonretryable in the shared execution policy. The latter does not falsely claim
  the server accepted a request whose headers never reached the client.
- Real received-reply review recognizes render before attempting audio decoding.
  It offers selectable retained text and Data Controls export guidance. No fake
  BackendTalkResult, Play, Append, speech marker, page mutation or acknowledgement.
- Extract the three existing retry/deadline/fallback methods from Root into one
  product policy owner. Root shrinks by99 lines; no new Root state/framework.

## Verification and failures

Signed native proof uses erased owned simulator
`91693AF0-AE2C-4FAD-9F4C-EC4C92AA382A`, iPhone17Pro/iOS26.2. No paid model calls.

- Initial focus: **63 pass / 1 fail / 0 skip**. Fixture generated equivalent JSON
  in different key orders on separate reads; stable served fixture bytes fix its
  exact raw-response oracle without changing production or weakening equality.
- Boundary focus: **77/2/0**. URLSession can report an abrupt URLProtocol failure
  before delivering buffered bytes to the delegate; cancellation can also win
  after another chunk. Fixtures now control the causal observed-chunk boundary.
  Dedicated failure/cancel tests pin the exact observed bytes, while actual-client
  unconfirmed tests do not pretend unavailable network bytes were received.
- Frozen-source full signed units: **1050/0/0**. Includes original contracts,
  fourteen recovery-parser cases, actual JSON/SSE client/store tests, observed
  chunk failure/cancel, malformed done, owner switch, index-fault and201 custody.
- Authenticated local UI: **2/0/0**. Canonical renderer → retained review →
  relaunch → same retained text, no Play/Append, unchanged exact original page
  and one original saved version. Existing raw voice → page → saved-version →
  exact relaunch also passes. Actual local HTTP and synthetic account/wallet;
  provider output is intercepted, not live-model or physical microphone proof.
  Observed intercepted counts: STT1/chat3/TTS23; no paid provider calls.
- macOS checkpoint: **BUILD SUCCEEDED**, process exit0.
- D009 passes against actual published T1182 parent: Root14928→14829,
  index33494/Studio17339/bridge12774/Memory10461 unchanged. Syntax and
  `git diff --check` pass. Existing Swift5 concurrency warnings remain; this is
  not proof of a Swift6 migration or strict-concurrency readiness.
- Backend production is unchanged; previous Node20 **2996/0/5** is inherited,
  not a fresh full run. Only the allowlisted local UI orchestration changes.

Artifacts: `/private/tmp/them-1185-render-proof`. Final archive/hash/publication
details follow only after terminal native results and committed-source checks.

## Committed proof checkpoint

Runtime merge `7a48dd84616eab11abbff5ac85ea59e931ab0c1d` preserves original
helper `5663be2c044c7f6d1cf9e0c0326a7a9575392137`. Identical-tree merge
`aee29413235c3a310c790a8186eab2e460219b36` additionally preserves original
follow-up `ff3eb5d08c945430217a017462ca65728130dfac`. No history rewrite.

Permanent archive:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1185-render-20261027-ykdls6gm`.
Verified **6084 artifact files / zero hash mismatches**, with all **16 scoped
source files** matching committed runtime bytes. Manifest SHA256:
`aeec7e6a138fe51732ee5fa80f16dcba73111c41cde0cac882f310c15824cab8`.
All native jobs terminated. Only the owned temporary dependency symlink was
removed; its target and unrelated work remain intact. A documentation-only
follow-up records this proof before normal scoped branch publication.

## Explicit limits and next implementation target

SSE framing is reconstructed with LF from `AsyncBytes.lines`; JSON string text
is kept intact. An unfinished raw line still buffered inside URLSession is not
available to this parser, and HTTP failure may expose headers with zero bytes.
Those cases retain available evidence and the original request, never invent
missing output or automatically pay for another generation. Response-size/disk
failures remain explicit held recovery rather than a successful-custody claim.

Normal render records intentionally remain held for review until the consumer
can prove original-document publication/save or intentional dismissal. Reading
or closing the review does not retire them. This incomplete integration is not
ready for main promotion or deployment.

Next, fence typed Root partial/final/catch/defer and its Screen caller with the
original request/document/auth/backend. Reuse the existing fingerprint/date
dispatch lease; use token-only cleanup so document switches do not strand busy
state. Screen seed/history cleanup needs its own existing perceived-speed lease.
Propagate ownership through deferred commit/annotation helpers' internal waits
and HTTP completion, not merely between calls. Voice render callbacks/fallback
callers also need their original operation lease. Do not drop retained responses.

Binary next proof: release A after Stop, B selection or a same-text replacement
request; B's exact text/status/submission remain unchanged, A remains recoverable
after relaunch, and no second generation starts. Preserve normal typed preview,
commit, acknowledged save and exact restore. Notes rewriting and its receipt
settlement remain separate. Physical phone/shipping backend proof remains open.

## Exact changed files

- `TASKS.md`
- `backend/evals/run_home_voice_handoff_ui_smoke.mjs`
- `docs/render-response-custody-2026-10-27.md`
- `them/BackendClient.swift`
- `them/BackendStudioRenderCustody.swift`
- `them/BackendTalkStreamingTransport.swift`
- `them/OfflineStudioRenderRecovery.swift`
- `them/OfflineTalkOutbox.swift`
- `them/OfflineTalkPageRecoveryUITestFixture.swift`
- `them/OfflineTalkRecovery.swift`
- `them/OfflineTalkReplyReview.swift`
- `them/RootExperienceView.swift`
- `them/StudioRenderExecutionPolicy.swift`
- `themTests/BackendClientCraftAPITests.swift`
- `themTests/BackendStudioRenderCustodyTests.swift`
- `themTests/BackendTalkStreamingTransportTests.swift`
- `themTests/OfflineStudioRenderRecoveryTests.swift`
- `themUITests/V1SmokeUITests.swift`

## Session status

1. **Completed:** connected render response custody, nonretryable uncertain
   outcomes, bounded text recovery and canonical partial/cancel retention.
2. **Files:** the exact18 paths above; no other source or private inputs changed.
3. **Root fixes:** missing accepted-output handoff; network/timeout fallback
   regenerating; malformed done promotion; replay through a damaged index.
4. **Verification:** signed1050/0/0, local HTTP/UI2/0/0, D009/syntax/diff pass.
   macOS build exit0. Intermediate failures are retained above.
5. **GitHub:** preserving helper integration on T1185 only, runtimeaee2941 and
   archive above. Normal scoped branch publication only; no main merge,
   original PR-head change, deployment or protection/review bypass.
6. **Next active task:** original request/document fencing through Root, Screen
   and deferred metadata, then normal render settlement. Do not drop kept output.
7. **Continue status:** **READY FOR CONTINUE**; product goal remains incomplete.
