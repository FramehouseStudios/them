// T-provider-spend-cap — release preflight requires a positive spend cap. This
// is a DEPLOY-time gate, separate from runtime boot, so the cap stays optional
// in dev and tests.

import test from "node:test";
import assert from "node:assert/strict";

import { assertReleaseConfig } from "../config.js";

test("[assertReleaseConfig] requires a positive PROVIDER_DAILY_USD_CAP", () => {
  assert.throws(() => assertReleaseConfig({}), /PROVIDER_DAILY_USD_CAP/);
  assert.throws(() => assertReleaseConfig({ PROVIDER_DAILY_USD_CAP: "" }), /PROVIDER_DAILY_USD_CAP/);
  assert.throws(() => assertReleaseConfig({ PROVIDER_DAILY_USD_CAP: "0" }), /PROVIDER_DAILY_USD_CAP/);
  assert.throws(() => assertReleaseConfig({ PROVIDER_DAILY_USD_CAP: "-1" }), /PROVIDER_DAILY_USD_CAP/);
  assert.throws(() => assertReleaseConfig({ PROVIDER_DAILY_USD_CAP: "abc" }), /PROVIDER_DAILY_USD_CAP/);
});

test("[assertReleaseConfig] passes with a positive cap", () => {
  assert.doesNotThrow(() => assertReleaseConfig({ PROVIDER_DAILY_USD_CAP: "5" }));
  assert.doesNotThrow(() => assertReleaseConfig({ PROVIDER_DAILY_USD_CAP: "2.5" }));
});
