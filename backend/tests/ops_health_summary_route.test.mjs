// T-ops-health-summary-route — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  mountOpsHealthSummaryRoute,
  humanizeMs,
  normalizeFeatures,
  normalizeSignals,
  resolveSignals,
  OPS_HEALTH_SUMMARY_SCHEMA_VERSION,
} from "../lib/ops_health_summary_route.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
// ---------- humanizeMs ----------

test("[ops-health] humanizeMs: small intervals show seconds", () => {
  assert.equal(humanizeMs(0), "0s");
  assert.equal(humanizeMs(1500), "1s");
  assert.equal(humanizeMs(59_000), "59s");
});

test("[ops-health] humanizeMs: minutes/hours/days", () => {
  assert.equal(humanizeMs(120_000), "2m 0s");
  assert.equal(humanizeMs(3_600_000), "1h 0m");
  assert.equal(humanizeMs(86_400_000), "1d 0h");
});

test("[ops-health] humanizeMs: non-finite → 0s", () => {
  assert.equal(humanizeMs(Number.NaN), "0s");
  assert.equal(humanizeMs(-1), "0s");
});

// ---------- normalizeFeatures ----------

test("[ops-health] normalizeFeatures coerces to bools", () => {
  const out = normalizeFeatures({ a: 1, b: "yes", c: 0, d: null, e: undefined, f: true });
  assert.equal(out.a, true);
  assert.equal(out.b, true);
  assert.equal(out.c, false);
  assert.equal(out.d, false);
  assert.equal(out.e, false);
  assert.equal(out.f, true);
});

test("[ops-health] normalizeFeatures handles null/undefined", () => {
  assert.deepEqual(normalizeFeatures(null), {});
  assert.deepEqual(normalizeFeatures(undefined), {});
});

// ---------- normalizeSignals ----------

test("[ops-health] normalizeSignals keeps cheap scalar signal objects", () => {
  const out = normalizeSignals({
    screenplay_page_write: {
      status: "warning",
      sampleReady: true,
      pageRequestedCount: 8,
      pageAcceptanceRate: 0.625,
      nested: { reason: "low_page_acceptance" },
    },
  });
  assert.deepEqual(out.screenplay_page_write, {
    status: "warning",
    sampleReady: true,
    pageRequestedCount: 8,
    pageAcceptanceRate: 0.625,
    nested: { reason: "low_page_acceptance" },
  });
});

test("[ops-health] resolveSignals catches signal supplier failures", () => {
  const out = resolveSignals(() => { throw new Error("boom"); });
  assert.equal(out.ops_health_signals.status, "error");
  assert.equal(out.ops_health_signals.reason, "derive_failed");
});

// ---------- endpoint integration ----------

async function withTestServer(fn, opts = {}) {
  const app = express();
  mountOpsHealthSummaryRoute(app, opts);
  const server = listenEphemeral(app);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.json().catch(() => null) };
}

test("[ops-health] GET /ops/health-summary returns schemaVersion and status", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/ops/health-summary");
    assert.equal(r.status, 200);
    assert.equal(r.body.schemaVersion, OPS_HEALTH_SUMMARY_SCHEMA_VERSION);
    assert.equal(r.body.status, "unknown");
    assert.ok(Array.isArray(r.body.reasons));
    assert.ok(typeof r.body.uptimeMs === "number");
    assert.ok(typeof r.body.uptimeHuman === "string");
    assert.equal(r.body.node.version, process.version);
    assert.deepEqual(r.body.features, {});
    assert.deepEqual(r.body.signals, {});
  });
});

test("[ops-health] features map flows through to the response", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/ops/health-summary");
      assert.equal(r.body.features.creative_memory, true);
      assert.equal(r.body.features.block_signal, true);
      assert.equal(r.body.features.experimental_x, false);
    },
    {
      features: { creative_memory: true, block_signal: true, experimental_x: false },
    },
  );
});

test("[ops-health] deriveBackendStatus throwing → status='error'", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/ops/health-summary");
      assert.equal(r.body.status, "error");
      assert.match(r.body.reasons[0], /boom/);
    },
    {
      deriveBackendStatus: () => { throw new Error("boom"); },
    },
  );
});

test("[ops-health] signals function flows through to the response", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/ops/health-summary");
      assert.equal(r.body.signals.screenplay_page_write.status, "warning");
      assert.equal(r.body.signals.screenplay_page_write.reason, "low_page_acceptance");
      assert.equal(r.body.signals.screenplay_page_write.pageRequestedCount, 8);
    },
    {
      signals: () => ({
        screenplay_page_write: {
          status: "warning",
          reason: "low_page_acceptance",
          pageRequestedCount: 8,
        },
      }),
    },
  );
});

test("[ops-health] Cache-Control: no-store on every response", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/ops/health-summary");
    assert.equal(r.headers["cache-control"], "no-store");
  });
});

test("[ops-health] uptimeMs reflects startedAtMs offset", async () => {
  const t0 = Date.now() - 10_000;
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/ops/health-summary");
      assert.ok(r.body.uptimeMs >= 9000, `uptime too low: ${r.body.uptimeMs}`);
    },
    { startedAtMs: t0 },
  );
});

test("[ops-health] mountOpsHealthSummaryRoute requires an Express app", () => {
  assert.throws(() => mountOpsHealthSummaryRoute(null));
});
