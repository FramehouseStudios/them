#!/usr/bin/env node
//
// Screenplay quality prompt eval — deterministic fixture coverage for
// Clementine's expert screenwriting brain.
//
// This eval does not call an LLM. It verifies that canonical prompt
// assembly gives the model the right feature-film obligations before
// generation: Act I/II/III continuity, scene execution, subtext,
// image-system payoffs, page-first speed discipline, and task routing.
// Same JSON fixtures + pure functions => same result every run.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildModelPrompt,
  inferScreenplayTask,
  FEATURE_MAP_BLOCK_OPEN,
  SCREENPLAY_TASK_BLOCK_OPEN,
} from "../lib/prompt_assembly.js";
import { fitSystemPromptForTurnLatency } from "../lib/system_prompt_trim.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CASES_PATH = path.join(__dirname, "screenplay_quality_cases.json");
const DEFAULT_PERSONA = "You are Clementine, an emotionally intelligent cinematic writing partner for feature screenwriters.";
const REQUIRED_INTENTS = new Set([
  "finish_feature",
  "rewrite_scene",
  "continue_script",
  "dialogue_punchup",
  "scene_doctor",
]);
const REQUIRED_ACT_LABELS = ["Act I", "Act II", "Act III"];

let allOK = true;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    allOK = false;
    console.error(`FAIL  ${label}${detail ? `\n  ${detail}` : ""}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function includesCaseInsensitive(text, needle) {
  return String(text || "").toLowerCase().includes(String(needle || "").toLowerCase());
}

function buildPromptForCase(item) {
  const taskHint = String(item.screenplayTaskHint || item.userInput || "").trim();
  const screenplayTask = inferScreenplayTask(taskHint);
  const prompt = buildModelPrompt({
    persona: String(item.persona || DEFAULT_PERSONA),
    sessionContext: item.sessionContext && typeof item.sessionContext === "object"
      ? item.sessionContext
      : null,
    screenplayTask,
    userInput: String(item.userInput || ""),
  });
  return { prompt, screenplayTask };
}

function validateCoverage(cases) {
  const ids = new Set();
  const intents = new Set();
  const acts = new Set();
  for (const item of cases) {
    if (ids.has(item.id)) {
      check(`coverage: duplicate id ${item.id}`, false);
    }
    ids.add(item.id);
    if (item.expectedIntent) intents.add(item.expectedIntent);
    const act = String(item.sessionContext?.act || "");
    for (const label of REQUIRED_ACT_LABELS) {
      if (act.includes(label)) acts.add(label);
    }
  }
  for (const intent of REQUIRED_INTENTS) {
    check(`coverage: includes ${intent}`, intents.has(intent));
  }
  for (const act of REQUIRED_ACT_LABELS) {
    check(`coverage: includes ${act}`, acts.has(act));
  }
}

function validateCase(item, globals) {
  const { prompt, screenplayTask } = buildPromptForCase(item);
  const fittedPrompt = fitSystemPromptForTurnLatency(prompt, {
    routingLane: "creative",
    chatModelPlan: { tier: "rich" },
    fastMaxChars: 3_800,
    richMaxChars: 6_200,
  });
  const id = item.id || "<missing-id>";
  const expectedIntent = String(item.expectedIntent || "").trim();
  const maxChars = Number(item.maxChars || 0);

  check(`${id}: id is stable string`, typeof item.id === "string" && item.id.length > 0);
  check(`${id}: inferred screenplay task`, Boolean(screenplayTask?.intent));
  if (expectedIntent) {
    check(
      `${id}: intent ${expectedIntent}`,
      screenplayTask?.intent === expectedIntent,
      `got ${screenplayTask?.intent || "<none>"} for hint: ${item.screenplayTaskHint}`,
    );
  }
  check(`${id}: prompt includes screenplay task block`, prompt.includes(SCREENPLAY_TASK_BLOCK_OPEN));
  check(`${id}: prompt includes feature film map`, prompt.includes(FEATURE_MAP_BLOCK_OPEN));
  check(`${id}: prompt includes expert scene execution`, prompt.includes("expert_scene_execution:"));
  check(`${id}: prompt includes page-first speed discipline`, prompt.includes("speed discipline"));
  check(`${id}: prompt includes speed protocol`, prompt.includes("speed_protocol:"));
  check(`${id}: fitted prompt is within live rich budget`, fittedPrompt.length <= 6_200);
  check(`${id}: fitted prompt preserves feature map`, fittedPrompt.includes(FEATURE_MAP_BLOCK_OPEN));
  check(`${id}: fitted prompt preserves screenplay task`, fittedPrompt.includes(SCREENPLAY_TASK_BLOCK_OPEN));
  check(`${id}: fitted prompt preserves intent`, fittedPrompt.includes(`intent: ${screenplayTask?.intent}`));
  check(`${id}: fitted prompt preserves expert craft contract`, fittedPrompt.includes(
    "craft_contract: whole-feature authorship; page batch discipline; expert page engine; subtext engine; image system; speed discipline"
  ));
  check(`${id}: fitted prompt preserves mode contract`, fittedPrompt.includes("mode_contract:"));
  check(`${id}: fitted prompt preserves the writer request`, fittedPrompt.includes(String(item.userInput || "").trim()));
  check(`${id}: fitted craft contract is complete`, !/^craft_contract:.*\.\.\.$/m.test(fittedPrompt));

  const expectedSequence = asArray(item.mustInclude).find((needle) =>
    String(needle || "").startsWith("current_sequence:")
  );
  if (expectedSequence) {
    check(`${id}: fitted prompt preserves active sequence`, fittedPrompt.includes(expectedSequence));
  }
  const requestedPages = Number(screenplayTask?.requestedPages || 0);
  if (requestedPages > 0) {
    check(`${id}: fitted prompt preserves feature page assignment`, fittedPrompt.includes(`requested_pages: ${requestedPages}`));
    check(`${id}: fitted prompt preserves task page assignment`, fittedPrompt.includes(`requested_page_batch: ${requestedPages}`));
  }

  if (maxChars > 0) {
    check(`${id}: prompt under ${maxChars} chars (got ${prompt.length})`, prompt.length <= maxChars);
  }

  for (const needle of asArray(globals.globalMustInclude)) {
    check(`${id}: global include '${needle}'`, prompt.includes(needle));
  }
  for (const needle of asArray(item.mustInclude)) {
    check(`${id}: include '${needle}'`, prompt.includes(needle));
  }
  for (const needle of [...asArray(globals.globalMustNotInclude), ...asArray(item.mustNotInclude)]) {
    check(`${id}: forbid '${needle}'`, !includesCaseInsensitive(prompt, needle));
  }

  const a = buildPromptForCase(item);
  const b = buildPromptForCase(item);
  check(`${id}: deterministic prompt`, a.prompt === b.prompt);
  check(`${id}: deterministic intent`, a.screenplayTask?.intent === b.screenplayTask?.intent);
}

const suite = readJson(CASES_PATH);
check("fixture version is 1", suite.version === 1);
check("fixture has cases", Array.isArray(suite.cases) && suite.cases.length >= 7);

validateCoverage(asArray(suite.cases));
for (const item of asArray(suite.cases)) {
  validateCase(item, suite);
}

if (!allOK) {
  console.error("screenplay quality eval: FAILED");
  process.exit(1);
}

console.log(`screenplay quality eval: OK (${suite.cases.length} cases)`);
