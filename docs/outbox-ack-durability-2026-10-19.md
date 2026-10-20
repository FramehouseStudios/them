# T-1017 — Durable queued-send boundaries

## Root and correction

VERIFIED by source inspection: drainDue ignored pre-send and post-result
manifest errors. Successful response handling deleted the payload before the
queue removal was persisted. A failed write could leave a manifest referring
to missing bytes. No pre-fix executable failure run is claimed.

Persist inflight state before transport; if that write fails, restore the
pending entry and return/publish the storage error without sending. On success,
remove the entry from memory, persist the queue, then remove its payload. If
the post-result manifest write fails, restore only the affected entry rather
than overwriting work enqueued during the transport await. Retain that entry
parked because the service may already have processed it.

On relaunch, an interrupted inflight record is parked for explicit review,
not automatically replayed. Keep the original bytes, owner and request key.
The existing Data Controls retained-turn action remains the recovery path.
Requests whose pre-send write failed remain pending and can resume once the
storage issue is resolved. No new framework or storage schema.

## Evidence

Intermediate signed run:18 passed/0 failed/0 skipped at
/tmp/them-1017-ack-durability/v1-ui-smoke-local-1-58747.xcresult.
It proved persistence ordering but still automatically replayed an ambiguous
inflight record after relaunch. Source review of the server then justified
tightening that behavior; do not use the intermediate pass as the final proof.

VERIFIED final signed run:18 passed/0 failed/0 skipped, exit0, erased task-owned
Pro11CF5EFB, iOS26.2, code signing on. Actual summary read at
/tmp/them-1017-ack-final/v1-ui-smoke-local-1-59366.xcresult.

The new test exercises two actual filesystem failure points by replacing the
synthetic manifest with a directory: before sending (zero transport calls) and
after a200 response (one call). Both retain exact UTF8/CRLF bytes and key.
After fixture repair, actor relaunch sends the never-sent request normally,
but makes zero automatic calls for the ambiguous inflight record. Its explicit
retry then sends the original body/key and durable success removes both record
and blob. All17 outbox checks and the existing real-HTTP provider401/quota429
retention case passed. No paid model call was made.

D009 initially failed closed because the requested tracking ref was absent.
Fetching it verified bcac817dc2cff160150b919e4346bd24b608783d; all five actual
god-file deltas are0. Whitespace check passes. The missing baseline was not
bypassed. Backend is unchanged: no new backend/full-unit/UI/macOS proof claimed.

Private evidence directory:
/Users/halfmutantfilms/io.them-worktrees/_proof/T-1017-20261019.YIBbx6/.

## Limits and next boundary

This is not a transactional filesystem or physical-device file-protection
proof. Cleanup failure, process kill
at every machine instruction and reentrant enqueue during a failed ack write
are not newly fault-injected. Payload cleanup is best-effort after manifest
commit; orphan bytes are preferable to deleting the only recovery copy.

Implementation follow-up after the human requested fewer test cycles: use the
existing outline-outbox pattern for iOS writes, Data.write with atomic and
completeFileProtection together. Remove the separate post-write setAttributes
call: its failure could previously report a failed commit after the manifest
was already replaced. macOS retains atomic writes. This closes that separate
post-write error point by construction, not by a new fault-injection claim.
The prior18-case result applies to4dc6576a; this follow-up receives signed
compile/diff/god-file verification only, with no new test suite or paid call.
Build log: /tmp/them-1017-atomic-protection-build.log.
VERIFIED follow-up signed iOS simulator build completed exit0, BUILD SUCCEEDED;
D009 all five deltas0 and whitespace pass. No new tests were launched.

Server source: index.js defaults TALK_IDEMPOTENCY_TTL_MS to five minutes;
resolveTalkSessionKey uses client token or IP, and lib/talk_state.js combines
that session key with the request key. That is not durable user-owned replay
protection across arbitrary offline duration, token refresh or service restart.
No server-side fix is included here. Manual retry can still repeat previously
processed work after that boundary; investigate durable owned request receipts
before claiming duplicate prevention end to end.

Foreground delivery of replayed reply/audio remains unconnected, as recorded
in T-1016. This work does not prove live speech, useful generated screenplay,
physical-phone restore, export, or the intended shipping backend.

Branch codex/T-1017-outbox-ack-durability preserves T-1016 bcac817d. No original
PR head, main, review protection, deployment or secret is changed. #962 remains
at87a62a6c while its exact hosted39349393133 run finishes; do not advance the
next original boundary before it is green.

## Exact changed files

- them/OfflineTalkOutbox.swift
- themTests/OfflineTalkOutboxTests.swift
- TASKS.md
- docs/outbox-ack-durability-2026-10-19.md
