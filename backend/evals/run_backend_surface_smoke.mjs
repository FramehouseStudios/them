#!/usr/bin/env node
//
// T-backend-surface-smoke — single eval that mounts every iOS-facing
// backend route on an in-memory test server and exercises each with
// canonical fixtures, asserting the contract is intact.
//
// Catches the regression gap between unit tests (which exercise
// individual modules) and prod (which exercises the full mounted
// surface). Each endpoint gets one happy-path check; the eval is
// fast (~1s total) so it's cheap to bundle into `eval:gate`.
//
// Exits non-zero on first failure with a clear "[FAIL] <route>:
// <reason>" line.
//
// Routes covered (as of 2026-05-11):
//   GET    /craft/frameworks
//   GET    /craft/frameworks/:id
//   GET    /craft/schemas/report
//   GET    /craft/schemas/framework
//   POST   /craft/analyze
//   POST   /craft/overrides
//   DELETE /craft/overrides/:id
//   POST   /craft/format/lint
//   POST   /craft/twist/suggest
//   POST   /craft/twist/accepted
//   GET    /craft/twist/accepted
//   DELETE /craft/twist/accepted/:id
//   POST   /craft/logline/distill
//   GET    /craft/logline/drift
//   GET    /craft/logline/history
//   POST   /memory/record-character-mention
//   POST   /memory/character-trait
//   GET    /memory/character-traits
//   GET    /memory/block-signal

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";

import { mountCraftRoutes } from "../lib/craft_routes.js";
import { mountMemoryCharacterMentionRoute } from "../lib/memory_character_mention_route.js";
import { mountCharacterTraitRoute } from "../lib/character_trait_route.js";
import { mountBlockSignalRoute } from "../lib/block_signal_route.js";
import { configureCraftAnalysis } from "../lib/craft_analysis.js";
import { configureLoglineDistiller } from "../lib/logline_distiller.js";
import { configureAcceptedTwistLog } from "../lib/accepted_twist_log.js";
import { createCreativeMemoryStore } from "../lib/creative_memory_store.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

let failures = 0;

function check(label, cond, detail = "") {
  if (cond) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? "  — " + detail : ""}`);
  }
}

async function get(baseURL, p, headers = {}) {
  const r = await fetch(`${baseURL}${p}`, { headers });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function postJson(baseURL, p, body, headers = {}) {
  const r = await fetch(`${baseURL}${p}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function del(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`, { method: "DELETE" });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function startServer() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-surface-smoke-"));
  const sharedPersistence = createJsonPersistence({ jsonRoot: root });
  configureCraftAnalysis({ persistence: sharedPersistence });
  configureLoglineDistiller({ persistence: sharedPersistence, classifier: null });
  configureAcceptedTwistLog({ persistence: sharedPersistence });
  const creativeMemoryStore = createCreativeMemoryStore({ persistence: sharedPersistence });
  const app = express();
  app.use(express.json());
  // Stand-in canonical auth identity for the isolated smoke server.
  app.use((req, _res, next) => {
    req.authUser = { id: "smoke-user-1" };
    req.userId = req.authUser.id;
    next();
  });
  mountCraftRoutes(app, { authorizeProjectAccess: async () => true });
  mountMemoryCharacterMentionRoute(app, { creativeMemoryStore });
  mountCharacterTraitRoute(app, { creativeMemoryStore });
  mountBlockSignalRoute(app, { creativeMemoryStore });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  return { server, baseURL: `http://127.0.0.1:${port}` };
}

console.log("[backend-surface-smoke] starting");
const { server, baseURL } = await startServer();

