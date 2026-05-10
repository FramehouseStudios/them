import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const cancelKey = "studio_debug_cancel_synced_voice_insert_after_ms";

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

function readDefaultsJSON(key) {
  const raw = execFileSync("defaults", ["read", "io.them.them", key], {
    encoding: "utf8",
  }).trim();
  return JSON.parse(raw);
}

function parseResult(output) {
  const marker = "__STUDIO_CMDRETURN_RESULT__ ";
  const line = String(output || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(marker));
  assert(line, "Voice cancel smoke did not emit a structured Studio result");
  return JSON.parse(line.slice(marker.length));
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

try {
  execFileSync("defaults", ["write", "io.them.them", cancelKey, "-int", "850"], { stdio: "inherit" });
  const prompt = "Write a slightly longer screenplay page with three short beats, two cues, and dialogue so the synced insert has time to start.";
  const output = runSmoke({
    STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
    STUDIO_CMDRETURN_FIRST_PROMPT: prompt,
  });
  process.stdout.write(output);

  const structuredResult = parseResult(output);
  const persistedVoiceResult = readDefaultsJSON("studio_debug_voice_turn_result_json");
  const breadcrumbs = Array.isArray(persistedVoiceResult?.breadcrumbs) ? persistedVoiceResult.breadcrumbs : [];
  const events = breadcrumbs.map((entry) => String(entry?.event || ""));
  const cancelBreadcrumb = breadcrumbs.find((entry) => String(entry?.event || "") === "synced_insert_cancelled") || null;
  const diffState = readDefaultsJSON("studio_debug_diff_state_json");
  const visibleDraft = normalizeText(`${diffState?.draftPreview || ""}\n${diffState?.draftTailPreview || ""}`);
  const insertedPreview = normalizeText(
    structuredResult?.voiceResult?.insertedPreview
    || persistedVoiceResult?.insertedPreview
    || ""
  );

  assert(events.includes("synced_insert_started"), "Voice cancel smoke did not start a synced insert");
  assert(events.includes("synced_insert_cancelled"), "Voice cancel smoke did not record synced insert cancellation");
  assert.equal(
    String(cancelBreadcrumb?.interruptionReason || persistedVoiceResult?.syncedInsertInterruptionReason || "").trim(),
    "cancel",
    "Voice cancel smoke did not emit the explicit cancel interruption reason"
  );
  assert.equal(
    String(diffState?.selectedProjectID || "").trim(),
    String(structuredResult?.throwawayProjectId || "").trim(),
    "Voice cancel smoke drifted away from the throwaway Studio project"
  );
  assert.equal(visibleDraft, "", `Voice cancel smoke left screenplay text behind after cancellation: ${visibleDraft}`);
  if (insertedPreview) {
    assert(
      !visibleDraft.includes(insertedPreview),
      "Voice cancel smoke left a partial synced insert fragment on the page"
    );
  }
  console.log("voice barge-in cancel smoke passed");
} finally {
  execFileSync("defaults", ["write", "io.them.them", cancelKey, "-int", "0"], { stdio: "inherit" });
}
