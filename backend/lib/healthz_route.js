// /healthz — orchestrator-friendly readiness probe.
//
// Purpose: tell Render/Fly/Kubernetes "is this backend ready to take
// traffic?" The existing /health endpoint is a liveness probe (heavy
// envelope, memory-state reads). /realtime/health is a supplier
// probe. This endpoint is the missing readiness probe: it returns
// 200 only if the persistence layer can be reached, 503 otherwise.
//
// Designed to be cheap (one SELECT 1 round-trip in Postgres mode;
// noop in JSON dev mode) and stateless. Safe to call multiple times
// per second from an orchestrator.

function mountHealthzRoute(app, deps) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountHealthzRoute requires an Express app");
  }
  const ping = typeof deps?.pingPersistence === "function"
    ? deps.pingPersistence
    : async () => true;
  const isDraining = typeof deps?.isDraining === "function"
    ? deps.isDraining
    : () => false;
  const timeoutMs = Number(deps?.timeoutMs || 1500);

  app.get("/healthz", async (req, res) => {
    const startedAt = Date.now();
    const result = { ok: false, persistence: "unknown", elapsed_ms: 0 };

    if (isDraining()) {
      result.status = "draining";
      result.persistence = "skipped";
      result.elapsed_ms = Date.now() - startedAt;
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json(result);
    }

    try {
      const pingPromise = Promise.resolve().then(() => ping());
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("healthz_ping_timeout")), timeoutMs)
      );
      const persistenceOk = await Promise.race([pingPromise, timeoutPromise]);
      result.ok = !!persistenceOk;
      result.persistence = persistenceOk ? "ok" : "fail";
    } catch (err) {
      result.ok = false;
      result.persistence = "fail";
      result.error = String(err?.message || err || "ping_failed");
    } finally {
      result.elapsed_ms = Date.now() - startedAt;
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(result.ok ? 200 : 503).json(result);
  });
}

export { mountHealthzRoute };
