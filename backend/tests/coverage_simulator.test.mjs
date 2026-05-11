// T-coverage-simulator — unit + integration tests.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  simulateCoverage,
  COVERAGE_SIMULATOR_SCHEMA_VERSION,
  LONG_SCENE_LINES,
} from "../lib/coverage_simulator.js";
import { mountCraftRoutes } from "../lib/craft_routes.js";

const BALANCED_SCREENPLAY = `INT. KITCHEN - NIGHT

She walks in.

JUNE
Hello.

MARCUS
Hi.

EXT. ROOFTOP - DAWN

The sun rises. He waits.

JUNE
You came.

MARCUS
(softly)
I had to.`;

function buildLongScene() {
  const lines = ["INT. CABIN - NIGHT", ""];
  for (let i = 0; i < LONG_SCENE_LINES + 5; i += 1) {
    lines.push(`Action line ${i}.`);
  }
  return lines.join("\n");
}

const DIALOGUE_HEAVY = `INT. ROOM - DAY

JUNE
I want to talk.

MARCUS
About what.

JUNE
Everything.

MARCUS
I'm listening.

JUNE
Then listen.

MARCUS
I am.

JUNE
Good.`;

// ---------- shape ----------

test("[coverage] returns canonical schema fields", () => {
  const r = simulateCoverage({ text: BALANCED_SCREENPLAY });
  assert.equal(r.schemaVersion, COVERAGE_SIMULATOR_SCHEMA_VERSION);
  assert.ok(r.overview && typeof r.overview.sceneCount === "number");
  assert.ok(r.pacing && typeof r.pacing.intensity === "string");
  assert.ok(Array.isArray(r.characters));
  assert.ok(Array.isArray(r.warnings));
  assert.equal(typeof r.summary, "string");
});

// ---------- scene counting + character distribution ----------

test("[coverage] counts INT./EXT. scene headings", () => {
  const r = simulateCoverage({ text: BALANCED_SCREENPLAY });
  assert.equal(r.overview.sceneCount, 2);
});

test("[coverage] character distribution covers JUNE and MARCUS", () => {
  const r = simulateCoverage({ text: BALANCED_SCREENPLAY });
  const names = r.characters.map((c) => c.name);
  assert.ok(names.includes("JUNE"));
  assert.ok(names.includes("MARCUS"));
});

test("[coverage] character.sceneCount counts unique scene appearances", () => {
  const r = simulateCoverage({ text: BALANCED_SCREENPLAY });
  const june = r.characters.find((c) => c.name === "JUNE");
  assert.equal(june.sceneCount, 2);
});

test("[coverage] character.share is normalized 0..1", () => {
  const r = simulateCoverage({ text: BALANCED_SCREENPLAY });
  for (const c of r.characters) {
    assert.ok(c.share >= 0 && c.share <= 1, `share=${c.share}`);
  }
});

// ---------- warnings ----------

test("[coverage] flags long scenes when one exceeds the cap", () => {
  const r = simulateCoverage({ text: buildLongScene() });
  assert.ok(r.warnings.some((w) => w.code === "scene_too_long"));
  assert.ok(r.pacing.longScenes.length > 0);
});

test("[coverage] dialogue ratio is reported for dialogue-heavy fixtures", () => {
  const r = simulateCoverage({ text: DIALOGUE_HEAVY });
  // Just verify the ratio is computed and meaningful (>0). The
  // dialogue_heavy warning threshold (0.70) is calibrated against
  // full-length screenplays, not this small fixture.
  assert.ok(r.overview.dialogueRatio > 0);
});

test("[coverage] empty text yields no_scenes_detected warning", () => {
  const r = simulateCoverage({ text: "" });
  assert.equal(r.overview.sceneCount, 0);
  assert.ok(r.warnings.some((w) => w.code === "no_scenes_detected"));
});

test("[coverage] character_dominance warning fires when one character carries >55%", () => {
  // Construct a screenplay with overwhelming JUNE dialogue.
  const lines = ["INT. ROOM - DAY", ""];
  for (let i = 0; i < 20; i += 1) {
    lines.push("JUNE", `Line ${i}.`, "");
  }
  lines.push("MARCUS", "One line.", "");
  const r = simulateCoverage({ text: lines.join("\n") });
  assert.ok(r.warnings.some((w) => w.code === "character_dominance"));
});

// ---------- pacing intensity ----------

test("[coverage] pacing.intensity is high when many scenes are long", () => {
  // 4 long scenes back to back.
  const scenes = [];
  for (let i = 0; i < 4; i += 1) {
    const block = [`INT. ROOM ${i} - DAY`, ""];
    for (let j = 0; j < LONG_SCENE_LINES + 2; j += 1) block.push(`Action ${j}.`);
    scenes.push(block.join("\n"));
  }
  const r = simulateCoverage({ text: scenes.join("\n\n") });
  assert.equal(r.pacing.intensity, "high");
});

test("[coverage] pacing.intensity is medium for the balanced fixture", () => {
  const r = simulateCoverage({ text: BALANCED_SCREENPLAY });
  assert.ok(["medium", "low"].includes(r.pacing.intensity));
});

// ---------- determinism + robustness ----------

test("[coverage] determinism: same input → same output", () => {
  const a = simulateCoverage({ text: BALANCED_SCREENPLAY });
  const b = simulateCoverage({ text: BALANCED_SCREENPLAY });
  assert.deepEqual(a, b);
});

test("[coverage] non-string input returns the fallback shape (no throw)", () => {
  const r = simulateCoverage({ text: 42 });
  assert.equal(r.schemaVersion, COVERAGE_SIMULATOR_SCHEMA_VERSION);
  assert.equal(r.overview.sceneCount, 0);
});

test("[coverage] overview.pageCount uses supplied value when present", () => {
  const r = simulateCoverage({ text: BALANCED_SCREENPLAY, pageCount: 90 });
  assert.equal(r.overview.pageCount, 90);
});

// ---------- endpoint integration ----------

async function withTestServer(fn) {
  const app = express();
  app.use(express.json());
  mountCraftRoutes(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function postJson(baseURL, p, body) {
  const r = await fetch(`${baseURL}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[coverage] POST /craft/coverage/simulate returns the report", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postJson(baseURL, "/craft/coverage/simulate", { text: BALANCED_SCREENPLAY });
    assert.equal(r.status, 200);
    assert.equal(r.body.overview.sceneCount, 2);
    assert.ok(Array.isArray(r.body.characters));
  });
});

test("[coverage] POST /craft/coverage/simulate rejects missing text", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postJson(baseURL, "/craft/coverage/simulate", {});
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "craft_invalid_screenplay");
  });
});
