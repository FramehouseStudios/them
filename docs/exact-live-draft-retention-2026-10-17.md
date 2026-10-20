# T-980 — Exact live draft retention

## Contract

Preserve a byte-distinct writer edit in the canonical owner-scoped live-draft
storage even when Swift considers the old and new strings canonically equal.
No normalization, new persistence format, provider change, project rebinding
or separate storage framework. Follow-up is based on existing #961 repair
2fcdc772, not a replacement for that draft or its original history.

## VERIFIED failing-first proof

Added `testCanonicallyEquivalentLiveDraftEditPersistsExactBytes` to the real
bridge recovery tests. Its composed/decomposed screenplay fixtures compare
equal as Swift Strings but have different UTF-8 bytes. Set the authoritative
bridge draft to each in order and read the actual owner-scoped UserDefaults
entry. On unchanged production code, bridge memory had the second form while
storage retained the first. The durable-byte assertion failed: 0 passed,
1 failed, 0 skipped, terminal exit65 on the erased task-owned simulator
11CF5EFB-D8C3-4F19-8062-28AF37F27D93, iOS26.2, signing on.

Evidence: `/tmp/them-980-unicode-before.xcresult` and `.log`.
Only synthetic fixture bytes were inspected; no user screenplay or secrets.

## Root fix

Replace `draftText != oldValue` in the bridge didSet with the existing package
`ScreenplayDraftTextIdentity.matches` check. It already defines byte-exact
writer identity for save/coverage/recovery. Reuse it rather than adding a
second comparison policy. The same canonical persistence function and
account-reconciliation guard remain. Protected bridge line delta0.

## VERIFIED after-fix proof

Focused regression1 passed/0 failed/0 skipped, terminal exit0:
`/tmp/them-980-unicode-after.xcresult` and `.log`.

Frozen staged source tree `3293a14bfcf6ed43690e50bcab4917bce9de258f`.
No production/test source changed during or after the following pipeline;
documentation was finalized afterward. All simulator runs use the erased
task-owned device above and normal signing, never CODE_SIGNING_ALLOWED=NO.

- Full signed units857/0/0, `/tmp/them-980-unicode-units.xcresult` and `.log`.
- Sequential page batches/relaunch1/0/0, including both batches exactly once
  in the reachable native editor; `/tmp/them-980-unicode-sequential.xcresult`
  and `.log`.
- Authenticated fixed-provider Home2/0/0; STT1/chat4/TTS24, external provider
  requests blocked; `/tmp/them-980-unicode-home.xcresult` and `.log`.
- Authenticated writer/save/native MD+FDX export/relaunch1/0/0;
  STT0/chat0/TTS0; `/tmp/them-980-unicode-writer.xcresult` and `.log`.
- macOS scaffold compile, terminal pipeline2591 exit0;
  `/tmp/them-980-unicode-macos.log`. Existing concurrency warnings remain;
  this is compile proof, not macOS interaction or warning-free release proof.
- Pinned Node20.20.2 full backend2886 passed/0 failed/2 skipped, terminal
  exit0; `/tmp/them-980-unicode-node20-v2.log`. Source snapshot
  `/tmp/them-980-unicode-node20.gYdT3g`, no local env files, network disabled,
  source/dependencies read-only, disposable backend/data tmpfs. First container
  startup failed exit125 because its data mountpoint was absent; no tests ran.
  Created that empty snapshot directory, then ran the suite. Retain the
  initial `/tmp/them-980-unicode-node20.log`; do not hide it as a test flake.
  Skips are the unconfigured real-Postgres adapter case and opt-in live
  page-write provider case. Neither is counted as production proof.
- God-file gate against origin/codex/T-979-mentor-ending-integration:
  all five watched line deltas0. Working/staged whitespace checks pass.

Private retained evidence:
`/Users/halfmutantfilms/io.them-worktrees/_proof/T-980-exact-retention-20261017.1xlM3a/`.

## Other authoritative state and limits

Previous goal turn was progress: #906 merged by the protected review process,
and #961's two-cause page recovery fix was committed/pushed with local proof.
Current #961 run39077888031 is live on2fcdc772; main run39075059944 is live on
deac1a6d. Do not reuse an old green result or rerun unchanged quiet jobs.

Canonical `node scripts/live_backend_health.mjs --url=https://api.them.io`
failed both health/version checks on2026-10-17: parked-domain redirect.
Human/operator clearance: attach api.them.io to the intended shipping backend,
set the DNS records supplied by that service, verify TLS and direct JSON200
for /healthz and /api/version, then confirm expected revision and durable DB.
Do not silently switch shipping clients to an unverified alternate host.
Chrome deployment settings redirected to Render sign-in. No credentials were
entered and no production setting changed. Human said they need a few minutes
to sign in. Continue local work without repeatedly requesting credentials.

No paid model calls or secret access in this pass. Hosted green, real phone
speech/reply/rewrite/offline/relaunch/external export, authenticated production
restart and generated120-page screenplay/print quality remain unproven.

## Exact change manifest

- `them/ScreenplayLiveDraftBridge.swift`
- `themTests/ScreenplayStudioDraftRecoveryTests.swift`
- `TASKS.md`
- `docs/exact-live-draft-retention-2026-10-17.md`
