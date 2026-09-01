import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadScenes,
  validateScene,
  scoreSceneStub,
  REQUIRED,
} from "../evals/clementine/score_scene.js";

const scenesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../evals/clementine/scenes.jsonl"
);

test("[clementine voice eval] loads >= 45 scenes with required fields", () => {
  const scenes = loadScenes(scenesPath);
  assert.ok(scenes.length >= 45, `expected >= 45 scenes, got ${scenes.length}`);

  const ids = new Set();
  for (const scene of scenes) {
    for (const key of REQUIRED) {
      assert.ok(scene[key] !== undefined && scene[key] !== null && scene[key] !== "", `${scene.id || scene.line}: missing ${key}`);
    }
    assert.ok(Array.isArray(scene.pass_criteria) && scene.pass_criteria.length >= 1);
    assert.equal(typeof scene.input, "string");
    assert.ok(scene.input.length > 0);
    assert.equal(ids.has(scene.id), false, `duplicate id ${scene.id}`);
    ids.add(scene.id);

    const errors = validateScene(scene);
    assert.deepEqual(errors, [], `${scene.id}: ${errors.join("; ")}`);
  }
});

test("[clementine voice eval] stub scorer dry-runs pass_criteria presence", () => {
  const scenes = loadScenes(scenesPath);
  for (const scene of scenes) {
    const result = scoreSceneStub(scene);
    assert.equal(result.ok, true, `${scene.id}: ${result.errors.join("; ")}`);
    assert.equal(result.dimensions.pass_criteria_present, "pass");
    assert.equal(result.dimensions.schema, "pass");
  }
});

test("[clementine voice eval] covers required category mix", () => {
  const scenes = loadScenes(scenesPath);
  const cats = new Set(scenes.map((s) => s.category));
  for (const need of [
    "comfort",
    "tease",
    "boundary",
    "memory_recall",
    "silence",
    "page_propose",
    "barge_in_cancel",
    "plan_deep",
    "greeting_reflex",
    "wallet_empty",
  ]) {
    assert.ok(cats.has(need), `missing category ${need}`);
  }
});
