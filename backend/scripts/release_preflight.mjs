#!/usr/bin/env node
//
// release_preflight.mjs — deploy-time gate for production release configuration
// that is NOT enforced at runtime boot (so it stays optional in dev + tests).
// Runs as part of the render.yaml preDeployCommand; a non-zero exit fails the
// deploy visibly. Currently asserts a positive PROVIDER_DAILY_USD_CAP.

import { assertReleaseConfig } from "../config.js";

try {
  assertReleaseConfig(process.env);
  console.log("release preflight: ok");
} catch (err) {
  console.error(err?.message || err);
  process.exit(1);
}
