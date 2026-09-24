// T-archetype-engine — unit + integration tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import {
  classifyArchetypes,
  classifyCharacterArchetype,
  ARCHETYPES,
  ARCHETYPE_ENGINE_SCHEMA_VERSION,
} from "../lib/archetype_engine.js";
import { mountArchetypeRoute } from "../lib/archetype_route.js";
import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

import { listenEphemeral } from "./helpers/ephemeral_server.mjs";
function freshStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-archetype-"));
  return createCreativeMemoryStore({ persistence: createJsonPersistence({ jsonRoot: root }) });
}

const JUNE_HERO = {
  name: "JUNE",
  tags: ["lead"],
  traits: {
    keywords: ["earnest", "haunted", "ambitious"],
    emotional_default: "earnest",
    goals: ["save her brother"],
    relationships: { MARCUS: "estranged brother" },
  },
};

const MARCUS_SHADOW = {
  name: "MARCUS",
  tags: ["antagonist"],
  traits: {
    keywords: ["ruthless", "cynical"],
    emotional_default: "cold",
    relationships: { JUNE: "estranged sister, rival" },
  },
};

const ELLA_MENTOR = {
  name: "ELLA",
  tags: ["mentor"],
  traits: {
    keywords: ["calm", "weary", "warm"],
    emotional_default: "stoic",
    relationships: { JUNE: "teacher" },
  },
};

const CAL_COLD = {
  name: "CAL",
  tags: [],
  traits: {},
};

// ---------- lexicon shape ----------

test("[archetype] ARCHETYPES has all canonical buckets", () => {
  const expected = ["hero", "mentor", "shadow", "trickster", "ally", "herald", "threshold_guardian", "shapeshifter"];
  for (const a of expected) {
    assert.ok(ARCHETYPES[a], `missing archetype ${a}`);
    assert.ok(Array.isArray(ARCHETYPES[a].traitKeywords));
  }
});

// ---------- per-character classification ----------

test("[archetype] earnest+haunted+lead character classifies as hero", () => {
  const r = classifyCharacterArchetype(JUNE_HERO);
  assert.equal(r.primary.archetype, "hero");
  assert.ok(r.primary.score > 0);
  assert.ok(r.primary.signals.length > 0);
});

test("[archetype] ruthless+cynical+antagonist character classifies as shadow", () => {
  const r = classifyCharacterArchetype(MARCUS_SHADOW);
  assert.equal(r.primary.archetype, "shadow");
});

test("[archetype] calm+weary+stoic+mentor-tag classifies as mentor", () => {
  const r = classifyCharacterArchetype(ELLA_MENTOR);
  assert.equal(r.primary.archetype, "mentor");
});

test("[archetype] cold character with no traits defaults to ally + zero score + summary", () => {
  const r = classifyCharacterArchetype(CAL_COLD);
  assert.equal(r.primary.archetype, "ally");
  assert.equal(r.primary.score, 0);
  assert.match(r.summary, /no archetype signal/i);
});

test("[archetype] empty input doesn't throw", () => {
  const r1 = classifyCharacterArchetype(null);
  const r2 = classifyCharacterArchetype(undefined);
  assert.equal(r1.primary.archetype, "ally");
  assert.equal(r2.primary.archetype, "ally");
});

test("[archetype] candidates are sorted descending by score", () => {
  const r = classifyCharacterArchetype(JUNE_HERO);
  for (let i = 1; i < r.candidates.length; i += 1) {
    assert.ok(r.candidates[i - 1].score >= r.candidates[i].score);
  }
});

test("[archetype] close runner-up dampens confidence", () => {
  // Construct an ambiguous character — mentor + ally traits roughly equal.
  const ambiguous = {
    name: "MIA",
    tags: [],
    traits: {
      keywords: ["calm", "tender"],
      emotional_default: "tender",
    },
  };
  const r = classifyCharacterArchetype(ambiguous);
  // Primary should be mentor or ally; confidence < 1 because both fire.
  assert.ok(["mentor", "ally"].includes(r.primary.archetype));
  assert.ok(r.primary.score < 1);
});

// ---------- whole-roster classifier ----------

test("[archetype] classifyArchetypes returns one entry per character", () => {
  const r = classifyArchetypes({ characters: [JUNE_HERO, MARCUS_SHADOW, ELLA_MENTOR] });
  assert.equal(r.schemaVersion, ARCHETYPE_ENGINE_SCHEMA_VERSION);
  assert.equal(r.entries.length, 3);
  const byName = Object.fromEntries(r.entries.map((e) => [e.name, e]));
  assert.equal(byName.JUNE.primary.archetype, "hero");
  assert.equal(byName.MARCUS.primary.archetype, "shadow");
  assert.equal(byName.ELLA.primary.archetype, "mentor");
});

test("[archetype] empty characters array returns empty entries", () => {
  const r = classifyArchetypes({ characters: [] });
  assert.equal(r.entries.length, 0);
});

test("[archetype] determinism: same input → same output", () => {
  const a = classifyArchetypes({ characters: [JUNE_HERO, MARCUS_SHADOW] });
  const b = classifyArchetypes({ characters: [JUNE_HERO, MARCUS_SHADOW] });
  assert.deepEqual(a, b);
});

// ---------- endpoint integration ----------

async function withTestServer(fn, { userId = "u-test" } = {}) {
  const store = freshStore();
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  }
  mountArchetypeRoute(app, { creativeMemoryStore: store });
  const server = listenEphemeral(app);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, store });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[archetype] GET returns empty entries for an unknown user", async () => {
  await withTestServer(async ({ baseURL }) => {
    const r = await get(baseURL, "/memory/character-archetypes");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.entries, []);
  });
});

test("[archetype] GET classifies persisted characters via creativeMemoryStore", async () => {
  await withTestServer(async ({ baseURL, store }) => {
    await store.recordCharacterMention({
      userId: "u-test",
      characterName: "JUNE",
      tags: ["lead"],
      traits: { keywords: ["earnest", "haunted"], emotional_default: "earnest", goals: ["save Marcus"] },
    });
    await store.recordCharacterMention({
      userId: "u-test",
      characterName: "MARCUS",
      tags: ["antagonist"],
      traits: { keywords: ["ruthless", "cynical"], emotional_default: "cold" },
    });
    const r = await get(baseURL, "/memory/character-archetypes");
    assert.equal(r.status, 200);
    assert.equal(r.body.entries.length, 2);
    const byName = Object.fromEntries(r.body.entries.map((e) => [e.name, e]));
    assert.equal(byName.JUNE.primary.archetype, "hero");
    assert.equal(byName.MARCUS.primary.archetype, "shadow");
  });
});

test("[archetype] GET unauthenticated returns 401", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const r = await get(baseURL, "/memory/character-archetypes");
      assert.equal(r.status, 401);
      assert.equal(r.body.error, "user_auth_required");
    },
    { userId: null },
  );
});
