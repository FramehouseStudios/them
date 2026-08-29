import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evalFiles = [
  "backend/evals/run_studio_voice_pin_metadata_smoke.mjs",
  "backend/evals/run_studio_voice_visual_smoke.mjs",
  "backend/evals/run_studio_shell_visual_smoke.mjs",
];

test("[studio-eval-paths] release smokes resolve the backend from their checked-out module", () => {
  for (const relative of evalFiles) {
    const source = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    assert.doesNotMatch(source, /\/Users\/|\/home\/[^/]+\//, relative);
    assert.match(source, /fileURLToPath\(import\.meta\.url\)/, relative);
    assert.match(source, /nodePath\.resolve\(nodePath\.dirname/, relative);
  }
});
