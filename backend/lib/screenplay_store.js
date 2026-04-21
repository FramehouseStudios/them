const screenplayStoreByOwner = new Map();

let configuredDeps = null;

function configureScreenplayStore(deps = {}) {
  configuredDeps = deps;
}

function screenplayStoreDeps() {
  if (!configuredDeps) {
    throw new Error("screenplay_store not configured");
  }
  return configuredDeps;
}

function loadScreenplayStore(target = screenplayStoreByOwner) {
  const {
    SCREENPLAY_STORE_PATH,
    fs,
    normalizeStoredScreenplayOwner,
  } = screenplayStoreDeps();
  target.clear();
  try {
    if (!fs.existsSync(SCREENPLAY_STORE_PATH)) return;
    const raw = fs.readFileSync(SCREENPLAY_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const owners = Array.isArray(parsed?.owners) ? parsed.owners : [];
    for (const ownerEntry of owners) {
      const owner = normalizeStoredScreenplayOwner(ownerEntry);
      if (!owner) continue;
      target.set(owner.ownerKey, owner);
    }
  } catch (err) {
    console.error(`[screenplay_store] Failed to load store ${SCREENPLAY_STORE_PATH}:`, err);
  }
}

function saveScreenplayStore(now = Date.now()) {
  const {
    SCREENPLAY_STORE_PATH,
    normalizeStoredScreenplayCompanionState,
    writeJsonFileAtomic,
  } = screenplayStoreDeps();
  const payload = {
    version: 1,
    updatedAt: now,
    owners: [...screenplayStoreByOwner.values()].map((owner) => ({
      ownerKey: owner.ownerKey,
      activeProjectId: owner.activeProjectId,
      updatedAt: Math.max(0, Number(owner.updatedAt || now)),
      companionState: normalizeStoredScreenplayCompanionState(owner.companionState),
      projects: Array.isArray(owner.projects) ? owner.projects : [],
    })),
  };
  writeJsonFileAtomic(SCREENPLAY_STORE_PATH, payload, "screenplay_store");
}

function getOrCreateScreenplayOwnerRecord(req, { create = true } = {}) {
  const {
    createEmptyScreenplayOwner,
    resolveScreenplayOwnerKey,
  } = screenplayStoreDeps();
  const ownerKey = resolveScreenplayOwnerKey(req);
  let owner = screenplayStoreByOwner.get(ownerKey);
  if (!owner && create) {
    owner = createEmptyScreenplayOwner(ownerKey);
    screenplayStoreByOwner.set(ownerKey, owner);
  }
  return owner || null;
}

function getScreenplayProjectRecord(ownerRecord, projectId) {
  if (!ownerRecord || !Array.isArray(ownerRecord.projects)) return null;
  return ownerRecord.projects.find((project) => project.id === projectId) || null;
}

function getLatestScreenplayVersion(project) {
  if (!project || !Array.isArray(project.versions) || project.versions.length === 0) return null;
  return [...project.versions].sort((a, b) => {
    const aTs = Math.max(0, Number(a.updatedAt || a.createdAt || 0));
    const bTs = Math.max(0, Number(b.updatedAt || b.createdAt || 0));
    return bTs - aTs;
  })[0] || null;
}

function ensureScreenplayOutline(project) {
  const { createEmptyScreenplayOutline } = screenplayStoreDeps();
  if (!project.outline || typeof project.outline !== "object") {
    project.outline = createEmptyScreenplayOutline();
  }
  if (!Array.isArray(project.outline.acts)) project.outline.acts = [];
  if (!Array.isArray(project.outline.scenes)) project.outline.scenes = [];
  if (!Array.isArray(project.outline.beats)) project.outline.beats = [];
  return project.outline;
}

function recalculateScreenplayProject(project) {
  const {
    buildDraftExcerpt,
    normalizeSnippet,
  } = screenplayStoreDeps();
  const outline = ensureScreenplayOutline(project);
  const latestVersion = getLatestScreenplayVersion(project);
  const approvedEmails = (Array.isArray(project.collaborators) ? project.collaborators : [])
    .filter((item) => String(item.status || "").toLowerCase() === "approved")
    .map((item) => item.email)
    .filter(Boolean);
  const latestCommentAt = Math.max(
    0,
    ...((Array.isArray(project.comments) ? project.comments : []).map((item) => Number(item.updatedAt || item.createdAt || 0)))
  );
  project.updatedAt = Math.max(
    Number(project.updatedAt || 0),
    Number(outline.updatedAt || 0),
    Number(latestVersion?.updatedAt || latestVersion?.createdAt || 0),
    latestCommentAt
  );
  project.versionCount = Array.isArray(project.versions) ? project.versions.length : 0;
  project.lastVersionId = latestVersion?.id || "";
  project.lastVersionAt = Math.max(0, Number(latestVersion?.updatedAt || latestVersion?.createdAt || 0));
  project.activeVersionId = normalizeSnippet(project.activeVersionId, 64) || project.lastVersionId;
  project.lastPhase = normalizeSnippet(project.lastPhase, 48) || normalizeSnippet(latestVersion?.phase, 48) || "scene_draft";
  project.formatScore = Number(latestVersion?.formatScore || 0);
  project.storyScore = Number(latestVersion?.storyScore || 0);
  project.confidenceClass = normalizeSnippet(latestVersion?.confidenceClass, 24) || "medium";
  project.latestExcerpt = buildDraftExcerpt(latestVersion?.draftExcerpt || latestVersion?.draft || "", 220);
  project.actCount = outline.acts.length;
  project.sceneCount = outline.scenes.length;
  project.beatCount = outline.beats.length;
  project.outlineUpdatedAt = Math.max(0, Number(outline.updatedAt || 0));
  project.collaboratorCount = approvedEmails.length;
  project.approvedEmails = approvedEmails;
  project.commentCount = Array.isArray(project.comments) ? project.comments.length : 0;
  project.lastCommentAt = latestCommentAt;
  return project;
}

function markScreenplayOwnerDirty(ownerRecord, now = Date.now()) {
  if (!ownerRecord) return;
  ownerRecord.updatedAt = Math.max(0, Number(now || Date.now()));
  if (Array.isArray(ownerRecord.projects)) {
    ownerRecord.projects = ownerRecord.projects
      .map((project) => recalculateScreenplayProject(project))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }
  if (ownerRecord.activeProjectId && !ownerRecord.projects.some((project) => project.id === ownerRecord.activeProjectId)) {
    ownerRecord.activeProjectId = ownerRecord.projects[0]?.id || "";
  }
  screenplayStoreByOwner.set(ownerRecord.ownerKey, ownerRecord);
  saveScreenplayStore(now);
}

export {
  configureScreenplayStore,
  ensureScreenplayOutline,
  getLatestScreenplayVersion,
  getOrCreateScreenplayOwnerRecord,
  getScreenplayProjectRecord,
  loadScreenplayStore,
  markScreenplayOwnerDirty,
  recalculateScreenplayProject,
  saveScreenplayStore,
  screenplayStoreByOwner,
};
