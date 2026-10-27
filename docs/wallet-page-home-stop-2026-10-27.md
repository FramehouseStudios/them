# Wallet, Page ownership and Home Stop — 2026-10-27

## Completed and source boundary

VERIFIED runtime `770978cafc851bd2c7b6eb46aaeb780046d00ac4` on
`codex/T-1178-wallet-page-owner`, based on saved T1177
`3536be740ef97cba86d9e480586dc0c3cc25a706`.
Worktree: `/Users/halfmutantfilms/io.them-worktrees/codex-interrupted-talk-recovery`.
No original PR head, main, production or paid provider changed.

Restore preserved wallet and Page cancellation fixes from `6f360de` and
`f5e3e84` through the existing trusted-user resolver. Reuse canonical Page
reservations, wallet holds, screenplay instruction policy and synced native
insertion. No second authorization, wallet or draft store was introduced.

## Root causes and resulting behavior

1. Wallet balance reads accepted caller-supplied owner aliases; Page cancellation could
   cancel another account's reservation or claim an unowned reservation.
   Both routes now require verified middleware identity through
   `requireMemoryUserId`. Missing identity returns 401/no-store even when the
   global auth flag is off. Foreign, absent and legacy-unowned reservation IDs
   return the same 404. Session cancellation filters the verified owner exactly.
2. Raw Home "write a story" had neither a Page hint nor an existing project.
   The backend did not classify that explicit request as Page; Studio metadata
   could also be null before ASR and never be created afterward. The actual
   raw HTTP response lacked a Page handle. A canonical anchored story request
   predicate now serves target inference and lane classification. After ASR,
   the handler sanitizes metadata when it was absent. Explicit voice-pin,
   refusal, conceptual premise requests, questions and quoted dialogue retain
   their existing nonwriting behavior. Actual Page work must fund its server
   budget before generation and exposes its existing cancellation identity.
3. The client fixed its insertion choice before ASR. A Home request confirmed
   later as writing took immediate/fallback insertion paths instead of the
   existing synced path. Confirmed writing now initializes that same synced
   owner and excludes the redundant fallback generation path.
4. Stop's generic cleanup overwrote the voice-specific rollback command.
   Preserve an already-issued voice rollback through repeated cancellation.
5. Project loading conditionally removed the native editor. Actual diagnostic
   trace showed an empty editor replaced with a new 1,026-character editor;
   the replacement had no voice baseline/range. Keep the editor mounted under
   loading progress and disable input while loading. Final diagnostic trace
   showed one editor, native rollback 1,026 to zero, and queued empty binding.
   Temporary count-only creation/rollback instrumentation was removed.

The earlier extra response callback in local `620e877` did not fix the failure
and was reverted forward in `f343fc5`; its history remains preserved.

## Evidence and failures retained

- Initial preserved ownership regressions: 1 pass / 5 fail / 0 skip. Final
  focused owner/route/refusal/abort/fixture cohort: **42/0/0** on Node20.20.2.
- Actual JWT wallet tests exercise both auth flags, revoked/invalid tokens,
  aliases/header spoofing and restart. Page endpoint JWT admission is included;
  foreign in-flight abort/refund isolation uses a route fixture with server-set
  principals, real reservations/AbortController/wallet, not forged production JWTs.
- Raw ASR HTTP proof: five underfunded cases return 402 before chat/TTS,
  including Home without project/Page hints plus a misleading conversational
  hint. Funded Page settles fixture usage, publishes its handle and owner
  cancellation returns 200. No production wallet credit or provider call.
- The full backend initially had **2,995 pass / 1 fail / 5 skip**: an older
  turn-ownership fixture depended on this same story request bypassing the
  wallet. Provision synthetic funds through canonical persistence/restart;
  preserve every owner/foreign/revoked boundary assertion and require Page.
  Corrected frozen Node20.20.2 suite: **2,996/0/5**, 3,001 tests, 47 suites.
  Docker external network disabled. Shipping backend/test/dependency bytes are
  unchanged from green checkpoint `786fdec`; the later observer-only change
  passes its separate three-case fixture suite. No unchanged full rerun.
- Five full-suite skips: wallet-settlement PostgreSQL, literal-prefix real
  PostgreSQL, gated live Page-sync, idempotency PostgreSQL admission, metadata
  cleanup PostgreSQL. This pass does not turn skips into SQL/live proof.
- Earlier Stop UI's local assertions passed while the stronger producer failed
  because no server cancel occurred. After real Page routing, Stop UI failed
  to restore the baseline. After local command repair, the remaining failure
  exposed coordinator destruction. Each actual red bundle/log is retained.
- A first newly added native regression used zero segments, then a reveal
  starting at time zero; those fixtures completed before cancellation and
  their failures are not extra product bugs. The corrected active reveal is
  timed after cancellation and runs through real UIKit plus deferred SwiftUI
  publication. It passes **1/0/0** and retains exact baseline bytes through
  repeated Stop/barge-in cleanup. The original direct regression also passed;
  that narrow success did not override the actual failed UI journey.
- Instrumented stable-editor Stop: signed **1/0/0**; capture stopped, empty
  baseline restored, no late insertion/rearm. Actual authenticated HTTP 200
  reports `cancelled=true`, exactly one dropped reservation, by reservation ID.
  Earlier HTTP 200 without mutation is explicitly insufficient in the producer.
