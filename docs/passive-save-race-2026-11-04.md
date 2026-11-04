# Passive save race — 2026-11-04

An authenticated offline save/relaunch fixture saved the exact page once, but then parked a duplicate `studio_autosave` with an unproven predecessor. The parked row's bytes matched the visible recovered page. A focused in-flight manual-save regression reproduced the duplicate: two durable requests were created for the same page.

The dispatch path now coalesces only a passive autosave with a matching active save when its authenticated owner, project, non-nil document/backend origin, base, exact UTF-8 text and associated save metadata match. Explicit-base and conflict requests remain separate. Distinct newer text remains durable in the queue.

- Before fix, focused identical-passive regression failed: two queued requests instead of one; `/private/tmp/them-t1268-before-20261104.log`.
- After fix, signed save ownership, outbox and origin suite: 201 passed, 0 failed; `/private/tmp/them-t1268-focused-20261104.xcresult`.
- Signed original offline save/relaunch/reconnect fixture passed; `/private/tmp/them-t1268-offline-ui-20261104.log`.
- Signed full iPhone unit suite at the runtime fix before adding the test-only negative case: 1,462 passed, 0 failed, 0 skipped; `/private/tmp/them-t1268-full-20261104.xcresult`. The final ownership suite including the negative distinct-words case passed 25/25; `/private/tmp/them-t1268-negative-20261104.xcresult`.
- macOS scaffold unsigned build, D009 and `git diff --check` passed. Backend is unchanged from the parent, whose Node 20 suite passed 3,042, failed 0, skipped 5.

These are local fixture proofs, not production, live-model, physical-iPhone or outside-app export proof. Original PR ordering, required hosted checks and independent review remain necessary.
