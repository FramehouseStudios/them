import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const cancelKey = "studio_debug_cancel_synced_voice_insert_after_ms";

function runSmoke(extraEnv = {}) {
  execFileSync(
    process.execPath,
    [path.join("evals", "run_studio_cmdreturn_smoke.mjs")],
    {
      cwd: backendDir,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
    },
  );
}

function readDefaultsJSON(key) {
  const raw = execFileSync("defaults", ["read", "io.them.them", key], {
    encoding: "utf8",
  }).trim();
  return JSON.parse(raw);
}

try {
  execFileSync("defaults", ["write", "io.them.them", cancelKey, "-int", "850"], { stdio: "inherit" });
  const prompt = "Write a slightly longer screenplay page with three short beats, two cues, and dialogue so the synced insert has time to start.";
  runSmoke({
    STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
    STUDIO_CMDRETURN_FIRST_PROMPT: prompt,
  });

  const result = readDefaultsJSON("studio_debug_voice_turn_result_json");
  const breadcrumbs = Array.isArray(result?.breadcrumbs) ? result.breadcrumbs : [];
  const events = breadcrumbs.map((entry) => String(entry?.event || ""));

  assert(events.includes("synced_insert_started"), "Voice cancel smoke did not start a synced insert");
  assert(events.includes("synced_insert_cancelled"), "Voice cancel smoke did not record synced insert cancellation");
  console.log("voice barge-in cancel smoke passed");
} finally {
  execFileSync("defaults", ["write", "io.them.them", cancelKey, "-int", "0"], { stdio: "inherit" });
}
