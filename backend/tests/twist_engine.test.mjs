// T-twist-engine — unit tests for the pure module and integration
// tests for POST /craft/twist/suggest.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import {
  suggestTwists,
  deterministicTwists,
  TWIST_LIBRARY,
  TWIST_SCHEMA_VERSION,
  DEFAULT_COUNT,
  MAX_COUNT,
} from "../lib/twist_engine.js";
import { mountCraftRoutes } from "../lib/craft_routes.js";
import { configureCraftAnalysis, _resetCraftStores } from "../lib/craft_analysis.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

// ---------- pure module ----------

test("[twist-engine] suggestTwists returns deterministic twists for a known beat", async () => {
  const r = await suggestTwists({ frameworkId: "save-the-cat", currentBeatId: "midpoint" });
  assert.equal(r.schemaVersion, TWIST_SCHEMA_VERSION);
  assert.equal(r.frameworkId, "save-the-cat");
  assert.equal(r.currentBeatId, "midpoint");
  assert.equal(r.source, "stub");
  assert.equal(r.twists.length, DEFAULT_COUNT);
  for (const t of r.twists) {
    assert.ok(t.id && typeof t.id === "string");
    assert.ok(t.label && typeof t.label === "string");
    assert.ok(t.hook && typeof t.hook === "string");
    assert.ok(["high", "medium", "low"].includes(t.severity));
    assert.ok(typeof t.rationale === "string");
  }
});

test("[twist-engine] every canonical major-turn beat has at least one twist", () => {
  const expectations = {
    "save-the-cat": ["catalyst", "midpoint", "all-is-lost", "finale"],
    "three-act": ["inciting-incident", "midpoint-twist", "climax"],
    "story-circle": ["need", "go", "find", "return-changed"],
    "hero-journey": ["call-to-adventure", "crossing-first-threshold", "ordeal", "resurrection"],
  };
  for (const [fw, beats] of Object.entries(expectations)) {
    const lib = TWIST_LIBRARY[fw];
    assert.ok(lib, `library missing framework: ${fw}`);
    for (const b of beats) {
      assert.ok(lib[b] && lib[b].length >= 1, `framework ${fw} missing twists for beat ${b}`);
    }
  }
});

test("[twist-engine] all twist library entries have well-formed fields", () => {
  for (const fw of Object.values(TWIST_LIBRARY)) {
    for (const beatTwists of Object.values(fw)) {
      for (const t of beatTwists) {
        assert.match(t.id, /^[a-z]{2,4}-[a-z-]+-\d+$/, `bad id: ${t.id}`);
        assert.ok(t.label && t.label.length > 0);
        assert.ok(t.hook && t.hook.length > 0);
        assert.ok(["high", "medium", "low"].includes(t.severity));
        assert.ok(typeof t.rationale === "string");
      }
    }
  }
});

test("[twist-engine] count is clamped to [1, MAX_COUNT] but never exceeds the library size", async () => {
  const big = await suggestTwists({
    frameworkId: "save-the-cat",
    currentBeatId: "midpoint",
    count: 100,
  });
  // Request was clamped to MAX_COUNT, but the library may hold fewer
  // entries for this beat; the result is min(clampedCount, librarySize).
  assert.ok(big.twists.length <= MAX_COUNT);
  assert.ok(big.twists.length >= 1);
  const tiny = await suggestTwists({
    frameworkId: "save-the-cat",
    currentBeatId: "midpoint",
    count: 0,
  });
  assert.equal(tiny.twists.length, 1);
});

test("[twist-engine] unknown framework throws a typed error", async () => {
  await assert.rejects(
    () => suggestTwists({ frameworkId: "no-such", currentBeatId: "catalyst" }),
    (e) => e.code === "twist_unknown_framework",
  );
});

test("[twist-engine] unknown beat for a known framework throws a typed error", async () => {
  await assert.rejects(
    () => suggestTwists({ frameworkId: "save-the-cat", currentBeatId: "no-such-beat" }),
    (e) => e.code === "twist_unknown_beat",
  );
});

test("[twist-engine] missing frameworkId or currentBeatId rejects with twist_invalid_input", async () => {
  await assert.rejects(
    () => suggestTwists({ currentBeatId: "midpoint" }),
    (e) => e.code === "twist_invalid_input",
  );
  await assert.rejects(
    () => suggestTwists({ frameworkId: "save-the-cat" }),
    (e) => e.code === "twist_invalid_input",
  );
});

