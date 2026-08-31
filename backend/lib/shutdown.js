const DEFAULT_SHUTDOWN_GRACE_MS = 25_000;
const DEFAULT_POLL_INTERVAL_MS = 50;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function logEvent(logger, level, event, details = {}) {
  const method = logger?.[level] || logger?.log;
  if (typeof method === "function") {
    method.call(logger, event, details);
  }
}

function beginServerClose(server) {
  if (!server || typeof server.close !== "function") {
    return Promise.resolve();
  }
  const closePromise = new Promise((resolve, reject) => {
    const finish = (error) => {
      if (!error || error?.code === "ERR_SERVER_NOT_RUNNING") resolve();
      else reject(error);
    };
    try {
      server.close(finish);
    } catch (error) {
      finish(error);
    }
  });
  try {
    server.closeIdleConnections?.();
  } catch {
    // The close callback remains the source of truth.
  }
  return closePromise;
}

function createGracefulShutdown({
  server = null,
  inFlightCount = () => 0,
  stopBackgroundJobs = async () => {},
  drainOutbox = async () => {},
  closeBackplane = async () => {},
  closePersistence = async () => {},
  setRuntimeStatus = () => {},
  logger = console,
  graceMs = DEFAULT_SHUTDOWN_GRACE_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const resolvedGraceMs = positiveInteger(graceMs, DEFAULT_SHUTDOWN_GRACE_MS);
  const resolvedPollIntervalMs = positiveInteger(
    pollIntervalMs,
    DEFAULT_POLL_INTERVAL_MS,
  );
  let shutdownPromise = null;

  async function safeStep(name, operation) {
    try {
      await operation();
      return true;
    } catch (error) {
      logEvent(logger, "warn", "shutdown_cleanup_failed", {
        step: name,
        error: String(error?.message || error || "unknown_error"),
      });
      return false;
    }
  }

  async function performShutdown(signal) {
    const startedAt = Date.now();
    const initialInFlight = Math.max(0, Number(inFlightCount()) || 0);
    setRuntimeStatus("draining");
    logEvent(logger, "info", "shutdown_started", {
      signal,
      in_flight: initialInFlight,
      grace_ms: resolvedGraceMs,
    });

    let phase = "stop_accepting";
    const serverClosePromise = beginServerClose(server);
    let deadlineExpired = false;
    const work = (async () => {
      phase = "background_jobs";
      await safeStep("background_jobs", stopBackgroundJobs);
      phase = "in_flight_requests";
      while (
        !deadlineExpired
        && Math.max(0, Number(inFlightCount()) || 0) > 0
      ) {
        await sleep(resolvedPollIntervalMs);
      }
      if (deadlineExpired) return "timeout";
      phase = "outbox";
      await safeStep("outbox", drainOutbox);
      if (deadlineExpired) return "timeout";
      phase = "http_server";
      // Connections that were active when shutdown began may have become
      // keep-alive idle while the talk counter drained. Close that newly idle
      // set before awaiting Node's server-close callback.
      try {
        server?.closeIdleConnections?.();
      } catch {
        // The server-close callback remains authoritative.
      }
      await safeStep("http_server", () => serverClosePromise);
      if (deadlineExpired) return "timeout";
      phase = "dependencies";
      await Promise.all([
        safeStep("backplane", closeBackplane),
        safeStep("persistence", closePersistence),
      ]);
      return "closed";
    })();

    let deadlineTimer = null;
    const deadline = new Promise((resolve) => {
      deadlineTimer = setTimeout(() => {
        deadlineExpired = true;
        resolve("timeout");
      }, resolvedGraceMs);
    });
    const status = await Promise.race([work, deadline]);
    if (deadlineTimer) clearTimeout(deadlineTimer);

    const remainingInFlight = Math.max(0, Number(inFlightCount()) || 0);
    if (status === "timeout") {
      try {
        server?.closeAllConnections?.();
      } catch {
        // The caller exits after the bounded grace period.
      }
      logEvent(logger, "warn", "shutdown_timeout", {
        signal,
        elapsed_ms: Date.now() - startedAt,
        in_flight: remainingInFlight,
        phase,
      });
      return {
        status,
        signal,
        elapsedMs: Date.now() - startedAt,
        inFlightAtExit: remainingInFlight,
      };
    }

    logEvent(logger, "info", "shutdown_done", {
      signal,
      elapsed_ms: Date.now() - startedAt,
      in_flight: remainingInFlight,
    });
    return {
      status,
      signal,
      elapsedMs: Date.now() - startedAt,
      inFlightAtExit: remainingInFlight,
    };
  }

  function run(signal = "shutdown") {
    if (!shutdownPromise) {
      shutdownPromise = performShutdown(String(signal || "shutdown"));
    }
    return shutdownPromise;
  }

  return {
    run,
    isStarted: () => shutdownPromise !== null,
  };
}

export {
  createGracefulShutdown,
  DEFAULT_SHUTDOWN_GRACE_MS,
};
