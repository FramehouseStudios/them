import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");

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

const prompt = "Write exactly this Hollywood-format screenplay block and nothing else: INT. KITCHEN - DAY\\n\\nLUCY\\nI can do this.\\n\\nFRANK\\nMove now.";
runSmoke({
  STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
  STUDIO_CMDRETURN_FIRST_PROMPT: prompt,
});

const result = readDefaultsJSON("studio_debug_voice_turn_result_json");
const inserted = String(result?.insertedPreview || "").trim();
const lines = inserted.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

assert(lines.some((line) => /^INT\./.test(line)), "Hollywood line-type smoke did not keep a scene heading");
assert(lines.some((line) => line === line.toUpperCase() && /^[A-Z0-9 '()\-]+$/.test(line) && !line.includes(".")), "Hollywood line-type smoke did not keep a character cue");
assert(lines.some((line) => /[a-z]/.test(line) && !/^INT\./.test(line)), "Hollywood line-type smoke did not keep mixed-case dialogue/action text");

console.log("voice Hollywood line-type smoke passed");