- Final diagnostic-free ordinary raw Home writing: signed **1/0/0**, complete
  scene, one project, a matching saved version and exact page restored on relaunch. Intercepted
  STT1/chat2/TTS23; these counts are simulated-provider traffic, not costs or
  live microphone/voice-quality evidence.
  Correction to the earlier progress update: this workflow asserts one project,
  but does not assert exactly one saved version. Do not infer that count.

- Final diagnostic-free runtime770978c signed units **902/0/0**, completed
  native summary inspected; same owned iPhone17Pro/iOS26.2 build23C54.
- Final diagnostic-free Stop **1/0/0**, native baseline restored and no late
  insertion/rearm; actual owner HTTP200/cancelledtrue/dropped1/byReservationtrue.
- macOS scaffold **BUILD SUCCEEDED**, process exit0. Build-only, not macOS
  product-journey or unsigned-iOS-test evidence.

All native proofs erase only owned91693AF0; normal simulator signing remains.
Full-test container3a4bb06b is terminal/exited0, all native jobs terminal;
borrowed dependency symlink removed without modifying its parent target.
Permanent evidence: `/Users/halfmutantfilms/io.them-worktrees/_proof/T-1178-20261027.ziitf9xp/`.
17,462 hashed files, zero mismatches; manifest SHA256
`bfe41bf862a54fd32e924cc78ef693f19bfc30b9550753d6d1920932dd0d1ce6`.
Logs/bundles retain the reds, corrected fixtures and final scope separately.

D009 against saved T1177: index33494, Studio17340, MemoryAPI10463 unchanged;
Root14933 to14931, bridge12788 to12784. Diff/syntax checks pass. Existing Swift6
isolation/Sendable warnings remain; no claim they were resolved or suppressed.

## Integration and GitHub

Read-only GitHub refresh found main still
`78b8c94f43b4a11f18c2e61df556b9cd7370e735`, 367 open PRs, 356 drafts.
The session's initial local head was 225 commits ahead of main, not quoted301;
later local task commits increase that count. Counts are a snapshot, not readiness.

Foundation path: original #964 -> #904 -> #919 -> #973. Product path starts
original #638 -> #639 -> #640 -> #641 -> #642 -> #643 -> #644 -> #645 -> #646
-> #647 -> #648, following actual base names. These are separate dependency
paths; advancing main through one requires a preserving main refresh and new
checks for the other. They are not one interchangeable green rollup.

Exact #964 `5faa43d6` and #638 `0b568613` required runs are green; both lack a
current independent approval. #964's prior review is DISMISSED. Human chose
to review later. Original #639–#646 current-head rollups report SUCCESS;
#647 remains original `848e59d0` with old failing checks, not this local proof.
Main still requires Backend tests, Quality Gate and D009, strict up-to-date
checks, one approval, stale-review dismissal and administrator enforcement.

Publish only the scoped backup after proof; no replacement PR, original-head
advance, main push/merge, force/squash, auto-merge or protection bypass here.
Refreshing an old PR's status does not establish integrated-main proof.

## Remaining limits and next action

- Cancel during already-prepared playback does not promise a refund for a
  successfully delivered/billed response. In-flight abort/refund is checked
  separately; no new pricing or retroactive-refund rule is introduced.
- Reservation state is process-local; cross-host cancellation and interrupted
  pre-header ASR cancellation are not established by this post-response test.
- Existing completed-response TTL, legacy/unkeyed delivery and metadata size
  limits from T1177 remain. No indefinite delivery guarantee is made.
- Shipping backend, real microphone/voice quality, precise spoken rewrite and
  physical-phone full journey remain unproven. Production is held. No paid
  model calls were made and no secrets were read or included.
- Next: preserve/publish this scoped proof, then continue the remaining
  delivery/cancellation boundary audit and original-stack integration through
  genuine reviews and exact updated-head checks. READY FOR CONTINUE; the full
  product goal remains active and incomplete.

## Exact changed files versus saved T1177

```text
TASKS.md
backend/evals/home_voice_provider_fixture.mjs
backend/evals/run_home_voice_handoff_ui_smoke.mjs
backend/lib/clementine/intents.js
backend/lib/clementine/page_cancel.js
backend/lib/screenplay_turn_target.js
backend/lib/screenplay_write_instruction.js
backend/lib/talk_handler.js
backend/lib/talk_pipeline.js
backend/lib/user_auth.js
backend/tests/clementine_intents_story.test.mjs
backend/tests/clementine_page_abort_midflight.test.mjs
backend/tests/clementine_page_cancel_e2e.test.mjs
backend/tests/clementine_wallet.test.mjs
backend/tests/page_cancel_owner.test.mjs
backend/tests/raw_voice_page_lane.integration.test.mjs
backend/tests/screenplay_turn_target.test.mjs
backend/tests/talk_turn_owner_isolation.test.mjs
backend/tests/talk_wallet_auth.integration.test.mjs
them/ConfirmedStudioTurnPreparation.swift
them/RootExperienceView.swift
them/ScreenplayLiveDraftBridge.swift
them/ScreenplayStudioScreen.swift
themTests/ScreenplayPreviewCancellationTests.swift
docs/wallet-page-home-stop-2026-10-27.md
```

AGENTS.md and DECISIONS.md are unchanged. Orb/Clementine and the established
visual direction are preserved. These fixes do not establish launch readiness.

