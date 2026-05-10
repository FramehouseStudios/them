// T21 follow-up: tests for the per-scene classifier cache.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  createCraftSceneCache,
  sceneContentHash,
  craftSceneCacheKey,
  CRAFT_CLASSIFICATIONS_DOMAIN,
} from "../lib/craft_scene_cache.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-scene-cache-"));
  return createJsonPersistence({ jsonRoot: root });
}

// ---------- hashing ----------

test("sceneContentHash produces a stable hex hash for the same content", () => {
  const a = sceneContentHash({ title: "INT. ROOM - NIGHT", text: "ALICE\nHello." });
  const b = sceneContentHash({ title: "INT. ROOM - NIGHT", text: "ALICE\nHello." });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("sceneContentHash is whitespace-tolerant (CRLF / trailing spaces)", () => {
  const a = sceneContentHash({ title: "INT. ROOM", text: "ALICE\r\nHi.\r\n" });
  const b = sceneContentHash({ title: "INT. ROOM", text: "ALICE\nHi.\n" });
  assert.equal(a, b);
  const c = sceneContentHash({ title: "INT. ROOM", text: "ALICE  \nHi.  \n" });
  assert.equal(a, c);
});

test("sceneContentHash distinguishes title from text", () => {
  const a = sceneContentHash({ title: "X", text: "Y" });
  const b = sceneContentHash({ title: "Y", text: "X" });
  assert.notEqual(a, b);
});

test("craftSceneCacheKey is `<frameworkId>:<hash>`", () => {
  const k = craftSceneCacheKey({ frameworkId: "save-the-cat", hash: "abc" });
  assert.equal(k, "save-the-cat:abc");
});

// ---------- cache behavior ----------

test("read returns null for a cold cache, write then read returns the value", async () => {
  const cache = createCraftSceneCache({ persistence: freshPersistence() });
  const scene = { title: "INT. ROOM", text: "scene text" };
  const cold = await cache.read({ frameworkId: "save-the-cat", scene });
  assert.equal(cold, null);

  await cache.write({
    frameworkId: "save-the-cat",
    scene,
    value: { beatId: "midpoint", confidence: 0.8 },
  });

  const warm = await cache.read({ frameworkId: "save-the-cat", scene });
  assert.deepEqual(warm.value, { beatId: "midpoint", confidence: 0.8 });
});

test("ttlMs expires stale entries", async () => {
  const cache = createCraftSceneCache({ persistence: freshPersistence(), ttlMs: 50 });
  const scene = { title: "X", text: "Y" };
  await cache.write({ frameworkId: "save-the-cat", scene, value: { beatId: "x" } });
  await new Promise((r) => setTimeout(r, 75));
  const stale = await cache.read({ frameworkId: "save-the-cat", scene });
  assert.equal(stale, null);
});

test("classifyWithCache calls classifyOne only on cache miss", async () => {
  const cache = createCraftSceneCache({ persistence: freshPersistence() });
  const calls = [];
  const classifyOne = async (scene) => {
    calls.push(scene.title);
    return { beatId: "x", confidence: 0.5 };
  };
  const scenes = [
    { title: "S1", text: "first" },
    { title: "S2", text: "second" },
    { title: "S1", text: "first" }, // duplicate of S1 — should hit cache
  ];
  const results = await cache.classifyWithCache({
    frameworkId: "save-the-cat",
    scenes,
    classifyOne,
  });
  assert.equal(results.length, 3);
  assert.equal(results[0].fromCache, false);
  assert.equal(results[1].fromCache, false);
  assert.equal(results[2].fromCache, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls, ["S1", "S2"]);
});

test("classifyWithCache surfaces classifier errors per-scene without aborting", async () => {
  const cache = createCraftSceneCache({ persistence: freshPersistence() });
  const classifyOne = async (scene) => {
    if (scene.title === "BAD") throw new Error("model unavailable");
    return { beatId: "x" };
  };
  const results = await cache.classifyWithCache({
    frameworkId: "save-the-cat",
    scenes: [{ title: "OK", text: "..." }, { title: "BAD", text: "..." }, { title: "OK2", text: "..." }],
    classifyOne,
  });
  assert.equal(results[0].value.beatId, "x");
  assert.equal(results[1].value, null);
  assert.match(results[1].error, /model unavailable/);
  assert.equal(results[2].value.beatId, "x");
});

test("classifyWithCache distinguishes by frameworkId — same scene, different framework gets fresh classification", async () => {
  const cache = createCraftSceneCache({ persistence: freshPersistence() });
  const calls = [];
  const classifyOne = async (scene) => {
    calls.push(scene.title);
    return { beatId: "x" };
  };
  const scene = { title: "S1", text: "shared" };
  await cache.classifyWithCache({ frameworkId: "save-the-cat", scenes: [scene], classifyOne });
  await cache.classifyWithCache({ frameworkId: "three-act", scenes: [scene], classifyOne });
  assert.equal(calls.length, 2, "different frameworks should not share cache entries");
});

test("createCraftSceneCache rejects construction without a persistence handle", () => {
  assert.throws(() => createCraftSceneCache({ persistence: null }), /persistence/);
});

test("classifyWithCache rejects when classifyOne is not a function", async () => {
  const cache = createCraftSceneCache({ persistence: freshPersistence() });
  await assert.rejects(
    () => cache.classifyWithCache({
      frameworkId: "save-the-cat",
      scenes: [{ title: "x", text: "y" }],
      classifyOne: null,
    }),
    /classifyOne/,
  );
});

test("DOMAIN constant matches KNOWN_DOMAINS expectation", () => {
  assert.equal(CRAFT_CLASSIFICATIONS_DOMAIN, "craft_classifications");
});
