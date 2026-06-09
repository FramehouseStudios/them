// T-decompose-phase2a-screenplay-projects-reads — integration
// tests for the 5 GET handlers in `mountScreenplayProjectsRoutes`.
// Pin byte-identical response shape + required-deps guard.

import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";

import { mountScreenplayProjectsRoutes } from "../lib/screenplay_projects_routes.js";

function defaultOwner() {
  return {
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

function defaultDeps(overrides = {}) {
  const owner = defaultOwner();
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
    markScreenplayOwnerDirty: (_o, _now) => {},
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
    ...overrides,
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
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function get(baseURL, path) {
  const r = await fetch(`${baseURL}${path}`);
  const body = await r.json().catch(() => null);
  return { status: r.status, headers: r.headers, body };
}

test("[screenplay-projects-routes] mount fails without Express app", () => {
  assert.throws(() => mountScreenplayProjectsRoutes(null, defaultDeps()));
  assert.throws(() => mountScreenplayProjectsRoutes({}, defaultDeps()));
});

test("[screenplay-projects-routes] mount fails when required deps are missing", () => {
  const required = [
    "getOrCreateScreenplayOwnerRecord",
    "getScreenplayProjectRecord",
    "markScreenplayOwnerDirty",
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
    assert.equal(r.body.outline._serialized, true);
    assert.equal(r.body.project.id, "p1");
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, body: json };
}

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

test("[screenplay-projects-routes] POST /activate returns 404 for unknown project", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/missing/activate", {});
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "project_not_found");
  });
});

test("[screenplay-projects-routes] POST /outline parses body and persists outline", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/outline", {
      acts: [{ id: "act1", label: "Act 1" }],
      beats: [{ id: "b1", label: "Setup" }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "saved");
    assert.equal(r.body.outline._serialized, true);
  });
});

test("[screenplay-projects-routes] POST /outline returns 404 for unknown project", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/missing/outline", { acts: [] });
    assert.equal(r.status, 404);
  });
});

test("[screenplay-projects-routes] POST /scenes upserts a scene", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/scenes", {
      scene: { heading: "INT. ROOM - DAY", action: "Test scene." },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "saved");
    assert.ok(r.body.scene_id);
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
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/beats", {
      beat: { label: "Inciting incident" },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "saved");
    assert.ok(r.body.beat_id);
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
  await withTestServer(defaultDeps({
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
  }), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", {
      draft: "FADE IN:\n\nINT. ROOM - DAY\n\nAction.",
    });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "screenplay_persistence_failed");
    assert.equal(r.body.persistence, "postgres");
    assert.equal(r.body.persistence_failure_count, 1);
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

test("[screenplay-projects-routes] POST /version rejects empty draft with 400", async () => {
  await withTestServer(defaultDeps(), async (baseURL) => {
    const r = await postJson(baseURL, "/screenplay/projects/p1/version", { draft: "  " });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "draft_required");
  });
});
