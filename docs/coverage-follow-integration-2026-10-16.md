# T-972 — Automatic reads follow the owned screenplay

## Scope

Preserving merge of original #646
`72f9375e8e980cedbb1d7ed34a8339a155dd6613` above T-971
`923c42facc2fdcce33b58b4098ad14b245470e5d`. Original head and history remain
intact; no squash, replacement original PR or main merge.

The original refresh policy updates the Craft card after debounced editing
changes its printed-page or scene count, not after every word. Streaming and
in-flight reads are excluded. Existing exact-byte response/auth guards stay.

## Integration fixes

VERIFIED original title-only regression: signed baseline **19 pass / 1 fail /
0 skip**, with two failed assertions in that one test. The policy returns a
zero-page shape and marks a read as needed, even though the canonical document
codec knows there are no screenplay pages. The downstream existing body guard
already refuses the HTTP request; this fix avoids scheduling that unnecessary
attempt, not a claimed title-content leak. Log/bundle:
`/tmp/them-972-coverage-before.log`, `/tmp/them-972-coverage-before.xcresult`.

- Use existing `FountainPaginationSource` for body-only shape; title-only
  documents have no shape. No second title parser or pagination policy.
- Capture coverage context before asynchronous pagination/revision work.
  The queued read checks exact bytes, account generation and project again
  at execution; signed-out, projectless, hydrating, streaming and in-flight
  states do not dispatch a background request.
- Keep existing `refreshCoverage` as the only HTTP and response authority.
  Its cancellation and late-response rejection are not bypassed.
- Real-VM tests count automatic requests: one initial read, no additional
  read for a same-shape word/title edit, one for a new scene; stale context
  and signed-out/unowned/streaming cases dispatch none.
- Writer UI now requires an automatic Craft card **before** tapping Read it,
  while retaining the explicit Read it action and real backend comparison.

## Original follow-up retained

Read original #774 `a001ec0476c8ba2fc7e87ade4a2a569c756a1cc1` body and all
five changed files by scope. It owns quiet status announcements, dialogue-free
next moves and readable offline loglines. Keep it in its actual base chain;
do not recreate or close it. At this intermediate boundary, background reads
still append the existing grade status line (no speech). Do **not** call the
whole presentation silent or release-ready before that follow-up is integrated.

## Files

- `them/ScreenplayCoverage.swift`
- `them/ScreenplayStudioViewModel.swift`
- `themTests/ScreenplayCoverageTests.swift`
- `themUITests/V1SmokeUITests.swift`
- `TASKS.md`
- `docs/coverage-follow-integration-2026-10-16.md`

## Verification

VERIFIED: signed focused coverage **23 pass / 0 fail / 0 skip**, process exit0,
on erased owned iPhone17Pro/iOS26.2. After log/bundle:
`/tmp/them-972-coverage-after.log`, `/tmp/them-972-coverage-after.xcresult`.
All14 host runner contracts pass; `/tmp/them-972-runner-contracts.log`.
VERIFIED: strengthened authenticated local writer UI **1 pass / 0 fail /
0 skip**, process exit0; automatic card appears before manual Read it tap,
then real backend grade comparison, native Markdown/FDX handoff, exact saved
version and relaunch restore. Log/bundle `/tmp/them-972-coverage-writer.log`,
`/tmp/them-972-coverage-writer.xcresult`. STT/chat/TTS calls all0; deterministic
local proof is not a live conversation, shipping-backend or phone result.
VERIFIED: macOS scaffold compile **exit0** on final observed run, existing
warnings remain; not macOS UI proof. Original compile handle disappeared
after turn interruption with no recorded exit, so its result was not claimed.
No xcodebuild remained; one fresh compile obtained the terminal result.
Logs `/tmp/them-972-coverage-macos.log` (unproven interrupted observation),
`/tmp/them-972-coverage-macos-final.log` (exit0).
D009 versus T-971: all5 deltas0; working/staged diff checks pass.
Backend source unchanged from T-971: prior-head full Node20 proof2837/0/2,
not a fresh run for this iOS-only boundary. No paid model/provider calls.

Private retained baseline/after/UI bundles and logs:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-972-20261016.ADfEop/`.
Full iOS units are not repeated here; T-971's836/0/0 is prior-head evidence,
not proof of this updated Swift tree. Focused tests cover the changed seam.

Coverage remains a deterministic heuristic, not a professional read or model
quality proof. Same-shape edits intentionally keep the prior completed read;
freshness disclosure remains a product gap. Automatic HTTP failures can be
retried by subsequent edits/Read it; there is no new retry/backoff policy here.

Next original boundary: #647 `848e59d040dc935d082beaeb7dc21c51faee4222`,
base `claude/coverage-follows-draft`. #648 prompt protection remains queued.
Shipping backend, physical-phone speech/write/rewrite/offline/relaunch/export
and full 120-page generation remain unproven. Main unchanged.
