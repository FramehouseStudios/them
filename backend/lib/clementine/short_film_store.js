// Short-film store helper — id-only (PR-B, D009 strangler).
// Pure, no direct I/O. Caller persists via commitScreenplayOwnerMutation or
// markScreenplayOwnerDirty. Falls back to local generators when deps not provided.

function defaultCreateScreenplayId(prefix = "project") {
  const p = String(prefix || "project").trim() || "project";
  return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultCreateEmptyScreenplayOutline(now = Date.now()) {
  return { acts: [], scenes: [], beats: [], updatedAt: Math.max(0, Number(now || Date.now())) };
}

function trimToString(v) {
  return v == null ? "" : String(v).trim();
}

function normalizeParsed(parsed) {
  const chars = Array.isArray(parsed?.characters) ? parsed.characters.map((c) => trimToString(c)).filter(Boolean) : [];
  const setting = trimToString(parsed?.setting) || "bedroom";
  const genre = trimToString(parsed?.genre) || "horror";
  return { chars, setting, genre };
}

function buildShortFilmProject({
  parsed,
  ownerKey = "",
  now = Date.now(),
  createScreenplayId = defaultCreateScreenplayId,
  createEmptyScreenplayOutline = defaultCreateEmptyScreenplayOutline,
} = {}) {
  if (!parsed) throw new Error("parsed required");
  const ts = Math.max(0, Number(now || Date.now()));
  const { chars, setting, genre } = normalizeParsed(parsed);
  const outline = typeof createEmptyScreenplayOutline === "function"
    ? createEmptyScreenplayOutline()
    : defaultCreateEmptyScreenplayOutline(ts);
  // Ensure outline shape
  if (!outline || typeof outline !== "object") throw new Error("createEmptyScreenplayOutline must return object");
  if (!Array.isArray(outline.acts)) outline.acts = [];
  if (!Array.isArray(outline.scenes)) outline.scenes = [];
  if (!Array.isArray(outline.beats)) outline.beats = [];
  const id = typeof createScreenplayId === "function" ? createScreenplayId("project") : defaultCreateScreenplayId("project");
  return {
    id: String(id),
    ownerKey: trimToString(ownerKey),
    title: `Untitled ${genre} short`,
    logline: `${genre} in a single ${setting} with ${chars.join(", ") || "ensemble"}`,
    setting,
    tone: genre,
    characters: chars.map((name) => ({ name, description: `${name} — beta character` })),
    outline,
    outlineRevision: 1,
    outlineMutationReceipts: [],
    versions: [],
    activeVersionId: "",
    createdAt: ts,
    updatedAt: ts,
  };
}

function createShortFilmVersion({
  draft,
  parsed,
  now = Date.now(),
  createScreenplayId = defaultCreateScreenplayId,
} = {}) {
  if (draft == null || trimToString(draft) === "") throw new Error("draft required");
  const ts = Math.max(0, Number(now || Date.now()));
  const id = typeof createScreenplayId === "function" ? createScreenplayId("version") : defaultCreateScreenplayId("version");
  return {
    id: String(id),
    phase: "beta_short_film_5p",
    source: "short_film_beta",
    draft: String(draft),
    draftExcerpt: String(draft).slice(0, 220),
    createdAt: ts,
    updatedAt: ts,
    formatScore: 0,
    storyScore: 0,
  };
}

/**
 * Ensure short-film project exists for owner — id-only, no genre heuristic.
 * Reuses ownerRecord.activeProjectId when it points to an existing project;
 * otherwise creates a new one via buildShortFilmProject and updates activeProjectId.
 * Returns { project, created } without persisting.
 */
function ensureShortFilmProject({
  ownerRecord,
  parsed,
  now = Date.now(),
  createScreenplayId = defaultCreateScreenplayId,
  createEmptyScreenplayOutline = defaultCreateEmptyScreenplayOutline,
} = {}) {
  if (!ownerRecord) throw new Error("ownerRecord required");
  if (!parsed) throw new Error("parsed required");
  if (!Array.isArray(ownerRecord.projects)) ownerRecord.projects = [];
  const ts = Math.max(0, Number(now || Date.now()));
  // id-only: reuse activeProjectId if it resolves
  const activeId = trimToString(ownerRecord.activeProjectId);
  if (activeId) {
    const existing = ownerRecord.projects.find((p) => String(p?.id) === activeId);
    if (existing) {
      return { project: existing, created: false };
    }
  }
  const proj = buildShortFilmProject({ parsed, ownerKey: ownerRecord.ownerKey, now: ts, createScreenplayId, createEmptyScreenplayOutline });
  ownerRecord.projects.push(proj);
  ownerRecord.activeProjectId = proj.id;
  ownerRecord.updatedAt = ts;
  return { project: proj, created: true };
}

export { buildShortFilmProject, createShortFilmVersion, ensureShortFilmProject };
