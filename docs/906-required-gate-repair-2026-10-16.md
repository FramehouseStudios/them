# T-969 — Truthful required checks on original #906

Parent: approved #906 head `44518082e2b387a90fbd7817506f382f3b2d5a3c`.
Local task branch: `codex/T-969-truthful-906-gate`.
Landing remains the original `codex/T-live-sync-recovery-conflict` / #906;
no replacement PR, force push, squash or main merge.

## Verified failure and preserved repair

Exact-head run38998648618 reported overall success, but its raw log contains
V1 UI37 total/9 skipped/1 failure (Reuse callback did not reach the current
handler), plus voice-fault TEST FAILED/exit65. Both were hidden by
continue-on-error. No failure artifact was retained. Backend2739/0/2,
units624/0 and required writer passed. Returned #906 to draft; approval cannot
substitute for execution. The genuine old-head approval remains history.

Current main4d788975 run38998537356 also has a hidden voice exit65 despite
overall success. Its V1 run has37 total/9 skips/0 failures; not37 passes.
Neither green badge is release proof. Both raw logs retained privately.

Preserving merge `f4f64735b7a31c46c6e066a221e925bc732907fc` adds the existing
#904 CI-only prefix through `e842e3d0b0319298b9ffef6b2ad5bbd57e6c452a`:
e16caf12 ->61ccc7e8 ->608b22be ->83c759c0 ->e842e3d0. Required UI/voice gates,
signed iPhone tests, verbose diagnostics/result bundles, fully visible one-tap
Reuse/To Page and the measured bounded CI timeout are preserved, not recreated.
Later #904 recovery and inspector commits remain queued on its untouched
original head `a27c75a85309e8557163b009baf6e1573d403a0d`.

## Additional self-check: one clean-simulator owner

The preserved older voice entrypoint still called Xcode directly, skipping
simulator erasure. A new runner contract failed0/1 before correction (no erase
call). Route voice proof through the canonical `run_v1_ui_smoke.sh` instead.
That owner now matches current rehearsal byte-for-byte, including the existing
explicit-owned-local-simulator guard, injected simulator discovery and fail-
closed boot behavior. No duplicate reset/signing/result-path implementation.
macOS remains compile-only; no unsigned iPhone test and no macOS UI claim.

## Local proof

- Preserved-prefix full signed units624/0/0 plus the two hosted-failing UI
  cases2/0/0 in one fresh erased task-owned iPhone17Pro/iOS26.2 run:
  total626/0/0. `/tmp/them-969-906-signed-proof.xcresult` and `.log`.
- After canonical voice delegation, actual entrypoint: signed fault UI1/0/0,
  explicit erase/boot recorded, then macOS scaffold build exit0.
  `/tmp/them-969-final-voice/voice-network-fault-local-1-2633-ios.xcresult`,
  `/tmp/them-969-final-voice.log`. Not audible/live-provider proof.
- Separate macOS scaffold compilation exit0:
  `/tmp/them-969-906-macos.log`. Existing Swift concurrency/deprecation warnings
  remain; no release-signing or macOS interaction proof.
- Final exact staged runner tree under Node20.20.2, network disabled:
  11 passed/0 failed/0 skipped. `/tmp/them-969-final-node20-runner-contracts.log`.
  Earlier6/0 baseline contracts and failing voice-delegation contract retained.
- `bash -n`, D009 and diff pass. All five protected deltas0 vs main.
- Production `them/` and `backend/` trees are unchanged from44518082. The exact
  backend source passed2739/0/2 in that hosted run; no fresh local full backend
  rerun is claimed. Fresh whole-head hosted proof remains REQUIRED.
- Private evidence:
  `/Users/halfmutantfilms/io.them-worktrees/_proof/T-969-20261016.sMSK0b/`.

## GitHub protection correction, human-authorized

Verified before mutation: main required only God-file gate (D009); no additional
ruleset supplied Backend tests or Quality Gate. Human explicitly approved all
three required checks. Added the two GitHub Actions contexts with app15368,
preserving every existing context, strict up-to-date checking, one independent
approval, stale-review dismissal and administrator enforcement. Read back and
verified all settings. No approval impersonation or protection bypass.

This alone does not cure soft failures inside older workflow code; the required
step correction above must land and pass. Changing #906's head requires fresh
non-author approval. Keep draft and held until exact-head hosted evidence is
truly green, not merely an overall badge. No paid calls or manual deployment.

## Exact files in this repair boundary

`.github/workflows/quality-gate.yml`, `scripts/run_v1_ui_smoke.sh`,
`scripts/run_v1_ui_smoke.test.mjs`, `scripts/run_voice_network_fault_smokes.sh`,
`scripts/run_voice_network_fault_smokes.test.mjs`, `themUITests/V1SmokeUITests.swift`,
`TASKS.md`, this document. Original #906 production recovery changes are retained
without modification; their earlier scope/proofs remain in the PR history.

## Remaining goal boundaries

Repaired local tests do not clear iOS26.5 hosted behavior, the9 fixture skips,
shipping DNS/revision/storage, physical-phone speech/writes/offline restore,
external file opening or full120-page model quality and PDF parity. Preserve
orb/Clementine and continue #907/#888/#904 and the original product base chain
only after fixing the first actual red result. Main is not release-validated.
