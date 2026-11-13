# Echo-guard port — 2026-09-19

Base main: `647e01fc`. Independent branch: `codex/T-echo-loop-guard-port`.
Ported #467 commits `0c31766` and `aa3ce0c` with attribution. Its branch tip
also contains unrelated persona, pagination and server work, intentionally excluded.
Preserved main imports when resolving the import-only cherry-pick conflict.

Simulator barge-in defaults off; physical-device default and explicit overrides remain.
Repeated low-confidence clarification speech is capped; usable speech resets the streak.
Review corrections preserve single-word/non-Latin speech and reject null/empty scores as measurements.

- Signed full iOS unit suite: **622 passed, zero failures**; Xcode 26.3/iOS 26.2.
- Dedicated simulator `C8359FFC-760A-4B49-B134-280FAD630AEB`, explicitly erased before running `bash scripts/run_ios_unit_tests.sh` with that destination.
- Full backend: **2,746 passed, zero failed, two skipped**; `TEST_SPAWN_BACKEND=1 node --test --test-concurrency=1 --test-timeout=60000 tests/*.test.mjs`.
- Focused confidence/streak tests: **7 passed**. God-file gate, syntax and diff checks passed.
- Authenticated default quality gate: **exit 1**, `knowledge_empathy_depth` **0.656 < 0.710**, 24 regression cases. No thresholds changed; later stages did not run.
- Logs: `/tmp/them-echo-ios.log`, `/tmp/them-echo-backend.log`, `/tmp/them-echo-quality.log`.
- Xcode result: `/Users/halfmutantfilms/Library/Developer/Xcode/DerivedData/them-hhvaeagoljxhvybtfvczcywvtzoe/Logs/Test/Test-them-2026.09.19_18-16-10--0700.xcresult`.

Live microphone/playback behavior is not re-proved by these unit results.
Keep draft pending full gate and Claude re-proof; a human merges. No deployment.
