import {
  getLatestScreenplayVersion,
  getOrCreateScreenplayOwnerRecord,
  getScreenplayProjectRecord,
  refreshScreenplayOwnerRecord,
} from "../screenplay_store.js";

function findTerminalEndLine(draft) {
  const lines = String(draft || "").replace(/\r\n?/g, "\n").split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\s*(?:>\s*)?THE END(?:\s*<)?\s*$/i.test(lines[index])) {
      return index + 1;
    }
  }
  return 0;
}

function isAppendAfterTerminalEnd({ terminalEndLine, anchorLine, anchorEndLine, insertionMode } = {}) {
  const endLine = Math.max(0, Math.floor(Number(terminalEndLine) || 0));
  if (!endLine) return false;

  const start = Math.max(0, Math.floor(Number(anchorLine) || 0));
  const finish = Math.max(0, Math.floor(Number(anchorEndLine) || 0));
  const mode = String(insertionMode || "").trim().toLowerCase();

  // The UI's explicit selection-rewrite contract is a deliberate edit, not a
  // request to continue past the ending. It may replace the ending itself.
  if (mode === "replace_selection" && start > 0 && finish >= start && start <= endLine) {
    return false;
  }

  // Older clients omit insertionMode but still send an explicit 1-based
  // anchor. Preserve those writes when they target text before the ending.
  if (start > 0) {
    return start >= endLine;
  }

  // Missing/unknown placement means the writer pipeline will append by
  // default. Fail closed for a finished script rather than trusting excerpts.
  return true;
}

function readProjectId(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  return String(body.screenplay_project_id ?? body.screenplayProjectId ?? "").trim();
}

function readInsertion(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  return {
    anchorLine: body.screenplay_anchor_line ?? body.screenplayAnchorLine,
    anchorEndLine: body.screenplay_anchor_end_line ?? body.screenplayAnchorEndLine,
    insertionMode: body.screenplay_insertion_mode ?? body.screenplayInsertionMode,
  };
}

async function loadCanonicalProjectDraft(req, projectId) {
  // Owner identity is resolved by screenplay_store from server-attached auth
  // (or its existing server-side session fallback), never from a body ID.
  const owner = getOrCreateScreenplayOwnerRecord(req, { create: true });
  const refreshed = await refreshScreenplayOwnerRecord(owner.ownerKey);
  if (!refreshed?.ok) {
    const error = new Error("screenplay_state_unavailable");
    error.code = "screenplay_state_unavailable";
    error.status = 503;
    throw error;
  }
  const canonicalOwner = refreshed.owner || owner;
  const activeProjectId = String(canonicalOwner?.activeProjectId || "").trim();
  const targetProjectId = String(projectId || activeProjectId).trim();
  if (!targetProjectId) return null;

  const project = getScreenplayProjectRecord(canonicalOwner, targetProjectId);
  if (!project && activeProjectId) {
    const error = new Error("screenplay_project_not_found");
    error.code = "screenplay_project_not_found";
    error.status = 404;
    throw error;
  }
  if (!project) return null;
  const latest = getLatestScreenplayVersion(project);
  return String(latest?.draft || "");
}

function createFinishedScriptGuard({ loadProjectDraft = loadCanonicalProjectDraft } = {}) {
  if (typeof loadProjectDraft !== "function") {
    throw new Error("createFinishedScriptGuard requires loadProjectDraft");
  }
  return async function guardFinishedScriptWrite(req) {
    const projectId = readProjectId(req);
    // The canonical loader falls back to the server-owned active project when
    // older clients omit an id. A writer with no active project can start page 1.
    const draft = await loadProjectDraft(req, projectId);
    // A project may be selected in the client before its first version is
    // saved. With no server-owned draft there is no terminal marker to guard.
    if (draft == null) return { allowed: true, checked: false };

    const terminalEndLine = findTerminalEndLine(draft);
    const placement = readInsertion(req);
    if (!isAppendAfterTerminalEnd({ terminalEndLine, ...placement })) {
      return { allowed: true, checked: true, terminalEndLine };
    }

    return {
      allowed: false,
      status: 409,
      error: "screenplay_already_ended",
      message: "This screenplay is marked THE END. Select a passage to rewrite, or start a new project to keep writing.",
      terminalEndLine,
    };
  };
}

const guardFinishedScriptWrite = createFinishedScriptGuard();

export {
  createFinishedScriptGuard,
  findTerminalEndLine,
  guardFinishedScriptWrite,
  isAppendAfterTerminalEnd,
};
