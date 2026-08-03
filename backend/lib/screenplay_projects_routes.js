// T-decompose-phase2-screenplay-projects — `/screenplay/projects/*`
// route extraction from backend/index.js.
//
// Phase 2 of the decomposition (spec: docs/specs/T-decompose-backend-
// index.md). Phase 0 landed via PR #183 (/health), Phase 1 via #190
// (/ops/metrics + /ops/alerts). Phase 2a extracted the 5 read-only
// project routes (PR #192). This Phase 2b PR adds the 7 write routes
// to the same lib. Per spec, max 1 decomposition PR in flight.
//
// Routes:
//   GET  /screenplay/projects
//   POST /screenplay/projects                                   (2b)
//   GET  /screenplay/projects/:projectId
//   POST /screenplay/projects/:projectId/outline                (2b)
//   GET  /screenplay/projects/:projectId/outline
//   POST /screenplay/projects/:projectId/scenes                 (2b)
//   POST /screenplay/projects/:projectId/beats                  (2b)
//   GET  /screenplay/projects/:projectId/collaborators
//   POST /screenplay/projects/:projectId/collaborators          (2b)
//   GET  /screenplay/projects/:projectId/comments
//   POST /screenplay/projects/:projectId/comments               (2b)
//   POST /screenplay/projects/:projectId/version                (2b)
//
// Behavior is byte-identical with the previous inline handlers
// (same response shape, status codes, headers). Pure deps are
// passed by reference; live state is accessed through the deps
// (the screenplay store ultimately lives in screenplay_store.js,
// so no live-counter accessors are needed here — owner records
// are read at request time inside each handler).
//
// Every POST route mounts its own express.json() with the same
// limit the inline handler used (matches Codex #90's rule and the
// pre-flight `route-needs-own-parser` check).
//
// Access-control posture: PER-USER. These routes carry project
// content (titles, outlines, drafts, comments), so every handler
// requires trusted server-attached user identity before resolving an
// owner record. Caller-supplied X-User-Id is never trusted.

import express from "express";
import {
  defaultResolveScreenplayUserId,
  requireScreenplayUserId,
} from "./screenplay_route_auth.js";

