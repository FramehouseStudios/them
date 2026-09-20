# Empty-generation billing — work in progress, 2026-09-19

Branch: `codex/T-empty-generation-billing`, based on main `647e01fc`.
No merge, deployment, or physical-device verification is authorized by this proof.

## Implemented

- Non-stream generation validates HTTP status, JSON, and non-empty content before wallet commit.
- An empty short-film quality-gate reply no longer replaces the original non-empty generation.
- Short-film generation rejects empty drafts before wallet commit and project mutation.
- The real OpenAI supplier returns normalized JSON in `rawText`, not screenplay text.
  The short-film lane now extracts message content and rejects failed HTTP responses,
  instead of treating the response envelope as billable draft text.
- Regression tests exercise real generation, quality enforcement, short-film lane,
  and supplier code. Provider transport is mocked; no live request is needed.
- Follow-up real HTTP test reproduced a retained wallet hold: a 100-turn balance
  became 99 after empty generation returned recovery audio. The Page adapter now
  records proposed usage and settles only after the response finishes successfully;
  recovery, disconnect, and thrown-handler paths release the hold. Settlement is
  idempotent across finish/close events.

## Verification

- Focused generation/supplier/lane suites: 23 passed, zero failed.
- Full backend, Node 24.19.0, spawned isolated test servers:
  2,751 passed, zero failed, two skipped (2,753 tests).
  Log: `/tmp/them-empty-billing-backend-supplier.log`.
  This predates the response-settlement follow-up. The latest full run is RED:
  2,756 passed, one failed, two skipped (2,759 tests), log
  `/tmp/them-empty-billing-handler-final.log`. The failed oversized-import test
  received `UND_ERR_SOCKET` instead of its expected structured 413. Its isolated
  suite then passed 22/22; this does not make the full run green.
- Follow-up handler/settlement tests: six passed. An earlier full run exposed
  lifecycle listeners attached to a non-wallet request; listeners were narrowed
  to actual wallet reservations, and the ten reflex tests pass.
- Signed iOS unit suite: 618 passed, zero failed, on freshly created/erased
  simulator `65A0A68B-4910-4B4A-A4E1-80469E8468D2`.
  Log: `/tmp/them-empty-billing-ios.log`.
  No Swift changes followed that run; supplier parsing and backend tests did.
- `git diff --check` and `node scripts/check_god_files.mjs`: passed.
- Full live quality gate: NOT RUN for this branch. Approval system rejected
  evaluation-payload transmission to OpenAI; explicit user approval requested.
  Authentication itself was independently verified HTTP 200, without logging the key.

## Still required before readiness

- Real full `/talk` regressions now prove empty output and quality-rejected prose
  leave session history and wallet balance unchanged. They execute the production
  HTTP route, handler, supplier, and quality code with transport-only stubs; a
  marker asserts that generation was reached. Four adapter tests cover success,
  recovery, disconnect, and exceptions, including repeated lifecycle events.
- Existing saved-project content and client-side save acknowledgement still need
  end-to-end proof. Response completion is not proof of a durable phone save.
- Process-crash recovery of reserved wallet funds is not covered by these tests;
  response lifecycle settlement only covers a running server process.
- Complete the live quality gate after external-data approval, then publish a
  scoped draft PR with exact results for human/Claude review. Do not merge.
- Resolve the intermittent oversized-import connection reset and obtain a full
  backend proof for the final revision; keep this separate from billing logic.
- Phone speech → reply → saved screenplay remains unverified by these tests.
