import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const smokeSource = readFileSync(
  new URL("../evals/run_cross_platform_learned_memory_ui_smoke.mjs", import.meta.url),
  "utf8",
);
const uiTestSource = readFileSync(
  new URL("../../themUITests/V1SmokeUITests.swift", import.meta.url),
  "utf8",
);

test("[cross-platform-memory-ui-smoke] proves the complete device handoff", () => {
  assert.match(smokeSource, /THEM_LEARNED_MEMORY_UI_PLATFORM \|\| "all"/);
  assert.match(smokeSource, /handoffStage: "iphone_source"/);
  assert.match(smokeSource, /handoffStage: "mac_repair"/);
  assert.match(smokeSource, /handoffStage: "iphone_round_trip"/);
  assert.match(
    smokeSource,
    /handoffStages: PLATFORM === "all"\s*\? \["iphone_source", "mac_repair", "iphone_round_trip"\]/,
  );
  assert.match(smokeSource, /await server\.stop\(\);[\s\S]*startBackend\(\{ port: PORT, dataDir/);
  assert.match(smokeSource, /Number\(summary\?\.totalTestCount\) === 1/);
  assert.match(smokeSource, /Number\(summary\?\.passedTests\) === 1/);
  assert.match(smokeSource, /Number\(summary\?\.skippedTests\) === 0/);
});

test("[cross-platform-memory-ui-smoke] learns and corrects through production UI behavior", () => {
  assert.doesNotMatch(smokeSource, /\/memories\/story-preferences\/update/);
  assert.match(uiTestSource, /That did not help\. I am still stuck\. Try a different move\./);
  assert.match(uiTestSource, /assertIPhoneRescueRejectionPersists/);
  assert.match(uiTestSource, /assertMacAdaptsAndCorrectsRescue/);
  assert.match(uiTestSource, /assertIPhoneReceivesCorrectionAndProtectsCanon/);
  assert.match(
    uiTestSource,
    /studio\.story-preference\.\\\(fixture\.preferenceFamily\)\.prefer/,
  );
  assert.match(uiTestSource, /macOS did not expose the real prefer correction control/);
  assert.match(uiTestSource, /Due canon did not outrank the corrected cross-device instinct/);
  assert.match(uiTestSource, /assertLearnedMemoryFields\(fixture/);
});

test("[cross-platform-memory-ui-smoke] preserves failed evidence after explicit correction", () => {
  assert.match(smokeSource, /assertCorrectedRescueSurvived/);
  assert.match(smokeSource, /item\?\.family === "reversal_pressure" && item\?\.stance === "prefer"/);
  assert.match(smokeSource, /Number\(item\?\.failedRescueCount \|\| 0\) >= 1/);
  assert.match(smokeSource, /canonRescueFamily: "payoff_pressure"/);
});
