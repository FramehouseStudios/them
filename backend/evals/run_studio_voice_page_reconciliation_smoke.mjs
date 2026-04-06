import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");

function runSmoke(extraEnv = {}) {
  return execFileSync(
    process.execPath,
    [path.join("evals", "run_studio_cmdreturn_smoke.mjs")],
    {
      cwd: backendDir,
      env: { ...process.env, ...extraEnv },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function parseResult(output) {
  const marker = "__STUDIO_CMDRETURN_RESULT__ ";
  const line = String(output || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(marker));
  assert(line, "Voice page reconciliation smoke did not emit a structured Studio result");
  return JSON.parse(line.slice(marker.length));
}

function readDefaultsJSON(key) {
  try {
    const raw = execFileSync("defaults", ["read", "io.them.them", key], {
      encoding: "utf8",
    }).trim();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const prompt = "Write exactly this screenplay block and nothing else: INT. DINER - NIGHT\\n\\nLUCY\\nI can do this.\\n\\nFRANK\\nMove.";
const output = runSmoke({
  STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
  STUDIO_CMDRETURN_REQUIRE_TALK_RESPONSE: "1",
  STUDIO_CMDRETURN_REQUIRE_THREAD_ENTRY: "1",
  STUDIO_CMDRETURN_THREAD_ENTRY_TIMEOUT_MS: "25000",
  STUDIO_CMDRETURN_VOICE_PROMPT: prompt,
});

process.stdout.write(output);

const result = parseResult(output);
const token = Number(result?.commandReceivedToken || result?.voiceResult?.token || 0);
const tokenSnapshot = token > 0
  ? readDefaultsJSON(`studio_debug_voice_turn_result_json_${token}`)
  : null;
const screenplayOutput = result?.voiceTurnMeta?.screenplay_output || {
  target: String(tokenSnapshot?.screenplayOutputTarget || "").trim(),
  text: String(tokenSnapshot?.screenplayOutputText || "").trim(),
};
const timingSource = String(
  result?.voiceTurnMeta?.timing_source
  || tokenSnapshot?.timingSource
  || ""
).trim();
const screenplayText = String(screenplayOutput?.text || "").trim();
const latestEntryText = String(result?.latestEntry?.insertedText || "").trim();
const previewText = String(result?.voiceResult?.insertedPreview || tokenSnapshot?.insertedPreview || "").trim();
const finalCommittedPageText = String(
  result?.finalCommittedPageText
  || tokenSnapshot?.finalCommittedPageText
  || result?.voiceResult?.finalCommittedPageText
  || ""
).trim();

assert.equal(String(screenplayOutput?.target || "").trim(), "page", "Voice page reconciliation smoke did not target the page");
assert.equal(timingSource, "tts_segmented", `Voice page reconciliation smoke expected tts_segmented timing source, got ${timingSource || "empty"}`);
assert(screenplayText, "Voice page reconciliation smoke did not persist screenplay_output.text");
assert(latestEntryText, "Voice page reconciliation smoke did not persist final page text");
assert(finalCommittedPageText, "Voice page reconciliation smoke did not surface the final committed page text");
assert.equal(latestEntryText, screenplayText, "Voice page reconciliation smoke final committed page text drifted from screenplay_output.text");
assert.equal(finalCommittedPageText, screenplayText, "Voice page reconciliation smoke committed page block drifted from screenplay_output.text");
assert.equal(previewText, screenplayText, "Voice page reconciliation smoke preview text drifted from screenplay_output.text");

console.log("voice page reconciliation smoke passed");
