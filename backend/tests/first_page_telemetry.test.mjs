// T-first-page-telemetry-sink — unit tests for the module + endpoint
// integration tests.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import express from "express";

import {
  recordFirstPageWritten,
  getFirstPageEventForUser,
  listFirstPageEvents,
  summarizeFirstPageEvents,
  FIRST_PAGE_TELEMETRY_DOMAIN,
  configureFirstPageTelemetry,
} from "../lib/first_page_telemetry.js";
import { mountFirstPageTelemetryRoute } from "../lib/first_page_telemetry_route.js";
import { createJsonPersistence } from "../lib/persistence_json.js";

function freshPersistence() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-first-page-"));
  return createJsonPersistence({ jsonRoot: root });
}

// ---------- pure module ----------

test("[first-page] FIRST_PAGE_TELEMETRY_DOMAIN matches the canonical domain", () => {
  assert.equal(FIRST_PAGE_TELEMETRY_DOMAIN, "telemetry_first_page_written");
});

test("[first-page] recordFirstPageWritten persists a new entry", async () => {
  const p = freshPersistence();
  const r = await recordFirstPageWritten({
    persistence: p,
    userId: "u-1",
    projectId: "proj-1",
    versionId: "v1",
    source: "magic-moment",
    secondsToFirstPage: 42.5,
  });
  assert.equal(r.action, "recorded");
  assert.equal(r.entry.userId, "u-1");
  assert.equal(r.entry.secondsToFirstPage, 42.5);
});

test("[first-page] repeated recordFirstPageWritten preserves occurredAt + secondsToFirstPage", async () => {
  const p = freshPersistence();
  const first = await recordFirstPageWritten({
    persistence: p, userId: "u-2", secondsToFirstPage: 30, occurredAtMs: 1000,
  });
  const second = await recordFirstPageWritten({
    persistence: p, userId: "u-2", secondsToFirstPage: 999, occurredAtMs: 5000,
  });
  assert.equal(second.action, "updated");
  // Original values preserved.
  assert.equal(second.entry.occurredAtMs, 1000);
  assert.equal(second.entry.secondsToFirstPage, 30);
  // lastSeen reflects the latest call.
  assert.equal(second.entry.lastSeenAtMs, 5000);
  // Original occurrence preserved across two reads.
  assert.equal((await getFirstPageEventForUser({ persistence: p, userId: "u-2" })).occurredAtMs, 1000);
  // First record's reported action was "recorded".
  assert.equal(first.action, "recorded");
});

test("[first-page] recordFirstPageWritten requires a userId", async () => {
  const p = freshPersistence();
  const r = await recordFirstPageWritten({ persistence: p, userId: "" });
  assert.equal(r.ok, false);
  assert.equal(r.action, "skipped");
});

test("[first-page] listFirstPageEvents returns entries chronologically ascending", async () => {
  const p = freshPersistence();
  await recordFirstPageWritten({ persistence: p, userId: "u-a", occurredAtMs: 2000 });
  await recordFirstPageWritten({ persistence: p, userId: "u-b", occurredAtMs: 1000 });
  await recordFirstPageWritten({ persistence: p, userId: "u-c", occurredAtMs: 3000 });
  const entries = await listFirstPageEvents({ persistence: p });
  assert.deepEqual(entries.map((e) => e.userId), ["u-b", "u-a", "u-c"]);
});

test("[first-page] summarizeFirstPageEvents returns total + percentiles", () => {
  const entries = [
    { userId: "u1", secondsToFirstPage: 10 },
    { userId: "u2", secondsToFirstPage: 20 },
    { userId: "u3", secondsToFirstPage: 30 },
    { userId: "u4", secondsToFirstPage: 40 },
    { userId: "u5", secondsToFirstPage: 100 },
  ];
  const s = summarizeFirstPageEvents(entries);
  assert.equal(s.total, 5);
  assert.equal(s.medianSeconds, 30);
  assert.ok(s.percentile90Seconds >= 70);
});

test("[first-page] summarizeFirstPageEvents handles empty + no-timing inputs", () => {
  assert.deepEqual(summarizeFirstPageEvents([]), {
    total: 0,
    medianSeconds: null,
    percentile90Seconds: null,
    percentile50Seconds: null,
  });
  const noTiming = summarizeFirstPageEvents([{ userId: "u1" }, { userId: "u2" }]);
  assert.equal(noTiming.total, 2);
  assert.equal(noTiming.medianSeconds, null);
});

// ---------- endpoint integration ----------

async function withTestServer(fn, { userId = "u-test" } = {}) {
  const persistence = freshPersistence();
  configureFirstPageTelemetry({ persistence });
  const app = express();
  app.use(express.json());
  if (userId !== null) {
    app.use((req, _res, next) => { req.user = { id: userId }; next(); });
  }
  mountFirstPageTelemetryRoute(app);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseURL, persistence });
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

async function get(baseURL, p) {
  const r = await fetch(`${baseURL}${p}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("[first-page] POST records an event resolved from req.user", async () => {
  await withTestServer(async ({ baseURL, persistence }) => {
    const { status, body } = await postJson(baseURL, "/telemetry/first-page-written", {
      projectId: "p1", versionId: "v1", source: "magic-moment", secondsToFirstPage: 45,
    });
    assert.equal(status, 200);
    assert.equal(body.action, "recorded");
    assert.equal(body.entry.userId, "u-test");
    assert.equal(body.entry.projectId, "p1");
    assert.equal(body.entry.secondsToFirstPage, 45);
    const persisted = await getFirstPageEventForUser({ persistence, userId: "u-test" });
    assert.ok(persisted);
  });
});

test("[first-page] POST accepts snake_case keys", async () => {
  await withTestServer(async ({ baseURL }) => {
    const { status, body } = await postJson(baseURL, "/telemetry/first-page-written", {
      project_id: "p2", version_id: "v2", seconds_to_first_page: 60,
    });
    assert.equal(status, 200);
    assert.equal(body.entry.projectId, "p2");
    assert.equal(body.entry.versionId, "v2");
    assert.equal(body.entry.secondsToFirstPage, 60);
  });
});

test("[first-page] POST without user returns 200 skipped (not 401)", async () => {
  await withTestServer(
    async ({ baseURL }) => {
      const { status, body } = await postJson(baseURL, "/telemetry/first-page-written", {});
      assert.equal(status, 200);
      assert.equal(body.action, "skipped");
    },
    { userId: null },
  );
});

test("[first-page] GET /stats returns aggregate values", async () => {
  await withTestServer(async ({ baseURL, persistence }) => {
    for (const [u, secs] of [["a", 10], ["b", 30], ["c", 50]]) {
      await recordFirstPageWritten({ persistence, userId: u, secondsToFirstPage: secs });
    }
    const { status, body } = await get(baseURL, "/telemetry/first-page-written/stats");
    assert.equal(status, 200);
    assert.equal(body.total, 3);
    assert.equal(body.medianSeconds, 30);
    assert.ok(body.percentile90Seconds >= 40);
  });
});

test("[first-page] POST is idempotent — second call returns action=updated", async () => {
  await withTestServer(async ({ baseURL }) => {
    const first = await postJson(baseURL, "/telemetry/first-page-written", { secondsToFirstPage: 30 });
    const second = await postJson(baseURL, "/telemetry/first-page-written", { secondsToFirstPage: 99 });
    assert.equal(first.body.action, "recorded");
    assert.equal(second.body.action, "updated");
    assert.equal(second.body.entry.secondsToFirstPage, 30);
  });
});
