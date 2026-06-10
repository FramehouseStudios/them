// T-decompose-phase1-ops-routes — GET /ops/alerts
//
// Phase-1 of the backend/index.js decomposition. Extracts the
// previously-inline /ops/alerts handler verbatim. Behavior is
// byte-identical: same response shape, same status codes.
//
// Access-control posture: SAFE-PUBLIC. Response is alert codes,
// severity strings, and runtime snapshot — no per-user content.
// Matches /ops/metrics, /ops/health-summary, /ops/routes.
// Schema: docs/schemas/ops-alerts.md.
//
// Deps:
//   buildOpsAlerts()        → { status, alerts, runtime }
//   scaleBackplaneStatus()  → backplane snapshot object
//
// Both deps required. Mount fails loud at startup if either is
// missing.

function mountOpsAlertsRoute(app, deps = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountOpsAlertsRoute requires an Express app");
  }
  const { buildOpsAlerts, scaleBackplaneStatus } = deps;
  if (typeof buildOpsAlerts !== "function") {
    throw new Error("mountOpsAlertsRoute: buildOpsAlerts is required");
  }
  if (typeof scaleBackplaneStatus !== "function") {
    throw new Error("mountOpsAlertsRoute: scaleBackplaneStatus is required");
  }

  app.get("/ops/alerts", (req, res) => {
    const alerting = buildOpsAlerts();
    const backplaneStatus = scaleBackplaneStatus();
    return res.status(200).json({
      ok: true,
      status: alerting.status,
      alerts: alerting.alerts,
      runtime: alerting.runtime,
      scale_backplane: backplaneStatus,
    });
  });
}

export { mountOpsAlertsRoute };
