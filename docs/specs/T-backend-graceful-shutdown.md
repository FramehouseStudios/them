# Spec: T-backend-graceful-shutdown

**Status**: implemented locally on `codex/T383-graceful-shutdown`; awaiting
GitHub restoration and project review.
**Owner**: codex.
**V1 pillar**: infra (enables all)
**V1 effect**: closes the V1 "deploy interrupts in-flight talk" gap.
When Render/Fly sends SIGTERM during a deploy, active `/talk` streams must
finish inside a bounded grace period rather than being truncated by a fixed,
short close path.

## Problem

`backend/index.js` already had a partial inline eight-second close path when
implementation began. It stopped the listener and closed persistence, but did
not:

- Wait for in-flight requests (especially streaming `/talk`) to drain.
- Drain the outbox worker tick before exiting.
- Wait for an active account hard-delete sweep before closing persistence.
- Cancel delayed hydration and knowledge-warmup work before it could start.

The container orchestrator gives the process about 30 seconds after SIGTERM
before SIGKILL. The old eight-second deadline left most of that safe window
unused.

## Scope

In:
- A `gracefulShutdown(server, deps)` helper in `lib/shutdown.js`.
- Wire it from `index.js` after `app.listen(PORT, ...)`.
- Behavior:
  1. On SIGTERM/SIGINT: log `shutdown_started`, set
     `runtimeStatus = "draining"`.
  2. Call `server.close()` to stop accepting new connections.
  3. Track in-flight request counts (talkInFlight already exists);
     wait until it reaches 0 or the timeout fires.
  4. Drain the outbox worker (if running) — wait for the current
     tick without claiming a new batch.
  5. Wait for any active account hard-delete sweep and cancel delayed
     boot/background work.
  6. Call `closeScaleBackplaneOnce()` and `sharedPersistence.close()`
     (if defined).
  7. Exit 0.
- Timeout: `SHUTDOWN_GRACE_MS` env, default 25_000 ms (leaves 5s
  margin before SIGKILL on most orchestrators).
- During the drain, `/healthz` returns 503 so the LB pulls us out
  of rotation immediately.

Out:
- Persisting in-flight state across restarts. /talk turns that don't
  drain inside the grace window simply fail; the iOS outbox retries.

## Approach

`createGracefulShutdown` is dependency-injected and returns one idempotent
`run(signal)` promise. It marks readiness as draining synchronously, starts
`server.close()`, cancels delayed/background jobs, waits for active talk and
destructive purge work, waits for the current outbox tick, closes newly idle
keep-alive connections, and then closes the backplane and canonical
persistence adapter. One absolute deadline covers every phase. The helper
returns a result; `index.js` owns the final process exit so tests never patch
global process behavior.

## Acceptance

- Send SIGTERM to a running backend with 2 in-flight `/talk` turns.
  Both turns finish before the process exits. Process exit happens
  before 25s.
- `/healthz` returns 503 within 100 ms of SIGTERM.
- New connection attempts during drain are refused at the socket
  level (ECONNREFUSED).
- After `SHUTDOWN_GRACE_MS`, the process exits even if a turn is
  still in-flight (with a warn log).

## Risks

- `server.close()` only stops accepting new connections; it does
  not close existing ones until they finish naturally. Mitigation:
  the timeout enforces a hard deadline.
- A request handler that never calls `res.end()` will hold the
  drain forever (until timeout). Mitigation: the timeout log records the
  active shutdown phase and aggregate in-flight count before force-closing
  remaining sockets.

## Out-of-scope follow-ups

- SIGHUP for config reload.
- Persistent shutdown state (e.g. for a multi-instance graceful
  rollout).
- Treat a repeated identical termination signal as another idempotent drain
  request instead of the current operator force-stop behavior from
  `process.once`.
- Serialize overlapping diagnostic outbox snapshots so `stop()` can prove
  every best-effort snapshot write has settled before persistence closes.
