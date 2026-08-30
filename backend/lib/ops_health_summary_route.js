// T-ops-health-summary-route — GET /ops/health-summary
//
// One-shot diagnostic that answers "is this deployment fully
// wired?" without doing any per-user scans. Aggregates a small set
// of always-cheap signals:
//
//   - node uptime + version
//   - backend status string (e.g. "ok" / "degraded")
//   - which optional subsystems are mounted (by name)
//   - cheap safe-public subsystem quality signals
//
// Distinct from /ops/metrics, which exposes hot-path counters and
// recent talk samples. /ops/metrics costs nothing per call but
// dumps a lot of state; this endpoint dumps very little state and
// is the right thing for an uptime dashboard to poll every few
// seconds.

const OPS_HEALTH_SUMMARY_SCHEMA_VERSION = 1;

function mountOpsHealthSummaryRoute(app, {
  deriveBackendStatus = () => ({ status: "unknown", reasons: [] }),
  features = {},
  signals = {},
  startedAtMs = Date.now(),
  nowFn = () => Date.now(),
} = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountOpsHealthSummaryRoute requires an Express app");
  }

  app.get("/ops/health-summary", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    let runtime;
    try {
      runtime = deriveBackendStatus() || { status: "unknown", reasons: [] };
    } catch (e) {
      runtime = { status: "error", reasons: [e?.message || "derive_failed"] };
    }
    const uptimeMs = Math.max(0, nowFn() - startedAtMs);
    return res.status(200).json({
      schemaVersion: OPS_HEALTH_SUMMARY_SCHEMA_VERSION,
      status: typeof runtime.status === "string" ? runtime.status : "unknown",
      reasons: Array.isArray(runtime.reasons) ? runtime.reasons : [],
      uptimeMs,
      uptimeHuman: humanizeMs(uptimeMs),
      node: {
        version: typeof process !== "undefined" ? process.version : null,
        platform: typeof process !== "undefined" ? process.platform : null,
      },
      features: normalizeFeatures(features),
      signals: resolveSignals(signals),
    });
  });
}

function humanizeMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function normalizeFeatures(features) {
  if (!features || typeof features !== "object") return {};
  const out = {};
  for (const key of Object.keys(features)) {
    out[key] = Boolean(features[key]);
  }
  return out;
}

function normalizeSignalValue(value, depth = 0) {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) {
    if (depth >= 2) return [];
    return value.slice(0, 24).map((item) => normalizeSignalValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    if (depth >= 2) return {};
    const out = {};
    for (const key of Object.keys(value).slice(0, 64)) {
      out[key] = normalizeSignalValue(value[key], depth + 1);
    }
    return out;
  }
  return null;
}

function normalizeSignals(signals) {
  if (!signals || typeof signals !== "object") return {};
  const out = {};
  for (const key of Object.keys(signals)) {
    out[key] = normalizeSignalValue(signals[key]);
  }
  return out;
}

function resolveSignals(signals) {
  try {
    const source = typeof signals === "function" ? signals() : signals;
    return normalizeSignals(source);
  } catch (e) {
    return {
      ops_health_signals: {
        status: "error",
        reason: "derive_failed",
      },
    };
  }
}

export {
  mountOpsHealthSummaryRoute,
  humanizeMs,
  normalizeFeatures,
  normalizeSignals,
  resolveSignals,
  OPS_HEALTH_SUMMARY_SCHEMA_VERSION,
};
