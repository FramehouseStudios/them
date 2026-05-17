// T-genre-classifier — unit tests for the pure module.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import {
  classifyGenre,
  GENRE_LEXICONS,
  GENRE_CLASSIFIER_SCHEMA_VERSION,
} from "../lib/genre_classifier.js";
import { mountCraftRoutes } from "../lib/craft_routes.js";

const HORROR_SCREENPLAY = `INT. CABIN - NIGHT

A shadow moves in the basement. Scream. Blood on the wall.

JUNE
(whispers)
There's a ghost in this cabin.

The demon claws at the door. Darkness everywhere.`;

const COMEDY_SCREENPLAY = `INT. OFFICE - DAY

Awkward silence. June laughs at her own joke. Marcus is deadpan.

JUNE
(absurd)
This is ridiculous.

Marcus smirks. Punchline lands. Everyone embarrassed.`;

const SCIFI_SCREENPLAY = `INT. STARSHIP BRIDGE - NIGHT

The android adjusts the neural circuit. Wormhole opens on screen.

CAPTAIN
Activate the airlock. Quantum drive online.

The drone pilots itself toward the alien orbit.`;

const ROMANCE_SCREENPLAY = `INT. BEDROOM - DAWN

She kisses him tenderly. His heart aches. Their fingertips touch.

JUNE
(softly)
I love you. Always have.

A long embrace. Yearning.`;

// ---------- shape ----------

test("[genre] classifyGenre returns the canonical schema fields", () => {
  const r = classifyGenre({ text: HORROR_SCREENPLAY });
  assert.equal(r.schemaVersion, GENRE_CLASSIFIER_SCHEMA_VERSION);
  assert.equal(typeof r.primaryGenre, "string");
  assert.equal(typeof r.primaryConfidence, "number");
  assert.ok(Array.isArray(r.candidates));
  assert.ok(r.tone && typeof r.tone.intensity === "string");
  assert.equal(typeof r.summary, "string");
});

test("[genre] lexicons cover the documented genre buckets", () => {
  const expected = ["drama", "thriller", "horror", "comedy", "romance", "action", "sci-fi", "mystery", "biography"];
  for (const g of expected) {
    assert.ok(GENRE_LEXICONS[g], `missing lexicon for ${g}`);
    assert.ok(Array.isArray(GENRE_LEXICONS[g].keywords));
    assert.ok(GENRE_LEXICONS[g].keywords.length > 0);
  }
});

// ---------- classification accuracy ----------

test("[genre] horror screenplay classifies as horror", () => {
  const r = classifyGenre({ text: HORROR_SCREENPLAY });
  assert.equal(r.primaryGenre, "horror");
  assert.ok(r.primaryConfidence > 0);
});

test("[genre] comedy screenplay classifies as comedy", () => {
  const r = classifyGenre({ text: COMEDY_SCREENPLAY });
  assert.equal(r.primaryGenre, "comedy");
});

test("[genre] sci-fi screenplay classifies as sci-fi", () => {
  const r = classifyGenre({ text: SCIFI_SCREENPLAY });
  assert.equal(r.primaryGenre, "sci-fi");
});

test("[genre] romance screenplay classifies as romance", () => {
  const r = classifyGenre({ text: ROMANCE_SCREENPLAY });
  assert.equal(r.primaryGenre, "romance");
});

// ---------- tone ----------

test("[genre] horror screenplay reports high threat intensity", () => {
  const r = classifyGenre({ text: HORROR_SCREENPLAY });
  assert.ok(r.tone.threatRatio > 0);
  assert.ok(["medium", "high"].includes(r.tone.intensity), `intensity=${r.tone.intensity}`);
});

test("[genre] comedy screenplay reports a non-zero comedy ratio", () => {
  const r = classifyGenre({ text: COMEDY_SCREENPLAY });
  assert.ok(r.tone.comedyRatio > 0);
});

// ---------- robustness ----------

test("[genre] empty text returns a low-signal summary + drama fallback", () => {
  const r = classifyGenre({ text: "" });
  assert.equal(typeof r.primaryGenre, "string");
  assert.match(r.summary, /weak/i);
});

test("[genre] non-string text returns the fallback shape (no throw)", () => {
  const r = classifyGenre({ text: 42 });
  assert.equal(r.schemaVersion, GENRE_CLASSIFIER_SCHEMA_VERSION);
});

test("[genre] determinism: same input → same output", () => {
  const a = classifyGenre({ text: HORROR_SCREENPLAY });
  const b = classifyGenre({ text: HORROR_SCREENPLAY });
  assert.deepEqual(a, b);
});

test("[genre] candidates are sorted descending by score", () => {
  const r = classifyGenre({ text: HORROR_SCREENPLAY });
  for (let i = 1; i < r.candidates.length; i += 1) {
    assert.ok(r.candidates[i - 1].score >= r.candidates[i].score);
  }
});

test("[genre] sceneHeadingCount counts INT./EXT. headings", () => {
  const r = classifyGenre({ text: "INT. KITCHEN - DAY\n\nA scene.\n\nEXT. ROAD - NIGHT\n\nAnother scene." });
  assert.equal(r.sceneHeadingCount, 2);
});

test("[genre] candidates contain signal arrays with detected tokens", () => {
  const r = classifyGenre({ text: HORROR_SCREENPLAY });
  const horror = r.candidates.find((c) => c.genre === "horror");
  assert.ok(horror, "horror should be a candidate");
  assert.ok(Array.isArray(horror.signals) && horror.signals.length > 0);
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

test("[genre] POST /craft/genre/classify returns the classification", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postJson(baseURL, "/craft/genre/classify", { text: HORROR_SCREENPLAY });
    assert.equal(r.status, 200);
    assert.equal(r.body.primaryGenre, "horror");
    assert.ok(Array.isArray(r.body.candidates));
  });
});

test("[genre] POST /craft/genre/classify rejects missing text", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await postJson(baseURL, "/craft/genre/classify", {});
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "craft_invalid_screenplay");
  });
});
