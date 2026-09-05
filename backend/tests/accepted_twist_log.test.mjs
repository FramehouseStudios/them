// T-accepted-twist-log — unit tests for the pure module and
// integration tests for /craft/twist/accepted* endpoints.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import {
  recordAcceptedTwist,
  getAcceptedTwistsForProject,
  removeAcceptedTwist,
  buildAcceptedTwistsBlockForPrompt,
  storageKey,
  ACCEPTED_TWIST_SCHEMA_VERSION,
  MAX_LOG_ENTRIES,
  PROMPT_BLOCK_ITEM_CAP,
  configureAcceptedTwistLog,
  _sanitizeTwist,
} from "../lib/accepted_twist_log.js";
import { mountCraftRoutes } from "../lib/craft_routes.js";
import { configureCraftAnalysis, _resetCraftStores } from "../lib/craft_analysis.js";
import { configureLoglineDistiller } from "../lib/logline_distiller.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-twistlog-"));
  return createJsonPersistence({ jsonRoot: root });
}

const SAMPLE_TWIST = Object.freeze({
  id: "stc-midpoint-1",
  label: "False Victory",
  hook: "The win at midpoint is real, but the cost was paid by the wrong person.",
  severity: "high",
  rationale: "Classic midpoint inversion.",
});

// ---------- pure module ----------

test("[twist-log] storageKey requires projectId + twistId", () => {
  assert.equal(storageKey({ projectId: "", twistId: "t1" }), null);
  assert.equal(storageKey({ projectId: "p1", twistId: "" }), null);
  assert.equal(
    storageKey({ projectId: "p1", versionId: "v1", twistId: "t1" }),
    "entry:p1:v1:t1",
  );
  assert.equal(
    storageKey({ projectId: "p1", versionId: null, twistId: "t1" }),
    "entry:p1:-:t1",
  );
});

test("[twist-log] _sanitizeTwist drops payloads missing required fields", () => {
  assert.equal(_sanitizeTwist(null), null);
  assert.equal(_sanitizeTwist({}), null);
  assert.equal(_sanitizeTwist({ id: "t1", label: "L" }), null);
  const ok = _sanitizeTwist({ id: "t1", label: "L", hook: "H" });
  assert.deepEqual(ok, { id: "t1", label: "L", hook: "H", severity: "medium", rationale: "" });
});

test("[twist-log] _sanitizeTwist coerces invalid severity to 'medium'", () => {
  const r = _sanitizeTwist({ id: "t1", label: "L", hook: "H", severity: "bogus" });
  assert.equal(r.severity, "medium");
});

test("[twist-log] recordAcceptedTwist requires persistence + projectId + twist", async () => {
  await assert.rejects(
    () => recordAcceptedTwist({ projectId: "p", twist: SAMPLE_TWIST }),
    /persistence/i,
  );
  await assert.rejects(
    () => recordAcceptedTwist({ persistence: freshPersistence(), twist: SAMPLE_TWIST }),
    (e) => e.code === "twist_log_invalid_input",
  );
  await assert.rejects(
    () => recordAcceptedTwist({ persistence: freshPersistence(), projectId: "p", twist: { id: "t" } }),
    (e) => e.code === "twist_log_invalid_input",
  );
});

test("[twist-log] recordAcceptedTwist + getAcceptedTwistsForProject round-trip", async () => {
  const p = freshPersistence();
  const r = await recordAcceptedTwist({
    persistence: p,
    projectId: "proj-1",
    versionId: "v1",
    frameworkId: "save-the-cat",
    beatId: "midpoint",
    twist: SAMPLE_TWIST,
  });
  assert.equal(r.action, "recorded");
  assert.equal(r.entry.schemaVersion, ACCEPTED_TWIST_SCHEMA_VERSION);
  const entries = await getAcceptedTwistsForProject({ persistence: p, projectId: "proj-1" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].twist.id, "stc-midpoint-1");
  assert.equal(entries[0].beatId, "midpoint");
});

test("[twist-log] repeated recordAcceptedTwist for the same twistId yields action=updated", async () => {
  const p = freshPersistence();
  const first = await recordAcceptedTwist({
    persistence: p, projectId: "proj-2", versionId: "v1", twist: SAMPLE_TWIST,
  });
  assert.equal(first.action, "recorded");
  const firstAcceptedAtMs = first.entry.acceptedAtMs;
  // Force the lastUpdatedAtMs to advance so we can detect the update.
  const second = await recordAcceptedTwist({
    persistence: p, projectId: "proj-2", versionId: "v1", twist: SAMPLE_TWIST,
    note: "added note", acceptedAtMs: firstAcceptedAtMs + 10,
  });
  assert.equal(second.action, "updated");
  // acceptedAtMs preserved from the first acceptance.
  assert.equal(second.entry.acceptedAtMs, firstAcceptedAtMs);
  // lastUpdatedAtMs reflects the second write.
  assert.equal(second.entry.lastUpdatedAtMs, firstAcceptedAtMs + 10);
  assert.equal(second.entry.note, "added note");
  const entries = await getAcceptedTwistsForProject({ persistence: p, projectId: "proj-2" });
  assert.equal(entries.length, 1);
});

