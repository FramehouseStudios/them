// T-decompose-phase0-health-route — first concrete extraction
// from backend/index.js as proof-of-concept for the
// T-decompose-backend-index spec.
//
// Mounts GET /health and GET /bridge, which today are byte-identical
// inline handlers in index.js. Both return the canonical backend
// status + read-state envelope iOS uses to decide whether to fall
// back to local storage.
//
// Behavior is preserved exactly — same response shape, same headers,
// same status code. The only change is the handler now lives here.

function buildHealthPayload({
  req,
  nowMs,
  selectMemoryRecordForRead,
  buildReadStateMeta,
  deriveBackendRuntimeStatus,
  scaleBackplane,
  talkInFlight,
  talkInFlightBySession,
  API_SCHEMA_VERSION,
  BACKEND_BUILD,
  BACKEND_BOOT_ID,
}) {
  const selected = selectMemoryRecordForRead(req, nowMs);
  const readMeta = buildReadStateMeta(req, selected.memory, selected.ip);
  const runtime = deriveBackendRuntimeStatus();
  const backplaneStatus = scaleBackplane.status();
  return {
    payload: {
      ok: true,
      status: runtime.status,
      reasons: runtime.reasons,
      schema_version: API_SCHEMA_VERSION,
      backend_build: BACKEND_BUILD,
      backend_boot_id: BACKEND_BOOT_ID,
      session_id: readMeta.sessionId,
      state_version: readMeta.stateVersion,
      last_turn_id: readMeta.lastTurnId || null,
      last_updated_at: readMeta.lastUpdatedAt || null,
      history_updated_at: readMeta.historyUpdatedAt || null,
      memory_updated_at: readMeta.memoryUpdatedAt || null,
      talk_in_flight: talkInFlight,
      talk_sessions_in_flight: talkInFlightBySession.size,
      talk_metrics: runtime.metrics,
      scale_backplane: backplaneStatus,
    },
    runtime,
    readMeta,
  };
}

function mountHealthRoutes(app, deps) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountHealthRoutes requires an Express app");
  }
  const required = [
    "selectMemoryRecordForRead",
    "buildReadStateMeta",
    "deriveBackendRuntimeStatus",
    "scaleBackplane",
    "applyReadStateHeaders",
    "talkInFlight",
    "talkInFlightBySession",
    "API_SCHEMA_VERSION",
    "BACKEND_BUILD",
    "BACKEND_BOOT_ID",
  ];
  for (const k of required) {
    if (!(k in (deps || {}))) {
      throw new Error(`mountHealthRoutes requires deps.${k}`);
    }
  }

  function handler(req, res) {
    const { payload, readMeta, runtime } = buildHealthPayload({
      req,
      nowMs: Date.now(),
      selectMemoryRecordForRead: deps.selectMemoryRecordForRead,
      buildReadStateMeta: deps.buildReadStateMeta,
      deriveBackendRuntimeStatus: deps.deriveBackendRuntimeStatus,
      scaleBackplane: deps.scaleBackplane,
      // deps.talkInFlight / talkInFlightBySession are live references
      // to closure-scoped state in index.js. They can change between
      // request and response; read them at handler time so callers
      // see the current value.
      talkInFlight: deps.talkInFlight(),
      talkInFlightBySession: deps.talkInFlightBySession(),
      API_SCHEMA_VERSION: deps.API_SCHEMA_VERSION,
      BACKEND_BUILD: deps.BACKEND_BUILD,
      BACKEND_BOOT_ID: deps.BACKEND_BOOT_ID,
    });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    deps.applyReadStateHeaders(res, readMeta);
    res.setHeader("x-backend-status", runtime.status);
    return res.status(200).json(payload);
  }

  app.get("/health", handler);
  app.get("/bridge", handler);
}

export { mountHealthRoutes, buildHealthPayload };
