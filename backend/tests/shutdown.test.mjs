import assert from "node:assert/strict";
import test from "node:test";

import { createGracefulShutdown } from "../lib/shutdown.js";

function testLogger() {
  const events = [];
  return {
    events,
    info(event, details) { events.push({ level: "info", event, details }); },
    warn(event, details) { events.push({ level: "warn", event, details }); },
  };
}

test("[shutdown] marks draining and stops accepting before waiting for talk turns", async () => {
  const calls = [];
  const logger = testLogger();
  let inFlight = 2;
  let finishServerClose;
  const server = {
    close(callback) {
      calls.push("server.close");
      finishServerClose = callback;
    },
    closeIdleConnections() { calls.push("server.closeIdleConnections"); },
  };
  const shutdown = createGracefulShutdown({
    server,
    inFlightCount: () => inFlight,
    setRuntimeStatus: (status) => calls.push(`status:${status}`),
    stopBackgroundJobs: async () => { calls.push("background.stop"); },
    drainOutbox: async () => { calls.push("outbox.drain"); },
    closeBackplane: async () => { calls.push("backplane.close"); },
    closePersistence: async () => { calls.push("persistence.close"); },
    logger,
    graceMs: 200,
    pollIntervalMs: 1,
    sleep: async () => {
      calls.push("wait");
      inFlight = 0;
      finishServerClose();
    },
  });

  const result = await shutdown.run("SIGTERM");

  assert.equal(result.status, "closed");
  assert.equal(result.inFlightAtExit, 0);
  assert.deepEqual(calls.slice(0, 4), [
    "status:draining",
    "server.close",
    "server.closeIdleConnections",
    "background.stop",
  ]);
  assert.ok(calls.indexOf("outbox.drain") > calls.indexOf("wait"));
  assert.ok(calls.indexOf("backplane.close") > calls.indexOf("outbox.drain"));
  assert.ok(calls.indexOf("persistence.close") > calls.indexOf("outbox.drain"));
  assert.deepEqual(logger.events.map((entry) => entry.event), [
    "shutdown_started",
    "shutdown_done",
  ]);
});

test("[shutdown] repeated signals share one idempotent shutdown", async () => {
  let serverCloseCalls = 0;
  const server = {
    close(callback) {
      serverCloseCalls += 1;
      callback();
    },
  };
  const shutdown = createGracefulShutdown({ server, logger: testLogger() });

  const first = shutdown.run("SIGTERM");
  const second = shutdown.run("SIGINT");

  assert.strictEqual(first, second);
  assert.equal((await first).signal, "SIGTERM");
  assert.equal(serverCloseCalls, 1);
  assert.equal(shutdown.isStarted(), true);
});

test("[shutdown] cleanup failures are logged without blocking the remaining closers", async () => {
  const logger = testLogger();
  let persistenceClosed = false;
  const shutdown = createGracefulShutdown({
    server: { close: (callback) => callback() },
    closeBackplane: async () => { throw new Error("backplane unavailable"); },
    closePersistence: async () => { persistenceClosed = true; },
    logger,
  });

  const result = await shutdown.run("SIGTERM");

  assert.equal(result.status, "closed");
  assert.equal(persistenceClosed, true);
  const warning = logger.events.find((entry) => entry.event === "shutdown_cleanup_failed");
  assert.equal(warning?.details?.step, "backplane");
  assert.match(warning?.details?.error || "", /unavailable/);
});

test("[shutdown] enforces one absolute deadline and force-closes remaining sockets", async () => {
  const logger = testLogger();
  let forceCloseCalls = 0;
  const shutdown = createGracefulShutdown({
    server: {
      close() {},
      closeAllConnections() { forceCloseCalls += 1; },
    },
    inFlightCount: () => 1,
    logger,
    graceMs: 20,
    pollIntervalMs: 2,
  });

  const startedAt = Date.now();
  const result = await shutdown.run("SIGTERM");

  assert.equal(result.status, "timeout");
  assert.equal(result.inFlightAtExit, 1);
  assert.equal(forceCloseCalls, 1);
  assert.ok(Date.now() - startedAt < 250);
  assert.equal(
    logger.events.some((entry) => entry.event === "shutdown_timeout"),
    true,
  );
});
