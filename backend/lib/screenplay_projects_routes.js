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
import {
  OUTLINE_MUTATION_HASH_VERSION,
  appendBoundedOutlineReceipt,
  buildOutlineMutationRequestHash,
  normalizeOutlineMutationReceipts,
  normalizeOutlineRevision,
} from "./screenplay_outline_protocol.js";
import {
  SCREENPLAY_DRAFT_HASH_VERSION,
  canonicalizeScreenplayDraft,
  hashCanonicalScreenplayDraft,
} from "./screenplay_draft_receipt_protocol.js";

const SAFE_OUTLINE_COLLECTION_LIMITS = Object.freeze({
  acts: 32,
  scenes: 512,
  beats: 2048,
});

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
    commitScreenplayOwnerMutation,
    markScreenplayOwnerDirty,
    refreshScreenplayOwnerRecord,
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
    commitScreenplayOwnerMutation,
    markScreenplayOwnerDirty,
    refreshScreenplayOwnerRecord,
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
  const activeOutlineMutations = new Map();

  function getAuthorizedScreenplayOwner(req, res, stage) {
    const userId = requireScreenplayUserId(req, res, {
      resolveUserId: resolveScreenplayUserId,
      stage,
    });
    if (!userId) return null;
    if (!req.userId) req.userId = userId;
    return getOrCreateScreenplayOwnerRecord(req, { create: true });
  }

  async function getFreshAuthorizedScreenplayOwner(req, res, stage) {
    const cachedOwner = getAuthorizedScreenplayOwner(req, res, stage);
    if (!cachedOwner) return null;
    let refreshed;
    try {
      refreshed = await refreshScreenplayOwnerRecord(cachedOwner.ownerKey);
    } catch (error) {
      refreshed = { ok: false, error };
    }
    if (!refreshed?.ok) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({
        stage,
        error: "screenplay_persistence_failed",
        persistence: refreshed?.persistenceKind || "unknown",
      });
      return null;
    }
    if (!refreshed.owner) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).json({ stage, error: "screenplay_owner_not_found" });
      return null;
    }
    return refreshed.owner;
  }

  async function persistScreenplayOwnerOrFail(res, owner, now, stage) {
    const result = markScreenplayOwnerDirty(owner, now);
    if (result === false || result?.ok === false) {
      res.setHeader("Cache-Control", "no-store");
      res.status(503).json({
        stage,
        error: "screenplay_persistence_failed",
      });
      return null;
    }
    let committedOwner = result?.owner || owner;
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
        return null;
      }
      committedOwner = persisted?.owner || committedOwner;
    }
    return committedOwner;
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

  function parseOutlineWritePrecondition(body) {
    const requestKeys = ["client_request_id", "clientRequestId", "request_id", "requestId"];
    const revisionKeys = [
      "expected_outline_revision",
      "expectedOutlineRevision",
      "base_outline_revision",
      "baseOutlineRevision",
    ];
    const hasRequestId = bodyHasAny(body, requestKeys);
    const hasExpectedRevision = bodyHasAny(body, revisionKeys);
    if (!hasRequestId && !hasExpectedRevision) {
      return { mode: "legacy", clientRequestId: "", expectedRevision: null };
    }
    if (hasRequestId !== hasExpectedRevision) {
      return { error: "outline_write_precondition_pair_required" };
    }
    const requestValues = requestKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
      .map((key) => typeof body[key] === "string" ? body[key].trim() : "");
    const revisionValues = revisionKeys
      .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
      .map((key) => {
        const value = body[key];
        if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
        if (typeof value !== "string" && typeof value !== "number") return null;
        const numeric = Number(value);
        return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
      });
    const clientRequestId = requestValues[0] || "";
    const numericRevision = revisionValues[0];
    if (
      !clientRequestId
      || clientRequestId.length > 96
      || requestValues.some((value) => value !== clientRequestId)
      || numericRevision == null
      || revisionValues.some((value) => value !== numericRevision)
    ) {
      return { error: "invalid_outline_write_precondition" };
    }
    return {
      mode: "safe",
      clientRequestId,
      expectedRevision: numericRevision,
    };
  }

  function safeOutlineEntitiesHaveStableIds(body) {
    return ["acts", "scenes", "beats"].every((key) => (
      !Array.isArray(body?.[key])
      || body[key].every((item) => {
        const id = item && typeof item === "object" && typeof item.id === "string"
          ? item.id.trim()
          : "";
        return Boolean(id && id.length <= 64 && normalizeSnippet(id, 64) === id);
      })
    ));
  }

  function safeOutlineCollectionsAreComplete(body) {
    return ["acts", "scenes", "beats"].every((key) => Array.isArray(body?.[key]));
  }

  function outlineCollectionsAreBounded(body) {
    return Object.entries(SAFE_OUTLINE_COLLECTION_LIMITS).every(([key, limit]) => (
      !Array.isArray(body?.[key]) || body[key].length <= limit
    ));
  }

  function safeOutlineEntityIdsAreUnique(body) {
    return ["acts", "scenes", "beats"].every((key) => {
      const ids = body[key].map((item) => normalizeSnippet(item?.id, 64));
      return new Set(ids).size === ids.length;
    });
  }

  function readSafeOutlineReference(entity, aliases, field) {
    const presentAliases = aliases.filter((key) => Object.prototype.hasOwnProperty.call(entity, key));
    if (!presentAliases.length) return { ok: true, present: false, value: "" };
    const values = [];
    for (const alias of presentAliases) {
      const raw = entity[alias];
      if (raw == null || raw === "") {
        values.push("");
        continue;
      }
      if (typeof raw !== "string") {
        return { ok: false, reason: "invalid_reference_value", field };
      }
      const trimmed = raw.trim();
      const normalized = normalizeSnippet(raw, 64);
      if (trimmed.length > 64 || normalized !== trimmed) {
        return { ok: false, reason: "invalid_reference_value", field };
      }
      values.push(normalized);
    }
    if (new Set(values).size > 1) {
      return { ok: false, reason: "reference_alias_mismatch", field };
    }
    return { ok: true, present: true, value: values[0] || "" };
  }

  function readSafeOutlineReferenceList(entity, aliases, field) {
    const presentAliases = aliases.filter((key) => Object.prototype.hasOwnProperty.call(entity, key));
    if (!presentAliases.length) return { ok: true, present: false, values: [] };
    const lists = [];
    for (const alias of presentAliases) {
      const rawList = entity[alias];
      if (!Array.isArray(rawList)) {
        return { ok: false, reason: "invalid_reference_value", field };
      }
      const values = [];
      for (const raw of rawList) {
        if (typeof raw !== "string") {
          return { ok: false, reason: "invalid_reference_value", field };
        }
        const trimmed = raw.trim();
        const normalized = normalizeSnippet(raw, 64);
        if (!normalized || trimmed.length > 64 || normalized !== trimmed) {
          return { ok: false, reason: "invalid_reference_value", field };
        }
        values.push(normalized);
      }
      if (new Set(values).size !== values.length) {
        return { ok: false, reason: "duplicate_reference", field };
      }
      lists.push(values);
    }
    const canonical = JSON.stringify(lists[0]);
    if (lists.some((values) => JSON.stringify(values) !== canonical)) {
      return { ok: false, reason: "reference_alias_mismatch", field };
    }
    return { ok: true, present: true, values: lists[0] };
  }

  function validateSafeOutlineReferences(body) {
    const acts = new Map(body.acts.map((act) => [normalizeSnippet(act.id, 64), act]));
    const scenes = new Map(body.scenes.map((scene) => [normalizeSnippet(scene.id, 64), scene]));
    const beats = new Map(body.beats.map((beat) => [normalizeSnippet(beat.id, 64), beat]));
    const sceneRelations = new Map();
    const beatRelations = new Map();
    const actSceneLists = new Map();
    const sceneBeatLists = new Map();

    for (const [sceneId, scene] of scenes) {
      const actReference = readSafeOutlineReference(scene, ["actId", "act_id"], "scene.act_id");
      if (!actReference.ok) return { ...actReference, entityId: sceneId };
      if (actReference.value && !acts.has(actReference.value)) {
        return {
          ok: false,
          reason: "orphan_reference",
          field: "scene.act_id",
          entityId: sceneId,
          referenceId: actReference.value,
        };
      }
      sceneRelations.set(sceneId, { actId: actReference.value });

      const beatList = readSafeOutlineReferenceList(scene, ["beatIds", "beat_ids"], "scene.beat_ids");
      if (!beatList.ok) return { ...beatList, entityId: sceneId };
      sceneBeatLists.set(sceneId, beatList);
    }

    for (const [beatId, beat] of beats) {
      const sceneReference = readSafeOutlineReference(beat, ["sceneId", "scene_id"], "beat.scene_id");
      if (!sceneReference.ok) return { ...sceneReference, entityId: beatId };
      const actReference = readSafeOutlineReference(beat, ["actId", "act_id"], "beat.act_id");
      if (!actReference.ok) return { ...actReference, entityId: beatId };
      if (sceneReference.value && !scenes.has(sceneReference.value)) {
        return {
          ok: false,
          reason: "orphan_reference",
          field: "beat.scene_id",
          entityId: beatId,
          referenceId: sceneReference.value,
        };
      }
      if (actReference.value && !acts.has(actReference.value)) {
        return {
          ok: false,
          reason: "orphan_reference",
          field: "beat.act_id",
          entityId: beatId,
          referenceId: actReference.value,
        };
      }
      const referencedSceneActId = sceneRelations.get(sceneReference.value)?.actId || "";
      if (actReference.value && referencedSceneActId && actReference.value !== referencedSceneActId) {
        return {
          ok: false,
          reason: "reference_mismatch",
          field: "beat.act_id",
          entityId: beatId,
          referenceId: actReference.value,
        };
      }
      beatRelations.set(beatId, {
        sceneId: sceneReference.value,
        actId: actReference.value,
      });
    }

    for (const [actId, act] of acts) {
      const sceneList = readSafeOutlineReferenceList(act, ["sceneIds", "scene_ids"], "act.scene_ids");
      if (!sceneList.ok) return { ...sceneList, entityId: actId };
      actSceneLists.set(actId, sceneList);
      for (const sceneId of sceneList.values) {
        if (!scenes.has(sceneId)) {
          return {
            ok: false,
            reason: "orphan_reference",
            field: "act.scene_ids",
            entityId: actId,
            referenceId: sceneId,
          };
        }
        if (sceneRelations.get(sceneId)?.actId !== actId) {
          return {
            ok: false,
            reason: "reference_mismatch",
            field: "act.scene_ids",
            entityId: actId,
            referenceId: sceneId,
          };
        }
      }
    }

    for (const [sceneId, sceneList] of sceneBeatLists) {
      for (const beatId of sceneList.values) {
        if (!beats.has(beatId)) {
          return {
            ok: false,
            reason: "orphan_reference",
            field: "scene.beat_ids",
            entityId: sceneId,
            referenceId: beatId,
          };
        }
        if (beatRelations.get(beatId)?.sceneId !== sceneId) {
          return {
            ok: false,
            reason: "reference_mismatch",
            field: "scene.beat_ids",
            entityId: sceneId,
            referenceId: beatId,
          };
        }
      }
    }

    for (const [sceneId, relation] of sceneRelations) {
      const declaredScenes = actSceneLists.get(relation.actId);
      if (relation.actId && declaredScenes?.present && !declaredScenes.values.includes(sceneId)) {
        return {
          ok: false,
          reason: "reference_mismatch",
          field: "act.scene_ids",
          entityId: relation.actId,
          referenceId: sceneId,
        };
      }
    }
    for (const [beatId, relation] of beatRelations) {
      const declaredBeats = sceneBeatLists.get(relation.sceneId);
      if (relation.sceneId && declaredBeats?.present && !declaredBeats.values.includes(beatId)) {
        return {
          ok: false,
          reason: "reference_mismatch",
          field: "scene.beat_ids",
          entityId: relation.sceneId,
          referenceId: beatId,
        };
      }
    }
    return { ok: true };
  }

  function outlineCollectionCounts(outline) {
    return {
      acts: Array.isArray(outline?.acts) ? outline.acts.length : 0,
      scenes: Array.isArray(outline?.scenes) ? outline.scenes.length : 0,
      beats: Array.isArray(outline?.beats) ? outline.beats.length : 0,
    };
  }

  function outlineEntityWouldAppend(project, collection, entityInput) {
    const entities = Array.isArray(project?.outline?.[collection]) ? project.outline[collection] : [];
    const entityId = normalizeSnippet(entityInput?.id, 64);
    return !entityId || !entities.some((entity) => normalizeSnippet(entity?.id, 64) === entityId);
  }

  function outlineBodyWithServerOwnedEntityTimes(body) {
    const stripTimes = (item) => {
      const {
        createdAt: _createdAt,
        created_at: _createdAtSnake,
        updatedAt: _updatedAt,
        updated_at: _updatedAtSnake,
        ...semanticFields
      } = item;
      return semanticFields;
    };
    return {
      ...body,
      acts: body.acts.map(stripTimes),
      scenes: body.scenes.map(stripTimes),
      beats: body.beats.map(stripTimes),
    };
  }

  function outlineWithServerOwnedEntityTimes(nextOutline, previousOutline, committedAt) {
    const prior = previousOutline && typeof previousOutline === "object" ? previousOutline : {};
    const next = nextOutline && typeof nextOutline === "object" ? nextOutline : {};
    const serverTimestamp = Math.max(0, Number(committedAt || Date.now()));
    for (const key of ["acts", "scenes", "beats"]) {
      const createdAtById = new Map(
        (Array.isArray(prior[key]) ? prior[key] : []).map((item) => [
          String(item?.id || ""),
          Math.max(0, Number(item?.createdAt || 0)),
        ])
      );
      next[key] = (Array.isArray(next[key]) ? next[key] : []).map((item) => ({
        ...item,
        createdAt: createdAtById.get(String(item?.id || "")) || serverTimestamp,
        updatedAt: serverTimestamp,
      }));
    }
    next.updatedAt = serverTimestamp;
    return next;
  }

  function advanceOutlineRevisionIfNeeded(project, previousRevision) {
    const current = normalizeOutlineRevision(project.outlineRevision ?? project.outline?.revision);
    const revision = current > previousRevision
      ? current
      : Math.min(Number.MAX_SAFE_INTEGER, previousRevision + 1);
    project.outline = project.outline && typeof project.outline === "object"
      ? project.outline
      : createEmptyScreenplayOutline();
    project.outline.revision = revision;
    project.outlineRevision = revision;
    return revision;
  }

  function nextOutlineMutationTimestamp(project, candidateNow) {
    const safeTimestamp = (value) => {
      const number = Number(value);
      return Number.isSafeInteger(number) && number >= 0 ? number : 0;
    };
    const previous = Math.max(
      safeTimestamp(project?.updatedAt),
      safeTimestamp(project?.outline?.updatedAt)
    );
    return Math.max(
      safeTimestamp(candidateNow),
      previous >= Number.MAX_SAFE_INTEGER ? previous : previous + 1
    );
  }

  function sendScreenplayCommitFailure(res, stage, commit) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(commit?.conflict ? 409 : 503).json({
      stage,
      error: commit?.conflict ? "screenplay_write_conflict" : "screenplay_persistence_failed",
      persistence: commit?.persistenceKind || "unknown",
      persistence_failure_count: commit?.persistenceFailureCount || 1,
    });
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

  app.get("/screenplay/projects", async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_projects");
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

  app.get("/screenplay/projects/:projectId", async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_project");
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

  app.get("/screenplay/projects/:projectId/outline", async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_outline");
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
      outline_revision: normalizeOutlineRevision(project.outlineRevision ?? project.outline?.revision),
      outline: toScreenplayOutlinePayload(project.outline),
      project: includeProject
        ? toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false })
        : null,
    }));
  });

  app.post("/screenplay/projects/:projectId/activate", express.json({ limit: "64kb" }), async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_project_activate");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_project_activate", error: "project_not_found" });
    }
    const now = Date.now();
    owner.activeProjectId = project.id;
    project.updatedAt = now;
    const committedOwner = await persistScreenplayOwnerOrFail(
      res,
      owner,
      now,
      "screenplay_project_activate"
    );
    if (!committedOwner) return;
    const committedProject = getScreenplayProjectRecord(committedOwner, projectId);
    if (!committedProject) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        stage: "screenplay_project_activate",
        error: "screenplay_persistence_failed",
      });
    }
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    return res.status(200).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_project_activate",
      status: "activated",
      project_id: committedProject.id,
      project: toScreenplayProjectPayload(committedProject, {
        includeVersions: false,
        includeDrafts: false,
      }),
      screenplay_active_project_id: committedOwner.activeProjectId || "",
      screenplay_project_count: committedOwner.projects.length,
      screenplay_projects: committedOwner.projects.map((item) => toScreenplayProjectPayload(item, {
        includeVersions: false,
        includeDrafts: false,
      })),
    }));
  });

  app.get("/screenplay/projects/:projectId/collaborators", async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_collaborators");
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

  app.get("/screenplay/projects/:projectId/comments", async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_comments");
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
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_project");
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
    const committedOwner = await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_project");
    if (!committedOwner) return;
    const committedProject = getScreenplayProjectRecord(committedOwner, project.id);
    if (!committedProject) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        stage: "screenplay_project",
        error: "screenplay_persistence_failed",
      });
    }
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    return res.status(created ? 201 : 200).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_project",
      status: created ? "created" : "updated",
      created,
      project_id: committedProject.id,
      project: toScreenplayProjectPayload(committedProject, {
        includeVersions: true,
        includeDrafts: true,
        versionLimit: 24,
      }),
      screenplay_active_project_id: committedOwner.activeProjectId || "",
      screenplay_project_count: committedOwner.projects.length,
      screenplay_projects: committedOwner.projects.map((item) => toScreenplayProjectPayload(item, {
        includeVersions: false,
        includeDrafts: false,
      })),
    }));
  });

  app.post("/screenplay/projects/:projectId/outline", express.json({ limit: "1mb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_outline");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const precondition = parseOutlineWritePrecondition(req.body);
    if (precondition.error) {
      return res.status(400).json({ stage: "screenplay_outline", error: precondition.error });
    }
    if (precondition.mode === "safe" && bodyHasAny(req.body, ["title", "phase"])) {
      return res.status(400).json({
        stage: "screenplay_outline",
        error: "outline_safe_metadata_not_allowed",
      });
    }
    if (precondition.mode === "safe" && parseBool(req.body?.merge)) {
      return res.status(400).json({
        stage: "screenplay_outline",
        error: "outline_merge_not_supported",
      });
    }
    if (precondition.mode === "safe" && !safeOutlineCollectionsAreComplete(req.body)) {
      return res.status(400).json({
        stage: "screenplay_outline",
        error: "outline_collections_required",
      });
    }
    if (!outlineCollectionsAreBounded(req.body)) {
      return res.status(413).json({
        stage: "screenplay_outline",
        error: "outline_collection_limit_exceeded",
        limits: SAFE_OUTLINE_COLLECTION_LIMITS,
        counts: {
          acts: Array.isArray(req.body?.acts) ? req.body.acts.length : 0,
          scenes: Array.isArray(req.body?.scenes) ? req.body.scenes.length : 0,
          beats: Array.isArray(req.body?.beats) ? req.body.beats.length : 0,
        },
      });
    }
    if (precondition.mode === "safe" && !safeOutlineEntitiesHaveStableIds(req.body)) {
      return res.status(400).json({
        stage: "screenplay_outline",
        error: "outline_entity_id_required",
      });
    }
    if (precondition.mode === "safe" && !safeOutlineEntityIdsAreUnique(req.body)) {
      return res.status(400).json({
        stage: "screenplay_outline",
        error: "outline_entity_ids_must_be_unique",
      });
    }
    if (precondition.mode === "safe") {
      const referenceValidation = validateSafeOutlineReferences(req.body);
      if (!referenceValidation.ok) {
        return res.status(400).json({
          stage: "screenplay_outline",
          error: "outline_reference_invalid",
          reason: referenceValidation.reason,
          field: referenceValidation.field,
          entity_id: referenceValidation.entityId || "",
          reference_id: referenceValidation.referenceId || "",
        });
      }
    }

    const now = Date.now();
    const outlineInput = precondition.mode === "safe"
      ? outlineBodyWithServerOwnedEntityTimes(req.body)
      : req.body;
    const normalizedIntent = precondition.mode === "safe"
      ? parseScreenplayOutlineInput(outlineInput, 0)
      : null;
    const requestHash = precondition.mode === "safe"
      ? buildOutlineMutationRequestHash({
          acts: normalizedIntent.acts,
          scenes: normalizedIntent.scenes,
          beats: normalizedIntent.beats,
        }, { operation: "replace" })
      : "";
    const activeMutationKey = precondition.mode === "safe"
      ? `${owner.ownerKey}\u0000${projectId}\u0000${precondition.clientRequestId}`
      : "";
    const activeMutation = activeMutationKey ? activeOutlineMutations.get(activeMutationKey) : null;
    if (activeMutation) {
      if (
        activeMutation.requestHash !== requestHash
        || activeMutation.expectedRevision !== precondition.expectedRevision
        || activeMutation.operation !== "replace"
      ) {
        return res.status(409).json({
          stage: "screenplay_outline",
          status: "request_id_reused",
          error: "screenplay_outline_client_request_id_reused",
          conflict: true,
          replayed: false,
          client_request_id: precondition.clientRequestId,
        });
      }
      res.setHeader("Retry-After", "1");
      return res.status(425).json({
        stage: "screenplay_outline",
        status: "persistence_pending",
        error: "screenplay_outline_mutation_inflight",
        conflict: false,
        replayed: false,
        client_request_id: precondition.clientRequestId,
        retry_after_ms: 1000,
      });
    }
    if (activeMutationKey) {
      activeOutlineMutations.set(activeMutationKey, {
        requestHash,
        expectedRevision: precondition.expectedRevision,
        operation: "replace",
      });
    }

    let commit;
    try {
      commit = await commitScreenplayOwnerMutation({
        ownerKey: owner.ownerKey,
        now,
        retryAmbiguousCommit: precondition.mode === "safe",
        mutate(nextOwner) {
          const project = getScreenplayProjectRecord(nextOwner, projectId);
          if (!project) return { commit: false, kind: "not_found" };
          const currentRevision = normalizeOutlineRevision(
            project.outlineRevision ?? project.outline?.revision
          );
          project.outlineRevision = currentRevision;
          if (project.outline && typeof project.outline === "object") {
            project.outline.revision = currentRevision;
          }
          const receipts = normalizeOutlineMutationReceipts(project.outlineMutationReceipts);

          if (precondition.mode === "safe") {
            const priorReceipt = receipts.find((item) => item.requestId === precondition.clientRequestId);
            if (priorReceipt) {
              if (
                priorReceipt.hashVersion !== OUTLINE_MUTATION_HASH_VERSION
                || priorReceipt.requestHash !== requestHash
                || priorReceipt.baseRevision !== precondition.expectedRevision
                || priorReceipt.operation !== "replace"
              ) {
                return {
                  commit: false,
                  kind: "request_id_reused",
                  currentRevision,
                };
              }
              if (priorReceipt.committedRevision === currentRevision) {
                return {
                  commit: false,
                  kind: "replayed",
                  currentRevision,
                  committedRevision: priorReceipt.committedRevision,
                };
              }
              return {
                commit: false,
                kind: "replayed_superseded",
                currentRevision,
                committedRevision: priorReceipt.committedRevision,
              };
            }
            if (precondition.expectedRevision !== currentRevision) {
              return {
                commit: false,
                kind: "stale_revision",
                currentRevision,
              };
            }
          }

          if (currentRevision >= Number.MAX_SAFE_INTEGER) {
            return { commit: false, kind: "revision_exhausted", currentRevision };
          }
          const committedAt = nextOutlineMutationTimestamp(project, now);
          const committedRevision = currentRevision + 1;
          const previousOutline = project.outline;
          project.outline = parseScreenplayOutlineInput(outlineInput, committedAt);
          if (precondition.mode === "safe") {
            project.outline = outlineWithServerOwnedEntityTimes(
              project.outline,
              previousOutline,
              committedAt
            );
          }
          project.outline.revision = committedRevision;
          project.outlineRevision = committedRevision;
          project.updatedAt = committedAt;
          if (precondition.mode === "legacy") {
            if (normalizeSnippet(req.body?.title, 160)) {
              project.title = normalizeSnippet(req.body?.title, 160);
            }
            project.lastPhase = normalizeScreenplayPhaseValue(req.body?.phase || project.lastPhase);
          }
          project.outlineMutationReceipts = precondition.mode === "safe"
            ? appendBoundedOutlineReceipt(receipts, {
                requestId: precondition.clientRequestId,
                hashVersion: OUTLINE_MUTATION_HASH_VERSION,
                operation: "replace",
                requestHash,
                baseRevision: precondition.expectedRevision,
                committedRevision,
                committedAt,
              })
            : receipts;
          nextOwner.activeProjectId = nextOwner.activeProjectId || project.id;
          return {
            kind: "saved",
            committedRevision,
            currentRevision: committedRevision,
          };
        },
      });
    } finally {
      if (activeMutationKey) activeOutlineMutations.delete(activeMutationKey);
    }
    if (!commit?.ok) return sendScreenplayCommitFailure(res, "screenplay_outline", commit);
    const committedOwner = commit.owner || owner;
    const project = getScreenplayProjectRecord(committedOwner, projectId);
    const outcome = commit.result || {};
    if (!project || outcome.kind === "not_found") {
      return res.status(404).json({ stage: "screenplay_outline", error: "project_not_found" });
    }
    const currentRevision = normalizeOutlineRevision(
      outcome.currentRevision ?? project.outlineRevision ?? project.outline?.revision
    );
    if (["request_id_reused", "stale_revision", "replayed_superseded", "revision_exhausted"].includes(outcome.kind)) {
      const errorByKind = {
        request_id_reused: "screenplay_outline_client_request_id_reused",
        stale_revision: "stale_screenplay_outline_revision",
        replayed_superseded: "screenplay_outline_replayed_superseded",
        revision_exhausted: "screenplay_outline_revision_exhausted",
      };
      return res.status(409).json(buildScreenplayEnvelope(req, committedOwner, {
        stage: "screenplay_outline",
        status: outcome.kind,
        error: errorByKind[outcome.kind],
        conflict: true,
        replayed: false,
        client_request_id: precondition.clientRequestId || "",
        expected_outline_revision: precondition.expectedRevision,
        outline_revision: currentRevision,
        project_id: project.id,
        project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
        outline: toScreenplayOutlinePayload(project.outline),
      }));
    }
    const replayed = outcome.kind === "replayed";
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    return res.status(200).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_outline",
      status: replayed ? "replayed" : "saved",
      replayed,
      conflict: false,
      client_request_id: precondition.clientRequestId || "",
      expected_outline_revision: precondition.expectedRevision,
      outline_revision: currentRevision,
      committed_revision: normalizeOutlineRevision(outcome.committedRevision ?? currentRevision),
      created_project: false,
      project_id: project.id,
      project: toScreenplayProjectPayload(project, {
        includeVersions: false,
        includeDrafts: false,
      }),
      outline: toScreenplayOutlinePayload(project.outline),
      screenplay_active_project_id: committedOwner.activeProjectId || "",
      screenplay_project_count: committedOwner.projects.length,
      screenplay_projects: committedOwner.projects.map((item) => toScreenplayProjectPayload(item, {
        includeVersions: false,
        includeDrafts: false,
      })),
    }));
  });

  app.post("/screenplay/projects/:projectId/scenes", express.json({ limit: "512kb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_scene");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const now = Date.now();
    const commit = await commitScreenplayOwnerMutation({
      ownerKey: owner.ownerKey,
      now,
      mutate(nextOwner) {
        const project = getScreenplayProjectRecord(nextOwner, projectId);
        if (!project) return { commit: false, kind: "not_found" };
        const counts = outlineCollectionCounts(project.outline);
        if (
          counts.scenes >= SAFE_OUTLINE_COLLECTION_LIMITS.scenes
          && outlineEntityWouldAppend(project, "scenes", req.body?.scene)
        ) {
          return { commit: false, kind: "collection_limit", counts };
        }
        const previousRevision = normalizeOutlineRevision(
          project.outlineRevision ?? project.outline?.revision
        );
        if (previousRevision >= Number.MAX_SAFE_INTEGER) {
          return { commit: false, kind: "revision_exhausted", outlineRevision: previousRevision };
        }
        const committedAt = nextOutlineMutationTimestamp(project, now);
        const scene = upsertScreenplaySceneRecord(project, req.body?.scene || {}, committedAt);
        if (!scene) return { commit: false, kind: "scene_required" };
        const outlineRevision = advanceOutlineRevisionIfNeeded(project, previousRevision);
        if (normalizeSnippet(req.body?.title, 160)) {
          project.title = normalizeSnippet(req.body?.title, 160);
        }
        project.lastPhase = normalizeScreenplayPhaseValue(req.body?.phase || project.lastPhase);
        nextOwner.activeProjectId = nextOwner.activeProjectId || project.id;
        return { kind: "saved", sceneId: scene.id, outlineRevision };
      },
    });
    if (!commit?.ok) return sendScreenplayCommitFailure(res, "screenplay_scene", commit);
    const committedOwner = commit.owner || owner;
    const project = getScreenplayProjectRecord(committedOwner, projectId);
    const outcome = commit.result || {};
    if (!project || outcome.kind === "not_found") {
      return res.status(404).json({ stage: "screenplay_scene", error: "project_not_found" });
    }
    if (outcome.kind === "scene_required") {
      return res.status(400).json({ stage: "screenplay_scene", error: "scene_required" });
    }
    if (outcome.kind === "collection_limit") {
      return res.status(413).json({
        stage: "screenplay_scene",
        error: "outline_collection_limit_exceeded",
        limits: SAFE_OUTLINE_COLLECTION_LIMITS,
        counts: outcome.counts || outlineCollectionCounts(project.outline),
      });
    }
    if (outcome.kind === "revision_exhausted") {
      return res.status(409).json(buildScreenplayEnvelope(req, committedOwner, {
        stage: "screenplay_scene",
        status: "revision_exhausted",
        error: "screenplay_outline_revision_exhausted",
        conflict: true,
        project_id: project.id,
        outline_revision: normalizeOutlineRevision(outcome.outlineRevision),
        project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
        outline: toScreenplayOutlinePayload(project.outline),
      }));
    }
    const scene = project.outline?.scenes?.find((item) => item.id === outcome.sceneId);
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    return res.status(200).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_scene",
      status: "saved",
      project_id: project.id,
      scene_id: outcome.sceneId,
      scene: toScreenplayScenePayload(scene),
      outline_revision: normalizeOutlineRevision(outcome.outlineRevision),
      project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
      outline: toScreenplayOutlinePayload(project.outline),
    }));
  });

  app.post("/screenplay/projects/:projectId/beats", express.json({ limit: "512kb" }), async (req, res) => {
    const owner = getAuthorizedScreenplayOwner(req, res, "screenplay_beat");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const now = Date.now();
    const commit = await commitScreenplayOwnerMutation({
      ownerKey: owner.ownerKey,
      now,
      mutate(nextOwner) {
        const project = getScreenplayProjectRecord(nextOwner, projectId);
        if (!project) return { commit: false, kind: "not_found" };
        const counts = outlineCollectionCounts(project.outline);
        if (
          counts.beats >= SAFE_OUTLINE_COLLECTION_LIMITS.beats
          && outlineEntityWouldAppend(project, "beats", req.body?.beat)
        ) {
          return { commit: false, kind: "collection_limit", counts };
        }
        const previousRevision = normalizeOutlineRevision(
          project.outlineRevision ?? project.outline?.revision
        );
        if (previousRevision >= Number.MAX_SAFE_INTEGER) {
          return { commit: false, kind: "revision_exhausted", outlineRevision: previousRevision };
        }
        const committedAt = nextOutlineMutationTimestamp(project, now);
        const beat = upsertScreenplayBeatRecord(project, req.body?.beat || {}, committedAt);
        if (!beat) return { commit: false, kind: "beat_required" };
        const outlineRevision = advanceOutlineRevisionIfNeeded(project, previousRevision);
        if (normalizeSnippet(req.body?.title, 160)) {
          project.title = normalizeSnippet(req.body?.title, 160);
        }
        project.lastPhase = normalizeScreenplayPhaseValue(req.body?.phase || project.lastPhase);
        nextOwner.activeProjectId = nextOwner.activeProjectId || project.id;
        return { kind: "saved", beatId: beat.id, outlineRevision };
      },
    });
    if (!commit?.ok) return sendScreenplayCommitFailure(res, "screenplay_beat", commit);
    const committedOwner = commit.owner || owner;
    const project = getScreenplayProjectRecord(committedOwner, projectId);
    const outcome = commit.result || {};
    if (!project || outcome.kind === "not_found") {
      return res.status(404).json({ stage: "screenplay_beat", error: "project_not_found" });
    }
    if (outcome.kind === "beat_required") {
      return res.status(400).json({ stage: "screenplay_beat", error: "beat_required" });
    }
    if (outcome.kind === "collection_limit") {
      return res.status(413).json({
        stage: "screenplay_beat",
        error: "outline_collection_limit_exceeded",
        limits: SAFE_OUTLINE_COLLECTION_LIMITS,
        counts: outcome.counts || outlineCollectionCounts(project.outline),
      });
    }
    if (outcome.kind === "revision_exhausted") {
      return res.status(409).json(buildScreenplayEnvelope(req, committedOwner, {
        stage: "screenplay_beat",
        status: "revision_exhausted",
        error: "screenplay_outline_revision_exhausted",
        conflict: true,
        project_id: project.id,
        outline_revision: normalizeOutlineRevision(outcome.outlineRevision),
        project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
        outline: toScreenplayOutlinePayload(project.outline),
      }));
    }
    const beat = project.outline?.beats?.find((item) => item.id === outcome.beatId);
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    return res.status(200).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_beat",
      status: "saved",
      project_id: project.id,
      beat_id: outcome.beatId,
      beat: toScreenplayBeatPayload(beat),
      outline_revision: normalizeOutlineRevision(outcome.outlineRevision),
      project: toScreenplayProjectPayload(project, { includeVersions: false, includeDrafts: false }),
      outline: toScreenplayOutlinePayload(project.outline),
    }));
  });

  app.post("/screenplay/projects/:projectId/collaborators", express.json({ limit: "256kb" }), async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_collaborators");
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
    const committedOwner = await persistScreenplayOwnerOrFail(
      res,
      owner,
      now,
      "screenplay_collaborators"
    );
    if (!committedOwner) return;
    const committedProject = getScreenplayProjectRecord(committedOwner, projectId);
    if (!committedProject) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        stage: "screenplay_collaborators",
        error: "screenplay_persistence_failed",
      });
    }
    const committedCollaborator = collaborator
      ? (committedProject.collaborators || []).find((item) => item.id === collaborator.id) || null
      : null;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    return res.status(200).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_collaborators",
      status: action === "delete" || action === "remove" || action === "revoke" ? "removed" : "approved",
      project_id: committedProject.id,
      collaborator_count: Array.isArray(committedProject.collaborators) ? committedProject.collaborators.length : 0,
      approved_emails: committedProject.approvedEmails || [],
      collaborator: committedCollaborator ? toScreenplayCollaboratorPayload(committedCollaborator) : null,
      collaborators: (committedProject.collaborators || []).map(toScreenplayCollaboratorPayload),
      project: toScreenplayProjectPayload(committedProject, { includeVersions: false, includeDrafts: false }),
    }));
  });

  app.post("/screenplay/projects/:projectId/comments", express.json({ limit: "512kb" }), async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_comments");
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
    const committedOwner = await persistScreenplayOwnerOrFail(res, owner, now, "screenplay_comments");
    if (!committedOwner) return;
    const committedProject = getScreenplayProjectRecord(committedOwner, projectId);
    if (!committedProject) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        stage: "screenplay_comments",
        error: "screenplay_persistence_failed",
      });
    }
    const committedComment = comment
      ? (committedProject.comments || []).find((item) => item.id === comment.id) || null
      : null;
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    const payloadComments = [...(committedProject.comments || [])]
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      .map((item) => toScreenplayCommentPayload(item, actorEmail));
    return res.status(200).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_comments",
      status: action,
      project_id: committedProject.id,
      comment_count: payloadComments.length,
      comment: committedComment ? toScreenplayCommentPayload(committedComment, actorEmail) : null,
      comments: payloadComments,
      project: toScreenplayProjectPayload(committedProject, { includeVersions: false, includeDrafts: false }),
    }));
  });

  app.post("/screenplay/projects/:projectId/version", express.json({ limit: "2mb" }), async (req, res) => {
    const owner = await getFreshAuthorizedScreenplayOwner(req, res, "screenplay_version");
    if (!owner) return;
    const projectId = normalizeSnippet(req.params?.projectId, 64);
    const project = getScreenplayProjectRecord(owner, projectId);
    if (!project) {
      return res.status(404).json({ stage: "screenplay_version", error: "project_not_found" });
    }
    const now = Date.now();
    const draftInput = req.body?.draft;
    const draft = typeof draftInput === "string"
      ? canonicalizeScreenplayDraft(draftInput)
      : "";
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
    const currentVersion = (project.versions || [])
      .find((item) => item.id === currentVersionId) || latestVersion || null;
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
      const requestMatches = canonicalizeScreenplayDraft(replayedVersion.draft) === draft;
      const replayWasSuperseded = Boolean(currentVersionId && currentVersionId !== replayedVersion.id);
      applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
      return res.status(requestMatches && !replayWasSuperseded ? 200 : 409).json(buildScreenplayEnvelope(req, owner, {
        stage: "screenplay_version",
        status: requestMatches
          ? (replayWasSuperseded ? "replayed_superseded" : "replayed")
          : "client_request_id_reused",
        created_project: false,
        project_id: project.id,
        client_request_id: clientRequestId,
        draft_hash_version: SCREENPLAY_DRAFT_HASH_VERSION,
        draft_hash: hashCanonicalScreenplayDraft(replayedVersion.draft),
        version_id: replayedVersion.id,
        version: toScreenplayVersionPayload(replayedVersion, { includeDraft: true }),
        project: toScreenplayProjectPayload(project, { includeVersions: true, includeDrafts: true, versionLimit: 24 }),
        format_score: Number(replayedVersion.formatScore || 0),
        story_score: Number(replayedVersion.storyScore || 0),
        confidence_class: replayedVersion.confidenceClass || "medium",
        warnings: replayedVersion.warnings || [],
        base_version_id: baseVersionId,
        server_version_id: currentVersionId,
        server_version: currentVersion ? toScreenplayVersionPayload(currentVersion, { includeDraft: true }) : null,
        conflict: !requestMatches || replayWasSuperseded,
        replayed: requestMatches,
      }));
    }
    const missingRequiredBase = conflictStrategy === "reject_if_stale" && currentVersionId && !baseVersionId;
    const staleBase = conflictStrategy === "reject_if_stale" &&
      baseVersionId &&
      currentVersionId &&
      baseVersionId !== currentVersionId;
    if (missingRequiredBase || staleBase) {
      applyReadStateHeaders(res, buildScreenplayReadMeta(req, owner));
      return res.status(409).json(buildScreenplayEnvelope(req, owner, {
        stage: "screenplay_version",
        status: "conflict",
        created_project: false,
        project_id: project.id,
        client_request_id: clientRequestId,
        draft_hash_version: SCREENPLAY_DRAFT_HASH_VERSION,
        draft_hash: currentVersion ? hashCanonicalScreenplayDraft(currentVersion.draft) : "",
        version_id: currentVersionId,
        version: currentVersion ? toScreenplayVersionPayload(currentVersion, { includeDraft: true }) : null,
        project: toScreenplayProjectPayload(project, { includeVersions: true, includeDrafts: true, versionLimit: 24 }),
        format_score: Number(currentVersion?.formatScore || 0),
        story_score: Number(currentVersion?.storyScore || 0),
        confidence_class: currentVersion?.confidenceClass || "medium",
        warnings: currentVersion?.warnings || [],
        base_version_id: baseVersionId,
        server_version_id: currentVersionId,
        server_version: currentVersion ? toScreenplayVersionPayload(currentVersion, { includeDraft: true }) : null,
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
    const committedOwner = await persistScreenplayOwnerOrFail(
      res,
      owner,
      now,
      "screenplay_version"
    );
    if (!committedOwner) {
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
    const committedProject = getScreenplayProjectRecord(committedOwner, projectId);
    const committedVersion = (committedProject?.versions || [])
      .find((item) => item.id === version.id) || null;
    if (!committedProject || !committedVersion) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({
        stage: "screenplay_version",
        error: "screenplay_persistence_failed",
      });
    }
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, committedOwner));
    return res.status(201).json(buildScreenplayEnvelope(req, committedOwner, {
      stage: "screenplay_version",
      status: "saved",
      created_project: false,
      project_id: committedProject.id,
      client_request_id: clientRequestId,
      draft_hash_version: SCREENPLAY_DRAFT_HASH_VERSION,
      draft_hash: hashCanonicalScreenplayDraft(committedVersion.draft),
      version_id: committedVersion.id,
      version: toScreenplayVersionPayload(committedVersion, { includeDraft: true }),
      project: toScreenplayProjectPayload(committedProject, {
        includeVersions: true,
        includeDrafts: true,
        versionLimit: 24,
      }),
      format_score: committedVersion.formatScore,
      story_score: committedVersion.storyScore,
      confidence_class: committedVersion.confidenceClass,
      warnings: committedVersion.warnings,
      base_version_id: baseVersionId,
      server_version_id: committedVersion.id,
      server_version: toScreenplayVersionPayload(committedVersion, { includeDraft: true }),
      conflict: false,
      replayed: false,
    }));
  });
}

export { mountScreenplayProjectsRoutes };
