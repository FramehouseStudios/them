# Page cancellation ownership guard

Branch: `codex/T-page-cancel-owner-guard`, based on main `647e01fc`.
No deployment or physical-device validation is claimed.

## Behavior

The production cancellation route previously accepted a reservation ID without
checking its owner, and preferred a body-supplied user ID for session cancellation.
It now requires the canonical `req.authUser.id` populated by authentication
middleware. Foreign and missing reservation IDs return the same 404 envelope.
Session cancellation only touches reservations with that exact authenticated
owner; legacy ownerless reservations are not treated as wildcards.
Successful response fields and owner retry/idempotence remain unchanged.
No god file grows, and no duplicate authentication implementation is introduced.

## Compatibility and rollout

The current Swift cancellation client already attaches its account Authorization
header. Body user IDs remain accepted syntactically but are ignored for authority.
Anonymous/demo and legacy ownerless HTTP cancellation now fail closed: this is an
intentional security restriction, not a transparent compatibility claim. Internal
store callers retain their existing behavior unless strict ownership is requested.
Review this change before deployment; do not restore the vulnerable route as a
rollback. If a guest workflow is required, design a scoped cancellation capability
instead of trusting a user ID supplied by the caller.

## Evidence and adversarial review

- Before the fix, production-route/store regression tests failed three ownership
  assertions; legitimate-owner retry passed. `/tmp/them-page-cancel-ownership-red.log`.
- After the fix, all five ownership tests pass, including a local full-backend
  account signup/Bearer-auth check. `/tmp/them-page-owner-auth-integration.log`.
- Foreign IDs, forged body identities, shared session IDs, ownerless entries and
  anonymous route requests leave unauthorized reservations and wallet release
  records untouched. Valid duplicate cancellation releases only once.
- The route/store tests use trusted identity middleware and a release recorder;
  the separate full-server test proves real authentication wiring, not a live
  provider call. No claim of anonymous production exposure is made: global
  middleware may already reject anonymous traffic.
- Reservation storage remains process-local. Crash durability and cancellation
  racing settlement are not newly solved here. Session-wide cancellation can
  still affect a later turn belonging to the same writer; request-specific
  cancellation remains a separate follow-up.
- No Swift code changes. Signed iOS tests have not been rerun on this branch;
  earlier results from other branches are not attributed to this change.

Final full-backend verification passed: 2,744 passed, zero failures, two skipped
(2,746 total), 46.53 seconds, in `/tmp/them-page-owner-backend-final.log`.
`git diff --check` and the D009 god-file gate also passed. This is deterministic
local proof, not hosted CI or a deployed speech-to-page acceptance test.
