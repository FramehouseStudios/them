#!/usr/bin/env node
//
// T-ops-health-summary-eval — pin the canonical features map and
// envelope shape of GET /ops/health-summary.
//
// PR #134 ships the route + unit tests. This eval pins the
// **specific list of features** that the production deployment
// advertises, so a future refactor that removes a feature (or
// silently flips one off) fails loudly.
//
// Distinct from the unit tests (which exercise the helper) because
// this is the deployment-level contract: which surfaces is this
// build claiming to mount?

import process from "node:process";
import express from "express";
import { mountOpsHealthSummaryRoute } from "../lib/ops_health_summary_route.js";

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

// Mirror of the features map index.js wires up. Keep in lockstep
// with the production mount in backend/index.js.
const EXPECTED_FEATURES = [
  "creative_memory",
  "block_signal",
  "block_signal_history",
  "talk_pipeline",
  "screenplay_export_markdown",
  "screenplay_export_formats",
];

async function withTestServer(fn) {
  const app = express();
  mountOpsHealthSummaryRoute(app, {
    deriveBackendStatus: () => ({ status: "ok", reasons: [] }),
    features: Object.fromEntries(EXPECTED_FEATURES.map((k) => [k, true])),
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(baseURL);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

await withTestServer(async (baseURL) => {
  const r = await fetch(`${baseURL}/ops/health-summary`);
  const body = await r.json();
  check("HTTP 200", r.status === 200);
  check("Cache-Control: no-store", r.headers.get("cache-control") === "no-store");
  check("schemaVersion present", body.schemaVersion === 1);
  check("status is ok", body.status === "ok");
  check("reasons is empty array", Array.isArray(body.reasons) && body.reasons.length === 0);
  check("uptimeMs is a number", typeof body.uptimeMs === "number");
  check("uptimeHuman is a string", typeof body.uptimeHuman === "string");
  check("node.version is set", typeof body.node?.version === "string");
  check("node.platform is set", typeof body.node?.platform === "string");
  // Features contract.
  const actualKeys = Object.keys(body.features || {}).sort();
  const expectedKeys = [...EXPECTED_FEATURES].sort();
  check(
    "features contains exactly the canonical key set",
    JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
    `actual:   ${actualKeys.join(", ")}\nexpected: ${expectedKeys.join(", ")}`,
  );
  for (const k of EXPECTED_FEATURES) {
    check(`features.${k} === true`, body.features?.[k] === true);
  }
});

if (!allOK) {
  console.error("ops-health-summary eval: FAILED");
  process.exit(1);
}
console.log("ops-health-summary eval: OK");