function mountScreenplayProjectsRoutes(app, deps = {}) {
  if (!app || typeof app.get !== "function") {
    throw new Error("mountScreenplayProjectsRoutes requires an Express app");
  }
  const {
    // Owner / project resolution
    getOrCreateScreenplayOwnerRecord,
    getScreenplayProjectRecord,
    resolveScreenplayUserId = defaultResolveScreenplayUserId,
    // Owner mutation helpers (writes)
    markScreenplayOwnerDirty,
    createScreenplayId,
    createEmptyScreenplayOutline,
    parseScreenplayOutlineInput,
    upsertScreenplaySceneRecord,
    upsertScreenplayBeatRecord,
    getLatestScreenplayVersion,
    scoreScreenplayDraft,
    buildDraftExcerpt,
    // Envelope + headers
    buildScreenplayEnvelope,
    buildScreenplayReadMeta,
    applyReadStateHeaders,
    // Payload serializers
    toScreenplayProjectPayload,
    toScreenplayOutlinePayload,
    toScreenplayCollaboratorPayload,
    toScreenplayCommentPayload,
    toScreenplayScenePayload,
    toScreenplayBeatPayload,
    toScreenplayVersionPayload,
    // Normalizers / parsers
    parseBool,
    parsePositiveInt,
    normalizeSnippet,
    normalizeEmailAddress,
    normalizeClientIp,
    clientIp,
    normalizeScreenplayStringList,
    normalizeScreenplayPhaseValue,
    normalizeStoredScreenplayThreadViewState,
    normalizeStoredScreenplayDiffAcknowledgementState,
    normalizeStoredScreenplayStudioAskNoteHistory,
    normalizeStoredScreenplayWriteAnchors,
    normalizeStoredScreenplayBindings,
  } = deps;

  const requiredFns = {
    getOrCreateScreenplayOwnerRecord,
    getScreenplayProjectRecord,
    markScreenplayOwnerDirty,
    createScreenplayId,
    createEmptyScreenplayOutline,
    parseScreenplayOutlineInput,
    upsertScreenplaySceneRecord,
    upsertScreenplayBeatRecord,
    getLatestScreenplayVersion,
    scoreScreenplayDraft,
    buildDraftExcerpt,
    buildScreenplayEnvelope,
    buildScreenplayReadMeta,
    applyReadStateHeaders,
    toScreenplayProjectPayload,
    toScreenplayOutlinePayload,
    toScreenplayCollaboratorPayload,
    toScreenplayCommentPayload,
    toScreenplayScenePayload,
    toScreenplayBeatPayload,
    toScreenplayVersionPayload,
    parseBool,
    parsePositiveInt,
    normalizeSnippet,
    normalizeEmailAddress,
    normalizeClientIp,
    clientIp,
    normalizeScreenplayStringList,
    normalizeScreenplayPhaseValue,
    normalizeStoredScreenplayThreadViewState,
    normalizeStoredScreenplayDiffAcknowledgementState,
    normalizeStoredScreenplayStudioAskNoteHistory,
    normalizeStoredScreenplayWriteAnchors,
    normalizeStoredScreenplayBindings,
  };
  for (const [key, fn] of Object.entries(requiredFns)) {
    if (typeof fn !== "function") {
      throw new Error(`mountScreenplayProjectsRoutes: ${key} is required`);
    }
  }
  if (typeof resolveScreenplayUserId !== "function") {
    throw new Error("mountScreenplayProjectsRoutes: resolveScreenplayUserId must be a function");
  }

  function getAuthorizedScreenplayOwner(req, res, stage) {
    const userId = requireScreenplayUserId(req, res, {
      resolveUserId: resolveScreenplayUserId,
      stage,
    });
    if (!userId) return null;
    if (!req.userId) req.userId = userId;
    return getOrCreateScreenplayOwnerRecord(req, { create: true });
  }

  async function persistScreenplayOwnerOrFail(res, owner, now, stage) {
    const result = markScreenplayOwnerDirty(owner, now);
    if (result === false || result?.ok === false) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({
        stage,
        error: "screenplay_persistence_failed",
      });
      return false;
    }
    if (result?.persistencePromise) {
      const persisted = await result.persistencePromise;
      if (persisted?.ok === false) {
        res.setHeader("Cache-Control", "no-store");
        res.status(503).json({
          stage,
          error: "screenplay_persistence_failed",
          persistence: persisted.persistenceKind || result.persistenceKind || "unknown",
          persistence_failure_count: persisted.persistenceFailureCount || 1,
        });
        return false;
      }
    }
    return true;
  }

  function bodyHasAny(body, keys) {
    if (!body || typeof body !== "object") return false;
    return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
  }

  function firstBodyValue(body, keys) {
    if (!body || typeof body !== "object") return undefined;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        return body[key];
      }
    }
    return undefined;
  }

  function applyFeatureSpineMetadata(project, body) {
    const stringFields = [
      { prop: "logline", keys: ["logline"], max: 500 },
      { prop: "themeArgument", keys: ["theme_argument", "themeArgument", "theme"], max: 500 },
      { prop: "centralQuestion", keys: ["central_question", "centralQuestion", "dramatic_question", "dramaticQuestion"], max: 500 },
      { prop: "protagonistWant", keys: ["protagonist_want", "protagonistWant"], max: 500 },
      { prop: "protagonistNeed", keys: ["protagonist_need", "protagonistNeed"], max: 500 },
      { prop: "antagonisticForce", keys: ["antagonistic_force", "antagonisticForce"], max: 500 },
      { prop: "actPosition", keys: ["act_position", "actPosition", "act"], max: 80 },
      { prop: "endingImage", keys: ["ending_image", "endingImage", "final_image", "finalImage"], max: 500 },
    ];
    for (const field of stringFields) {
      if (bodyHasAny(body, field.keys)) {
        project[field.prop] = normalizeSnippet(firstBodyValue(body, field.keys), field.max);
      }
    }
    if (bodyHasAny(body, ["unresolved_setups", "unresolvedSetups"])) {
      project.unresolvedSetups = normalizeScreenplayStringList(
        firstBodyValue(body, ["unresolved_setups", "unresolvedSetups"]),
        24,
        220
      );
    }
  }

  app.get("/screenplay/projects", (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_projects");
    if (!owner) return;
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
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_project");
    if (!owner) return;
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
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_outline");
    if (!owner) return;
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

  app.post("/screenplay/projects/:projectId/activate", express.json({ limit: "64kb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_project_activate");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_project_activate", error: "project_not_found" });
    }
    const now = Date.now();
    owner.activeProjectId = project.id;
    project.updatedAt = now;
    if (!(await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_project_activate"))) return;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_project_activate",
      status: "activated",
      project_id: project.id,
      project: toScreenplayProjectPayload(project, {
        includeVersions: false,
        includeDrafts: false,
      }),
      screenplay_active_project_id: owner.activeProjectId || "",
      screenplay_project_count: owner.projects.length,
      screenplay_projects: owner.projects.map((item) => toScreenplayProjectPayload(item, {
        includeVersions: false,
        includeDrafts: false,
      })),
    }));
  });

  app.get("/screenplay/projects/:projectId/collaborators", (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_collaborators");
    if (!owner) return;
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
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_comments");
    if (!owner) return;
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

  // ---------- Phase 2b: write routes ----------

  app.post("/screenplay/projects", express.json({ limit: "512kb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_project");
    if (!owner) return;
    const now = Date.now();
    const requestedProjectId = normalizeSnippet(req.body?.project_id, 64);
    const title = normalizeSnippet(req.body?.title, 160);
    if (!title) {
      return res.status(400).json({ stage: "screenplay_project", error: "title_required" });
    }
    const activate = req.body?.activate == null ? true : parseBool(req.body?.activate);
    const existing = requestedProjectId ? getScreenplayProjectRecord(owner, requestedProjectId) : null;
    const created = !existing;
    const hasStudioThreadViewState = req.body && (
      Object.prototype.hasOwnProperty.call(req.body, "studio_thread_view_state")
      || Object.prototype.hasOwnProperty.call(req.body, "studioThreadViewState")
    );
    const hasStudioDiffAcknowledgedKeys = req.body && (
      Object.prototype.hasOwnProperty.call(req.body, "studio_diff_acknowledged_keys")
      || Object.prototype.hasOwnProperty.call(req.body, "studioDiffAcknowledgedKeys")
      || Object.prototype.hasOwnProperty.call(req.body, "studio_diff_acknowledged_entries")
      || Object.prototype.hasOwnProperty.call(req.body, "studioDiffAcknowledgedEntries")
      || Object.prototype.hasOwnProperty.call(req.body, "studio_diff_acknowledged")
      || Object.prototype.hasOwnProperty.call(req.body, "studioDiffAcknowledged")
    );
    const hasStudioAskNoteHistory = req.body && (
      Object.prototype.hasOwnProperty.call(req.body, "studio_ask_note_history")
      || Object.prototype.hasOwnProperty.call(req.body, "studioAskNoteHistory")
      || Object.prototype.hasOwnProperty.call(req.body, "studio_exchange_history")
      || Object.prototype.hasOwnProperty.call(req.body, "studioExchangeHistory")
    );
    const project = existing || {
      id: requestedProjectId || createScreenplayId("project"),
      title,
      archived: false,
      tags: [],
      characters: [],
      setting: "",
      tone: "",
      promptSeed: "",
      logline: "",
      themeArgument: "",
      centralQuestion: "",
      protagonistWant: "",
      protagonistNeed: "",
      antagonisticForce: "",
      actPosition: "",
      endingImage: "",
      unresolvedSetups: [],
      createdAt: now,
      updatedAt: now,
      lastPhase: "scene_draft",
      activeVersionId: "",
      lastVersionId: "",
      lastVersionAt: 0,
      studioThreadViewState: null,
      studioDiffAcknowledgedKeys: [],
      studioDiffAcknowledgedEntries: [],
      studioAskNoteHistory: [],
      outline: createEmptyScreenplayOutline(),
      versions: [],
      collaborators: [],
      comments: [],
    };
    project.title = title;
    project.tags = normalizeScreenplayStringList(req.body?.tags, 24, 48);
    project.characters = normalizeScreenplayStringList(req.body?.characters, 24, 48);
    project.setting = normalizeSnippet(req.body?.setting, 120);
    project.tone = normalizeSnippet(req.body?.tone, 120);
    applyFeatureSpineMetadata(project, req.body);
    if (hasStudioThreadViewState) {
      project.studioThreadViewState = normalizeStoredScreenplayThreadViewState(
        req.body?.studioThreadViewState || req.body?.studio_thread_view_state
      );
    }
    if (hasStudioDiffAcknowledgedKeys) {
      const diffAcknowledged = normalizeStoredScreenplayDiffAcknowledgementState({
        keys: req.body?.studioDiffAcknowledgedKeys
          || req.body?.studio_diff_acknowledged_keys
          || req.body?.studioDiffAcknowledged?.keys
          || req.body?.studio_diff_acknowledged?.keys,
        entries: req.body?.studioDiffAcknowledgedEntries
          || req.body?.studio_diff_acknowledged_entries
          || req.body?.studioDiffAcknowledged?.entries
          || req.body?.studio_diff_acknowledged?.entries,
      });
      project.studioDiffAcknowledgedKeys = diffAcknowledged.keys;
      project.studioDiffAcknowledgedEntries = diffAcknowledged.entries;
    }
    if (hasStudioAskNoteHistory) {
      project.studioAskNoteHistory = normalizeStoredScreenplayStudioAskNoteHistory(
        req.body?.studioAskNoteHistory
        || req.body?.studio_ask_note_history
        || req.body?.studioExchangeHistory
        || req.body?.studio_exchange_history
      );
    }
    project.lastPhase = normalizeScreenplayPhaseValue(req.body?.phase);
    project.updatedAt = now;

    if (created) {
      owner.projects.unshift(project);
    }
    if (activate || !owner.activeProjectId) {
      owner.activeProjectId = project.id;
    }
    if (!(await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_project"))) return;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(created ? 201 : 200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_project",
      status: created ? "created" : "updated",
      created,
      project_id: project.id,
      project: toScreenplayProjectPayload(project, {
        includeVersions: true,
        includeDrafts: true,
        versionLimit: 24,
      }),
      screenplay_active_project_id: owner.activeProjectId || "",
      screenplay_project_count: owner.projects.length,
      screenplay_projects: owner.projects.map((item) => toScreenplayProjectPayload(item, {
        includeVersions: false,
        includeDrafts: false,
      })),
    }));
  });

  app.post("/screenplay/projects/:projectId/outline", express.json({ limit: "1mb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_outline");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_outline", error: "project_not_found" });
    }
    const now = Date.now();
    project.outline = parseScreenplayOutlineInput(req.body, now);
    project.updatedAt = now;
    if (normalizeSnippet(req.body?.title, 160)) {
      project.title = normalizeSnippet(req.body?.title, 160);
    }
    project.lastPhase = normalizeScreenplayPhaseValue(req.body?.phase || project.lastPhase);
    owner.activeProjectId = owner.activeProjectId || project.id;
    if (!(await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_outline"))) return;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_outline",
      status: "saved",
      created_project: false,
      project_id: project.id,
      project: toScreenplayProjectPayload(project, {
        includeVersions: false,
        includeDrafts: false,
      }),
      outline: toScreenplayOutlinePayload(project.outline),
      screenplay_active_project_id: owner.activeProjectId || "",
      screenplay_project_count: owner.projects.length,
      screenplay_projects: owner.projects.map((item) => toScreenplayProjectPayload(item, {
        includeVersions: false,
        includeDrafts: false,
      })),
    }));
  });

  app.post("/screenplay/projects/:projectId/scenes", express.json({ limit: "512kb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_scene");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_scene", error: "project_not_found" });
    }
    const now = Date.now();
    const scene = upsertScreenplaySceneRecord(project, req.body?.scene || {}, now);
    if (!scene) {
      return res.status(400).json({ stage: "screenplay_scene", error: "scene_required" });
    }
    if (normalizeSnippet(req.body?.title, 160)) {
      project.title = normalizeSnippet(req.body?.title, 160);
    }
    project.lastPhase = normalizeScreenplayPhaseValue(req.body?.phase || project.lastPhase);
    owner.activeProjectId = owner.activeProjectId || project.id;
    if (!(await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_scene"))) return;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_scene",
      status: "saved",
      project_id: project.id,
      scene_id: scene.id,
      scene: toScreenplayScenePayload(scene),
      project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
      outline: toScreenplayOutlinePayload(project.outline),
    }));
  });

  app.post("/screenplay/projects/:projectId/beats", express.json({ limit: "512kb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_beat");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_beat", error: "project_not_found" });
    }
    const now = Date.now();
    const beat = upsertScreenplayBeatRecord(project, req.body?.beat || {}, now);
    if (!beat) {
      return res.status(400).json({ stage: "screenplay_beat", error: "beat_required" });
    }
    if (normalizeSnippet(req.body?.title, 160)) {
      project.title = normalizeSnippet(req.body?.title, 160);
    }
    project.lastPhase = normalizeScreenplayPhaseValue(req.body?.phase || project.lastPhase);
    owner.activeProjectId = owner.activeProjectId || project.id;
    if (!(await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_beat"))) return;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_beat",
      status: "saved",
      project_id: project.id,
      beat_id: beat.id,
      beat: toScreenplayBeatPayload(beat),
      project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
      outline: toScreenplayOutlinePayload(project.outline),
    }));
  });

  app.post("/screenplay/projects/:projectId/collaborators", express.json({ limit: "256kb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_collaborators");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_collaborators", error: "project_not_found" });
    }
    const email = normalizeEmailAddress(req.body?.email);
    if (!email) {
      return res.status(400).json({ stage: "screenplay_collaborators", error: "valid_email_required" });
    }
    const action = String(req.body?.action || "approve").trim().toLowerCase();
    const now = Date.now();
    let collaborator = (project.collaborators || []).find((item) => item.email === email) || null;
    if (action === "delete" || action === "remove" || action === "revoke") {
      project.collaborators = (project.collaborators || []).filter((item) => item.email !== email);
      collaborator = null;
    } else {
      collaborator = {
        ...(collaborator || {}),
        id: collaborator?.id || createScreenplayId("collab"),
        email,
        status: "approved",
        approvedAt: collaborator?.approvedAt || now,
        updatedAt: now,
        invitedBy: normalizeSnippet(req.body?.invited_by, 96),
        note: normalizeSnippet(req.body?.note, 220),
      };
      project.collaborators = (project.collaborators || []).filter((item) => item.email !== email);
      project.collaborators.unshift(collaborator);
    }
    project.updatedAt = now;
    if (!(await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_collaborators"))) return;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_collaborators",
      status: action === "delete" || action === "remove" || action === "revoke" ? "removed" : "approved",
      project_id: project.id,
      collaborator_count: Array.isArray(project.collaborators) ? project.collaborators.length : 0,
      approved_emails: project.approvedEmails || [],
      collaborator: collaborator ? toScreenplayCollaboratorPayload(collaborator) : null,
      collaborators: (project.collaborators || []).map(toScreenplayCollaboratorPayload),
      project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
    }));
  });

  app.post("/screenplay/projects/:projectId/comments", express.json({ limit: "512kb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_comments");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_comments", error: "project_not_found" });
    }
    const now = Date.now();
    const action = String(req.body?.action || "upsert").trim().toLowerCase();
    const actorEmail = normalizeEmailAddress(req.body?.actor_email);
    const commentId = normalizeSnippet(req.body?.comment_id, 64);
    const parentCommentId = normalizeSnippet(req.body?.parent_comment_id, 64);
    let comment = commentId
      ? (project.comments || []).find((item) => item.id === commentId) || null
      : null;

    if (action === "delete" || action === "remove") {
      if (!comment) {
        return res.status(404).json({ stage: "screenplay_comments", error: "comment_not_found" });
      }
      comment.isDeleted = true;
      comment.deletedAt = now;
      comment.updatedAt = now;
    } else if (action === "resolve" || action === "mark_resolved" || action === "unresolve" || action === "reopen" || action === "mark_open") {
      if (!comment) {
        return res.status(404).json({ stage: "screenplay_comments", error: "comment_not_found" });
      }
      const resolved = !(action === "unresolve" || action === "reopen" || action === "mark_open");
      comment.resolved = resolved;
      comment.resolvedAt = resolved ? now : 0;
      comment.resolvedBy = actorEmail || normalizeSnippet(req.body?.author_email, 96);
      comment.updatedAt = now;
    } else {
      const text = normalizeSnippet(req.body?.text, 1200);
      const voiceUrl = normalizeSnippet(req.body?.voice_url, 400);
      const voiceTranscript = normalizeSnippet(req.body?.voice_transcript, 1200);
      if (!text && !voiceUrl && !voiceTranscript) {
        return res.status(400).json({ stage: "screenplay_comments", error: "comment_or_voice_required" });
      }
      const parent = parentCommentId
        ? (project.comments || []).find((item) => item.id === parentCommentId) || null
        : null;
      comment = {
        ...(comment || {}),
        id: comment?.id || commentId || createScreenplayId("comment"),
        projectId: project.id,
        versionId: normalizeSnippet(req.body?.version_id, 64) || project.activeVersionId || project.lastVersionId || "",
        type: normalizeSnippet(req.body?.type, 24) || (voiceUrl || voiceTranscript ? "voice" : "text"),
        text,
        authorEmail: normalizeEmailAddress(req.body?.author_email),
        authorName: normalizeSnippet(req.body?.author_name, 96),
        anchorLine: Number.isFinite(Number(req.body?.anchor_line)) && Number(req.body?.anchor_line) > 0
          ? Math.floor(Number(req.body?.anchor_line))
          : null,
        parentCommentId,
        threadRootId: parent?.threadRootId || parent?.id || comment?.threadRootId || comment?.id || commentId || "",
        isDeleted: false,
        deletedAt: 0,
        resolved: Boolean(comment?.resolved),
        resolvedAt: Math.max(0, Number(comment?.resolvedAt || 0)),
        resolvedBy: comment?.resolvedBy || "",
        voiceUrl,
        voiceTranscript,
        voiceDurationMs: Math.max(0, Number(req.body?.voice_duration_ms || 0)),
        createdAt: comment?.createdAt || now,
        updatedAt: now,
      };
      if (!comment.threadRootId) {
        comment.threadRootId = comment.id;
      }
      project.comments = (project.comments || []).filter((item) => item.id !== comment.id);
      project.comments.push(comment);
    }

    project.updatedAt = now;
    if (!(await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_comments"))) return;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    const payloadComments = [...(project.comments || [])]
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      .map((item) => toScreenplayCommentPayload(item, actorEmail));
    return res.status(200).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_comments",
      status: action,
      project_id: project.id,
      comment_count: payloadComments.length,
      comment: comment ? toScreenplayCommentPayload(comment, actorEmail) : null,
      comments: payloadComments,
      project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
    }));
  });

  app.post("/screenplay/projects/:projectId/version", express.json({ limit: "2mb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_version");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_version", error: "project_not_found" });
    }
    const now = Date.now();
    const draft = String(req.body?.draft || "").replace(/\r\n/g, "\n").trim();
    if (!draft) {
      return res.status(400).json({ stage: "screenplay_version", error: "draft_required" });
    }
    const phase = normalizeScreenplayPhaseValue(req.body?.phase || project.lastPhase);
    const source = normalizeSnippet(req.body?.source, 48) || "studio_autosave";
    const notes = normalizeSnippet(req.body?.notes, 240);
    const studioWriteAnchors = normalizeStoredScreenplayWriteAnchors(req.body?.studio_write_anchors);
    const screenplayBindings = normalizeStoredScreenplayBindings(req.body?.screenplay_bindings);
    const baseVersionId = normalizeSnippet(req.body?.base_version_id, 64);
    const clientRequestId = normalizeSnippet(req.body?.client_request_id, 96);
    const conflictStrategy = String(req.body?.conflict_strategy || "reject_if_stale").trim().toLowerCase();
    const latestVersion = getLatestScreenplayVersion(project);
    const currentVersionId = project.activeVersionId || latestVersion?.id || "";
    const replayedVersion = clientRequestId
      ? (project.versions || []).find((item) => item.clientRequestId === clientRequestId)
      : null;
    if (replayedVersion) {
      if (replayedVersion.persistencePending === true) {
        applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
        return res.status(425).json(buildScreenplayEnvelope(req, owner, {
          stage: "screenplay_version",
          status: "persistence_pending",
          project_id: project.id,
          version_id: replayedVersion.id,
          conflict: false,
          replayed: false,
        }));
      }
      const requestMatches = String(replayedVersion.draft || "").replace(/\r\n/g, "\n").trim() === draft;
      const replayWasSuperseded = Boolean(currentVersionId && currentVersionId !== replayedVersion.id);
      applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
      return res.status(requestMatches && !replayWasSuperseded ? 200 : 409).json(buildScreenplayEnvelope(req, owner, {
        stage: "screenplay_version",
        status: requestMatches
          ? (replayWasSuperseded ? "replayed_superseded" : "replayed")
          : "client_request_id_reused",
        created_project: false,
        project_id: project.id,
        version_id: replayedVersion.id,
        version: toScreenplayVersionPayload(replayedVersion, { includeDraft: true }),
        project: toScreenplayProjectPayload(project, { includeVersions: true, includeDrafts: true, versionLimit: 24 }),
        format_score: Number(replayedVersion.formatScore || 0),
        story_score: Number(replayedVersion.storyScore || 0),
        confidence_class: replayedVersion.confidenceClass || "medium",
        warnings: replayedVersion.warnings || [],
        base_version_id: baseVersionId,
        server_version_id: currentVersionId,
        server_version: latestVersion ? toScreenplayVersionPayload(latestVersion, { includeDraft: true }) : null,
        conflict: !requestMatches || replayWasSuperseded,
        replayed: requestMatches,
      }));
    }
    if (conflictStrategy === "reject_if_stale" && baseVersionId && currentVersionId && baseVersionId !== currentVersionId) {
      applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
      return res.status(409).json(buildScreenplayEnvelope(req, owner, {
        stage: "screenplay_version",
        status: "conflict",
        created_project: false,
        project_id: project.id,
        version_id: currentVersionId,
        version: latestVersion ? toScreenplayVersionPayload(latestVersion, { includeDraft: true }) : null,
        project: toScreenplayProjectPayload(project, { includeVersions: true, includeDrafts: true, versionLimit: 24 }),
        format_score: Number(latestVersion?.formatScore || 0),
        story_score: Number(latestVersion?.storyScore || 0),
        confidence_class: latestVersion?.confidenceClass || "medium",
        warnings: latestVersion?.warnings || [],
        base_version_id: baseVersionId,
        server_version_id: currentVersionId,
        server_version: latestVersion ? toScreenplayVersionPayload(latestVersion, { includeDraft: true }) : null,
        conflict: true,
        replayed: false,
      }));
    }

    const score = scoreScreenplayDraft(draft);
    const priorProjectState = {
      versions: [...(project.versions || [])],
      activeVersionId: project.activeVersionId,
      lastVersionId: project.lastVersionId,
      lastVersionAt: project.lastVersionAt,
      lastPhase: project.lastPhase,
      title: project.title,
      updatedAt: project.updatedAt,
      ownerActiveProjectId: owner.activeProjectId,
      ownerUpdatedAt: owner.updatedAt,
    };
    const version = {
      id: createScreenplayId("version"),
      projectId: project.id,
      phase,
      source,
      clientRequestId,
      createdAt: now,
      updatedAt: now,
      prompt: "",
      notes,
      formatScore: score.formatScore,
      storyScore: score.storyScore,
      confidenceClass: score.confidenceClass,
      warnings: score.warnings,
      draft,
      draftExcerpt: buildDraftExcerpt(draft, 220),
      studioWriteAnchors,
      screenplayBindings,
      persistencePending: Boolean(clientRequestId),
    };
    project.versions = Array.isArray(project.versions) ? project.versions : [];
    project.versions.unshift(version);
    project.activeVersionId = version.id;
    project.lastVersionId = version.id;
    project.lastVersionAt = now;
    project.lastPhase = phase;
    if (normalizeSnippet(req.body?.title, 160)) {
      project.title = normalizeSnippet(req.body?.title, 160);
    }
    project.updatedAt = now;
    owner.activeProjectId = project.id;
    if (!(await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_version"))) {
      project.versions = priorProjectState.versions;
      project.activeVersionId = priorProjectState.activeVersionId;
      project.lastVersionId = priorProjectState.lastVersionId;
      project.lastVersionAt = priorProjectState.lastVersionAt;
      project.lastPhase = priorProjectState.lastPhase;
      project.title = priorProjectState.title;
      project.updatedAt = priorProjectState.updatedAt;
      owner.activeProjectId = priorProjectState.ownerActiveProjectId;
      owner.updatedAt = priorProjectState.ownerUpdatedAt;
      return;
    }
    version.persistencePending = false;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
    return res.status(201).json(buildScreenplayEnvelope(req, owner, {
      stage: "screenplay_version",
      status: "saved",
      created_project: false,
      project_id: project.id,
      version_id: version.id,
      version: toScreenplayVersionPayload(version, { includeDraft: true }),
      project: toScreenplayProjectPayload(project, { includeVersions: true, includeDrafts: true, versionLimit: 24 }),
      format_score: score.formatScore,
      story_score: score.storyScore,
      confidence_class: score.confidenceClass,
      warnings: score.warnings,
      base_version_id: baseVersionId,
      server_version_id: version.id,
      server_version: toScreenplayVersionPayload(version, { includeDraft: true }),
      conflict: false,
      replayed: false,
    }));
  });
}

export { mountScreenplayProjectsRoutes };
