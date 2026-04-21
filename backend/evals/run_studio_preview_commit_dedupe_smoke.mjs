import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runOptional(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function readDefaultString(key) {
  const result = runOptional("defaults", ["read", "io.them.them", key]);
  return result.status === 0 ? result.stdout.trim() : "";
}

function readDebugDiffState() {
  const raw = readDefaultString("studio_debug_diff_state_json");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStudioAskNoteHistoryMap() {
  const raw = readDefaultString("studio.ask.note.history.v2");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function countOccurrences(haystack, needle) {
  if (!haystack || !needle) return 0;
  let count = 0;
  let start = 0;
  while (start <= haystack.length) {
    const index = haystack.indexOf(needle, start);
    if (index === -1) break;
    count += 1;
    start = index + needle.length;
  }
  return count;
}

function parseSmokeResult(stdout) {
  const marker = "__STUDIO_CMDRETURN_RESULT__ ";
  const line = String(stdout || "")
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(marker));
  assert(line, "Preview/commit smoke did not emit a cmd-return result payload");
  return JSON.parse(line.slice(marker.length));
}

const smokePath = fileURLToPath(new URL("./run_studio_cmdreturn_smoke.mjs", import.meta.url));
const child = runOptional("node", [smokePath], {
  env: {
    ...process.env,
    STUDIO_CMDRETURN_SCENARIO: "voice-early-paint",
    STUDIO_CMDRETURN_REQUIRE_THREAD_ENTRY: "false",
    STUDIO_CMDRETURN_REQUIRE_TALK_RESPONSE: "1",
    STUDIO_CMDRETURN_ALLOW_MISSING_EARLY_COMMIT: "1",
    STUDIO_CMDRETURN_RELAX_EARLY_PREVIEW_ASSERTS: "1",
    STUDIO_CMDRETURN_MIN_RENDER_FIRST_DELTA_MS: "0",
    STUDIO_CMDRETURN_VOICE_PROMPT: "Write three tense screenplay lines: She reaches the door before he can answer. That's it.",
  },
});

if (child.status !== 0) {
  throw new Error((child.stderr || child.stdout || "preview/commit smoke failed").trim());
}

const result = parseSmokeResult(child.stdout);
assert(result?.ok, "Preview/commit smoke did not finish cleanly");

const projectKey = String(result.projectKey || "").trim();
assert(projectKey, "Preview/commit smoke did not surface a project key");

const latestEntry = result.latestEntry || {};
if (latestEntry && Object.keys(latestEntry).length > 0) {
  assert(normalizeKey(latestEntry.target) === "page", "Preview/commit smoke did not land on the page target");
}

const headerReplyPreview = normalizeText(result.voiceTurnMeta?.reply || "");
const insertedText = normalizeText(latestEntry.insertedText || result.voiceResult?.insertedPreview || "");
assert(insertedText, "Preview/commit smoke did not surface inserted page text");
assert(headerReplyPreview, "Preview/commit smoke did not surface a reply preview");
assert(
  headerReplyPreview !== insertedText,
  "Preview/commit smoke still surfaced the full page block through the reply preview"
);
assert(
  insertedText.startsWith(headerReplyPreview),
  `Preview/commit smoke reply preview was not a prefix of the committed page block.\nPreview: ${headerReplyPreview}\nInserted: ${insertedText}`
);

const diffState = readDebugDiffState();
assert(diffState, "Preview/commit smoke could not read studio debug diff state");

const draftPreview = normalizeText(diffState?.draftPreview || "");
const draftTailPreview = normalizeText(diffState?.draftTailPreview || "");
const exactPreviewMatches = [draftPreview, draftTailPreview].filter(Boolean).filter((preview) => preview === insertedText);
assert(
  exactPreviewMatches.length >= 1,
  `Preview/commit smoke draft preview did not settle to the inserted block.\nInserted: ${insertedText}\nPreview: ${draftPreview}\nTail: ${draftTailPreview}`
);

assert(
  countOccurrences(draftPreview, insertedText) <= 1 && countOccurrences(draftTailPreview, insertedText) <= 1,
  "Preview/commit smoke found duplicate inserted text in the final draft preview"
);

const historyMap = readStudioAskNoteHistoryMap();
const projectEntries = Array.isArray(historyMap[projectKey]) ? historyMap[projectKey] : [];
const pageEntries = projectEntries.filter((entry) => normalizeKey(entry?.target) === "page");
const matchingPageEntries = pageEntries.filter((entry) => normalizeText(entry?.insertedText || entry?.noteBody || "") === insertedText);
if (pageEntries.length > 0) {
  assert(pageEntries.length === 1, `Expected exactly one page-thread entry for ${projectKey}, found ${pageEntries.length}`);
  assert(
    matchingPageEntries.length === 1,
    `Expected exactly one persisted page entry for the inserted block, found ${matchingPageEntries.length}`
  );
}

const summary = {
  ok: true,
  projectKey,
  voiceTurn: result.voiceTurn,
  replyPreview: headerReplyPreview.slice(0, 220),
  insertedPreview: insertedText.slice(0, 220),
  pageEntryCount: pageEntries.length,
  matchingPageEntryCount: matchingPageEntries.length,
  historyPersisted: pageEntries.length > 0,
  draftPreviewMatches: exactPreviewMatches.length,
};

console.log(JSON.stringify(summary, null, 2));
console.log(`__STUDIO_PREVIEW_COMMIT_RESULT__ ${JSON.stringify(summary)}`);
console.log("studio-preview-commit-dedupe-smoke: ok");