test("[twist-engine] deterministicTwists is pure (returns same array shape across calls)", () => {
  const a = deterministicTwists({ frameworkId: "story-circle", currentBeatId: "find" });
  const b = deterministicTwists({ frameworkId: "story-circle", currentBeatId: "find" });
  assert.deepEqual(a, b);
});

test("[twist-engine] story-circle 'return-changed' surfaces a high-severity twist", async () => {
  const r = await suggestTwists({
    frameworkId: "story-circle",
    currentBeatId: "return-changed",
    count: MAX_COUNT,
  });
  assert.ok(r.twists.some((t) => t.severity === "high"));
});

test("[twist-engine] hero-journey 'ordeal' twists carry varied severities", async () => {
  const r = await suggestTwists({
    frameworkId: "hero-journey",
    currentBeatId: "ordeal",
    count: MAX_COUNT,
  });
  const severities = new Set(r.twists.map((t) => t.severity));
  assert.ok(severities.size >= 2);
});

test("[twist-engine] LLM mode falls back to deterministic when classifier lacks classifyScene", async () => {
  const r = await suggestTwists({
    frameworkId: "save-the-cat",
    currentBeatId: "catalyst",
    classifier: { kind: "openai" }, // no classifyScene method → fallback
    forceMode: "llm",
  });
  // Even though we asked for LLM mode, the fallback path produces a stub
  // response — but `source` reflects the requested mode so the caller
  // knows the LLM was attempted.
  assert.equal(r.source, "openai");
  assert.equal(r.twists.length, DEFAULT_COUNT);
});

test("[twist-engine] LLM mode parses a valid classifier response", async () => {
  const fakeTwists = [
    { id: "fake-1", label: "Fake Twist A", hook: "Hook A", severity: "high", rationale: "" },
    { id: "fake-2", label: "Fake Twist B", hook: "Hook B", severity: "medium", rationale: "" },
  ];
  const classifier = {
    kind: "openai",
    async classifyScene() {
      return { beatId: "midpoint", confidence: 1, rationale: JSON.stringify(fakeTwists) };
    },
  };
  const r = await suggestTwists({
    frameworkId: "save-the-cat",
    currentBeatId: "midpoint",
    classifier,
    count: 5,
  });
  assert.equal(r.source, "openai");
  assert.equal(r.twists.length, 2);
  assert.equal(r.twists[0].id, "fake-1");
});

test("[twist-engine] LLM mode falls back when classifier returns invalid JSON", async () => {
  const classifier = {
    kind: "openai",
    async classifyScene() {
      return { beatId: "midpoint", confidence: 1, rationale: "not json at all" };
    },
  };
  const r = await suggestTwists({
    frameworkId: "save-the-cat",
    currentBeatId: "midpoint",
    classifier,
  });
  // Fallback path → deterministic twists.
  assert.equal(r.twists.length, DEFAULT_COUNT);
  assert.equal(r.twists[0].id, "stc-midpoint-1");
});

// ---------- endpoint integration ----------

async function withTestServer(fn) {
  _resetCraftStores();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-twist-"));
  configureCraftAnalysis({ persistence: createJsonPersistence({ jsonRoot: root }) });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = { id: "twist-engine-test-user" };
    req.userId = req.authUser.id;
    next();
  });
  mountCraftRoutes(app, { authorizeProjectAccess: async () => true });
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

async function postJson(baseURL, path, payload) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

test("[twist-engine] POST /craft/twist/suggest returns deterministic twists", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/twist/suggest", {
      frameworkId: "save-the-cat",
      currentBeatId: "all-is-lost",
    });
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, TWIST_SCHEMA_VERSION);
    assert.equal(body.frameworkId, "save-the-cat");
    assert.equal(body.currentBeatId, "all-is-lost");
    assert.ok(Array.isArray(body.twists));
    assert.equal(body.twists.length, DEFAULT_COUNT);
  });
});

test("[twist-engine] POST /craft/twist/suggest rejects unknown frameworkId with 400", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/twist/suggest", {
      frameworkId: "no-such",
      currentBeatId: "anything",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_framework_id");
  });
});

test("[twist-engine] POST /craft/twist/suggest rejects unknown beat with 400", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/twist/suggest", {
      frameworkId: "story-circle",
      currentBeatId: "no-such",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});

test("[twist-engine] POST /craft/twist/suggest rejects missing frameworkId", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/twist/suggest", {
      currentBeatId: "midpoint",
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_framework_id");
  });
});

test("[twist-engine] POST /craft/twist/suggest honors the count parameter", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/twist/suggest", {
      frameworkId: "hero-journey",
      currentBeatId: "resurrection",
      count: 2,
    });
    assert.equal(status, 200);
    assert.equal(body.twists.length, 2);
  });
});
