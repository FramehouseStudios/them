# T-970 — Required-proof repair integrated without losing recovery gates

## Scope and decision

DECIDED: preserve-merge original #906 head
`b2994b001ae815d6ab6353c5ac0c59cb31324492` above T-968
`619f9887a7e97c1ae1681c4140001abb26cea84f`. Preserve both histories; do not
rewrite original heads, replace original PRs, or merge to main.

VERIFIED: rehearsal already has the canonical clean-simulator runner and a
stronger workflow contract requiring the offline-save recovery step. Retain
that assertion, not the narrower incoming two-step assertion. Incoming voice
delegation passes the explicit Xcode executable and unique bundle path to the
canonical runner. No independent reset/signing implementation is added.

The automatic test-file merge duplicated the fake simulator declaration;
resolved before verification. Added direct boot, iOS-test and macOS-build
failure cases: exact nonzero exit propagates, later stages do not run, and no
success banner appears. Temporary fixture files are cleaned up after tests.

## Exact files changed relative to T-968

- `TASKS.md`
- `docs/906-required-gate-repair-2026-10-16.md` (preserved incoming evidence)
- `docs/required-proof-integration-2026-10-16.md`
- `scripts/run_voice_network_fault_smokes.sh`
- `scripts/run_voice_network_fault_smokes.test.mjs`

The conflicted `scripts/run_v1_ui_smoke.test.mjs` resolves byte-identically to
T-968. Backend, app, unit/UI test source, workflow and canonical iPhone runner
are unchanged from T-968. No orb, Clementine or aesthetic change.

## Proof

VERIFIED: staged source tree `7760c587adf1ef930d68397907995e66d0678f4c`
archived using git (no secret/untracked files) into
`/tmp/them-970-node20.XZXd3a`; Docker image `them-proof-node20-943`,
Node20.20.2, `--network none`: runner contracts **14 pass / 0 fail / 0 skip**.
Same contracts pass on the host. Log `/tmp/them-970-node20-contracts.log`.

VERIFIED: actual `scripts/run_voice_network_fault_smokes.sh` used explicit
task-owned simulator `11CF5EFB-D8C3-4F19-8062-28AF37F27D93`, erase/boot
recorded, normal signing retained. Signed iPhone17Pro/iOS26.2 voice-fault UI:
**1 pass / 0 fail / 0 skip**. Authoritative bundle:
`/tmp/them-970-voice-proof/voice-network-fault-local-1-4563-ios.xcresult`.
Combined log `/tmp/them-970-voice-proof.log`. The same entrypoint completed
the macOS scaffold build with **BUILD SUCCEEDED**, process **exit0**. This is
compilation, not macOS UI proof; existing compiler warnings remain.

Private retained logs and bundle:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-970-20261016.YMid4m/`.

VERIFIED: D009 versus `origin/codex/T-968-coverage-document-identity`: all five
watched file deltas **0**. Shell syntax and staged/working diff checks pass.
Full backend/unit/writer suites are not rerun for this runner-only boundary;
T-967/T-968 manifests are prior-head/source-identical evidence, not fresh runs.

## Promotion and remaining proof

As observed on this pass, #906 run39002286236 has backend and D009 success;
Quality Gate is still running. Do not retry it unchanged or infer success.
Main remains `4d788975860a8704798c07fc3b1f9bec18eb3b30`.
Fresh non-author approval and all required checks remain necessary for #906.

The fault scenario is deterministic, not a paid model conversation, shipping
backend check or physical-phone speech/write/rewrite/offline/relaunch/export
proof. Full-length screenplay quality and 120-page print parity remain open.
Next original product boundary is #645 mentor structure map, then #646 by base;
its historical 40/40 live score must remain separate from current offline proof.
