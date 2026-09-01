#!/usr/bin/env node
//
// Clementine voice-eval stub scorer (D008 / T-clementine-voice-eval).
// Validates scenes.jsonl schema and dry-runs pass_criteria presence.
// No model calls. Exit non-zero on any failure.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENES_PATH = path.join(__dirname, "scenes.jsonl");

const REQUIRED = Object.freeze(["id", "intent", "lane", "input", "pass_criteria"]);
const LANES = new Set(["Reflex", "Companion", "Page", "Deep"]);

function loadScenes(filePath = SCENES_PATH) {
  const raw = fs.readFileSync(filePath, "utf8");
  const scenes = [];
  const lines = raw.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      throw new Error(`line ${i + 1}: invalid JSON (${err.message})`);
    }
    scenes.push({ line: i + 1, ...obj });
  }
  return scenes;
}

function validateScene(scene) {
  const errors = [];
  for (const key of REQUIRED) {
    if (scene[key] === undefined || scene[key] === null || scene[key] === "") {
      errors.push(`missing required field "${key}"`);
    }
  }
  if (typeof scene.id !== "string") errors.push("id must be string");
  if (typeof scene.intent !== "string") errors.push("intent must be string");
  if (typeof scene.input !== "string") errors.push("input must be string");
  if (!LANES.has(scene.lane)) {
    errors.push(`lane must be one of ${[...LANES].join("|")} (got ${JSON.stringify(scene.lane)})`);
  }
  if (!Array.isArray(scene.pass_criteria) || scene.pass_criteria.length < 1) {
    errors.push("pass_criteria must be a non-empty string array");
  } else {
    for (const [idx, c] of scene.pass_criteria.entries()) {
      if (typeof c !== "string" || !c.trim()) {
        errors.push(`pass_criteria[${idx}] must be a non-empty string`);
      }
    }
  }
  if (scene.forbidden_patterns !== undefined) {
    if (!Array.isArray(scene.forbidden_patterns)) {
      errors.push("forbidden_patterns must be an array when present");
    } else {
      for (const [idx, p] of scene.forbidden_patterns.entries()) {
        if (typeof p !== "string" || !p.length) {
          errors.push(`forbidden_patterns[${idx}] must be a non-empty string`);
          continue;
        }
        try {
          // Dry-run: ensure pattern compiles; scoring against model output is later.
          new RegExp(p, "i");
        } catch (err) {
          errors.push(`forbidden_patterns[${idx}] invalid regex: ${err.message}`);
        }
      }
    }
  }
  return errors;
}

/** Dry-run "score": schema OK + pass_criteria present → stub pass (no model). */
function scoreSceneStub(scene) {
  const errors = validateScene(scene);
  return {
    id: scene.id || `line_${scene.line}`,
    ok: errors.length === 0,
    errors,
    dimensions: {
      voice_match: "pending_model",
      memory_fidelity: "pending_model",
      tool_hygiene: "pending_model",
      tokens: "pending_model",
      ttft: "pending_model",
      schema: errors.length === 0 ? "pass" : "fail",
      pass_criteria_present: Array.isArray(scene.pass_criteria) && scene.pass_criteria.length > 0 ? "pass" : "fail",
    },
  };
}

function main(argv = process.argv.slice(2)) {
  const fileArg = argv.find((a) => !a.startsWith("-"));
  const scenesPath = fileArg ? path.resolve(fileArg) : SCENES_PATH;
  let scenes;
  try {
    scenes = loadScenes(scenesPath);
  } catch (err) {
    console.error(`FAIL  load: ${err.message}`);
    process.exit(1);
  }

  const ids = new Set();
  let failed = 0;
  const byCategory = Object.create(null);

  for (const scene of scenes) {
    const result = scoreSceneStub(scene);
    const cat = scene.category || "uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + 1;

    if (scene.id) {
      if (ids.has(scene.id)) {
        result.ok = false;
        result.errors.push(`duplicate id "${scene.id}"`);
      }
      ids.add(scene.id);
    }

    if (result.ok) {
      console.log(`PASS  ${result.id}`);
    } else {
      failed += 1;
      console.error(`FAIL  ${result.id}`);
      for (const e of result.errors) console.error(`  - ${e}`);
    }
  }

  console.log("");
  console.log(`scenes=${scenes.length} unique_ids=${ids.size} failed=${failed}`);
  console.log("by_category=" + JSON.stringify(byCategory));
  if (scenes.length < 45) {
    console.error(`FAIL  expected >= 45 scenes, got ${scenes.length}`);
    process.exit(1);
  }
  process.exit(failed === 0 ? 0 : 1);
}

export { loadScenes, validateScene, scoreSceneStub, REQUIRED, LANES, SCENES_PATH };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
