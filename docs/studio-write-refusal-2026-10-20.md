# T-1094 — Refused Studio writes stay off the page

Branch `codex/T-1094-studio-write-refusal`, parent `20cb2499`.
Runtime commit `6ccee798572fa4cea3a1f6096bf419a0a4640d3a`.

Target: current writing refusals outrank Page selection, old hints and confirmed
context; do not insert/replace pages or bill a Page turn; retain separately
affirmative commands and the writer's original message.

## Root cause and connected fix

VERIFIED before correction, actual task/lane functions selected rewrite_scene /
page_rewrite for `Do not rewrite this scene. Just discuss it.` With forced Page
hints, even a discussion request selected Page. A mixed refusal/continuation
could select the operation the writer had refused. Home's earlier verb filter
did not protect active Studio or the backend reservation/generation path.

- Pure server permission owner `screenplay_write_instruction.js` and its Swift
  DraftStudio-package mirror share 18 behavioral fixtures. Balanced quotes and
  pasted Fountain scene bodies are data, not permission/refusal. Clear separate
  affirmative clauses can still authorize a write. Routing text is not sent
  instead of the original words, stored as history, or used as screenplay text.
- Existing client Page router rejects refusal before a manual Page target.
  Root's force/explicit cues, remembered approval, render expansion and final
  insertion respect that policy. Intent preparation preserves the original
  refused/mixed ask instead of wrapping it in a contradictory rewrite command.
  Extracted the duplicated direct-line cue family into the existing classifier;
  no new framework, view state, HTTP stack or draft writer.
- Server task, target and cost lane respect current words before forced hints.
  Additive story_discussion contracts survive prompt trimming without a
  Fountain-pages-first instruction. Authenticated story discussion can still use
  the existing project-memory policy, not a new unscoped memory read.
- Removed the raw Page-hint reservation bypass after classification. Actual
  post-ASR refusal revokes the provisional Page hold through its existing cancel
  owner, releases proposed accounting, detaches the Page AbortSignal/commit
  hook, and allows a nonwriting reply. It also clears a pre-ASR silence template
  and its response headers, so unhinted real audio isn't swallowed by Reflex.
  Current words are retained; no model call is replaced by a fabricated reply.

VERIFIED after correction: refused rewrite -> story_discussion / advise;
`Do not rewrite the scene; continue from here instead.` -> continue_script /
page_continue even with a stale forced rewrite hint. Separate-command routing
is unit-proven, not a claim of a full mixed-command physical-phone workflow.

## Proof, failures and scope

Permanent artifacts:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-1094-20261020.4cDUgQ/`.
Contains source archive, implementation patch, exact runtime-changed-files.txt,
Node logs, signed native bundle, failed and corrected UI bundles/screenshots,
macOS log, native/UI summaries and D009 JSON. No private environment files.

- Final pinned Node20.20.2, external network disabled: **61 pass / 0 fail /
  0 skip**. Refusal, existing dialogue notes/target/cancel/wallet, real failed-
  generation billing and handler-closure regressions. The new authenticated
  HTTP test exercises current client words, actual ASR with stale Page context,
  and unhinted ASR. Three generations receive original words + discussion
  contract; two use synthetic ASR. Saved project/versions and Page balance
  remain exactly equal. No stale Page-reservation or Reflex header remains.
  Final `them-1094-node20-proven.log`; earlier42/0/0 and61/0/0 retained separately.
- Signed focused Swift **15/0/0**, erased task-owned Pro
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, iOS26.2/23C54. Same 18 fixtures run
  in Swift; manual Page/forced signals, intent preparation, positive command
  and existing intent tests. `native/v1-ui-smoke-local-1-7504.xcresult`.
  No Swift runtime changes after this proof.
- Actual saved-project composer UI **1/0/0**, same erased owned Pro, signing on,
  authenticated local backend with external provider fetches blocked. Restore
  exact draft, keep Page selected, type/send the refusal, require model-output
  marker in the pin, require exact editor text and unchanged saved versions.
  Provider deliberately returns Fountain-shaped text, not an ideal response;
  it must not become page copy. Synthetic chat1/STT0/TTS0 are transport counts,
  not live-model or microphone proof. `ui-fixed/refusal-ui.xcresult`.
  Screenshot inspected: Page is selected while response route says Voice Pin;
  saved/editor assertions verify the underlying text, not the screenshot alone.
- The first UI **0/1/0**, chat0, is retained in `ui-red/`. New test mistakenly
  used `live`, which this typed-UI automation maps to a local stub. Corrected
  fixture to its supported `live-backend` mode; same assertion/timeouts passed
  through real HTTP. No product assertion was weakened. Initial host focused
  fixture failures also exposed missing act-aware project context, an empty
  pre-ASR fixture and a zero-token hold assumption; corrected those fixtures,
  not the established context/billing rules.
- macOS scaffold **BUILD SUCCEEDED** (`macos/scaffold.log`). Build-only signing
  behavior unchanged. Existing Swift actor/Sendable warnings remain. The red UI
  result also records an invalid-frame warning; this task does not diagnose it.
- D009 vs main `78b8c94f`: index33,557(-69), Studio17,421(-14), Root14,992(-120),
  bridge12,934(-18), memory10,865(0). Root shrank8 lines vs task parent; other
  monitored god files unchanged. Syntax and staged/working diff checks pass.

The final backend-only header cleanup followed the UI/native/macOS runs; it
does not alter their tested native or Studio-render paths. Its actual /talk
header/accounting behavior is covered by the final61/0/0 Node run.

## Adversarial pass and limits

- Answered for covered English forms: current refusal wins over Page selection,
  stale expansion and forced lane; no saved-page mutation or Page debit in real
  authenticated HTTP; a synthetic screenplay-shaped answer cannot bypass the
  native refusal guard. Existing cancel/error billing checks stay green.
- Answered for bounded content fixtures: quoted dialogue, pasted Fountain and
  `don't stop writing` do not become writer refusals. Original words remain
  available to generation. Later manual pin-to-page actions with no refused
  request are not prohibited based on an old remembered transcript.
- Partial: this is explicit English clause/lexical protection, not general
  language understanding. Ambiguous sentence structure, unbalanced quotes,
  multilingual negatives and quoted/unquoted fictional verbs outside the
  covered notes path need additional actual repros before broader claims.
- Not covered here: physical microphone/phone, real model reply quality or
  spend, production backend, mixed-command UI rewrite, cross-device/offline
  integration, full app/store readiness. No paid calls, unchanged full backend
  or full themTests rerun; broader gates remain required at protected landings.

## GitHub and next boundary

Save target is the existing integration-backup branch via a normal preserving
fast-forward, not a replacement PR, original-head rewrite or main merge.
Fresh remote read: main `78b8c94f`, backup parent `20cb2499` before this save.
Original #964 remains OPEN, non-draft, exact `5faa43d6`, all three hosted required
checks SUCCESS but REVIEW_REQUIRED / BLOCKED. No approval impersonation or
protection bypass. Those checks do not prove this backup's new runtime.

Next implementation boundary: original #642 Pages work, reconciled with this
writer foundation after reading its actual head/body/follow-ups. Protected
original landing, integrated-main proof and observed physical-iPhone journey
remain unfinished. Production stays held pending the human's credentials
decision; no deployment, secret change, paid call or fresh-phone install here.
Orb, Clementine and the established aesthetic are unchanged.
