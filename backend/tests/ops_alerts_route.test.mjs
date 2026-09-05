// T-decompose-phase1-ops-routes — integration tests for
// `mountOpsAlertsRoute`. Pin byte-identical response shape +
// required-deps guard.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountOpsAlertsRoute } from "../lib/ops_alerts_route.js";

function fakeAlerting({ status = "healthy", alerts = [] } = {}) {
  return {
    status,
    alerts,
    runtime: {
      status: alerts.length ? "degraded" : "up",
      reasons: [],
      metrics: { windowMs: 60000, sampleCount: 0 },
    },
  };
}

function defaultDeps(overrides = {}) {
  return {
    buildOpsAlerts: () => fakeAlerting(),
    scaleBackplaneStatus: () => ({ status: "noop", outboxPending: 0 }),
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
  mountOpsAlertsRoute(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

test("[ops-alerts-route] mount fails without Express app", () => {
  assert.throws(() => mountOpsAlertsRoute(null, defaultDeps()));
  assert.throws(() => mountOpsAlertsRoute({}, defaultDeps()));
});

test("[ops-alerts-route] mount fails without required deps", () => {
  const app = express();
  assert.throws(
    () => mountOpsAlertsRoute(app, defaultDeps({ buildOpsAlerts: undefined })),
    /buildOpsAlerts/,
  );
  assert.throws(
    () => mountOpsAlertsRoute(app, defaultDeps({ scaleBackplaneStatus: undefined })),
    /scaleBackplaneStatus/,
  );
});

test("[ops-alerts-route] returns healthy envelope when no alerts", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/ops/alerts");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.status, "healthy");
    assert.deepEqual(r.body.alerts, []);
    assert.equal(r.body.runtime.status, "up");
    assert.equal(typeof r.body.scale_backplane, "object");
  });
});

test("[ops-alerts-route] surfaces active alerts verbatim", async () => {
  const deps = defaultDeps({
    buildOpsAlerts: () => fakeAlerting({
      status: "alerting",
      alerts: [
        { code: "high_error_rate", severity: "critical", message: "Error rate 0.500 exceeded 0.100." },
        { code: "session_lock_pressure", severity: "warning", message: "Session lock pressure (200 locks)." },
      ],
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/ops/alerts");
    assert.equal(r.body.status, "alerting");
    assert.equal(r.body.alerts.length, 2);
    assert.equal(r.body.alerts[0].code, "high_error_rate");
    assert.equal(r.body.alerts[0].severity, "critical");
    assert.equal(r.body.alerts[1].code, "session_lock_pressure");
  });
});

test("[ops-alerts-route] re-evaluates deps on each request (live)", async () => {
  let alertsThisRequest = [];
  const deps = defaultDeps({
    buildOpsAlerts: () => fakeAlerting({
      status: alertsThisRequest.length ? "alerting" : "healthy",
      alerts: alertsThisRequest,
    }),
  });
  await withTestServer(deps, async (baseURL) => {
    const cold = await get(baseURL, "/ops/alerts");
    assert.equal(cold.body.status, "healthy");
    alertsThisRequest = [{ code: "runtime_degraded", severity: "warning", message: "x" }];
    const hot = await get(baseURL, "/ops/alerts");
    assert.equal(hot.body.status, "alerting");
    assert.equal(hot.body.alerts[0].code, "runtime_degraded");
  });
});

test("[ops-alerts-route] safe-public posture: no per-user content", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/ops/alerts");
    const raw = JSON.stringify(r.body);
    const forbidden = [
      "@", "Bearer ", "userId", "user_id", "deviceId",
      "device_id", "sessionId", "session_id", "prompt",
      "completion", "transcript", "content", "ipAddress",
      "ip_address",
    ];
    for (const needle of forbidden) {
      assert.equal(
        raw.includes(needle),
        false,
        `/ops/alerts leaked forbidden substring: ${needle}`,
      );
    }
  });
});

test("[ops-alerts-route] canonical envelope keys", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/ops/alerts");
    const keys = Object.keys(r.body).sort();
    assert.deepEqual(keys, ["alerts", "ok", "runtime", "scale_backplane", "status"]);
  });
});
