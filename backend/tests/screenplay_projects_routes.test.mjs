// T-decompose-phase2a-screenplay-projects-reads — integration
// tests for the 5 GET handlers in `mountScreenplayProjectsRoutes`.
// Pin byte-identical response shape + required-deps guard.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountScreenplayProjectsRoutes } from "../lib/screenplay_projects_routes.js";

function defaultOwner() {
  return {
    ownerKey: "owner:screenplay-route-test-user",
    activeProjectId: "p1",
    projects: [
      {
        id: "p1",
        title: "First Project",
        updatedAt: 2000,
        approvedEmails: ["alice@example.com"],
        collaborators: [
          { id: "c1", email: "alice@example.com", status: "approved" },
        ],
        comments: [
          { id: "cm1", text: "first", createdAt: 1000, authorEmail: "alice@example.com" },
          { id: "cm2", text: "second", createdAt: 1500, authorEmail: "bob@example.com" },
        ],
        outline: { acts: [], beats: [] },
      },
      {
        id: "p2",
        title: "Second Project",
        updatedAt: 1000,
        approvedEmails: [],
        collaborators: [],
        comments: [],
        outline: { acts: [], beats: [] },
      },
    ],
  };
}

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function defaultDeps(overrides = {}) {
  const owner = defaultOwner();
  const commitStats = { calls: 0, writes: 0 };
  return {
    getOrCreateScreenplayOwnerRecord: () => owner,
    getScreenplayProjectRecord: (o, id) => (o.projects || []).find((p) => p.id === id) || null,
    buildScreenplayEnvelope: (_req, o, extra) => ({ ok: true, ...extra }),
    buildScreenplayReadMeta: () => ({ stateVersion: "v1" }),
    applyReadStateHeaders: (res, meta) => { res.setHeader("X-State-Version", meta.stateVersion); },
    toScreenplayProjectPayload: (project, opts) => ({
      id: project.id,
      title: project.title,
      logline: project.logline || "",
      theme_argument: project.themeArgument || "",
      central_question: project.centralQuestion || "",
      protagonist_want: project.protagonistWant || "",
      protagonist_need: project.protagonistNeed || "",
      antagonistic_force: project.antagonisticForce || "",
      act_position: project.actPosition || "",
      ending_image: project.endingImage || "",
      unresolved_setups: project.unresolvedSetups || [],
      studio_ask_note_history: project.studioAskNoteHistory || [],
      outline_revision: Number(project.outlineRevision || project.outline?.revision || 0),
      _versionsIncluded: Boolean(opts?.includeVersions),
      _draftsIncluded: Boolean(opts?.includeDrafts),
    }),
    toScreenplayOutlinePayload: (outline) => ({ ...outline, _serialized: true }),
    toScreenplayCollaboratorPayload: (c) => ({ id: c.id, email: c.email }),
    toScreenplayCommentPayload: (c, actor) => ({
      id: c.id,
      text: c.text,
      authorEmail: c.authorEmail,
      _viewerIsAuthor: actor === c.authorEmail,
    }),
    parseBool: (v) => v === "true" || v === true || v === "1" || v === 1,
    parsePositiveInt: (v, def) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
    },
    normalizeSnippet: (v, _max) => (typeof v === "string" ? v.trim() : ""),
    normalizeEmailAddress: (v) => (typeof v === "string" ? v.trim().toLowerCase() : ""),
    normalizeClientIp: (v) => (typeof v === "string" ? v : ""),
    clientIp: () => "127.0.0.1",
    // Phase 2b write-route deps
    commitScreenplayOwnerMutation: async ({ mutate }) => {
      commitStats.calls += 1;
      const result = await mutate(owner, { attempt: 1, currentOwner: structuredClone(owner) });
      if (result?.commit !== false) commitStats.writes += 1;
      return {
        ok: true,
        committed: result?.commit !== false,
        owner,
        result,
      };
    },
    markScreenplayOwnerDirty: (_o, _now) => {},
    refreshScreenplayOwnerRecord: async (ownerKey) => ({
      ok: true,
      owner: owner.ownerKey === ownerKey ? owner : null,
      authoritative: true,
      persistenceKind: "test",
    }),
    createScreenplayId: (prefix) => `${prefix || "id"}_test_${Math.random().toString(36).slice(2, 8)}`,
    createEmptyScreenplayOutline: () => ({ acts: [], beats: [], scenes: [] }),
    parseScreenplayOutlineInput: (body, _now) => ({ acts: body?.acts || [], beats: body?.beats || [], scenes: body?.scenes || [] }),
    upsertScreenplaySceneRecord: (project, sceneInput, _now) => {
      if (!sceneInput || (!sceneInput.id && !sceneInput.heading)) return null;
      const scene = { id: sceneInput.id || `scene_${Math.random().toString(36).slice(2, 8)}`, ...sceneInput };
      project.outline = project.outline || { acts: [], beats: [], scenes: [] };
      project.outline.scenes = (project.outline.scenes || []).filter((s) => s.id !== scene.id);
      project.outline.scenes.push(scene);
      return scene;
    },
    upsertScreenplayBeatRecord: (project, beatInput, _now) => {
      if (!beatInput || (!beatInput.id && !beatInput.label)) return null;
      const beat = { id: beatInput.id || `beat_${Math.random().toString(36).slice(2, 8)}`, ...beatInput };
      project.outline = project.outline || { acts: [], beats: [], scenes: [] };
      project.outline.beats = (project.outline.beats || []).filter((b) => b.id !== beat.id);
      project.outline.beats.push(beat);
      return beat;
    },
    getLatestScreenplayVersion: (project) => (project.versions || [])[0] || null,
    scoreScreenplayDraft: (_draft) => ({ formatScore: 0.8, storyScore: 0.7, confidenceClass: "medium", warnings: [] }),
    buildDraftExcerpt: (draft, _len) => String(draft).slice(0, 50),
    toScreenplayScenePayload: (s) => ({ id: s.id, heading: s.heading || "" }),
    toScreenplayBeatPayload: (b) => ({ id: b.id, label: b.label || "" }),
    toScreenplayVersionPayload: (v, _opts) => ({ id: v.id, draft: v.draft || "", source: v.source || "" }),
    normalizeScreenplayStringList: (v, _max, _itemMax) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []),
    normalizeScreenplayPhaseValue: (v) => (typeof v === "string" && v ? v : "scene_draft"),
    normalizeStoredScreenplayThreadViewState: (v) => v || null,
    normalizeStoredScreenplayDiffAcknowledgementState: (v) => ({ keys: v?.keys || [], entries: v?.entries || [] }),
    normalizeStoredScreenplayStudioAskNoteHistory: (v) => (Array.isArray(v) ? v.slice(0, 24) : []),
    normalizeStoredScreenplayWriteAnchors: (v) => v || [],
    normalizeStoredScreenplayBindings: (v) => v || [],
    _owner: owner,
    _commitStats: commitStats,
    ...overrides,
  };
}

function serializedCommitter(owner, stats = { calls: 0, writes: 0 }) {
  let chain = Promise.resolve();
  return async ({ mutate }) => {
    stats.calls += 1;
    const run = chain.then(async () => {
      const nextOwner = structuredClone(owner);
      const result = await mutate(nextOwner, {
        attempt: 1,
        currentOwner: structuredClone(owner),
      });
      if (result?.commit !== false) {
        stats.writes += 1;
        for (const key of Object.keys(owner)) delete owner[key];
        Object.assign(owner, nextOwner);
      }
      return {
        ok: true,
        committed: result?.commit !== false,
        owner,
        result,
      };
    });
    chain = run.catch(() => {});
    return run;
  };
}

