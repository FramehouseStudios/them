// Lightweight, dependency-free version endpoint.
//
// Distinct from /health (which exposes memory state + runtime metrics)
// and /realtime/health (which touches supplier reachability). This
// endpoint is safe to hit from any client, any frequency — it does
// not read memory, does not touch the DB, does not call out to
// suppliers. Clients use it to detect schema_version bumps and
// backend_boot_id changes (i.e. "is the server I'm talking to the
// one I expect?").

function buildVersionPayload({ API_SCHEMA_VERSION, BACKEND_BUILD, BACKEND_BOOT_ID, nowMs }) {
  return {
    ok: true,
    schema_version: API_SCHEMA_VERSION,
    backend_build: BACKEND_BUILD,
    backend_boot_id: BACKEND_BOOT_ID,
    server_time_ms: nowMs,
  };
}

function mountApiVersionRoute(app, deps) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountApiVersionRoute requires an Express app");
  }
  const required = ["API_SCHEMA_VERSION", "BACKEND_BUILD", "BACKEND_BOOT_ID"];
  for (const k of required) {
    if (!(k in (deps || {}))) {
      throw new Error(`mountApiVersionRoute requires deps.${k}`);
    }
  }

  app.get("/api/version", (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=5");
    res.status(200).json(buildVersionPayload({
      API_SCHEMA_VERSION: deps.API_SCHEMA_VERSION,
      BACKEND_BUILD: deps.BACKEND_BUILD,
      BACKEND_BOOT_ID: deps.BACKEND_BOOT_ID,
      nowMs: Date.now(),
    }));
  });
}

export { mountApiVersionRoute, buildVersionPayload };
