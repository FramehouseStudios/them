// One owner for stored version fields; both ordinary saves and first saves use it.
export function createScreenplayVersionRecord({ id, projectId, phase, source, clientRequestId,
  now, notes = "", draft, score, draftExcerpt, studioWriteAnchors = [], screenplayBindings = [],
  persistencePending = false, initialRequestHash = "" }) {
  return {
    id, projectId, phase, source, clientRequestId, createdAt: now, updatedAt: now,
    prompt: "", notes, formatScore: score.formatScore, storyScore: score.storyScore,
    confidenceClass: score.confidenceClass, warnings: score.warnings,
    draft, draftExcerpt, studioWriteAnchors, screenplayBindings, persistencePending,
    ...(initialRequestHash ? { initialRequestHash } : {}),
  };
}

export function normalizeStoredScreenplayVersionRecord(entry, {
  normalizeSnippet, normalizeScreenplayStringList, buildDraftExcerpt,
  normalizeStoredScreenplayWriteAnchors, normalizeStoredScreenplayBindings,
}) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64);
  if (!id) return null;
  const initialRequestHash = String(entry.initialRequestHash || "");
  return {
    id,
    projectId: normalizeSnippet(entry.projectId, 64),
    phase: normalizeSnippet(entry.phase, 48) || "scene_draft",
    source: normalizeSnippet(entry.source, 48),
    clientRequestId: normalizeSnippet(entry.clientRequestId ?? entry.client_request_id, 96),
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
    prompt: normalizeSnippet(entry.prompt, 320),
    notes: normalizeSnippet(entry.notes, 240),
    formatScore: Number(entry.formatScore || 0),
    storyScore: Number(entry.storyScore || 0),
    confidenceClass: normalizeSnippet(entry.confidenceClass, 24) || "medium",
    warnings: normalizeScreenplayStringList(entry.warnings, 8, 64),
    draft: String(entry.draft || ""),
    draftExcerpt: buildDraftExcerpt(entry.draftExcerpt || entry.draft || ""),
    studioWriteAnchors: normalizeStoredScreenplayWriteAnchors(entry.studioWriteAnchors || entry.studio_write_anchors),
    screenplayBindings: normalizeStoredScreenplayBindings(entry.screenplayBindings || entry.screenplay_bindings),
    ...(/^[a-f0-9]{64}$/.test(initialRequestHash) ? { initialRequestHash } : {}),
  };
}
