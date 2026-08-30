import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const BACKEND_DIR = fileURLToPath(new URL("..", import.meta.url));

test("authenticated cross-platform question cadence survives relaunch", () => {
  const result = spawnSync(
    process.execPath,
    ["evals/run_cross_platform_question_cadence_smoke.mjs"],
    {
      cwd: BACKEND_DIR,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
      env: process.env,
    }
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /"sourceDevice":"iPhone"/);
  assert.match(output, /"restoredDevice":"macOS"/);
  assert.match(output, /"backendRestarted":true/);
  assert.match(output, /"distinctClientSessions":true/);
  assert.match(output, /"liveTalkResolution":true/);
  assert.match(output, /"answeredOutcome":"accepted_pages"/);
  assert.match(output, /"ignoredOutcome":"ignored"/);
  assert.match(output, /"cadenceMinutes":45/);
  assert.match(output, /"duplicateResolvedQuestion":false/);
  assert.match(output, /cross-platform-question-cadence-smoke: ok/);
  assert.doesNotMatch(output, /accessToken|clientToken|Authorization|Bearer\s|password|@example\.test/i);
});