async function withTestServer(deps, fn, { authenticated = true, userId = "screenplay-route-test-user" } = {}) {
  const app = express();
  if (authenticated) {
    app.use((req, _res, next) => {
      req.authUser = { id: userId };
      req.userId = userId;
      next();
    });
  }
  mountScreenplayProjectsRoutes(app, deps);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`, {
    headers: { connection: "close" },
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, headers: r.headers, body };
}

async function assertRequestReachedPersistenceGate(persistenceStarted, responsePromise, label) {
  const outcome = await Promise.race([
    persistenceStarted.then(() => ({ kind: "persistence_started" })),
    responsePromise.then(
      (response) => ({ kind: "response", response }),
      (error) => ({ kind: "error", error })
    ),
  ]);
  if (outcome.kind === "error") throw outcome.error;
  assert.equal(
    outcome.kind,
    "persistence_started",
    `${label} completed before reaching its persistence gate: ${JSON.stringify(outcome.response || null)}`
  );
}

test("[screenplay-projects-routes] persistence gates surface early request failures", async () => {
  const transportFailure = new Error("synthetic local transport failure");
  await assert.rejects(
    assertRequestReachedPersistenceGate(
      new Promise(() => {}),
      Promise.reject(transportFailure),
      "regression request"
    ),
    (error) => error === transportFailure
  );
});

test("[screenplay-projects-routes] mount fails without Express app", () => {
  assert.throws(() => mountScreenplayProjectsRoutes(null, defaultDeps()));
  assert.throws(() => mountScreenplayProjectsRoutes({}, defaultDeps()));
});

test("[screenplay-projects-routes] mount fails when required deps are missing", () => {
  const required = [
    "getOrCreateScreenplayOwnerRecord",
    "getScreenplayProjectRecord",
    "commitScreenplayOwnerMutation",
    "markScreenplayOwnerDirty",
    "refreshScreenplayOwnerRecord",
    "createScreenplayId",
    "createEmptyScreenplayOutline",
    "parseScreenplayOutlineInput",
    "upsertScreenplaySceneRecord",
    "upsertScreenplayBeatRecord",
    "getLatestScreenplayVersion",
    "scoreScreenplayDraft",
    "buildDraftExcerpt",
    "buildScreenplayEnvelope",
    "buildScreenplayReadMeta",
    "applyReadStateHeaders",
    "toScreenplayProjectPayload",
    "toScreenplayOutlinePayload",
    "toScreenplayCollaboratorPayload",
    "toScreenplayCommentPayload",
    "toScreenplayScenePayload",
    "toScreenplayBeatPayload",
    "toScreenplayVersionPayload",
    "parseBool",
    "parsePositiveInt",
    "normalizeSnippet",
    "normalizeEmailAddress",
    "normalizeClientIp",
    "clientIp",
    "normalizeScreenplayStringList",
    "normalizeScreenplayPhaseValue",
    "normalizeStoredScreenplayThreadViewState",
    "normalizeStoredScreenplayDiffAcknowledgementState",
    "normalizeStoredScreenplayStudioAskNoteHistory",
    "normalizeStoredScreenplayWriteAnchors",
    "normalizeStoredScreenplayBindings",
  ];
  for (const key of required) {
    const deps = defaultDeps();
    deps[key] = undefined;
    const app = express();
    assert.throws(
      () => mountScreenplayProjectsRoutes(app, deps),
      new RegExp(key),
      `should reject missing ${key}`,
    );
  }
});

test("[screenplay-projects-routes] mount rejects invalid custom auth resolver", () => {
  const app = express();
  assert.throws(
    () => mountScreenplayProjectsRoutes(app, defaultDeps({ resolveScreenplayUserId: "bad" })),
    /resolveScreenplayUserId/,
  );
});

test("[screenplay-projects-routes] unauthenticated requests return 401 and do not create an owner", async () => {
  let ownerLookups = 0;
  const deps = defaultDeps({
    getOrCreateScreenplayOwnerRecord: () => {
      ownerLookups += 1;
      return defaultOwner();
    },
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await fetch(`${baseURL}/screenplay/projects`, {
      headers: { "X-User-Id": "spoofed-user" },
    });
    const body = await r.json();
    assert.equal(r.status, 401);
    assert.equal(body.error, "user_auth_required");
    assert.equal(body.stage, "screenplay_projects");
    assert.equal(ownerLookups, 0);
  }, { authenticated: false });
});

test("[screenplay-projects-routes] GET /screenplay/projects lists projects, newest first", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects");
    assert.equal(r.status, 200);
    assert.equal(r.body.stage, "screenplay_projects");
    assert.equal(r.body.screenplay_project_count, 2);
    assert.equal(r.body.screenplay_projects[0].id, "p1"); // newest (updatedAt 2000)
    assert.equal(r.body.screenplay_projects[1].id, "p2"); // older
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-state-version"), "v1");
  });
});

test("[screenplay-projects-routes] GET /screenplay/projects respects include_versions + limit", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects?include_versions=true&limit=1");
    assert.equal(r.body.screenplay_projects.length, 1);
    assert.equal(r.body.screenplay_projects[0]._versionsIncluded, true);
  });
});

test("[screenplay-projects-routes] GET /screenplay/projects preserves active project id outside returned page", async () => {
  const deps = defaultDeps();
  deps._owner.activeProjectId = "p2";

  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects?limit=1");

    assert.equal(r.status, 200);
    assert.equal(r.body.screenplay_active_project_id, "p2");
    assert.equal(r.body.screenplay_projects.length, 1);
    assert.equal(r.body.screenplay_projects[0].id, "p1");
  });
});

test("[screenplay-projects-routes] GET /screenplay/projects/:projectId returns 404 for unknown id", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/nope");
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "project_not_found");
  });
});

test("[screenplay-projects-routes] GET /screenplay/projects/:projectId returns project + versions by default", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/p1");
    assert.equal(r.status, 200);
    assert.equal(r.body.project.id, "p1");
    assert.equal(r.body.project._versionsIncluded, true);
  });
});

test("[screenplay-projects-routes] GET /outline returns 404 for unknown project", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/missing/outline");
    assert.equal(r.status, 404);
  });
});

test("[screenplay-projects-routes] GET /outline returns serialized outline + project by default", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/p1/outline");
    assert.equal(r.status, 200);
    assert.equal(r.body.outline_revision, 0);
    assert.equal(r.body.outline._serialized, true);
    assert.equal(r.body.project.id, "p1");
  });
});

test("[screenplay-projects-routes] GET /outline refreshes canonical multi-instance state", async () => {
  const deps = defaultDeps();
  const freshOwner = structuredClone(deps._owner);
  freshOwner.projects[0].outlineRevision = 4;
  freshOwner.projects[0].outline = {
    revision: 4,
    acts: [{ id: "act-fresh", title: "Fresh act" }],
    scenes: [],
    beats: [],
  };
  deps.refreshScreenplayOwnerRecord = async () => ({
    ok: true,
    owner: freshOwner,
    authoritative: true,
    persistenceKind: "postgres",
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/p1/outline");
    assert.equal(r.status, 200);
    assert.equal(r.body.outline_revision, 4);
    assert.equal(r.body.outline.acts[0].title, "Fresh act");
  });
});

test("[screenplay-projects-routes] canonical read failures return 503 instead of stale state", async () => {
  const deps = defaultDeps({
    refreshScreenplayOwnerRecord: async () => ({
      ok: false,
      persistenceKind: "postgres",
      error: new Error("database unavailable"),
    }),
  });

  await withTestServer(deps, async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/p1/outline");
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "screenplay_persistence_failed");
    assert.equal(r.body.persistence, "postgres");
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
});

test("[screenplay-projects-routes] GET /outline?include_project=false omits project payload", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/p1/outline?include_project=false");
    assert.equal(r.body.project, null);
    assert.equal(r.body.outline._serialized, true);
  });
});

test("[screenplay-projects-routes] GET /collaborators returns approved_emails + collaborators", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/p1/collaborators");
    assert.equal(r.status, 200);
    assert.equal(r.body.collaborator_count, 1);
    assert.equal(r.body.collaborators[0].email, "alice@example.com");
    assert.deepEqual(r.body.approved_emails, ["alice@example.com"]);
  });
});

test("[screenplay-projects-routes] GET /comments sorts ascending by createdAt", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/p1/comments");
    assert.equal(r.status, 200);
    assert.equal(r.body.comments.length, 2);
    assert.equal(r.body.comments[0].id, "cm1"); // older
    assert.equal(r.body.comments[1].id, "cm2"); // newer
  });
});

test("[screenplay-projects-routes] GET /comments threads actor_email through to payload", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/p1/comments?actor_email=alice@example.com");
    assert.equal(r.body.comments[0]._viewerIsAuthor, true);
    assert.equal(r.body.comments[1]._viewerIsAuthor, false);
  });
});

test("[screenplay-projects-routes] GET /comments returns 404 for unknown project", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await get(baseURL, "/screenplay/projects/missing/comments");
    assert.equal(r.status, 404);
  });
});

// ---------- Phase 2b: write-route smoke tests ----------

async function postJson(baseURL, path, body) {
  const r = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: {
      connection: "close",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, headers: r.headers, body: json };
}

test("[screenplay-projects-routes] legacy project writes refresh a project created on another instance", async () => {
  const cachedOwner = defaultOwner();
  const freshOwner = structuredClone(cachedOwner);
  freshOwner.projects.push({
    id: "remote-project",
    title: "Remote project",
    updatedAt: 3000,
    activeVersionId: "",
    lastVersionId: "",
    versions: [],
    collaborators: [],
    comments: [],
    outline: { revision: 0, acts: [], scenes: [], beats: [] },
  });
  const deps = defaultDeps({
    getOrCreateScreenplayOwnerRecord: () => cachedOwner,
    refreshScreenplayOwnerRecord: async () => ({
      ok: true,
      owner: freshOwner,
      authoritative: true,
      persistenceKind: "postgres",
    }),
    markScreenplayOwnerDirty: () => {},
    _owner: cachedOwner,
  });

  await withTestServer(deps, async (baseURL) => {
    const response = await postJson(baseURL, "/screenplay/projects/remote-project/comments", {
      text: "This write reached the canonical project.",
      author_email: "writer@example.com",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.project_id, "remote-project");
    assert.equal(freshOwner.projects.at(-1).comments.length, 1);
  });
});

test("[screenplay-projects-routes] POST /screenplay/projects creates a project, returns 201", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects", { title: "Brand New", project_id: "new1" });
    assert.equal(r.status, 201);
    assert.equal(r.body.status, "created");
    assert.equal(r.body.project_id, "new1");
  });
});

test("[screenplay-projects-routes] POST /screenplay/projects rejects empty title with 400", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects", { title: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "title_required");
  });
});

test("[screenplay-projects-routes] POST /screenplay/projects surfaces store write failure", async () => {
  await withTestServer(defaultDeps({
    markScreenplayOwnerDirty: () => ({ ok: false, fileOk: false }),
  }), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects", { title: "Cannot Persist" });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "screenplay_persistence_failed");
    assert.equal(r.body.stage, "screenplay_project");
  });
});

test("[screenplay-projects-routes] POST /screenplay/projects updates existing project with 200", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    // p1 already exists in the default owner fixture.
    const r = await postJson(baseURL, "/screenplay/projects", { title: "First Project (renamed)", project_id: "p1" });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "updated");
    assert.equal(r.body.project_id, "p1");
  });
});

test("[screenplay-projects-routes] POST /screenplay/projects responds with its committed snapshot", async () => {
  let releasePersistence;
  let signalPersistenceStarted;
  const persistenceGate = new Promise((resolve) => { releasePersistence = resolve; });
  const persistenceStarted = new Promise((resolve) => { signalPersistenceStarted = resolve; });
  let committedOwner = null;
  const deps = defaultDeps({
    buildScreenplayEnvelope: (_req, owner, extra) => ({
      ok: true,
      envelope_active_project_id: owner.activeProjectId,
      envelope_project_title: owner.projects.find((item) => item.id === "p1")?.title || "",
      ...extra,
    }),
    markScreenplayOwnerDirty: (owner) => {
      committedOwner = freezeDeep(structuredClone(owner));
      signalPersistenceStarted();
      return {
        ok: true,
        persistenceKind: "postgres",
        persistencePromise: persistenceGate,
      };
    },
  });
  const liveProject = deps._owner.projects.find((item) => item.id === "p1");

  await withTestServer(deps, async (baseURL) => {
    const responsePromise = postJson(baseURL, "/screenplay/projects", {
      project_id: "p1",
      title: "Committed project title",
    });
    try {
      await assertRequestReachedPersistenceGate(
        persistenceStarted,
        responsePromise,
        "project snapshot request"
      );
      liveProject.title = "Concurrent uncommitted project title";
      deps._owner.activeProjectId = "p2";
      deps._owner.projects.push({
        id: "concurrent-project",
        title: "Concurrent project",
        collaborators: [],
        comments: [],
        outline: { acts: [], scenes: [], beats: [] },
      });
    } finally {
      releasePersistence({ ok: true, owner: committedOwner });
    }

    const response = await responsePromise;
    assert.equal(response.status, 200);
    assert.equal(response.body.envelope_active_project_id, "p1");
    assert.equal(response.body.envelope_project_title, "Committed project title");
    assert.equal(response.body.project.title, "Committed project title");
    assert.equal(response.body.screenplay_active_project_id, "p1");
    assert.equal(response.body.screenplay_project_count, 2);
    assert.equal(response.body.screenplay_projects.some((item) => item.id === "concurrent-project"), false);
  });
});

test("[screenplay-projects-routes] POST /screenplay/projects saves and preserves feature spine metadata", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const saved = await postJson(baseURL, "/screenplay/projects", {
      title: "First Project",
      project_id: "p1",
      logline: "A composer follows a pirate radio signal into a city that has forgotten music.",
      theme_argument: "Love becomes courage when it asks for action, not nostalgia.",
      central_question: "Can Mara stop hiding in other people's songs?",
      protagonist_want: "Mara wants the missing broadcast master.",
      protagonist_need: "Mara needs to write her own ending.",
      antagonistic_force: "A studio executive burying the old recordings.",
      act_position: "Act IIa",
      ending_image: "Mara conducts the city from a rooftop as radios answer back.",
      unresolved_setups: ["The cracked acetate has not paid off.", "The silent tower remains locked."],
    });

    assert.equal(saved.status, 200);
    assert.equal(deps._owner.projects[0].logline, "A composer follows a pirate radio signal into a city that has forgotten music.");
    assert.equal(saved.body.project.theme_argument, "Love becomes courage when it asks for action, not nostalgia.");
    assert.equal(saved.body.project.act_position, "Act IIa");
    assert.deepEqual(saved.body.project.unresolved_setups, [
      "The cracked acetate has not paid off.",
      "The silent tower remains locked.",
    ]);

    const renamed = await postJson(baseURL, "/screenplay/projects", {
      title: "First Project renamed without spine",
      project_id: "p1",
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.project.logline, saved.body.project.logline);
    assert.equal(renamed.body.project.ending_image, saved.body.project.ending_image);
    assert.deepEqual(renamed.body.project.unresolved_setups, saved.body.project.unresolved_setups);
  });
});

test("[screenplay-projects-routes] POST /screenplay/projects persists Studio ask-note history", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const history = [{
      id: "exchange-one",
      request_id: "request-one",
      prompt: "Rewrite the final image.",
      target: "page",
      source: "typed",
      note_title: "Wrote to page",
      note_body: "INT. ROOM - NIGHT\n\nHe waits, still.",
      inserted_text: "INT. ROOM - NIGHT\n\nHe waits, still.",
      write_id: "write-one",
      timestamp: "2026-06-05T20:00:00.000Z",
    }];

    const saved = await postJson(baseURL, "/screenplay/projects", {
      title: "First Project",
      project_id: "p1",
      studio_ask_note_history: history,
    });
    assert.equal(saved.status, 200);
    assert.equal(deps._owner.projects[0].studioAskNoteHistory[0].id, "exchange-one");
    assert.equal(deps._owner.projects[0].studioAskNoteHistory[0].inserted_text, "INT. ROOM - NIGHT\n\nHe waits, still.");
    assert.deepEqual(saved.body.project.studio_ask_note_history, history);

    const renamed = await postJson(baseURL, "/screenplay/projects", {
      title: "First Project renamed without history",
      project_id: "p1",
    });
    assert.equal(renamed.status, 200);
    assert.equal(deps._owner.projects[0].studioAskNoteHistory[0].id, "exchange-one");
    assert.equal(renamed.body.project.studio_ask_note_history[0].inserted_text, "INT. ROOM - NIGHT\n\nHe waits, still.");
  });
});

test("[screenplay-projects-routes] POST /activate persists the active project for restore", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    assert.equal(deps._owner.activeProjectId, "p1");
    const r = await postJson(baseURL, "/screenplay/projects/p2/activate", {});
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "activated");
    assert.equal(r.body.screenplay_active_project_id, "p2");
    assert.equal(deps._owner.activeProjectId, "p2");

    const list = await get(baseURL, "/screenplay/projects");
    assert.equal(list.body.screenplay_active_project_id, "p2");
  });
});

test("[screenplay-projects-routes] POST /activate responds with its committed snapshot", async () => {
  let releasePersistence;
  let signalPersistenceStarted;
  const persistenceGate = new Promise((resolve) => { releasePersistence = resolve; });
  const persistenceStarted = new Promise((resolve) => { signalPersistenceStarted = resolve; });
  let committedOwner = null;
  const deps = defaultDeps({
    buildScreenplayEnvelope: (_req, owner, extra) => ({
      ok: true,
      envelope_active_project_id: owner.activeProjectId,
      envelope_project_title: owner.projects.find((item) => item.id === "p2")?.title || "",
      ...extra,
    }),
    markScreenplayOwnerDirty: (owner) => {
      committedOwner = freezeDeep(structuredClone(owner));
      signalPersistenceStarted();
      return {
        ok: true,
        persistenceKind: "postgres",
        persistencePromise: persistenceGate,
      };
    },
  });
  const liveProject = deps._owner.projects.find((item) => item.id === "p2");

  await withTestServer(deps, async (baseURL) => {
    const responsePromise = postJson(baseURL, "/screenplay/projects/p2/activate", {});
    try {
      await assertRequestReachedPersistenceGate(
        persistenceStarted,
        responsePromise,
        "project activation snapshot request"
      );
      deps._owner.activeProjectId = "p1";
      liveProject.title = "Concurrent uncommitted title";
      deps._owner.projects.push({
        id: "concurrent-project",
        title: "Concurrent project",
        collaborators: [],
        comments: [],
        outline: { acts: [], scenes: [], beats: [] },
      });
    } finally {
      releasePersistence({ ok: true, owner: committedOwner });
    }

    const response = await responsePromise;
    assert.equal(response.status, 200);
    assert.equal(response.body.envelope_active_project_id, "p2");
    assert.equal(response.body.envelope_project_title, "Second Project");
    assert.equal(response.body.project.title, "Second Project");
    assert.equal(response.body.screenplay_active_project_id, "p2");
    assert.equal(response.body.screenplay_project_count, 2);
    assert.equal(response.body.screenplay_projects.some((item) => item.id === "concurrent-project"), false);
  });
});

test("[screenplay-projects-routes] POST /activate returns 404 for unknown project", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/missing/activate", {});
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "project_not_found");
  });
});

test("[screenplay-projects-routes] POST /outline parses body and persists outline", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      acts: [{ id: "act1", label: "Act 1" }],
      beats: [{ id: "b1", label: "Setup" }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "saved");
    assert.equal(r.body.outline_revision, 1);
    assert.equal(r.body.outline.revision, 1);
    assert.equal(deps._owner.projects[0].outlineRevision, 1);
    assert.equal(r.body.outline._serialized, true);
  });
});

test("[screenplay-projects-routes] POST /outline commits a protected request and replays it once", async () => {
  const deps = defaultDeps();
  const body = {
    client_request_id: "outline-save-001",
    expected_outline_revision: 0,
    acts: [{ id: "act-1", title: "Act One" }],
    scenes: [{ id: "scene-1", heading: "INT. ROOM - DAY" }],
    beats: [{ id: "beat-1", label: "Reveal", scene_id: "scene-1" }],
  };

  await withTestServer(deps, async (baseURL) => {
    const first = await postJson(baseURL, "/screenplay/projects/p1/outline", body);
    const replay = await postJson(baseURL, "/screenplay/projects/p1/outline", body);

    assert.equal(first.status, 200);
    assert.equal(first.body.status, "saved");
    assert.equal(first.body.replayed, false);
    assert.equal(first.body.outline_revision, 1);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.status, "replayed");
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.outline_revision, 1);
    assert.equal(deps._commitStats.calls, 2);
    assert.equal(deps._commitStats.writes, 1);
    assert.equal(deps._owner.projects[0].outlineMutationReceipts.length, 1);
  });
});

test("[screenplay-projects-routes] POST /outline returns 425 for an identical inflight request", async () => {
  const owner = defaultOwner();
  let releaseCommit;
  let signalEntered;
  const commitGate = new Promise((resolve) => { releaseCommit = resolve; });
  const entered = new Promise((resolve) => { signalEntered = resolve; });
  const deps = defaultDeps({
    getOrCreateScreenplayOwnerRecord: () => owner,
    commitScreenplayOwnerMutation: async ({ mutate }) => {
      const nextOwner = structuredClone(owner);
      const result = await mutate(nextOwner, { attempt: 1, currentOwner: structuredClone(owner) });
      signalEntered();
      await commitGate;
      for (const key of Object.keys(owner)) delete owner[key];
      Object.assign(owner, nextOwner);
      return { ok: true, committed: true, owner, result };
    },
    _owner: owner,
  });
  const body = {
    client_request_id: "outline-save-inflight",
    expected_outline_revision: 0,
    acts: [{ id: "act-1", title: "Act One" }],
    scenes: [],
    beats: [],
  };

  await withTestServer(deps, async (baseURL) => {
    const firstRequest = postJson(baseURL, "/screenplay/projects/p1/outline", body);
    try {
      const firstState = await Promise.race([
        entered.then(() => ({ entered: true })),
        firstRequest.then((response) => ({ entered: false, response })),
      ]);
      assert.equal(
        firstState.entered,
        true,
        `first request completed before commit gate: ${JSON.stringify(firstState.response || null)}`
      );
      const inflight = await postJson(baseURL, "/screenplay/projects/p1/outline", body);

      assert.equal(inflight.status, 425);
      assert.equal(inflight.body.error, "screenplay_outline_mutation_inflight");
      assert.equal(inflight.headers.get("retry-after"), "1");

      const reusedPrecondition = await postJson(baseURL, "/screenplay/projects/p1/outline", {
        ...body,
        expected_outline_revision: 1,
      });
      assert.equal(reusedPrecondition.status, 409);
      assert.equal(
        reusedPrecondition.body.error,
        "screenplay_outline_client_request_id_reused"
      );
    } finally {
      releaseCommit();
    }
    const first = await firstRequest;
    assert.equal(first.status, 200);
    assert.equal(first.body.status, "saved");
  });
});

test("[screenplay-projects-routes] POST /outline rejects request ID reuse with changed intent", async () => {
  const deps = defaultDeps();
  const base = {
    client_request_id: "outline-save-reused",
    expected_outline_revision: 0,
    acts: [{ id: "act-1", title: "Act One" }],
    scenes: [],
    beats: [],
  };

  await withTestServer(deps, async (baseURL) => {
    const first = await postJson(baseURL, "/screenplay/projects/p1/outline", base);
    const reused = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      ...base,
      acts: [{ id: "act-1", title: "Changed Act" }],
    });

    assert.equal(first.status, 200);
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error, "screenplay_outline_client_request_id_reused");
    assert.equal(reused.body.outline_revision, 1);
    assert.equal(deps._commitStats.writes, 1);
    assert.equal(deps._owner.projects[0].outline.acts[0].title, "Act One");
  });
});

test("[screenplay-projects-routes] POST /outline rejects request ID reuse with a changed base revision", async () => {
  const deps = defaultDeps();
  const base = {
    client_request_id: "outline-save-reused-revision",
    expected_outline_revision: 0,
    acts: [{ id: "act-1", title: "Act One" }],
    scenes: [],
    beats: [],
  };

  await withTestServer(deps, async (baseURL) => {
    const first = await postJson(baseURL, "/screenplay/projects/p1/outline", base);
    const reused = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      ...base,
      expected_outline_revision: 1,
    });

    assert.equal(first.status, 200);
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error, "screenplay_outline_client_request_id_reused");
    assert.equal(reused.body.outline_revision, 1);
    assert.equal(deps._commitStats.writes, 1);
  });
});

test("[screenplay-projects-routes] protected outline replacement preserves server-owned creation times", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects[0];
  project.outlineRevision = 1;
  project.outline = {
    revision: 1,
    updatedAt: 150,
    acts: [{ id: "act-existing", title: "Old", createdAt: 100, updatedAt: 150 }],
    scenes: [{ id: "scene-existing", createdAt: 110, updatedAt: 150 }],
    beats: [{ id: "beat-existing", createdAt: 120, updatedAt: 150 }],
  };

  await withTestServer(deps, async (baseURL) => {
    const response = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-preserve-created-at",
      expected_outline_revision: 1,
      acts: [
        { id: "act-existing", title: "Updated", created_at: 999_001, updated_at: 999_002 },
        { id: "act-new", title: "New", created_at: 999_003, updated_at: 999_004 },
      ],
      scenes: [{ id: "scene-existing", createdAt: 999_005, updatedAt: 999_006 }],
      beats: [{ id: "beat-existing", createdAt: 999_007, updatedAt: 999_008 }],
    });

    assert.equal(response.status, 200);
    const [existingAct, newAct] = project.outline.acts;
    assert.equal(existingAct.createdAt, 100);
    assert.equal(project.outline.scenes[0].createdAt, 110);
    assert.equal(project.outline.beats[0].createdAt, 120);
    assert.ok(existingAct.updatedAt > 150);
    assert.equal(newAct.createdAt, newAct.updatedAt);
    assert.notEqual(newAct.createdAt, 999_003);
  });
});

test("[screenplay-projects-routes] POST /outline rejects stale and superseded retries", async () => {
  const deps = defaultDeps();
  const firstBody = {
    client_request_id: "outline-save-old",
    expected_outline_revision: 0,
    acts: [{ id: "act-1", title: "First" }],
    scenes: [],
    beats: [],
  };
  const secondBody = {
    client_request_id: "outline-save-new",
    expected_outline_revision: 1,
    acts: [{ id: "act-1", title: "Second" }],
    scenes: [],
    beats: [],
  };

  await withTestServer(deps, async (baseURL) => {
    assert.equal((await postJson(baseURL, "/screenplay/projects/p1/outline", firstBody)).status, 200);
    const stale = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      ...secondBody,
      client_request_id: "outline-save-stale",
      expected_outline_revision: 0,
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "stale_screenplay_outline_revision");
    assert.equal(stale.body.outline_revision, 1);

    assert.equal((await postJson(baseURL, "/screenplay/projects/p1/outline", secondBody)).status, 200);
    const superseded = await postJson(baseURL, "/screenplay/projects/p1/outline", firstBody);
    assert.equal(superseded.status, 409);
    assert.equal(superseded.body.error, "screenplay_outline_replayed_superseded");
    assert.equal(superseded.body.outline_revision, 2);
    assert.equal(deps._commitStats.writes, 2);
    assert.equal(deps._owner.projects[0].outline.acts[0].title, "Second");
  });
});

test("[screenplay-projects-routes] POST /outline requires paired preconditions and stable safe-mode scope", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const missingRevision = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-missing-revision",
      acts: [],
      scenes: [],
      beats: [],
    });
    assert.equal(missingRevision.status, 400);
    assert.equal(missingRevision.body.error, "outline_write_precondition_pair_required");

    const invalidRevision = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-invalid-revision",
      expected_outline_revision: null,
      acts: [],
      scenes: [],
      beats: [],
    });
    assert.equal(invalidRevision.status, 400);
    assert.equal(invalidRevision.body.error, "invalid_outline_write_precondition");

    const incompleteSnapshot = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-incomplete",
      expected_outline_revision: 0,
      acts: [],
      scenes: [],
    });
    assert.equal(incompleteSnapshot.status, 400);
    assert.equal(incompleteSnapshot.body.error, "outline_collections_required");

    const missingEntityId = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-missing-id",
      expected_outline_revision: 0,
      acts: [{ label: "Act without identity" }],
      scenes: [],
      beats: [],
    });
    assert.equal(missingEntityId.status, 400);
    assert.equal(missingEntityId.body.error, "outline_entity_id_required");

    const duplicateEntityId = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-duplicate-id",
      expected_outline_revision: 0,
      acts: [{ id: "act-1" }, { id: "act-1" }],
      scenes: [],
      beats: [],
    });
    assert.equal(duplicateEntityId.status, 400);
    assert.equal(duplicateEntityId.body.error, "outline_entity_ids_must_be_unique");

    const metadata = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-stale-metadata",
      expected_outline_revision: 0,
      title: "A stale cached title",
      acts: [],
      scenes: [],
      beats: [],
    });
    assert.equal(metadata.status, 400);
    assert.equal(metadata.body.error, "outline_safe_metadata_not_allowed");
  });
});

test("[screenplay-projects-routes] protected outline rejects orphan references before hashing or commit", async () => {
  const deps = defaultDeps();
  const before = structuredClone(deps._owner.projects[0]);

  await withTestServer(deps, async (baseURL) => {
    const orphanScene = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-orphan-scene-act",
      expected_outline_revision: 0,
      acts: [{ id: "act-1" }],
      scenes: [{ id: "scene-1", act_id: "missing-act" }],
      beats: [],
    });
    assert.equal(orphanScene.status, 400);
    assert.equal(orphanScene.body.error, "outline_reference_invalid");
    assert.equal(orphanScene.body.reason, "orphan_reference");
    assert.equal(orphanScene.body.field, "scene.act_id");
    assert.equal(orphanScene.body.reference_id, "missing-act");

    const orphanBeat = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-orphan-beat-scene",
      expected_outline_revision: 0,
      acts: [],
      scenes: [],
      beats: [{ id: "beat-1", scene_id: "missing-scene" }],
    });
    assert.equal(orphanBeat.status, 400);
    assert.equal(orphanBeat.body.error, "outline_reference_invalid");
    assert.equal(orphanBeat.body.field, "beat.scene_id");

    assert.equal(deps._commitStats.calls, 0);
    assert.deepEqual(deps._owner.projects[0], before);
  });
});

test("[screenplay-projects-routes] protected outline rejects mismatched direct and derived references", async () => {
  const deps = defaultDeps();

  await withTestServer(deps, async (baseURL) => {
    const mismatchedBeatAct = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-mismatched-beat-act",
      expected_outline_revision: 0,
      acts: [{ id: "act-1" }, { id: "act-2" }],
      scenes: [{ id: "scene-1", act_id: "act-1" }],
      beats: [{ id: "beat-1", scene_id: "scene-1", act_id: "act-2" }],
    });
    assert.equal(mismatchedBeatAct.status, 400);
    assert.equal(mismatchedBeatAct.body.error, "outline_reference_invalid");
    assert.equal(mismatchedBeatAct.body.reason, "reference_mismatch");
    assert.equal(mismatchedBeatAct.body.field, "beat.act_id");

    const mismatchedDerivedList = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-mismatched-derived-list",
      expected_outline_revision: 0,
      acts: [{ id: "act-1", scene_ids: ["scene-1"] }, { id: "act-2" }],
      scenes: [{ id: "scene-1", act_id: "act-2" }],
      beats: [],
    });
    assert.equal(mismatchedDerivedList.status, 400);
    assert.equal(mismatchedDerivedList.body.error, "outline_reference_invalid");
    assert.equal(mismatchedDerivedList.body.reason, "reference_mismatch");
    assert.equal(mismatchedDerivedList.body.field, "act.scene_ids");

    assert.equal(deps._commitStats.calls, 0);
  });
});

test("[screenplay-projects-routes] outline writes reject adversarial collection sizes before normalization", async () => {
  const deps = defaultDeps();
  const scenes = Array.from({ length: 513 }, (_, index) => ({
    id: `scene-${String(index).padStart(4, "0")}`,
  }));

  await withTestServer(deps, async (baseURL) => {
    const response = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-too-many-scenes",
      expected_outline_revision: 0,
      acts: [],
      scenes,
      beats: [],
    });

    assert.equal(response.status, 413);
    assert.equal(response.body.error, "outline_collection_limit_exceeded");
    assert.equal(response.body.limits.scenes, 512);
    assert.equal(response.body.counts.scenes, 513);
    assert.equal(deps._commitStats.calls, 0);

    const legacyResponse = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      scenes,
    });
    assert.equal(legacyResponse.status, 413);
    assert.equal(legacyResponse.body.error, "outline_collection_limit_exceeded");
    assert.equal(legacyResponse.body.counts.scenes, 513);
    assert.equal(deps._commitStats.calls, 0);
  });
});

test("[screenplay-projects-routes] concurrent protected outline writes choose one revision winner", async () => {
  const owner = defaultOwner();
  const stats = { calls: 0, writes: 0 };
  const deps = defaultDeps({
    getOrCreateScreenplayOwnerRecord: () => owner,
    commitScreenplayOwnerMutation: serializedCommitter(owner, stats),
    _owner: owner,
    _commitStats: stats,
  });
  const common = {
    expected_outline_revision: 0,
    acts: [{ id: "act-1", title: "Act One" }],
    scenes: [],
    beats: [],
  };

  await withTestServer(deps, async (baseURL) => {
    const [winner, loser] = await Promise.all([
      postJson(baseURL, "/screenplay/projects/p1/outline", {
        ...common,
        client_request_id: "outline-race-a",
      }),
      postJson(baseURL, "/screenplay/projects/p1/outline", {
        ...common,
        client_request_id: "outline-race-b",
      }),
    ]);
    assert.deepEqual([winner.status, loser.status].sort(), [200, 409]);
    assert.equal(stats.writes, 1);
    assert.equal(owner.projects[0].outlineRevision, 1);
  });
});

test("[screenplay-projects-routes] failed protected commit leaves outline state untouched", async () => {
  const deps = defaultDeps({
    commitScreenplayOwnerMutation: async () => ({
      ok: false,
      committed: false,
      persistenceKind: "postgres",
      persistenceFailureCount: 1,
    }),
  });
  const before = structuredClone(deps._owner.projects[0]);

  await withTestServer(deps, async (baseURL) => {
    const failed = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      client_request_id: "outline-cas-failed",
      expected_outline_revision: 0,
      acts: [{ id: "act-1", title: "Should not commit" }],
      scenes: [],
      beats: [],
    });

    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, "screenplay_persistence_failed");
    assert.deepEqual(deps._owner.projects[0], before);
  });
});

test("[screenplay-projects-routes] POST /outline returns 404 for unknown project", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/missing/outline", { acts: [] });
    assert.equal(r.status, 404);
  });
});

test("[screenplay-projects-routes] POST /scenes upserts a scene", async () => {
  const deps = defaultDeps();
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/scenes", {
      scene: { heading: "INT. ROOM - DAY", action: "Test scene." },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "saved");
    assert.ok(r.body.scene_id);
    assert.equal(r.body.outline_revision, 1);
  });
});

test("[screenplay-projects-routes] POST /scenes rejects missing scene with 400", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/scenes", { scene: {} });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "scene_required");
  });
});

test("[screenplay-projects-routes] POST /beats upserts a beat", async () => {
  const deps = defaultDeps();
  deps._owner.projects[0].outlineRevision = 3;
  deps._owner.projects[0].outline.revision = 3;
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/beats", {
      beat: { label: "Inciting incident" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "saved");
    assert.ok(r.body.beat_id);
    assert.equal(r.body.outline_revision, 4);
  });
});

test("[screenplay-projects-routes] scene and beat writes keep commit timestamps monotonic", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects[0];
  const futureTimestamp = Date.now() + 60_000;
  project.updatedAt = futureTimestamp;
  project.outline.updatedAt = futureTimestamp;
  const observed = [];
  deps.upsertScreenplaySceneRecord = (target, scene, committedAt) => {
    observed.push(committedAt);
    target.outline.scenes = [{ id: scene.id, updatedAt: committedAt }];
    target.outline.updatedAt = committedAt;
    target.updatedAt = committedAt;
    return target.outline.scenes[0];
  };
  deps.upsertScreenplayBeatRecord = (target, beat, committedAt) => {
    observed.push(committedAt);
    target.outline.beats = [{ id: beat.id, updatedAt: committedAt }];
    target.outline.updatedAt = committedAt;
    target.updatedAt = committedAt;
    return target.outline.beats[0];
  };

  await withTestServer(deps, async (baseURL) => {
    const scene = await postJson(baseURL, "/screenplay/projects/p1/scenes", {
      scene: { id: "scene-monotonic" },
    });
    const beat = await postJson(baseURL, "/screenplay/projects/p1/beats", {
      beat: { id: "beat-monotonic" },
    });

    assert.equal(scene.status, 200);
    assert.equal(beat.status, 200);
    assert.deepEqual(observed, [futureTimestamp + 1, futureTimestamp + 2]);
  });
});

test("[screenplay-projects-routes] scene and beat writes reject exhausted outline revisions", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects[0];
  project.outlineRevision = Number.MAX_SAFE_INTEGER;
  project.outline.revision = Number.MAX_SAFE_INTEGER;
  project.outline.scenes = [];
  project.outline.beats = [];

  await withTestServer(deps, async (baseURL) => {
    const scene = await postJson(baseURL, "/screenplay/projects/p1/scenes", {
      scene: { id: "scene-max", heading: "INT. ROOM - DAY" },
    });
    const beat = await postJson(baseURL, "/screenplay/projects/p1/beats", {
      beat: { id: "beat-max", label: "No room left" },
    });

    assert.equal(scene.status, 409);
    assert.equal(scene.body.error, "screenplay_outline_revision_exhausted");
    assert.equal(beat.status, 409);
    assert.equal(beat.body.error, "screenplay_outline_revision_exhausted");
    assert.deepEqual(project.outline.scenes, []);
    assert.deepEqual(project.outline.beats, []);
  });
});

test("[screenplay-projects-routes] scene and beat caps reject appends but preserve updates", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects[0];
  project.outlineRevision = 7;
  project.outline = {
    revision: 7,
    acts: [],
    scenes: Array.from({ length: 512 }, (_, index) => ({
      id: `scene-cap-${index}`,
      heading: `Scene ${index}`,
    })),
    beats: Array.from({ length: 2048 }, (_, index) => ({
      id: `beat-cap-${index}`,
      label: `Beat ${index}`,
    })),
  };
  const beforeRejectedWrites = structuredClone(project);

  await withTestServer(deps, async (baseURL) => {
    const sceneAppend = await postJson(baseURL, "/screenplay/projects/p1/scenes", {
      scene: { id: "scene-over-cap", heading: "No room" },
    });
    const beatAppend = await postJson(baseURL, "/screenplay/projects/p1/beats", {
      beat: { id: "beat-over-cap", label: "No room" },
    });

    assert.equal(sceneAppend.status, 413);
    assert.equal(sceneAppend.body.error, "outline_collection_limit_exceeded");
    assert.equal(sceneAppend.body.limits.scenes, 512);
    assert.equal(sceneAppend.body.counts.scenes, 512);
    assert.equal(beatAppend.status, 413);
    assert.equal(beatAppend.body.error, "outline_collection_limit_exceeded");
    assert.equal(beatAppend.body.limits.beats, 2048);
    assert.equal(beatAppend.body.counts.beats, 2048);
    assert.equal(deps._commitStats.writes, 0);
    assert.deepEqual(project, beforeRejectedWrites);

    const sceneUpdate = await postJson(baseURL, "/screenplay/projects/p1/scenes", {
      scene: { id: "scene-cap-0", heading: "Updated scene" },
    });
    const beatUpdate = await postJson(baseURL, "/screenplay/projects/p1/beats", {
      beat: { id: "beat-cap-0", label: "Updated beat" },
    });

    assert.equal(sceneUpdate.status, 200);
    assert.equal(sceneUpdate.body.outline_revision, 8);
    assert.equal(beatUpdate.status, 200);
    assert.equal(beatUpdate.body.outline_revision, 9);
    assert.equal(project.outline.scenes.length, 512);
    assert.equal(project.outline.beats.length, 2048);
    assert.equal(project.outline.scenes.find((scene) => scene.id === "scene-cap-0").heading, "Updated scene");
    assert.equal(project.outline.beats.find((beat) => beat.id === "beat-cap-0").label, "Updated beat");
    assert.equal(deps._commitStats.writes, 2);
  });
});

test("[screenplay-projects-routes] POST /collaborators approves email", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/collaborators", {
      email: "carol@example.com",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "approved");
    assert.equal(r.body.collaborator.email, "carol@example.com");
  });
});

test("[screenplay-projects-routes] POST /collaborators rejects missing email with 400", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/collaborators", { email: "" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "valid_email_required");
  });
});

test("[screenplay-projects-routes] POST /collaborators with action=remove deletes", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    // alice already exists in the default owner.
    const r = await postJson(baseURL, "/screenplay/projects/p1/collaborators", {
      email: "alice@example.com",
      action: "remove",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "removed");
    assert.equal(r.body.collaborator, null);
  });
});

test("[screenplay-projects-routes] POST /comments creates a new comment", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/comments", {
      text: "Great scene.",
      author_email: "alice@example.com",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "upsert");
    assert.ok(r.body.comment.id);
  });
});

test("[screenplay-projects-routes] POST /comments responds with its committed snapshot", async () => {
  let releasePersistence;
  let signalPersistenceStarted;
  const persistenceGate = new Promise((resolve) => { releasePersistence = resolve; });
  const persistenceStarted = new Promise((resolve) => { signalPersistenceStarted = resolve; });
  let committedOwner = null;
  const deps = defaultDeps({
    buildScreenplayEnvelope: (_req, owner, extra) => ({
      ok: true,
      envelope_active_project_id: owner.activeProjectId,
      envelope_comment_text: owner.projects
        .find((item) => item.id === "p1")
        ?.comments.find((item) => item.id === "committed-comment")
        ?.text || "",
      ...extra,
    }),
    markScreenplayOwnerDirty: (owner) => {
      committedOwner = freezeDeep(structuredClone(owner));
      signalPersistenceStarted();
      return {
        ok: true,
        persistenceKind: "postgres",
        persistencePromise: persistenceGate,
      };
    },
  });
  const liveProject = deps._owner.projects.find((item) => item.id === "p1");

  await withTestServer(deps, async (baseURL) => {
    const responsePromise = postJson(baseURL, "/screenplay/projects/p1/comments", {
      comment_id: "committed-comment",
      text: "Committed comment text.",
      author_email: "writer@example.com",
    });
    try {
      await assertRequestReachedPersistenceGate(
        persistenceStarted,
        responsePromise,
        "comment snapshot request"
      );
      liveProject.comments.find((item) => item.id === "committed-comment").text = "Concurrent uncommitted comment.";
      liveProject.comments.push({
        id: "concurrent-comment",
        text: "Concurrent comment",
        createdAt: Date.now(),
      });
      liveProject.title = "Concurrent uncommitted project title";
      deps._owner.activeProjectId = "p2";
    } finally {
      releasePersistence({ ok: true, owner: committedOwner });
    }

    const response = await responsePromise;
    assert.equal(response.status, 200);
    assert.equal(response.body.envelope_active_project_id, "p1");
    assert.equal(response.body.envelope_comment_text, "Committed comment text.");
    assert.equal(response.body.comment.text, "Committed comment text.");
    assert.equal(response.body.comments.some((item) => item.id === "concurrent-comment"), false);
    assert.equal(response.body.comment_count, 3);
    assert.equal(response.body.project.title, "First Project");
  });
});

test("[screenplay-projects-routes] POST /comments rejects empty body with 400", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/comments", {});
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "comment_or_voice_required");
  });
});

test("[screenplay-projects-routes] POST /version saves a draft and returns 201", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - DAY\n\nAction.",
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.status, "saved");
    assert.ok(r.body.version_id);
    assert.equal(r.body.conflict, false);
  });
});

test("[screenplay-projects-routes] POST /version surfaces adapter persistence failure", async () => {
  const deps = defaultDeps({
    markScreenplayOwnerDirty: () => ({
      ok: true,
      fileOk: true,
      persistenceKind: "postgres",
      persistencePromise: Promise.resolve({
        ok: false,
        persistenceKind: "postgres",
        persistenceFailureCount: 1,
      }),
    }),
  });
  const project = deps._owner.projects.find((item) => item.id === "p1");
  const versionCountBeforeSave = Array.isArray(project.versions) ? project.versions.length : 0;
  const activeVersionBeforeSave = project.activeVersionId;
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - DAY\n\nAction.",
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "screenplay_persistence_failed");
    assert.equal(r.body.persistence, "postgres");
    assert.equal(r.body.persistence_failure_count, 1);
    assert.equal(Array.isArray(project.versions) ? project.versions.length : 0, versionCountBeforeSave);
    assert.equal(project.activeVersionId, activeVersionBeforeSave);
  });
});

test("[screenplay-projects-routes] POST /version saves Clementine page writes as active project drafts", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects.find((p) => p.id === "p1");
  project.activeVersionId = "base_v1";
  project.versions = [
    {
      id: "base_v1",
      draft: "FADE IN:\n\nINT. ROOM - DAY\n\nThe old draft waits.",
      source: "studio_manual",
      updatedAt: 1000,
    },
  ];
  const generatedDraft = "FADE IN:\n\nINT. DINER - NIGHT\n\nGenerated by Clementine, with feeling.";

  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: generatedDraft,
      phase: "scene_draft",
      source: "studio_clementine_page_write",
      base_version_id: "base_v1",
      conflict_strategy: "reject_if_stale",
    });

    assert.equal(r.status, 201);
    assert.equal(r.body.status, "saved");
    assert.equal(r.body.conflict, false);
    assert.ok(r.body.version_id);
    assert.equal(project.activeVersionId, r.body.version_id);
    assert.equal(project.lastVersionId, r.body.version_id);
    assert.equal(project.versions[0].id, r.body.version_id);
    assert.equal(project.versions[0].source, "studio_clementine_page_write");
    assert.equal(project.versions[0].draft, generatedDraft);
  });
});

test("[screenplay-projects-routes] POST /version replays a committed client request exactly once", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects.find((p) => p.id === "p1");
  project.activeVersionId = "base_v1";
  project.versions = [{ id: "base_v1", draft: "Old draft.", updatedAt: 1000 }];
  const body = {
    draft: "FADE IN:\n\nINT. KITCHEN - NIGHT\n\nLucy waits.",
    base_version_id: "base_v1",
    conflict_strategy: "reject_if_stale",
    client_request_id: "device-save-001",
  };

  await withTestServer(deps, async (baseURL) => {
    const first = await postJson(baseURL, "/screenplay/projects/p1/version", body);
    const replay = await postJson(baseURL, "/screenplay/projects/p1/version", body);

    assert.equal(first.status, 201);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.status, "replayed");
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.version_id, first.body.version_id);
    assert.equal(project.versions.length, 2);
    assert.equal(project.versions[0].clientRequestId, "device-save-001");
  });
});

test("[screenplay-projects-routes] POST /version does not replay before durable persistence completes", async () => {
  let releasePersistence;
  const persistencePromise = new Promise((resolve) => {
    releasePersistence = () => resolve({ ok: true });
  });
  const deps = defaultDeps({
    markScreenplayOwnerDirty: () => ({ ok: true, persistencePromise }),
  });
  const project = deps._owner.projects.find((p) => p.id === "p1");
  const body = {
    draft: "FADE IN:\n\nINT. KITCHEN - NIGHT\n\nLucy waits.",
    client_request_id: "device-save-pending",
  };

  await withTestServer(deps, async (baseURL) => {
    const firstRequest = postJson(baseURL, "/screenplay/projects/p1/version", body);
    while (!project.versions?.some((version) => version.clientRequestId === "device-save-pending")) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const earlyReplay = await postJson(baseURL, "/screenplay/projects/p1/version", body);
    assert.equal(earlyReplay.status, 425);
    assert.equal(earlyReplay.body.status, "persistence_pending");
    assert.equal(earlyReplay.body.replayed, false);

    releasePersistence();
    const first = await firstRequest;
    assert.equal(first.status, 201);
    assert.equal(project.versions[0].persistencePending, false);
  });
});

test("[screenplay-projects-routes] POST /version responds with its committed snapshot", async () => {
  let releasePersistence;
  let signalPersistenceStarted;
  const persistenceGate = new Promise((resolve) => { releasePersistence = resolve; });
  const persistenceStarted = new Promise((resolve) => { signalPersistenceStarted = resolve; });
  let committedOwner = null;
  const deps = defaultDeps({
    markScreenplayOwnerDirty: (owner) => {
      committedOwner = structuredClone(owner);
      signalPersistenceStarted();
      return {
        ok: true,
        persistenceKind: "postgres",
        persistencePromise: persistenceGate,
      };
    },
  });
  const project = deps._owner.projects.find((item) => item.id === "p1");

  await withTestServer(deps, async (baseURL) => {
    const responsePromise = postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - DAY\n\nCommitted draft.",
    });
    try {
      await assertRequestReachedPersistenceGate(
        persistenceStarted,
        responsePromise,
        "version snapshot request"
      );
      project.versions[0].draft = "Concurrent uncommitted draft.";
    } finally {
      releasePersistence({ ok: true, owner: committedOwner });
    }

    const response = await responsePromise;
    assert.equal(response.status, 201);
    assert.equal(response.body.version.draft, "FADE IN:\n\nINT. ROOM - DAY\n\nCommitted draft.");
    assert.equal(response.body.server_version.draft, response.body.version.draft);
  });
});

test("[screenplay-projects-routes] POST /version rejects a reused client request with different content", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects.find((p) => p.id === "p1");
  await withTestServer(deps, async (baseURL) => {
    const first = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - DAY\n\nFirst draft.",
      client_request_id: "device-save-reused",
    });
    const versionCountAfterFirstSave = project.versions.length;
    const reused = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - DAY\n\nDifferent draft.",
      client_request_id: "device-save-reused",
    });

    assert.equal(first.status, 201);
    assert.equal(reused.status, 409);
    assert.equal(reused.body.status, "client_request_id_reused");
    assert.equal(reused.body.replayed, false);
    assert.equal(reused.body.conflict, true);
    assert.equal(project.versions.length, versionCountAfterFirstSave);
  });
});

test("[screenplay-projects-routes] POST /version rejects stale base_version_id with 409", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects.find((p) => p.id === "p1");
  project.activeVersionId = "server_current";
  project.versions = [{ id: "server_current", draft: "Current server draft." }];
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - NIGHT\n\nChanged.",
      base_version_id: "client_stale",
      conflict_strategy: "reject_if_stale",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "conflict");
    assert.equal(r.body.conflict, true);
    assert.equal(r.body.base_version_id, "client_stale");
    assert.equal(r.body.server_version_id, "server_current");
  });
});

test("[screenplay-projects-routes] strict version save rejects a missing base once a server version exists", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects.find((p) => p.id === "p1");
  project.activeVersionId = "server_current";
  project.versions = [{ id: "server_current", draft: "Current server draft." }];
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - NIGHT\n\nUnbased edit.",
      conflict_strategy: "reject_if_stale",
      client_request_id: "missing-base-device-save",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "conflict");
    assert.equal(r.body.conflict, true);
    assert.equal(r.body.base_version_id, "");
    assert.equal(r.body.server_version_id, "server_current");
    assert.equal(project.versions.length, 1);
  });
});

test("[screenplay-projects-routes] default version save rejects a missing base once a server version exists", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects.find((p) => p.id === "p1");
  project.activeVersionId = "server_current";
  project.versions = [{ id: "server_current", draft: "Current server draft." }];
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - NIGHT\n\nUnbased default edit.",
      client_request_id: "missing-base-default-save",
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.status, "conflict");
    assert.equal(r.body.conflict, true);
    assert.equal(r.body.base_version_id, "");
    assert.equal(r.body.server_version_id, "server_current");
    assert.equal(project.versions.length, 1);
  });
});

test("[screenplay-projects-routes] explicit allow strategy permits an unbased overwrite", async () => {
  const deps = defaultDeps();
  const project = deps._owner.projects.find((p) => p.id === "p1");
  project.activeVersionId = "server_current";
  project.versions = [{ id: "server_current", draft: "Current server draft." }];
  await withTestServer(deps, async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - NIGHT\n\nIntentional overwrite.",
      conflict_strategy: "allow",
      client_request_id: "explicit-allow-save",
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.status, "saved");
    assert.equal(r.body.conflict, false);
    assert.equal(project.versions.length, 2);
  });
});

test("[screenplay-projects-routes] POST /version rejects empty draft with 400", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", { draft: "  " });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "draft_required");
  });
});

test("[screenplay-projects-routes] GET /screenplay/projects answers 304 to a matching If-None-Match and 200 otherwise", async () => {
  const deps = {
    ...defaultDeps(),
    buildScreenplayReadMeta: () => ({ stateVersion: "v7", etag: "\"etag-v7\"" }),
    applyReadStateHeaders: (res, meta) => {
      res.setHeader("X-State-Version", meta.stateVersion);
      if (meta.etag) res.setHeader("ETag", meta.etag);
    },
  };
  await withTestServer(deps, async (baseURL) => {
    const fresh = await fetch(`${baseURL}/screenplay/projects`, { headers: { connection: "close" } });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get("etag"), "\"etag-v7\"");
    const hit = await fetch(`${baseURL}/screenplay/projects`, {
      headers: { connection: "close", "If-None-Match": "\"etag-v7\"" },
    });
    assert.equal(hit.status, 304);
    assert.equal(hit.headers.get("x-state-version"), "v7");
    assert.equal(hit.headers.get("cache-control"), "no-store");
    assert.equal((await hit.text()).length, 0);
    const miss = await fetch(`${baseURL}/screenplay/projects`, {
      headers: { connection: "close", "If-None-Match": "\"etag-v6\"" },
    });
    assert.equal(miss.status, 200);
    assert.equal((await miss.json()).stage, "screenplay_projects");
  });
});
