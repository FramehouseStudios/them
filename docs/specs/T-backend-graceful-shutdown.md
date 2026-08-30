# Spec: T-backend-graceful-shutdown

**Status**: ready (support agent can implement).
**Owner**: support.
**V1 pillar**: infra (enables all)
**V1 effect**: closes the V1 "deploy interrupts in-flight talk" gap.
When Render/Fly sends SIGTERM during a deploy, the current `index.js`
behavior is to immediately exit, killing every in-flight `/talk`
turn mid-stream. Users see a network error.

## Problem

`backend/index.js` currently registers SIGINT/SIGTERM/exit handlers
for the scale-backplane (`closeScaleBackplaneOnce`), but does NOT:

- Stop accepting new connections.
- Wait for in-flight requests (especially streaming `/talk`) to drain.
- Drain the outbox worker tick before exiting.

The container orchestrator gives the process ~30s after SIGTERM
before SIGKILL. We're not using that window.

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
     tick.
  5. Call `closeScaleBackplaneOnce()` and `sharedPersistence.end()`
     (if defined).
  6. Exit 0.
- Timeout: `SHUTDOWN_GRACE_MS` env, default 25_000 ms (leaves 5s
  margin before SIGKILL on most orchestrators).
- During the drain, `/healthz` returns 503 so the LB pulls us out
  of rotation immediately.

Out:
- Persisting in-flight state across restarts. /talk turns that don't
  drain inside the grace window simply fail; the iOS outbox retries.

## Approach

```js
// lib/shutdown.js
function gracefulShutdown(server, {
  inFlightCount,    // () => number
  drainOutbox,      // async () => void
  closeBackplane,   // async () => void
  endPersistence,   // async () => void
  setRuntimeStatus, // (s) => void
  logger,
  graceMs = 25_000,
}) {
  let started = false;
  async function run(signal) {
    if (started) return;
    started = true;
    logger.info("shutdown_started", { signal, in_flight: inFlightCount() });
    setRuntimeStatus("draining");
    server.close();  // stop new conns; existing keep going
    const deadline = Date.now() + graceMs;
    while (inFlightCount() > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }
    await drainOutbox().catch(e => logger.warn("outbox_drain_fail", { e: e.message }));
    await closeBackplane().catch(() => {});
    await endPersistence?.().catch(() => {});
    logger.info("shutdown_done", { in_flight_at_exit: inFlightCount() });
    process.exit(0);
  }
  process.on("SIGTERM", () => run("SIGTERM"));
  process.on("SIGINT", () => run("SIGINT"));
}
```

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
  drain forever (until timeout). Mitigation: log per-request when
  drain timeout fires, naming the route.

## Out-of-scope follow-ups

- SIGHUP for config reload.
- Persistent shutdown state (e.g. for a multi-instance graceful
  rollout).
