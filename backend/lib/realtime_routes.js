// T-decompose-phase5a-realtime-reads — extract the read-only
// `/realtime/*` routes from backend/index.js.
//
// Phase 5 of the decomposition (spec:
// `docs/specs/T-decompose-backend-index.md`). Phases 0–4 merged.
// Per spec, max 1 decomp PR in flight.
//
// Phase 5a (this PR): the 2 read-only GET routes.
// Phase 5b will follow with the 5 write/streaming/call routes
// (client_secret, studio_render, studio_render_stream, turn_commit,
// /realtime/call). Phase 5b is a much heavier extraction (~40 deps,
// the supplier-mint state machine, the studio-render LLM streaming
// path, the WebRTC SDP exchange) so it gets its own PR per the
// Phase 2 precedent.
//
// Routes:
//   GET /realtime/health
//   GET /realtime/bridge
//
// Behavior is byte-identical with the previous inline handlers
// (same response shape, headers, caching, CSP, status codes).
//
// Access-control posture: SAFE-PUBLIC.
//   /realtime/health returns supplier shape + cached liveness
//   probe results. No per-user content. Matches the other public
//   ops surface.
//   /realtime/bridge returns the static HTML page that WebRTC
//   clients load to bootstrap the realtime connection. No per-user
//   content. Same CSP it has always had.

function mountRealtimeRoutes(app, deps = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountRealtimeRoutes requires an Express app");
  }
  const {
    // /realtime/health
    getRealtimeSupplier,
    probeSupplierShape,
    probeSupplierLive,
    realtimeHealthCache,
    // /realtime/bridge
    renderRealtimeBridgeHtml,
  } = deps;

  if (typeof getRealtimeSupplier !== "function") {
    throw new Error("mountRealtimeRoutes: getRealtimeSupplier is required");
  }
  if (typeof probeSupplierShape !== "function") {
    throw new Error("mountRealtimeRoutes: probeSupplierShape is required");
  }
  if (typeof probeSupplierLive !== "function") {
    throw new Error("mountRealtimeRoutes: probeSupplierLive is required");
  }
  if (!realtimeHealthCache || typeof realtimeHealthCache.get !== "function" || typeof realtimeHealthCache.set !== "function") {
    throw new Error("mountRealtimeRoutes: realtimeHealthCache (with .get/.set) is required");
  }
  if (typeof renderRealtimeBridgeHtml !== "function") {
    throw new Error("mountRealtimeRoutes: renderRealtimeBridgeHtml is required");
  }

  app.get("/realtime/health", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // Live read of the supplier — accessor pattern. The supplier
    // reference may change at runtime (e.g. failover to stub) so
    // we resolve it at request time, not mount time.
    const supplier = getRealtimeSupplier();
    const deep = String(req.query?.deep || "").trim() === "1";
    const recordedAt = new Date().toISOString();
    if (!deep) {
      const shape = probeSupplierShape(supplier);
      return res.status(200).json({
        schemaVersion: 1,
        mode: "shape",
        kind: shape.kind || (supplier && supplier.kind) || null,
        healthy: Boolean(shape.healthy),
        error: shape.error,
        recordedAt,
      });
    }
    const cached = realtimeHealthCache.get(supplier);
    if (cached) {
      return res.status(200).json({
        schemaVersion: 1,
        mode: "live",
        cached: true,
        ...cached,
      });
    }
    const live = await probeSupplierLive(supplier, { timeoutMs: 5000 });
    const result = { kind: live.kind, healthy: Boolean(live.healthy), error: live.error, latencyMs: live.latencyMs, recordedAt };
    realtimeHealthCache.set(supplier, result);
    return res.status(200).json({ schemaVersion: 1, mode: "live", cached: false, ...result });
  });

  app.get("/realtime/bridge", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' https://api.openai.com blob: data:; connect-src 'self' https://api.openai.com; media-src blob: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    );
    res.type("html");
    return res.status(200).send(renderRealtimeBridgeHtml());
  });
}

export { mountRealtimeRoutes };
