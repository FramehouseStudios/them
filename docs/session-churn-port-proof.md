# Session-churn port proof

Base: `647e01fcf17730d301aaa8a5072255ca7494c53c` (main).
Port: `93c877e`, cherry-picked with attribution from
`4275c33a26a81b6a53fa4bf9fd1cd88e8172a52b` (`claude/session-churn-fix`, #481).
No dependency on the other closed branches or #620.

## Behavior

- An unchanged outbox snapshot no longer publishes another update.
- Outbox-driven pending-question refresh uses the cached session; explicit
  event-driven callers retain forced refresh.
- The regression exercises repeated idle drains followed by a real enqueue,
  verifying that idle notifications stop and real changes still notify.

## Verification

Recorded 2026-09-18; artifacts checked again 2026-09-19.

- Signed full `themTests`: **619 passed, zero failures**. Xcode 26.3,
  iOS 26.2, dedicated iPhone 17 Pro simulator
  `B2BDD10A-161D-45F3-B9C4-6CE54F137CD5`, explicitly erased immediately before
  `IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,id=B2BDD10A-161D-45F3-B9C4-6CE54F137CD5' bash scripts/run_ios_unit_tests.sh`.
  Signing was not disabled. Includes the new idle-drain regression.
- Full `cd backend && npm test`: **2,739 passed, zero failed, two skipped**
  (2,741 total).
- `node scripts/check_god_files.mjs`: passed; all five tracked files have
  zero line-count growth.
- `git diff origin/main --check`: passed.
- Default `RUN_QUALITY_GATE=1 bash scripts/quality_gate.sh`: **blocked**, exit 2
  at missing `OPENAI_API_KEY`, after canon and page-craft stages. Page-craft
  checked 14 fixtures with zero gate failures. No checks were disabled.
  An earlier sandboxed attempt failed to bind a local test server; the
  authorized rerun reached the credential check.

Logs: `/tmp/them-session-churn-ios.log`,
`/tmp/them-session-churn-backend.log`,
`/tmp/them-session-churn-quality-retry.log`.
Xcode bundle:
`/Users/halfmutantfilms/Library/Developer/Xcode/DerivedData/them-ctoqdxembmwhqrbuoagkmpgjzibo/Logs/Test/Test-them-2026.09.18_12-18-13--0700.xcresult`.

The original branch reports a live reduction in periodic session creation;
this port has not independently re-proved that with a signed-in live backend.
Do not treat clean-state unit proof as persisted-state startup recovery proof.
Keep the PR draft pending complete gate results and Claude re-proof. A human
merges; no deployment or physical-phone installation is part of this port.
