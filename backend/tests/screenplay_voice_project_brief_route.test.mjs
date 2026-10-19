import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import express from "express";
import { mountScreenplayVoiceProjectBriefRoute } from "../lib/screenplay_voice_project_brief_route.js";

function owner(userId, projectId = "project-1", title = "Midnight Run") {
  return {
    ownerKey: `user:${userId}`,
    activeProjectId: projectId,
    updatedAt: 0,
    projects: [{ id: projectId, title, updatedAt: 0 }],
  };
}

function createDurableHarness(seed = {}) {
  const persisted = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  let chain = Promise.resolve();
  const deps = {
    resolveScreenplayUserId: (req) => req.authUser?.id || null,
    getOrCreateScreenplayOwnerRecord(req) {
      const key = `user:${req.authUser.id}`;
      if (!persisted.has(key)) persisted.set(key, owner(req.authUser.id, "other-project", "Other"));
      return structuredClone(persisted.get(key));
    },
    getScreenplayProjectRecord: (record, projectId) => record?.projects?.find((project) => project.id === projectId) || null,
    refreshScreenplayOwnerRecord: async (ownerKey) => ({
      ok: true,
      owner: persisted.has(ownerKey) ? structuredClone(persisted.get(ownerKey)) : null,
    }),
    commitScreenplayOwnerMutation({ ownerKey, mutate }) {
      const run = chain.then(async () => {
        const current = structuredClone(persisted.get(ownerKey));
        const next = structuredClone(current);
        const result = await mutate(next, { attempt: 1, currentOwner: current });
        if (result?.commit !== false) persisted.set(ownerKey, structuredClone(next));
        return {
          ok: true,
          committed: result?.commit !== false || result?.kind === "replayed",
          owner: structuredClone(result?.commit !== false ? next : current),
          result,
        };
      });
      chain = run.catch(() => {});
      return run;
    },
    buildScreenplayEnvelope: (_req, _owner, extra) => ({ ok: true, ...extra }),
    buildScreenplayReadMeta: (_req, record) => ({ revision: record.updatedAt || 0 }),
    applyReadStateHeaders: (res) => res.setHeader("X-Screenplay-State", "canonical"),
    normalizeSnippet: (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "",
  };
  return { deps, persisted };
}

async function withServer(deps, userId, run) {
  const app = express();
  if (userId) app.use((req, _res, next) => { req.authUser = { id: userId }; next(); });
  mountScreenplayVoiceProjectBriefRoute(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(baseURL, projectId, body) {
  const response = await fetch(`${baseURL}/screenplay/projects/${projectId}/brief/turn`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test("route requires canonical authenticated identity", async () => {
  const harness = createDurableHarness();
  await withServer(harness.deps, null, async (baseURL) => {
    const response = await post(baseURL, "project-1", {
      client_request_id: "brief-auth-1",
      expected_revision: 0,
      action: { type: "skip_current" },
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.error, "user_auth_required");
  });
});

test("route persists a bounded brief turn and omitted fields do not clear prior data", async () => {
  const alice = owner("alice");
  const harness = createDurableHarness({ [alice.ownerKey]: alice });
  await withServer(harness.deps, "alice", async (baseURL) => {
    const first = await post(baseURL, "project-1", {
      client_request_id: "brief-alice-1",
      expected_revision: 0,
      action: {
        type: "candidates",
        candidates: {
          genre: "science fiction",
          characters: ["Mara", "Eli", "JO", "Venn", "Cato"],
        },
      },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.status, "saved");
    assert.equal(first.body.brief_revision, 1);
    assert.equal(first.body.brief.title, "Midnight Run");
    assert.equal(first.headers.get("x-screenplay-state"), "canonical");

    const second = await post(baseURL, "project-1", {
      client_request_id: "brief-alice-2",
      expected_revision: 1,
      action: { type: "candidates", candidates: { tone: "urgent" } },
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.brief_revision, 2);
    assert.equal(second.body.brief.fields.genre.value, "science fiction");
    assert.deepEqual(second.body.brief.fields.characters.value, ["Mara", "Eli", "JO", "Venn", "Cato"]);
    assert.equal(second.body.brief.fields.tone.value, "urgent");
  });
});

test("same request replays from its durable receipt after a server restart", async () => {
  const alice = owner("alice");
  const harness = createDurableHarness({ [alice.ownerKey]: alice });
  const request = {
    client_request_id: "brief-restart-1",
    expected_revision: 0,
    action: { type: "candidates", candidates: { story_clock: "before midnight" } },
  };
  await withServer(harness.deps, "alice", async (baseURL) => {
    const first = await post(baseURL, "project-1", request);
    assert.equal(first.status, 200);
    assert.equal(first.body.status, "saved");
  });
  const restarted = createDurableHarness(Object.fromEntries(harness.persisted));
  await withServer(restarted.deps, "alice", async (baseURL) => {
    const replay = await post(baseURL, "project-1", request);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.status, "replayed");
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.brief.fields.storyClock.value, "before midnight");
  });
});

test("competing devices use expected revision CAS and return the canonical winner", async () => {
  const alice = owner("alice");
  const harness = createDurableHarness({ [alice.ownerKey]: alice });
  await withServer(harness.deps, "alice", async (baseURL) => {
    const [left, right] = await Promise.all([
      post(baseURL, "project-1", {
        client_request_id: "brief-device-a",
        expected_revision: 0,
        action: { type: "candidates", candidates: { genre: "thriller" } },
      }),
      post(baseURL, "project-1", {
        client_request_id: "brief-device-b",
        expected_revision: 0,
        action: { type: "candidates", candidates: { genre: "comedy" } },
      }),
    ]);
    const saved = [left, right].find((response) => response.status === 200);
    const stale = [left, right].find((response) => response.status === 409);
    assert.ok(saved);
    assert.ok(stale);
    assert.equal(stale.body.status, "stale_revision");
    assert.equal(stale.body.brief_revision, 1);
    assert.equal(stale.body.brief.fields.genre.value, saved.body.brief.fields.genre.value);
  });
});

test("request-id reuse and superseded replay return 409 with current brief", async () => {
  const alice = owner("alice");
  const harness = createDurableHarness({ [alice.ownerKey]: alice });
  const firstRequest = {
    client_request_id: "brief-once",
    expected_revision: 0,
    action: { type: "candidates", candidates: { genre: "thriller" } },
  };
  await withServer(harness.deps, "alice", async (baseURL) => {
    assert.equal((await post(baseURL, "project-1", firstRequest)).status, 200);
    const reused = await post(baseURL, "project-1", {
      ...firstRequest,
      action: { type: "candidates", candidates: { genre: "comedy" } },
    });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.status, "request_id_reused");
    assert.equal(reused.body.brief.fields.genre.value, "thriller");

    assert.equal((await post(baseURL, "project-1", {
      client_request_id: "brief-confirm",
      expected_revision: 1,
      action: { type: "confirm", field: "genre" },
    })).status, 200);
    const superseded = await post(baseURL, "project-1", firstRequest);
    assert.equal(superseded.status, 409);
    assert.equal(superseded.body.status, "replayed_superseded");
    assert.equal(superseded.body.brief_revision, 2);
  });
});

test("invalid writes are 400 and cross-owner projects are indistinguishable from missing", async () => {
  const alice = owner("alice");
  const bob = owner("bob", "project-bob", "Bob Project");
  const harness = createDurableHarness({ [alice.ownerKey]: alice, [bob.ownerKey]: bob });
  await withServer(harness.deps, "alice", async (baseURL) => {
    const invalid = await post(baseURL, "project-1", { action: { type: "skip_current" } });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.status, "invalid_precondition");
    const missing = await post(baseURL, "missing", {});
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error, "project_not_found");
  });
  await withServer(harness.deps, "bob", async (baseURL) => {
    const crossOwner = await post(baseURL, "project-1", {});
    assert.equal(crossOwner.status, 404);
    assert.equal(crossOwner.body.error, "project_not_found");
  });
});

test("screenplay projects mount delegates the brief route to its child module", () => {
  const source = fs.readFileSync(new URL("../lib/screenplay_projects_routes.js", import.meta.url), "utf8");
  assert.match(source, /mountScreenplayVoiceProjectBriefRoute\(app,/);
});
