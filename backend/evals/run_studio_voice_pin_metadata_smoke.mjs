import { spawnSync } from "node:child_process";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND_DIR = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return (result.stdout || "").trim();
}

function extractMarkedJSON(text, marker) {
  const line = String(text || "")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${marker} `));
  if (!line) {
    throw new Error(`Missing ${marker} marker in smoke output`);
  }
  return JSON.parse(line.slice(marker.length + 1));
}

const voicePrompt = String(
  process.env.STUDIO_CMDRETURN_VOICE_PROMPT
  || "Write one tense screenplay action line: She reaches the door before he can answer. That's it."
).trim();

const smoke = run(
  "node",
  ["evals/run_studio_cmdreturn_smoke.mjs"],
  {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
      STUDIO_CMDRETURN_REQUIRE_THREAD_ENTRY: "1",
      STUDIO_CMDRETURN_THREAD_ENTRY_TIMEOUT_MS: process.env.STUDIO_CMDRETURN_THREAD_ENTRY_TIMEOUT_MS || "25000",
      STUDIO_CMDRETURN_VOICE_PROMPT: voicePrompt,
    },
  }
);

const payload = extractMarkedJSON(smoke, "__STUDIO_CMDRETURN_RESULT__");
const latestEntry = payload?.latestEntry || null;
assert(payload?.ok === true, "Studio Voice Pin metadata smoke did not report ok=true");
assert(latestEntry && typeof latestEntry === "object", "Studio Voice Pin metadata smoke did not produce a latest thread entry");
assert(String(latestEntry.source || "").trim().toLowerCase() === "voice", "Studio Voice Pin metadata smoke latest entry was not recorded as a voice turn");
assert(String(latestEntry.target || "").trim().toLowerCase() === "page", "Studio Voice Pin metadata smoke latest entry did not land on the page target");

const phase = String(latestEntry.phase || "").trim();
const packLabel = String(latestEntry.packLabel || "").trim();
const sluglineAnchorLine = Number(latestEntry.sluglineAnchorLine || 0);

assert(phase.length > 0, "Studio Voice Pin metadata smoke latest entry is missing phase");
assert(packLabel.length > 0, "Studio Voice Pin metadata smoke latest entry is missing packLabel");
assert(
  Number.isInteger(sluglineAnchorLine) && sluglineAnchorLine > 0,
  `Studio Voice Pin metadata smoke latest entry has invalid sluglineAnchorLine: ${latestEntry.sluglineAnchorLine}`
);

const result = {
  ok: true,
  throwawayProjectId: payload.throwawayProjectId || "",
  voicePrompt,
  voiceTurn: payload.voiceTurn || "",
  requestID: latestEntry.requestID || "",
  phase,
  packLabel,
  sluglineAnchorLine,
  latestEntrySource: latestEntry.source || "",
  latestEntryTarget: latestEntry.target || "",
};

console.log(JSON.stringify(result, null, 2));
console.log(`__STUDIO_VOICE_PIN_METADATA_RESULT__ ${JSON.stringify(result)}`);
console.log("studio-voice-pin-metadata-smoke: ok");
