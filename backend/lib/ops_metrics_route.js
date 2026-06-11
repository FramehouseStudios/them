// T-decompose-phase1-ops-routes — GET /ops/metrics
//
// Phase-1 of the backend/index.js decomposition. Extracts the
// previously-inline /ops/metrics handler verbatim. Behavior is
// byte-identical: same response shape, same headers, same response
// codes. Deps are passed as accessor functions so live counters are
// read at request time (not at mount time, which would freeze them).
//
// Access-control posture: SAFE-PUBLIC. The response is ops-only
// telemetry — counters, status, recent talk samples. No per-user
// content. Matches /ops/alerts, /ops/health-summary, /ops/routes.
//
// Deps:
//   deriveBackendRuntimeStatus()  → { status, reasons, metrics }
//   scaleBackplaneStatus()        → backplane snapshot object
//   talkMetricsSamples()          → array of sample objects
//   talkInFlight()                → number (live)
//   talkInFlightBySessionSize()   → number (live, Map.size)
//   talkIdempotencyCacheSize()    → number (live, cache size)
//   TALK_MAX_IN_FLIGHT            → constant integer
//
// All deps required. Mount fails loud at startup if any are missing,
// so a wiring mistake surfaces immediately instead of crashing on
// the first request.

function mountOpsMetricsRoute(app, deps = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountOpsMetricsRoute requires an Express app");
  }
  const {
    deriveBackendRuntimeStatus,
    scaleBackplaneStatus,
    talkMetricsSamples,
    talkInFlight,
    talkInFlightBySessionSize,
    talkIdempotencyCacheSize,
    TALK_MAX_IN_FLIGHT,
  } = deps;
  if (typeof deriveBackendRuntimeStatus !== "function") {
    throw new Error("mountOpsMetricsRoute: deriveBackendRuntimeStatus is required");
  }
  if (typeof scaleBackplaneStatus !== "function") {
    throw new Error("mountOpsMetricsRoute: scaleBackplaneStatus is required");
  }
  if (typeof talkMetricsSamples !== "function") {
    throw new Error("mountOpsMetricsRoute: talkMetricsSamples is required");
  }
  if (typeof talkInFlight !== "function") {
    throw new Error("mountOpsMetricsRoute: talkInFlight is required");
  }
  if (typeof talkInFlightBySessionSize !== "function") {
    throw new Error("mountOpsMetricsRoute: talkInFlightBySessionSize is required");
  }
  if (typeof talkIdempotencyCacheSize !== "function") {
    throw new Error("mountOpsMetricsRoute: talkIdempotencyCacheSize is required");
  }
  if (!Number.isFinite(TALK_MAX_IN_FLIGHT)) {
    throw new Error("mountOpsMetricsRoute: TALK_MAX_IN_FLIGHT must be a finite number");
  }

  app.get("/ops/metrics", (req, res) => {
    const runtime = deriveBackendRuntimeStatus();
    const backplaneStatus = scaleBackplaneStatus();
    const samples = talkMetricsSamples();
    const recent = samples
      .slice(-Math.min(32, samples.length))
      .map((sample) => ({
        at: sample.at,
        status_code: sample.statusCode,
        total_ms: sample.totalMs,
        stt_ms: sample.sttMs,
        llm_ms: sample.chatMs,
        tts_ms: sample.ttsMs,
        stream_audio: sample.streamAudio ? 1 : 0,
        chat_stream_used: sample.chatStreamUsed ? 1 : 0,
        talk_status: sample.talkStatus,
        lane: sample.lane,
        model: sample.model,
        screenplay_mode: sample.screenplayMode ? 1 : 0,
        screenplay_requested_target: sample.screenplayRequestedTarget || "none",
        screenplay_final_target: sample.screenplayFinalTarget || "none",
        screenplay_output_source: sample.screenplayOutputSource || "none",
        screenplay_quality_reason: sample.screenplayQualityReason || "none",
        screenplay_quality_confidence: sample.screenplayQualityConfidence || "none",
        screenplay_outcome: sample.screenplayOutcome || "none",
        screenplay_authoritative: sample.screenplayAuthoritative ? 1 : 0,
        screenplay_reply_repaired: sample.screenplayReplyRepaired ? 1 : 0,
      }));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("x-backend-status", runtime.status);
    return res.status(200).json({
      ok: true,
      status: runtime.status,
      reasons: runtime.reasons,
      talk_in_flight: talkInFlight(),
      talk_max_in_flight: TALK_MAX_IN_FLIGHT,
      session_locks: talkInFlightBySessionSize(),
      idempotency_entries: talkIdempotencyCacheSize(),
      scale_backplane: backplaneStatus,
      metrics_window_ms: runtime.metrics.windowMs,
      metrics: runtime.metrics,
      recent,
    });
  });
}

export { mountOpsMetricsRoute };
