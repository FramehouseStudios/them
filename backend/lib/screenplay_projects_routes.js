// T-decompose-phase2a-screenplay-projects-reads — extract the
// `/screenplay/projects/*` GET routes from backend/index.js.
//
// Phase 2 of the decomposition (spec: docs/specs/T-decompose-backend-
// index.md). Phase 0 landed via PR #183 (/health), Phase 1 via #190
// (/ops/metrics + /ops/alerts). This PR extracts the 5 read-only
// project routes. The 7 write routes (POST, version) follow in
// Phase 2b once this lands. Per spec, max 1 decomposition PR in
// flight.
//
// Routes:
//   GET  /screenplay/projects
//   GET  /screenplay/projects/:projectId
//   GET  /screenplay/projects/:projectId/outline
//   GET  /screenplay/projects/:projectId/collaborators
//   GET  /screenplay/projects/:projectId/comments
//
// Behavior is byte-identical with the previous inline handlers
// (same response shape, status codes, headers). Pure deps are
// passed by reference; live state is accessed through the deps
// (the screenplay store ultimately lives in screenplay_store.js,
// so no live-counter accessors are needed here — owner records
// are read at request time inside each handler).
//
// Access-control posture: PER-USER. Every handler resolves an
// owner record from the request (cookie / token / X-Client-Token),
// then reads only that owner's projects. The response carries
// project content (titles, outlines, draft excerpts, comments) so
// this is NOT safe-public. The /screenplay/projects/* routes are
// already mounted unauthenticated in the existing inline code,
// keyed off the owner record's client-token / IP — this PR
// preserves that exact behavior (no change to access control;
// only a code-organization change).

function mountScreenplayProjectsRoutes(app, deps = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountScreenplayProjectsRoutes requires an Express app");
  }
  const {
    // Owner / project resolution
    getOrCreateScreenplayOwnerRecord,
    getScreenplayProjectRecord,
    // Envelope + headers
    buildScreenplayEnvelope,
    buildScreenplayReadMeta,
    applyReadStateHeaders,
    // Payload serializers
    toScreenplayProjectPayload,
    toScreenplayOutlinePayload,
    toScreenplayCollaboratorPayload,
    toScreenplayCommentPayload,
    // Normalizers / parsers
    parseBool,
    parsePositiveInt,
    normalizeSnippet,
    normalizeEmailAddress,
    normalizeClientIp,
    clientIp,
  } = deps;

  const requiredFns = {
    getOrCreateScreenplayOwnerRecord,
    getScreenplayProjectRecord,
    buildScreenplayEnvelope,
    buildScreenplayReadMeta,
    applyReadStateHeaders,
    toScreenplayProjectPayload,
    toScreenplayOutlinePayload,
    toScreenplayCollaboratorPayload,
    toScreenplayCommentPayload,
    parseBool,
    parsePositiveInt,
    normalizeSnippet,
    normalizeEmailAddress,
    normalizeClientIp,
    clientIp,
  };
  for (const [key, fn] of Object.entries(requiredFns)) {
    if (typeof fn !== "function") {
      throw new Error(`mountScreenplayProjectsRoutes: ${key} is required`);
    }
  }

  app.get("/screenplay/projects", (req, res) => {
    const owner = getOrCreateScreenplayOwnerRecord(req, { create: true });
    const includeVersions = parseBool(req.query?.include_versions);
    const includeDrafts = parseBool(req.query?.include_drafts);
    const limit = Math.max(1, Math.min(96, parsePositiveInt(req.query?.limit, 24)));
    const payloadProjects = [...(owner.projects || [])]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, limit)
      .map((project) => toScreenplayProjectPayload(project, {
        includeVersions,
        includeDrafts,
        versionLimit: includeVersions ? 12 : 0,
      }));
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_projects",
      source: "screenplay_store",
      source_ip: normalizeClientIp(clientIp(req)),
      screenplay_active_project_id: owner.activeProjectId || "",
      screenplay_project_count: owner.projects.length,
      screenplay_projects: payloadProjects,
    }));
  });

  app.get("/screenplay/projects/:projectId", (req, res) => {
    const owner = getOrCreateScreenplayOwnerRecord(req, { create: true });
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const includeDrafts = parseBool(req.query?.include_drafts);
    const versionLimit = Math.max(1, Math.min(64, parsePositiveInt(req.query?.version_limit, 24)));
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_project", error: "project_not_found" });
    }
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_project",
      source: "screenplay_store",
      source_ip: normalizeClientIp(clientIp(req)),
      screenplay_active_project_id: owner.activeProjectId || "",
      screenplay_project_count: owner.projects.length,
      project: toScreenplayProjectPayload(project, {
        includeVersions: true,
        includeDrafts,
        versionLimit,
      }),
    }));
  });

  app.get("/screenplay/projects/:projectId/outline", (req, res) => {
    const owner = getOrCreateScreenplayOwnerRecord(req, { create: true });
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const includeProject = req.query?.include_project == null ? true : parseBool(req.query?.include_project);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_outline", error: "project_not_found" });
    }
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_outline",
      source: "screenplay_store",
      source_ip: normalizeClientIp(clientIp(req)),
      project_id: project.id,
      outline: toScreenplayOutlinePayload(project.outline),
      project: includeProject
        ? toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false })
        : null,
    }));
  });

  app.get("/screenplay/projects/:projectId/collaborators", (req, res) => {
    const owner = getOrCreateScreenplayOwnerRecord(req, { create: true });
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_collaborators", error: "project_not_found" });
    }
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_collaborators",
      status: "ok",
      project_id: project.id,
      collaborator_count: Array.isArray(project.collaborators) ? project.collaborators.length : 0,
      approved_emails: (project.approvedEmails || []),
      collaborators: (project.collaborators || []).map(toScreenplayCollaboratorPayload),
      project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
    }));
  });

  app.get("/screenplay/projects/:projectId/comments", (req, res) => {
    const owner = getOrCreateScreenplayOwnerRecord(req, { create: true });
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_comments", error: "project_not_found" });
    }
    const actorEmail = normalizeEmailAddress(req.query?.actor_email);
    const limit = Math.max(1, Math.min(240, parsePositiveInt(req.query?.limit, 120)));
    const comments = [...(project.comments || [])]
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      .slice(-limit)
      .map((comment) => toScreenplayCommentPayload(comment, actorEmail));
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_comments",
      status: "ok",
      project_id: project.id,
      comment_count: comments.length,
      comments,
      project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
    }));
  });
}

export { mountScreenplayProjectsRoutes };