try {
  // ---- craft framework + schema endpoints ----
  {
    const r = await get(baseURL, "/craft/frameworks");
    check("GET /craft/frameworks 200 + frameworks array", r.status === 200 && Array.isArray(r.body?.frameworks));
  }
  {
    const r = await get(baseURL, "/craft/frameworks/save-the-cat");
    check("GET /craft/frameworks/save-the-cat returns id", r.status === 200 && r.body?.id === "save-the-cat");
  }
  {
    const r = await get(baseURL, "/craft/schemas/report");
    check("GET /craft/schemas/report returns a JSON schema", r.status === 200 && typeof r.body?.$id === "string");
  }
  {
    const r = await get(baseURL, "/craft/schemas/framework");
    check("GET /craft/schemas/framework returns a JSON schema", r.status === 200 && typeof r.body?.$id === "string");
  }

  // ---- craft analyze + overrides ----
  {
    const r = await postJson(baseURL, "/craft/analyze", {
      projectId: "smoke-proj-1",
      versionId: "v1",
      frameworkId: "save-the-cat",
      screenplay: { pageCount: 110, title: "Smoke" },
    });
    check("POST /craft/analyze 200 + coverage.complete present",
      r.status === 200 && typeof r.body?.coverage?.complete === "boolean");
  }
  {
    const created = await postJson(baseURL, "/craft/overrides", {
      turnId: "midpoint", action: "mark-present", userId: "smoke-user-1",
    });
    check("POST /craft/overrides 200 + ov_ id", created.status === 200 && /^ov_/.test(String(created.body?.id || "")));
    if (created.body?.id) {
      const deleted = await del(baseURL, `/craft/overrides/${created.body.id}`);
      check("DELETE /craft/overrides/:id 200 + ok=true", deleted.status === 200 && deleted.body?.ok === true);
    }
  }

  // ---- format linter ----
  {
    const r = await postJson(baseURL, "/craft/format/lint", { text: "INT KITCHEN NIGHT\n\nJune\nHello.\n" });
    check("POST /craft/format/lint 200 + suggestions array",
      r.status === 200 && Array.isArray(r.body?.suggestions));
  }

  // ---- twist engine ----
  {
    const r = await postJson(baseURL, "/craft/twist/suggest", {
      frameworkId: "save-the-cat", currentBeatId: "midpoint",
    });
    check("POST /craft/twist/suggest 200 + twists array",
      r.status === 200 && Array.isArray(r.body?.twists) && r.body.twists.length > 0);
  }

  // ---- accepted twist log ----
  const SAMPLE_TWIST = {
    id: "smoke-twist-1", label: "False Victory",
    hook: "The win was paid for by the wrong person.", severity: "high", rationale: "smoke",
  };
  {
    const r = await postJson(baseURL, "/craft/twist/accepted", {
      projectId: "smoke-proj-1", versionId: "v1", twist: SAMPLE_TWIST,
    });
    check("POST /craft/twist/accepted 200 + action recorded",
      r.status === 200 && r.body?.action === "recorded");
  }
  {
    const r = await get(baseURL, "/craft/twist/accepted?projectId=smoke-proj-1");
    check("GET /craft/twist/accepted 200 + entries array",
      r.status === 200 && Array.isArray(r.body?.entries));
  }
  {
    const r = await del(baseURL, `/craft/twist/accepted/${SAMPLE_TWIST.id}?projectId=smoke-proj-1&versionId=v1`);
    check("DELETE /craft/twist/accepted/:id 200 + ok=true",
      r.status === 200 && r.body?.ok === true);
  }

  // ---- logline distiller ----
  {
    const r = await postJson(baseURL, "/craft/logline/distill", {
      text: "INT. KITCHEN - NIGHT\n\nJUNE\nI can't keep doing this.\n",
      projectId: "smoke-proj-1",
      versionId: "v1",
    });
    check("POST /craft/logline/distill 200 + logline string",
      r.status === 200 && typeof r.body?.logline === "string" && r.body.logline.length > 0);
  }
  {
    const r = await get(baseURL, "/craft/logline/drift?projectId=smoke-proj-1");
    check("GET /craft/logline/drift 200 + score finite",
      r.status === 200 && Number.isFinite(r.body?.score));
  }
  {
    const r = await get(baseURL, "/craft/logline/history?projectId=smoke-proj-1");
    check("GET /craft/logline/history 200 + entries array",
      r.status === 200 && Array.isArray(r.body?.entries));
  }

  // ---- memory ----
  {
    const r = await postJson(baseURL, "/memory/record-character-mention", {
      character_name: "JUNE", source: "ios_screenplay_render", write_id: "w1",
    });
    check("POST /memory/record-character-mention 200 + recorded",
      r.status === 200 && r.body?.action === "recorded" && r.body?.characterName === "JUNE");
  }
  {
    const r = await postJson(baseURL, "/memory/character-trait", {
      character_name: "JUNE", traits: { keywords: ["anxious"] },
    });
    check("POST /memory/character-trait 200 + traits persisted",
      r.status === 200 && r.body?.traits?.keywords?.includes("anxious"));
  }
  {
    const r = await get(baseURL, "/memory/character-traits");
    check("GET /memory/character-traits 200 + characters array",
      r.status === 200 && Array.isArray(r.body?.characters));
  }
  {
    const r = await get(baseURL, "/memory/block-signal");
    check("GET /memory/block-signal 200 + level present",
      r.status === 200 && typeof r.body?.level === "string");
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log("");
if (failures === 0) {
  console.log("[backend-surface-smoke] PASS");
  process.exit(0);
} else {
  console.log(`[backend-surface-smoke] FAIL — ${failures} failure(s)`);
  process.exit(1);
}
