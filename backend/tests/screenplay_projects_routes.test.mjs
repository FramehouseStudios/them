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
    _owner: owner,
    ...overrides,
  };
}

async function withTestServer(deps, fn) {
  const app = express();
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
    "buildScreenplayEnvelope",
    "buildScreenplayReadMeta",
    "applyReadStateHeaders",
    "toScreenplayProjectPayload",
    "toScreenplayOutlinePayload",
    "toScreenplayCollaboratorPayload",
    "toScreenplayCommentPayload",
    "parseBool",
    "parsePositiveInt",
    "normalizeSnippet",
    "normalizeEmailAddress",
    "normalizeClientIp",
    "clientIp",
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
