// T-logline-distiller: unit tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  distillLogline,
  recordLogline,
  getLoglineHistory,
  computeDrift,
  normalizeLogline,
  jaccardDistance,
  wordsFrom,
  storageKey,
  LOGLINE_SCHEMA_VERSION,
  LOGLINE_DOMAIN,
} from "../lib/logline_distiller.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-logline-"));
  return createJsonPersistence({ jsonRoot: root });
}

// ---------- pure helpers ----------

test("normalizeLogline collapses whitespace and strips quotes", () => {
  assert.equal(normalizeLogline('"  Hello   world  "'), "Hello world");
  assert.equal(normalizeLogline("Multi\nline\rinput"), "Multi line input");
});

test("normalizeLogline truncates over 280 chars with ellipsis", () => {
  const long = "A ".repeat(300);
  const out = normalizeLogline(long);
  assert.ok(out.length <= 280);
  assert.ok(out.endsWith("…"));
});

test("wordsFrom lowercases and drops short tokens", () => {
  const words = wordsFrom("She walks to the door at NOON.");
  assert.ok(words.has("walks"));
  assert.ok(words.has("door"));
  assert.ok(words.has("noon"));
  assert.equal(words.has("to"), false); // 2 chars, dropped
});

test("jaccardDistance 0 for identical sets, 1 for disjoint", () => {
  const a = new Set(["she", "walks", "door"]);
  const b = new Set(["she", "walks", "door"]);
  const c = new Set(["clouds", "horizon", "afterlife"]);
  assert.equal(jaccardDistance(a, b), 0);
  assert.equal(jaccardDistance(a, c), 1);
});

test("storageKey includes ISO timestamp for chrono lex ordering", () => {
  const k = storageKey({ projectId: "p1", versionId: "v2", distilledAtMs: Date.UTC(2026, 4, 10, 12, 0, 0) });
  assert.match(k, /^entry:p1:v2:2026-05-10T12:00:00\.000Z$/);
});

// ---------- distillLogline ----------

test("distillLogline (stub) extracts logline from first heading + cue", async () => {
  const text = `INT. KITCHEN - NIGHT

JUNE
Where is the cat?

She walks to the window.
`;
  const out = await distillLogline({ text });
  assert.match(out, /JUNE/);
  assert.match(out, /KITCHEN - NIGHT/);
});

test("distillLogline (stub) handles screenplay without a cue", async () => {
  const text = `INT. ROOM - DAY

The clock ticks. The light fades.
`;
  const out = await distillLogline({ text });
  assert.match(out, /ROOM - DAY/i);
});

test("distillLogline (stub) handles empty input safely", async () => {
  const out = await distillLogline({ text: "" });
  assert.ok(typeof out === "string" && out.length > 0);
});

test("distillLogline (LLM mode) routes through classifier.classifyScene", async () => {
  let recordedScene = null;
  const fakeClassifier = {
    kind: "openai",
    async classifyScene({ framework, scene }) {
      recordedScene = scene;
      return { beatId: "logline", confidence: 1, rationale: "JUNE searches a haunted kitchen for the truth she buried." };
    },
  };
  const out = await distillLogline({
    text: "INT. KITCHEN - NIGHT\n\nJUNE\nHi.",
    classifier: fakeClassifier,
    frameworkId: "save-the-cat",
  });
  assert.equal(out, "JUNE searches a haunted kitchen for the truth she buried.");
  assert.ok(recordedScene.text.includes("Write a single screenplay logline"));
});

test("distillLogline (LLM mode) falls back to stub on classifier error", async () => {
  const breaker = {
    kind: "openai",
    async classifyScene() { throw new Error("model down"); },
  };
  const out = await distillLogline({
    text: "INT. ROOM - DAY\n\nALICE\nHi.",
    classifier: breaker,
  });
  assert.match(out, /ALICE/);
  assert.match(out, /ROOM/);
});

// ---------- persistence ----------

test("recordLogline stores + getLoglineHistory returns in chrono order", async () => {
  const persistence = freshPersistence();
  await recordLogline({
    persistence, projectId: "p", versionId: "v1",
    logline: "First version of the pitch.", source: "stub",
    distilledAtMs: 1_700_000_000_000,
  });
  await recordLogline({
    persistence, projectId: "p", versionId: "v1",
    logline: "Second version refines the pitch.", source: "stub",
    distilledAtMs: 1_700_000_010_000,
  });
  const history = await getLoglineHistory({ persistence, projectId: "p" });
  assert.equal(history.length, 2);
  assert.match(history[0].logline, /First version/);
  assert.match(history[1].logline, /Second version/);
});

test("recordLogline rejects missing projectId", async () => {
  const persistence = freshPersistence();
  await assert.rejects(
    () => recordLogline({ persistence, projectId: "", logline: "x" }),
    /projectId/,
  );
});

test("recordLogline rejects empty logline", async () => {
  const persistence = freshPersistence();
  await assert.rejects(
    () => recordLogline({ persistence, projectId: "p", logline: "" }),
    /non-empty/,
  );
});

test("getLoglineHistory returns empty for unknown project", async () => {
  const persistence = freshPersistence();
  const history = await getLoglineHistory({ persistence, projectId: "no-such" });
  assert.deepEqual(history, []);
});

// ---------- drift ----------

test("computeDrift returns score 0 for identical earliest+current", async () => {
  const persistence = freshPersistence();
  await recordLogline({
    persistence, projectId: "p", versionId: "v1",
    logline: "She searches for the truth she buried in the kitchen.",
    distilledAtMs: 1_700_000_000_000,
  });
  const drift = await computeDrift({
    persistence, projectId: "p",
    currentLogline: "She searches for the truth she buried in the kitchen.",
  });
  assert.equal(drift.score, 0);
  assert.match(drift.summary, /holds tight/);
});

test("computeDrift detects sharp divergence", async () => {
  const persistence = freshPersistence();
  await recordLogline({
    persistence, projectId: "p",
    logline: "A young woman investigates a haunted kitchen.",
    distilledAtMs: 1_700_000_000_000,
  });
  const drift = await computeDrift({
    persistence, projectId: "p",
    currentLogline: "An astronaut crashes on Mars and rebuilds civilization.",
  });
  assert.ok(drift.score >= 0.7, `expected >=0.7 drift, got ${drift.score}`);
  assert.match(drift.summary, /diverged sharply/);
});

test("computeDrift summary thresholds map cleanly", async () => {
  const persistence = freshPersistence();
  await recordLogline({
    persistence, projectId: "thresh",
    logline: "A scientist studies a strange new fungus.",
    distilledAtMs: 1_700_000_000_000,
  });
  // Mostly-same-words → low drift
  const close = await computeDrift({
    persistence, projectId: "thresh",
    currentLogline: "A scientist studies a strange new mold.",
  });
  assert.ok(close.score < 0.5, `close drift ${close.score}`);
});

test("computeDrift handles empty history gracefully", async () => {
  const persistence = freshPersistence();
  const drift = await computeDrift({
    persistence, projectId: "empty",
    currentLogline: "Anything.",
  });
  assert.equal(drift.score, 0);
  assert.equal(drift.earliest, "");
  assert.equal(drift.historyCount, 0);
});

// ---------- domain constant ----------

test("LOGLINE_DOMAIN constant matches KNOWN_DOMAINS expectation", () => {
  assert.equal(LOGLINE_DOMAIN, "craft_loglines");
  assert.equal(LOGLINE_SCHEMA_VERSION, 1);
});
