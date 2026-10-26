import { createHash } from "node:crypto";
import { createScreenplayVersionRecord } from "./screenplay_version_record.js";

export function createEmptyScreenplayProjectRecord({ id, title, now, createEmptyScreenplayOutline }) {
  return {
    id, title, archived: false, tags: [], characters: [], setting: "", tone: "", promptSeed: "",
    logline: "", themeArgument: "", centralQuestion: "", protagonistWant: "", protagonistNeed: "",
    antagonisticForce: "", actPosition: "", endingImage: "", unresolvedSetups: [],
    createdAt: now, updatedAt: now, lastPhase: "scene_draft", activeVersionId: "",
    lastVersionId: "", lastVersionAt: 0, studioThreadViewState: null,
    studioDiffAcknowledgedKeys: [], studioDiffAcknowledgedEntries: [], studioAskNoteHistory: [],
    outline: createEmptyScreenplayOutline(), versions: [], collaborators: [], comments: [],
  };
}

// Opt-in contract on the existing collection route. The canonical owner transaction
// publishes metadata and first version together; its CAS also serializes retries.
export function createScreenplayProjectInitializer(deps) {
  const { getAuthorizedScreenplayOwner, getScreenplayProjectRecord, commitScreenplayOwnerMutation,
    createScreenplayId, createEmptyScreenplayOutline, normalizeSnippet, normalizeScreenplayPhaseValue,
    parseBool, scoreScreenplayDraft, buildDraftExcerpt, applyReadStateHeaders, buildScreenplayReadMeta,
    buildScreenplayEnvelope, toScreenplayProjectPayload, toScreenplayVersionPayload } = deps;
  return async function initialize(req, res) {
    const stage = "screenplay_project";
    const owner = getAuthorizedScreenplayOwner(req, res, stage);
    if (!owner) return;
    const fail = (status, error) => { res.setHeader("Cache-Control", "no-store"); return res.status(status).json({ stage, error }); };
    const body = req.body || {}, initial = body.initial_draft;
    if (!initial || typeof initial !== "object" || Array.isArray(initial)) return fail(400, "initial_draft_required");
    const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
    const requestId = typeof initial.client_request_id === "string" ? initial.client_request_id.trim() : "";
    const title = normalizeSnippet(body.title, 160);
    if (!projectId || projectId.length > 64) return fail(400, "project_id_required");
    if (!requestId || requestId.length > 96) return fail(400, "client_request_id_required");
    if (!title) return fail(400, "title_required");
    if (typeof initial.draft !== "string" || !initial.draft.trim()) return fail(400, "draft_required");
    const supported = new Set(["project_id", "title", "phase", "activate", "initial_draft"]);
    const initialFields = new Set(["draft", "client_request_id", "source", "notes"]);
    if (Object.keys(body).some(k => !supported.has(k)) || Object.keys(initial).some(k => !initialFields.has(k))) {
      return fail(400, "initial_metadata_not_supported");
    }
    const draft = initial.draft, phase = normalizeScreenplayPhaseValue(body.phase);
    const source = normalizeSnippet(initial.source, 48) || "studio_initial_create";
    const notes = normalizeSnippet(initial.notes, 240);
    const activate = body.activate == null ? true : parseBool(body.activate);
    const initialRequestHash = createHash("sha256").update(JSON.stringify(["them.initial-project.v1", projectId, title, phase, draft, source, notes, activate])).digest("hex");
    const now = Date.now(), versionId = createScreenplayId("version");
    let commit;
    try {
      commit = await commitScreenplayOwnerMutation({ ownerKey: owner.ownerKey, now, retryAmbiguousCommit: true,
        mutate(nextOwner) {
          const existing = getScreenplayProjectRecord(nextOwner, projectId);
          if (existing) {
            const version = (existing.versions || []).find(v => v.clientRequestId === requestId);
            if (!version || version.initialRequestHash !== initialRequestHash || version.draft !== draft) {
              return { commit: false, kind: "request_reused" };
            }
            const currentId = existing.activeVersionId || existing.lastVersionId || existing.versions?.[0]?.id || "";
            if (currentId !== version.id) return { commit: false, kind: "superseded" };
            return { commit: false, kind: "replayed", versionId: version.id };
          }
          // A creation request cannot be replayed under a second project identity.
          if ((nextOwner.projects || []).some(p => (p.versions || []).some(v => v.initialRequestHash && v.clientRequestId === requestId))) {
            return { commit: false, kind: "request_reused" };
          }
          const project = createEmptyScreenplayProjectRecord({ id: projectId, title, now, createEmptyScreenplayOutline });
          const version = createScreenplayVersionRecord({ id: versionId, projectId, phase, source,
            clientRequestId: requestId, now, notes, draft, score: scoreScreenplayDraft(draft),
            draftExcerpt: buildDraftExcerpt(draft, 220), initialRequestHash });
          project.versions = [version];
          project.activeVersionId = project.lastVersionId = version.id;
          project.lastVersionAt = now; project.lastPhase = phase;
          nextOwner.projects.unshift(project);
          if (activate || !nextOwner.activeProjectId) nextOwner.activeProjectId = project.id;
          return { kind: "created", versionId: version.id };
        },
      });
    } catch { return fail(503, "screenplay_persistence_failed"); }
    if (!commit?.ok || !commit.owner) return fail(503, "screenplay_persistence_failed");
    const kind = commit.result?.kind;
    if (kind === "request_reused") return fail(409, "screenplay_initial_request_reused");
    if (kind === "superseded") return fail(409, "screenplay_initial_request_superseded");
    if (!["created", "replayed"].includes(kind)) return fail(503, "screenplay_persistence_failed");
    const project = getScreenplayProjectRecord(commit.owner, projectId);
    const version = project?.versions?.find(v => v.id === commit.result?.versionId);
    if (!project || !version || version.draft !== draft || version.initialRequestHash !== initialRequestHash) {
      return fail(503, "screenplay_persistence_failed");
    }
    res.setHeader("Cache-Control", "no-store");
    applyReadStateHeaders(res, buildScreenplayReadMeta(req, commit.owner));
    return res.status(kind === "created" ? 201 : 200).json(buildScreenplayEnvelope(req, commit.owner, {
      stage, status: kind === "created" ? "created" : "replayed", created: kind === "created",
      replayed: kind === "replayed", conflict: false, project_id: project.id, version_id: version.id,
      version: toScreenplayVersionPayload(version, { includeDraft: true }),
      project: toScreenplayProjectPayload(project, { includeVersions: true, includeDrafts: true, versionLimit: 24 }),
      screenplay_active_project_id: commit.owner.activeProjectId || "", screenplay_project_count: commit.owner.projects.length,
    }));
  };
}
