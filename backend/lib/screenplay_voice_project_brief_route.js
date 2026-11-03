import express from "express";
import { requireScreenplayUserId } from "./screenplay_route_auth.js";
import {
  applyVoiceProjectBriefMutation,
  toVoiceProjectBriefPayload,
} from "./screenplay_voice_project_brief.js";

function mountScreenplayVoiceProjectBriefRoute(app, deps = {}) {
  if (!app || typeof app.post !== "function") {
    throw new Error("mountScreenplayVoiceProjectBriefRoute requires an Express app");
  }
  const {
    resolveScreenplayUserId,
    getOrCreateScreenplayOwnerRecord,
    getScreenplayProjectRecord,
    refreshScreenplayOwnerRecord,
    commitScreenplayOwnerMutation,
    buildScreenplayEnvelope,
    buildScreenplayReadMeta,
    applyReadStateHeaders,
    normalizeSnippet,
  } = deps;
  for (const [name, dependency] of Object.entries({
    resolveScreenplayUserId,
    getOrCreateScreenplayOwnerRecord,
    getScreenplayProjectRecord,
    refreshScreenplayOwnerRecord,
    commitScreenplayOwnerMutation,
    buildScreenplayEnvelope,
    buildScreenplayReadMeta,
    applyReadStateHeaders,
    normalizeSnippet,
  })) {
    if (typeof dependency !== "function") throw new Error(`mountScreenplayVoiceProjectBriefRoute: ${name} is required`);
  }

  app.post(
    "/screenplay/projects/:projectId/brief/turn",
    express.json({ limit: "64kb" }),
    async (req, res) => {
      const userId = requireScreenplayUserId(req, res, {
        resolveUserId: resolveScreenplayUserId,
        stage: "screenplay_voice_project_brief",
      });
      if (!userId) return;
      if (!req.userId) req.userId = userId;

      const cachedOwner = getOrCreateScreenplayOwnerRecord(req, { create: true });
      if (!cachedOwner) return res.status(404).json({ stage: "screenplay_voice_project_brief", error: "project_not_found" });
      let refreshed;
      try {
        refreshed = await refreshScreenplayOwnerRecord(cachedOwner.ownerKey);
      } catch (error) {
        refreshed = { ok: false, error };
      }
      if (!refreshed?.ok) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(503).json({ stage: "screenplay_voice_project_brief", error: "screenplay_persistence_failed" });
      }
      const owner = refreshed.owner;
      const projectId = normalizeSnippet(req.params?.projectId, 64);
      if (!owner || !getScreenplayProjectRecord(owner, projectId)) {
        return res.status(404).json({ stage: "screenplay_voice_project_brief", error: "project_not_found" });
      }

      let outcome;
      try {
        outcome = await commitScreenplayOwnerMutation({
          ownerKey: owner.ownerKey,
          now: Date.now(),
          retryAmbiguousCommit: true,
          mutate(nextOwner) {
            const project = getScreenplayProjectRecord(nextOwner, projectId);
            if (!project) return { commit: false, kind: "not_found" };
            return applyVoiceProjectBriefMutation(project, req.body);
          },
        });
      } catch (error) {
        outcome = { ok: false, error };
      }
      if (!outcome?.ok) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(503).json({ stage: "screenplay_voice_project_brief", error: "screenplay_persistence_failed" });
      }

      const kind = outcome.result?.kind || "invalid_action";
      const canonicalOwner = outcome.owner || owner;
      const canonicalProject = getScreenplayProjectRecord(canonicalOwner, projectId);
      if (!canonicalProject || kind === "not_found") {
        return res.status(404).json({ stage: "screenplay_voice_project_brief", error: "project_not_found" });
      }
      const conflictKinds = new Set(["stale_revision", "request_id_reused", "replayed_superseded"]);
      const invalidKinds = new Set([
        "invalid_precondition",
        "invalid_action",
        "value_required",
        "brief_already_ready",
        "not_current_field",
      ]);
      const statusCode = conflictKinds.has(kind) ? 409 : invalidKinds.has(kind) ? 400 : 200;
      const responseStatus = kind === "no_change" ? "saved" : kind;
      const brief = toVoiceProjectBriefPayload(canonicalProject);
      applyReadStateHeaders(res, buildScreenplayReadMeta(req, canonicalOwner));
      res.setHeader("Cache-Control", "no-store");
      return res.status(statusCode).json(buildScreenplayEnvelope(req, canonicalOwner, {
        stage: "screenplay_voice_project_brief",
        status: responseStatus,
        ...(statusCode >= 400 ? { error: `screenplay_voice_project_brief_${kind}` } : {}),
        conflict: conflictKinds.has(kind),
        replayed: kind === "replayed" || kind === "replayed_superseded",
        project_id: canonicalProject.id,
        brief_revision: brief.revision,
        brief,
      }));
    }
  );
}

export { mountScreenplayVoiceProjectBriefRoute };
