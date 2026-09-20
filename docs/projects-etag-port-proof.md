# Project-list ETag port checkpoint — 2026-09-19

Base: main `647e01fc`. Branch: `codex/T-projects-etag-port`.
Original tip `0555dfa8` (#482) cherry-picked with attribution as `50eb1e7`.
Independent of #620 and #621. No merge or deployment performed.

## Port and review corrections

- Conditional project-list reads reuse the payload on 304; limit, draft and
  version query variants have separate caches.
- Keep the verbatim BackendTaskModels.swift move from the original port.
- Export the existing pure ETag matcher from read_state.js and import it in
  the route, avoiding growth in backend/index.js. Route tests use this real
  matcher instead of a substituted implementation.
- Cache the processed response sync state, not the preceding sync state.
- Partition caches by user/session epoch. Reject in-flight responses after
  identity changes or cache invalidation, so they cannot refill a reset cache.

## Completed verification

- Full signed iOS unit bundle: **620 passed, zero failures**. Dedicated iPhone
  17 Pro simulator `EEAED52A-6D6A-4016-95B1-4BD04F4F5402` created and explicitly
  erased before the run; iOS 26.2, Xcode 26.3. New tests verify 304 reuse,
  query variants, reset, and in-flight invalidation.
- Focused backend route/read-state tests: **75 passed, zero failures**.
- God-file gate: passed; backend/index.js unchanged, BackendMemoryAPI.swift
  reduced by 27 lines. `git diff origin/main --check`: passed.
- Initial default quality gate: exit 2, missing `OPENAI_API_KEY`, after canon
  and page-craft (14 fixtures, zero gate failures).
- The local credential blocker was resolved using the existing preflight
  worktree credential, verified against OpenAI with HTTP 200. A local-only
  runner supplies it in process memory, without copying or displaying it.
  GitHub already has an `OPENAI_API_KEY` secret; Render was not changed.
- Authenticated default quality gate: **exit 1** at regression evaluation:
  `knowledge_betrayal_recovery` scored **0.641**, below **0.720**. Thresholds
  and case selection were unchanged. Later gate stages did not run.

## Full backend results and remaining verification

The original full backend run exited 1 after a 300-second local HTTP headers
timeout in `screenplay_question_routes.test.mjs`, test "promotes an explicit
answer before clearing it". The worker exited before the attempted stop;
no process was killed. Result: **2,739 passed, one failed, two skipped**.
That file independently passed all 12 tests on both
Node 24 and Node 26. This does not establish the root cause of the timeout.
A full rerun with the same test glob, spawn setting and serial concurrency,
plus a 60-second per-test timeout, completed successfully: **2,740 passed,
zero failed, two skipped** (2,742 total). Command:
`TEST_SPAWN_BACKEND=1 node --test --test-concurrency=1 --test-timeout=60000 tests/*.test.mjs`.
This pass does not erase the earlier transient timeout.

Logs: `/tmp/them-projects-etag-ios.log`,
`/tmp/them-projects-etag-focused.log`, `/tmp/them-projects-etag-backend.log`,
`/tmp/them-projects-etag-quality.log`,
`/tmp/them-projects-etag-quality-authenticated.log`,
`/tmp/them-projects-etag-backend-bounded.log`.
Xcode result:
`/Users/halfmutantfilms/Library/Developer/Xcode/DerivedData/them-ashjzqupvmbvoihlhevovgvxdvxi/Logs/Test/Test-them-2026.09.19_18-06-56--0700.xcresult`.

Keep the PR draft: complete quality-gate proof and Claude re-proof remain
required before a human merge. Physical-phone polling and deployment remain
unverified. The regression quality failure is not attributed to this port
without a controlled baseline comparison.
