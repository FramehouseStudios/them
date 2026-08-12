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

test("[studio-instinct-ui-smoke] defaults to the paired iPhone and macOS contract", () => {
  assert.match(
    smokeSource,
    /THEM_STUDIO_INSTINCT_UI_PLATFORM \|\| "all"/,
  );
  assert.match(smokeSource, /if \(PLATFORM !== "macos"\)/);
  assert.match(smokeSource, /if \(PLATFORM !== "ios"\)/);
  assert.match(
    smokeSource,
    /test_studio_writer_block_rescue_follows_instinct_then_protects_due_canon/,
  );
  assert.match(smokeSource, /Executed 0 tests/);
  assert.match(smokeSource, /did not execute/);
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
