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
  const deps = screenplayStoreDeps();
  const {
    SCREENPLAY_STORE_PATH,
    normalizeStoredScreenplayCompanionState,
    writeJsonFileAtomic,
    persistence,
  } = deps;
  const owners = [...screenplayStoreByOwner.values()].map((owner) => ({
    ownerKey: owner.ownerKey,
    activeProjectId: owner.activeProjectId,
    updatedAt: Math.max(0, Number(owner.updatedAt || now)),
    companionState: normalizeStoredScreenplayCompanionState(owner.companionState),
    projects: Array.isArray(owner.projects) ? owner.projects : [],
  }));
  const payload = {
    version: 1,
    updatedAt: now,
    owners,
  };
  // Existing JSON file path remains canonical until T07 migration completes.
  // Adapter writes run in parallel (dual-write) so Postgres state stays
  // consistent with the file. Adapter errors are logged but do not block
  // the in-memory save; the JSON file remains source-of-truth on disk.
  writeJsonFileAtomic(SCREENPLAY_STORE_PATH, payload, "screenplay_store");
  if (persistence && typeof persistence.put === "function") {
    // Fire-and-forget per-owner upserts. saveScreenplayStore stays sync to
    // preserve every existing call site; adapter errors log to console.
    for (const owner of owners) {
      void Promise.resolve(persistence.put({
        domain: "screenplay",
        key: owner.ownerKey,
        value: owner,
      })).catch((err) => {
        console.error(`[screenplay_store] adapter put failed for ${owner.ownerKey}:`, err?.message || err);
      });
    }
  }
}

// T07b: load owners from the persistence adapter (when configured).
// Async; callers must await. If no records exist in the adapter, the
// in-memory map is left untouched so the existing JSON-file load can
// be the fallback.
async function loadScreenplayStoreFromAdapter(target = screenplayStoreByOwner) {
  const deps = screenplayStoreDeps();
  const { persistence, normalizeStoredScreenplayOwner } = deps;
  if (!persistence || typeof persistence.list !== "function") return false;
  let records;
  try {
    records = await persistence.list({ domain: "screenplay", limit: 10_000 });
  } catch (err) {
    console.error("[screenplay_store] adapter list failed:", err?.message || err);
    return false;
  }
  if (!Array.isArray(records) || records.length === 0) return false;
  target.clear();
  for (const { value } of records) {
    const owner = normalizeStoredScreenplayOwner(value);
    if (!owner) continue;
    target.set(owner.ownerKey, owner);
  }
  return true;
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
  const activeVersionId = normalizeSnippet(project.activeVersionId, 64);
  project.activeVersionId = Array.isArray(project.versions) && project.versions.some((version) => version.id === activeVersionId)
    ? activeVersionId
    : project.lastVersionId;
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
  loadScreenplayStoreFromAdapter,
  screenplayStoreByOwner,
};
