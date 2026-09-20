# Request-scoped Page cancellation — in progress

Local branch `codex/T-page-request-cancel` combines #632 and #634. Neither
dependency is merged; this branch must not be presented as an independent port
off main. Draft review only; no deployment or device installation.

Reproduced two production route/store failures before implementation:
`/tmp/them-page-request-order-red.log` (five passed, two failed).
1. A delayed session cancellation aborts the newer turn as well as the old one.
2. Cancellation arriving before reservation does not stop that reservation.

Working backend implementation tags reservations by request ID and records
authenticated owner/session/request cancellation before a reservation exists.
It retains early-stop records for the process lifetime, fails at a bounded
10,000-record global capacity instead of evicting a stop, and releases linked wallet
reservations when a previously stopped request finally reserves.
Focused ownership, cancellation, midflight and wallet tests are green at
`/tmp/them-page-request-focused.log`. Diff and D009 checks pass.

Client wiring now sends the lifecycle UUID on talk and cancellation requests.
Cancellation uses `/talk/page-cancel/request`; unsupported servers fail instead
of receiving a fallback session-wide cancellation. The lifecycle also captures
the original talk session so a token refresh cannot retarget cancellation.
Focused backend checks passed 31 tests with zero failures:
`/tmp/them-page-request-wired-focused.log`.

Initial signed focused iOS run passed 16 tests, zero failures, exit 0
(`/tmp/them-page-request-ios-focused.log`). Full backend at that snapshot passed
2,747 tests, zero failures, two skips (`/tmp/them-page-request-backend-full.log`).
Additional malformed-ID, duplicate-stop, same-ID/different-owner/session,
capacity and production adapter/header tests pass: all 12 ownership tests,
`/tmp/them-page-request-adversarial.log`.
Known reservation IDs use exact-ID cancellation, avoiding early-stop ledger
capacity for requests whose reservation has already arrived.

Not complete or release-ready:
- Full signed iOS suite passed 631 tests, zero failures, exit 0 at
  `/tmp/them-page-request-ios-final.log` (before the queued-stop regression).
  The preliminary shutdown command failed because the owned simulator was already
  shut down; no tests ran in that command. Erase and test were then started.
- Broader backend suite failed: 2,750 passed, one failed, two skipped (2,753
  total), `/tmp/them-page-request-backend-final.log`. The unchanged craft-schema
  report test received 401 instead of 200. Investigating separately; not waived.
- Added a regression for a stop queued immediately before a newer turn. Exact
  targeted stops no longer cancel/suppress each other; only legacy session-wide
  stops retain the stale-generation guard. Full signed rerun passed 632 tests,
  zero failures, exit 0 at `/tmp/them-page-request-ios-queued-stop.log`.
- Isolated craft endpoint suite passed all 30 tests at
  `/tmp/them-page-request-craft-isolated.log`; root cause of the broader failure
  remains unproven. Full backend repeat passed 2,751 tests, zero failures, two
  skips (2,753 total), 54.80 seconds, exit 0:
  `/tmp/them-page-request-backend-repeat.log`. This does not erase the earlier
  intermittent failure or establish its cause.
- Mac Scaffold Release build passed, exit 0 at `/tmp/them-page-request-macos.log`.
- Process-local reservations/stops do not provide cross-worker or restart
  durability. Document or resolve this before production promotion.
- Physical speech → reply → saved screenplay remains unverified.

## Promotion audit

- Answered: forged owner IDs and cross-session request collisions cannot cancel
  another owner's/session's work; duplicate stops release a reservation once;
  early stops reach the real talk adapter's abort signal and proceed gate.
- Answered: old-server 404 does not trigger broad cancellation; original talk
  session is captured before token refresh; queued exact stops survive new turns
  without clearing newer client tracking. Signed tests cover these boundaries.
- Partially addressed: capacity is bounded and exhaustion returns an explicit
  error, but the process-wide ledger is not durable or distributed. A new
  1,000-record per-owner quota prevents a single account exhausting the global
  10,000-record limit; changing sessions does not bypass it, and retries do not
  consume quota. Owner exhaustion returns 429; global exhaustion returns 503.
  Exact-reservation cancellation remains available. All 13 focused ownership
  tests pass (`/tmp/them-page-request-quota-focused.log`); full backend rerun
  passed 2,752 tests, zero failures, two skips (2,754 total), 47.15 seconds,
  exit 0 at `/tmp/them-page-request-quota-full.log`. This is defensive capacity
  isolation, not a production retention policy: a long-lived legitimate writer
  can still reach their limit. Promotion needs safe lifetime/retention semantics
  and shared coordination, not silent eviction or routine restart as a solution.
- Not covered: real provider abort completion, wallet recovery after process
  death, cross-worker routing, and the physical-phone acceptance flow.
- Main remains `647e01fc`; #620 remains blocked with failed required hosted
  checks on the latest read. No merge, deploy, or bypass is authorized by green
  local tests alone.

## Retention investigation

The checked-in Render blueprint specifies one backend instance, but this is not
proof of live topology or protection against deployment overlap. The physical
iPhone was observed available/paired; that is not proof of an installed revision
or a working speech flow.

Do not reuse the existing talk-idempotency cache unchanged for cancellation:
`backend/lib/talk_state.js` prunes entries by age/capacity and treats an absent
entry as permission to start work. `backend/index.js`'s talk-turn metadata map
also expires and evicts entries. A stop marker may only be removed after the
protocol guarantees that its original request can no longer be admitted.
The next storage change needs an explicit request-admission lifetime plus
durable owner-scoped cancellation state, with expiry/restart/late-delivery tests.
Simply adding a TTL would reopen the reproduced early-stop race.

## Physical-device release readiness recheck

The release-default branch (`/private/tmp/them-release-live-backend-default`)
was checked using `node scripts/release_config_status.mjs --json` with resolved
Xcode settings. BACKEND_URL correctly resolves to the HTTPS Render host. Local
private configuration is absent: DEVELOPMENT_TEAM_ID, APP_TOKEN_RELEASE and
the OPENAI_API_KEY required for the live release canary are not configured in
that checkout. This does not establish whether Render has a provider key.
The unauthenticated `/api/version` request returned 401, so the deployed revision
was not verified. No credentials were printed, changed, or copied, and no paid
provider request, deployment, or physical-device installation was performed.

## Acknowledgement hardening

Request-scoped cancellation now requires a successful response with the exact
request_id and an explicit ok:true. A generic 200, a different turn ID, or
ok:false must not clear the client's turn tracking. Exact early-stop responses
with cancelled:false remain valid because the server has recorded the stop
before a reservation exists. Two client transport tests cover these cases.
Full signed iOS verification passed 634 tests, zero failures, exit 0 at
`/tmp/them-page-request-ios-ack.log`; diff/D009 checks passed. Final Mac Scaffold
Release build also passed, exit 0 at `/tmp/them-page-request-macos-ack.log`.
The backend was unchanged since the 2,752-pass run. Keep this draft held for
the storage and release risks listed above.