test("[twist-log] getAcceptedTwistsForProject sorts by acceptedAtMs ascending", async () => {
  const p = freshPersistence();
  await recordAcceptedTwist({
    persistence: p, projectId: "proj-3", twist: { ...SAMPLE_TWIST, id: "t-a" },
    acceptedAtMs: 1000,
  });
  await recordAcceptedTwist({
    persistence: p, projectId: "proj-3", twist: { ...SAMPLE_TWIST, id: "t-b" },
    acceptedAtMs: 500,
  });
  await recordAcceptedTwist({
    persistence: p, projectId: "proj-3", twist: { ...SAMPLE_TWIST, id: "t-c" },
    acceptedAtMs: 2000,
  });
  const entries = await getAcceptedTwistsForProject({ persistence: p, projectId: "proj-3" });
  assert.deepEqual(entries.map((e) => e.twist.id), ["t-b", "t-a", "t-c"]);
});

test("[twist-log] removeAcceptedTwist removes a single entry; second remove returns not_found", async () => {
  const p = freshPersistence();
  await recordAcceptedTwist({ persistence: p, projectId: "proj-4", twist: SAMPLE_TWIST });
  const first = await removeAcceptedTwist({
    persistence: p, projectId: "proj-4", twistId: SAMPLE_TWIST.id,
  });
  assert.equal(first.action, "removed");
  const second = await removeAcceptedTwist({
    persistence: p, projectId: "proj-4", twistId: SAMPLE_TWIST.id,
  });
  assert.equal(second.action, "not_found");
});

test("[twist-log] buildAcceptedTwistsBlockForPrompt picks newest first and caps at PROMPT_BLOCK_ITEM_CAP", () => {
  const entries = Array.from({ length: PROMPT_BLOCK_ITEM_CAP + 3 }, (_, i) => ({
    twist: {
      id: `t-${i}`, label: `Twist ${i}`, hook: `Hook ${i}`, severity: "medium",
    },
    acceptedAtMs: i, // earlier i = older
    beatId: "midpoint",
  }));
  const block = buildAcceptedTwistsBlockForPrompt(entries);
  const lines = block.split("\n");
  assert.equal(lines.length, PROMPT_BLOCK_ITEM_CAP);
  // Newest first means the highest-index entry shows up first.
  assert.ok(lines[0].includes(`Twist ${entries.length - 1}`));
});

test("[twist-log] buildAcceptedTwistsBlockForPrompt returns empty string for cold input", () => {
  assert.equal(buildAcceptedTwistsBlockForPrompt(null), "");
  assert.equal(buildAcceptedTwistsBlockForPrompt([]), "");
});

test("[twist-log] MAX_LOG_ENTRIES is at least 64 (sanity floor)", () => {
  assert.ok(MAX_LOG_ENTRIES >= 64);
});

// ---------- endpoint integration ----------

async function withTestServer(fn) {
  _resetCraftStores();
  const persistence = freshPersistence();
  configureCraftAnalysis({ persistence });
  configureLoglineDistiller({ persistence, classifier: null });
  configureAcceptedTwistLog({ persistence });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.authUser = { id: "accepted-twist-test-user" };
    req.userId = req.authUser.id;
    next();
  });
  mountCraftRoutes(app, { authorizeProjectAccess: async () => true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
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

async function del(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`, { method: "DELETE" });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

test("[twist-log] POST /craft/twist/accepted records a twist and returns the entry", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/twist/accepted", {
      projectId: "p-int-1",
      versionId: "v1",
      frameworkId: "save-the-cat",
      beatId: "midpoint",
      twist: SAMPLE_TWIST,
    });
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.action, "recorded");
    assert.equal(body.entry.twist.id, SAMPLE_TWIST.id);
    assert.equal(body.entry.frameworkId, "save-the-cat");
    assert.equal(body.entry.beatId, "midpoint");
  });
});

test("[twist-log] POST /craft/twist/accepted requires projectId", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/twist/accepted", {
      twist: SAMPLE_TWIST,
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});

test("[twist-log] POST /craft/twist/accepted rejects a malformed twist payload", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/craft/twist/accepted", {
      projectId: "p-int-bad",
      twist: { id: "only-id" },
    });
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});

test("[twist-log] GET /craft/twist/accepted returns entries chronologically", async () => {
  await withTestServer(async ({ baseURL }) => {
    await postJson(baseURL, "/craft/twist/accepted", {
      projectId: "p-int-2", twist: { ...SAMPLE_TWIST, id: "t-a" },
    });
    await new Promise((r) => setTimeout(r, 5));
    await postJson(baseURL, "/craft/twist/accepted", {
      projectId: "p-int-2", twist: { ...SAMPLE_TWIST, id: "t-b" },
    });
    const { status, body } = await get(baseURL, "/craft/twist/accepted?projectId=p-int-2");
    assert.equal(status, 200);
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.entries.length, 2);
    assert.equal(body.entries[0].twist.id, "t-a");
    assert.equal(body.entries[1].twist.id, "t-b");
  });
});

test("[twist-log] DELETE /craft/twist/accepted/:twistId removes the entry", async () => {
  await withTestServer(async ({ baseURL }) => {
    await postJson(baseURL, "/craft/twist/accepted", {
      projectId: "p-int-3", versionId: "v1", twist: SAMPLE_TWIST,
    });
    const first = await del(
      baseURL,
      `/craft/twist/accepted/${SAMPLE_TWIST.id}?projectId=p-int-3&versionId=v1`,
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.action, "removed");
    const second = await del(
      baseURL,
      `/craft/twist/accepted/${SAMPLE_TWIST.id}?projectId=p-int-3&versionId=v1`,
    );
    assert.equal(second.status, 400);
    assert.equal(second.body.error, "craft_invalid_screenplay");
  });
});

test("[twist-log] GET /craft/twist/accepted requires projectId", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await get(baseURL, "/craft/twist/accepted");
    assert.equal(status, 400);
    assert.equal(body.error, "craft_invalid_screenplay");
  });
});
