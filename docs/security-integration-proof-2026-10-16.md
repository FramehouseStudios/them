# T-950 — Existing security patch on the writing rehearsal

Goal requirements advanced: 6 (accounts/data safety) and 7 (integration proof).
This is local integration evidence, not production security clearance.

## Inputs and provenance

- Parent #942: `6e7138b1fa950f206eceb59ca17bc9f165d983dc`.
- Original #909: `788e010735bfa3c786c94c9f17b7f2c9742ee702`.
- Preserving `--no-ff` local merge: `a475533289cbc4a41af0d09c4ca257d0e3977a7e`.
- No conflicts. Original branches, main and T-943 rehearsal unchanged.
- #909 already preserves #905's proxy-address regression with provenance.
  No duplicate version bump or replacement PR is being introduced.

## Binary acceptance

1. Install the exact lockfile under Node 20.20.2; assert dependency resolution.
2. Run full backend with external networking disabled and record all skips.
3. Erase the task-owned simulator and run signed Home confirmed-transcript
   and raw-audio journeys against this backend; require exact saved/restored text.
4. All five god files unchanged from #942; `git diff --check` passes.

## Current evidence

- VERIFIED: fresh `npm ci --ignore-scripts` in existing test-only image
  `them-proof-node20-943`, Node20.20.2: 136 packages installed. npm reports
  zero known audit vulnerabilities at install time, not application security.
  Resolves Multer2.4.0, fast-uri3.1.8, proxy-addr2.0.8.
  Log: `/tmp/them-950-install.log`.
- VERIFIED: D009 versus `origin/codex/T-949-confirmed-home-page-routing`:
  index33557, Studio17435, Root15024, bridge12926, MemoryAPI10865; all unchanged.
- VERIFIED: full backend `npm test` under Node20.20.2 in the test-only image
  with `--network none`: **2,789 passed, 0 failed, 2 skipped**, 2,791 tests.
  Skips: real PostgreSQL prefix test (DATABASE_URL absent) and opt-in live
  page response test (RUN_LIVE_PAGE_TESTS=0). Exit0, no retries.
- VERIFIED: normal signed Home UI after shutdown/erase/boot of task-owned
  `11CF5EFB-D8C3-4F19-8062-28AF37F27D93` (iPhone17Pro, iOS26.2/23C54):
  **2 passed, 0 failed, 0 skipped**. Tests:
  `test_confirmed_home_voice_turn_opens_studio_writes_and_restores` and
  `test_home_raw_audio_uses_current_server_transcript_writes_and_restores`.
  Existing runner: `backend/evals/run_home_voice_handoff_ui_smoke.mjs`;
  REQUIRE_USER_AUTH=1; synthetic ASR/generation/audio only. Fixture counters
  across both cases: ASR1, chat4, TTS24. No paid provider traffic or live
  microphone/model-quality claim. Tests read native document and require the
  complete scene saved once and restored on relaunch.
- VERIFIED: `git diff --check` passes. No Swift files changed in this merge.
  Full units/macOS were not rerun here; #942's earlier 657-unit local proof
  is parent evidence, not a new result for this combined tree. Existing
  Swift concurrency warnings remain visible in the signed build log.
- Durable private artifacts (not committed/uploaded):
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-950-20261016.QzRP0Q/`:
  `home-pair.xcresult`, `them-950-home-pair.log`, `them-950-install.log`,
  `them-950-backend-node20.log`. Original `/tmp/them-950-*` results retained.

## Adversarial scope

- Answered for these two workflows: Multer2 request parsing remains compatible
  with the current raw-audio request; authenticated generation, insertion,
  version save and relaunch restoration pass exact-text assertions.
- Answered narrowly: #905's mapped-prefix regression runs in the full suite;
  patched proxy/URI/upload versions resolve from the unchanged merged lock.
- Not covered: concurrent hostile uploads, production ingress, restart-durable
  server storage, two-device recovery, real microphone/providers or all native
  metadata combinations. Retain #883/#926 rather than infer those from two UI cases.

## GitHub snapshot and next action

At this check main remains `647e01fcf17730d301aaa8a5072255ca7494c53c`.
#766 remains REVIEW_REQUIRED, head `f0c565c4`, base main; #770 head `fc252cdf`,
base `codex/T-live-sync-no-base-rebase`. No merge authority was bypassed.
#942 hosted backend/D009, required units and required writer-loop steps have
passed; the overall Quality Gate is still running its soft UI smoke steps.
Do not call the overall run green until its terminal result is inspected.

Next original integration boundary remains #642 `7c40428b`, based on
`claude/filmmaker-dialogue-port`. Its body and both commits were read; no
pagination changes were made during this security proof. Re-prove the actual
combined head before integrating. Main landing still starts #766 then #770.

## Copy-and-paste handoff

T-950 preserved #909 head788e0107 with a no-ff local merge onto #942 head6e7138b1.
Combined code a4755332: Node20 full backend2789/0/2; signed Home transcript/raw
audio UI2/0/0 on an erased task-owned simulator; lockfile install audit0 known
findings; D009/diff pass. Original heads and main unchanged. No replacement
dependency PR, deployment, paid generation, phone proof or full-unit reproof.
Retain #883/#884/#926 distinct hardening and #807 transcribe-first reconciliation.
Evidence is this document and the private durable artifact directory above.

## Scope and retained holds

- No Swift changes, live paid generation, deployment, main merge, independent
  approval or real-phone evidence. Synthetic providers do not prove voice quality.
- #883's native-compatible multipart limits, #884's distinct schema tests and
  #926's aggregate upload-byte limits must retain their original provenance and
  be independently integrated/proven. Dependency versions alone do not bound
  aggregate request memory or solve ingress/concurrency abuse.
- #942 raw Home currently makes two generation requests; reconcile #807's
  canonical transcribe-first path before production promotion and prove billing.
- #766 then #770 remain first main landing order after required independent
  non-author approval and current checks. This local rehearsal bypasses neither.
- Main remains vulnerable until reviewed fixes actually land; do not attribute
  this installed-tree audit to unchanged main or the shipping backend.
