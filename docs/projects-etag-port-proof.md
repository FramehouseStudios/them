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
- Default quality gate: exit 2, missing `OPENAI_API_KEY`, after canon and
  page-craft (14 fixtures, zero gate failures). Full gate is **not green**.

## Still running / unverified

Full backend suite started under exec session `84269`. Last inspected worker
PID 20655 was alive in `screenplay_question_routes.test.mjs`, with a local
listener and connection, but no final suite result. Do not report the suite
as passed or restart it merely because observation timed out. Re-poll the
session and inspect the log before deciding the next action.

Logs: `/tmp/them-projects-etag-ios.log`,
`/tmp/them-projects-etag-focused.log`, `/tmp/them-projects-etag-backend.log`,
`/tmp/them-projects-etag-quality.log`.
Xcode result:
`/Users/halfmutantfilms/Library/Developer/Xcode/DerivedData/them-ashjzqupvmbvoihlhevovgvxdvxi/Logs/Test/Test-them-2026.09.19_18-06-56--0700.xcresult`.

PR publication awaits the full backend result or a documented terminal
failure. Complete gate proof and Claude re-proof remain required before a
human merge. Physical-phone polling and deployment remain unverified.
