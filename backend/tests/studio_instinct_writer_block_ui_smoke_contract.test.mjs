import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const smokeSource = readFileSync(
  new URL("../evals/run_studio_instinct_writer_block_ui_smoke.mjs", import.meta.url),
  "utf8",
);
const packageJSON = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const iosScheme = readFileSync(
  new URL("../../them.xcodeproj/xcshareddata/xcschemes/them.xcscheme", import.meta.url),
  "utf8",
);
const macosScheme = readFileSync(
  new URL("../../them.xcodeproj/xcshareddata/xcschemes/them-macOS-scaffold.xcscheme", import.meta.url),
  "utf8",
);

test("[studio-instinct-ui-smoke] defaults to the paired iPhone and macOS contract", () => {
  assert.match(
    smokeSource,
    /THEM_STUDIO_INSTINCT_UI_PLATFORM \|\| "all"/,
  );
  assert.match(
    smokeSource,
    /const platforms = PLATFORM === "all" \? \["ios", "macos"\] : \[PLATFORM\]/,
  );
  assert.match(
    smokeSource,
    /test_studio_writer_block_rescue_follows_instinct_then_protects_due_canon/,
  );
  assert.doesNotMatch(smokeSource, /Executed 0 tests/);
  assert.match(smokeSource, /did not execute/);
  assert.match(smokeSource, /studio-instinct-writer-block/);
  assert.match(smokeSource, /01-baseline/);
  assert.match(smokeSource, /02-rescue-rejected/);
  assert.match(smokeSource, /03-relaunch-adapted/);
  assert.match(smokeSource, /04-repaired-rescue-learned/);
  assert.match(smokeSource, /05-other-act-unaffected/);
  assert.match(smokeSource, /06-explicit-correction/);
  assert.match(smokeSource, /07-canon-protected/);
  assert.match(smokeSource, /rejectedPreferenceFamily: "reversal_pressure"/);
  assert.match(smokeSource, /repairedPreferenceFamily: "relationship_pressure"/);
  assert.match(smokeSource, /repairMemoryLine: "I remember the last reversal did not get you moving here"/);
  assert.match(smokeSource, /otherActStrongestMove: "Ranked strongest move - reversal pressure"/);
  assert.match(smokeSource, /rescueAcceptedPage: RESCUE_ACCEPTED_PAGE/);
  assert.match(smokeSource, /act_position: "Act II"/);
  assert.match(smokeSource, /did not write/);
  assert.match(smokeSource, /stageMatch/);
  assert.match(smokeSource, /xcresulttool", "export", "attachments/);
  assert.match(smokeSource, /xcresulttool", "get", "test-results", "summary/);
  assert.match(smokeSource, /Number\(summary\?\.passedTests\) === 1/);
  assert.match(smokeSource, /Number\(summary\?\.skippedTests\) === 0/);
  for (const scheme of [iosScheme, macosScheme]) {
    assert.match(scheme, /key = "THEM_UITEST_STUDIO_INSTINCT_FIXTURE_BASE64URL"/);
    assert.match(scheme, /value = "\$\(THEM_UITEST_STUDIO_INSTINCT_FIXTURE_BASE64URL\)"/);
  }
});

test("[studio-instinct-ui-smoke] gives each platform an isolated writer account", () => {
  assert.match(smokeSource, /for \(const platform of platforms\)/);
  assert.match(smokeSource, /emailPrefix: `studio-instinct-ui-\$\{platform\}`/);
  assert.match(smokeSource, /await seedProject\(server, identity\)/);
  assert.doesNotMatch(smokeSource, /emailPrefix: "studio-instinct-ui"/);
});

test("[studio-instinct-ui-smoke] explicitly opts the real UI flow into its local backend", () => {
  const launchConfiguration = readFileSync(
    new URL("../../them/UITestLaunchConfiguration.swift", import.meta.url),
    "utf8",
  );
  const studioSource = readFileSync(
    new URL("../../them/ScreenplayStudioScreen.swift", import.meta.url),
    "utf8",
  );
  const rootExperienceSource = readFileSync(
    new URL("../../them/RootExperienceView.swift", import.meta.url),
    "utf8",
  );
  const uiTestSource = readFileSync(
    new URL("../../themUITests/V1SmokeUITests.swift", import.meta.url),
    "utf8",
  );

  assert.match(
    launchConfiguration,
    /copyLaunchArgumentValue\("studio_debug_submit_transport_mode"/,
  );
  assert.match(
    studioSource,
    /IOThemRuntime\.isRunningUITests && !shouldUseBackendStudioPromptTransportForDebugSubmit/,
  );
  assert.match(
    studioSource,
    /uiTestLaunchArgumentValue\(\s*"-studio_debug_submit_transport_mode"/,
  );
  assert.match(
    rootExperienceSource,
    /firstIndex\(of: "-studio_debug_submit_transport_mode"\)/,
  );
  assert.match(rootExperienceSource, /debugStudioPromptTransportMode == "live-backend"/);
  assert.match(
    rootExperienceSource,
    /BackendDefaultBaseURLPolicy\.currentUITestOverrideBaseURL/,
  );
  assert.match(uiTestSource, /submitTransportMode: "live-backend"/);
  assert.match(uiTestSource, /That did not help\. I am still stuck\. Try a different move\./);
  assert.match(uiTestSource, /app\.terminate\(\)\s*\n\s*app = launchStudio\(\)/);
  assert.match(uiTestSource, /setStudioStoryPosition\(\s*\n\s*act: "Act I"/);
  assert.match(uiTestSource, /setStudioStoryPosition\(\s*\n\s*act: "Act II"/);
  assert.match(uiTestSource, /did not unblock you/);
  assert.match(uiTestSource, /will not repeat this move/);
  assert.match(uiTestSource, /Due canon did not outrank the corrected creative instinct/);
});

test("[studio-instinct-ui-smoke] keeps editor alignment gaps out of narrative setup canon", () => {
  const rootExperienceSource = readFileSync(
    new URL("../../them/RootExperienceView.swift", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(rootExperienceSource, /Unbound draft scene:/);
  assert.match(rootExperienceSource, /Draft-outline alignment pending:/);
  assert.match(
    rootExperienceSource,
    /var promptUnresolvedSetups = featureSpine\.unresolvedSetups/,
  );
});

test("[studio-instinct-ui-smoke] keeps explicit single-platform diagnostics", () => {
  assert.equal(
    packageJSON.scripts["eval:studio-instinct-writer-block-ui:ios"],
    "THEM_STUDIO_INSTINCT_UI_PLATFORM=ios node evals/run_studio_instinct_writer_block_ui_smoke.mjs",
  );
  assert.equal(
    packageJSON.scripts["eval:studio-instinct-writer-block-ui:macos"],
    "THEM_STUDIO_INSTINCT_UI_PLATFORM=macos node evals/run_studio_instinct_writer_block_ui_smoke.mjs",
  );
});
