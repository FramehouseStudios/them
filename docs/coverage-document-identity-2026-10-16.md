# T-968 — Coverage follows exact screenplay bytes, not title metadata

Parent T-967/#950 `a28c7e15`. Branch `codex/T-968-coverage-document-identity`.

## Root causes and correction

Coverage received the complete Fountain document, unlike the canonical page
counter and FDX encoder. Title/author metadata became screenplay action, and a
title-only document could produce and speak a fabricated story-page read.
Use original #613's `FountainTitlePageCodec` to send only its screenplay body;
use its explicit document title when present. Empty body clears the existing
read and shared summary without a request or speech. Raw writer text is never
rewritten by this read operation.

The delayed-read guard used synthesized Swift String equality. Canonically
equivalent Unicode strings can have different UTF-8 bytes; an edit could be
missed and the old result published/spoken. Reuse the existing canonical
`ScreenplayDraftTextIdentity.matches` in coverage context equality and draft
change invalidation. Auth/project comparison behavior remains unchanged.
No second parser, text-normalization policy or identity owner.

## Evidence

- Before correction, signed focused coverage tests on erased task-owned
  iPhone17Pro/iOS26.2: **15 passed / 3 failed / 0 skipped**.
  `/tmp/them-968-coverage-before.xcresult` and `.log`.
  Real view-model tests reproduce body/title payload mismatch, title-only
  request/publication/speech, and stale publication after Unicode-byte change.
- After correction, full signed `themTests` after another owned-device erase:
  **836 passed / 0 failed / 0 skipped**.
  `/tmp/them-968-coverage-final-units.xcresult` and `.log`.
- D009 vs T-967: all five protected deltas0. Diff check passes.
- Backend tree is byte-identical to T-967, whose Node20 backend proof was
  2835/0/2; it was not rerun or relabeled as a fresh result for this boundary.
  T-967's connected UI and macOS build are parent evidence, not a new UI/macOS
  run here. No view/route/schema/signing/provider/deployment change in this task.
- Private before/after results retained under
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-968-20261016.HBICsI/`.

## Not covered

No real microphone/model quality, audible playback, shipping server, physical
phone, full-length generation, external export opening or 120-page PDF parity
claim. No paid call. Completed same-project reads still need a freshness label;
heuristic grades need explicit estimate wording before promotion. Preserve
original #646 refresh/#774 quiet announcements and #648 prompt protection.
Direct non-iOS coverage callers still own their submitted-body contract; this
fix does not invent a separate backend Fountain parser or claim all clients
exclude metadata. The tested path is the iPhone Studio request owner.

## Newly verified main-landing hold

#906 exact44518082 run38998648618 completed with an overall SUCCESS badge but
raw logs contain two hidden exit65 failures: V1 UI37 total/9 skipped/1 failure
at Reuse callback, and the voice network-fault command TEST FAILED. Backend
2739/0/2, units624/0 and required writer passed. No failure artifacts retained.
Returned original #906 to draft without changing its head; genuine human
approval remains recorded, but it cannot substitute for green execution.
Evidence comment:
https://github.com/FramehouseStudios/them/pull/906#issuecomment-6229435331

Next priority: preserve the existing original #904 CI-only prefix through
e842e3d0 (current ancestry e16caf12 ->61ccc7e8 ->608b22be ->83c759c0 ->e842e3d0)
on the original #906, not a replacement PR. This prefix already includes its
required/signed/diagnosable gates and fully-visible single-tap callback fix;
later #904 recovery and inspector repairs remain queued in their original
branch. Re-prove before pushing; any changed head requires fresh human review.
No main merge, protection bypass, unchanged retry or history rewrite.

## Exact files

`TASKS.md`, this document, `them/ScreenplayCoverage.swift`,
`them/ScreenplayStudioViewModel.swift`, `themTests/ScreenplayCoverageTests.swift`.
