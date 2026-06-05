function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeVersion(version) {
  if (!version || typeof version !== "object") return null;
  return {
    id: normalizeKey(version?.id),
    source: String(version?.source || "").trim(),
    draft: String(version?.draft || "").trim(),
    draftExcerpt: String(version?.draftExcerpt || version?.draft_excerpt || "").trim(),
    updatedAt: Number(version?.updatedAt ?? version?.updated_at ?? 0) || 0,
  };
}

export function extractStudioProjectMetadata(payload) {
  const project = payload?.payload?.project || payload?.project || null;
  if (!project || typeof project !== "object") return null;

  const threadViewState = project?.studioThreadViewState || project?.studio_thread_view_state || {};
  const diffAcknowledged = project?.studioDiffAcknowledged || project?.studio_diff_acknowledged || {};
  const acknowledgedEntries = Array.isArray(diffAcknowledged?.entries)
    ? diffAcknowledged.entries.map((entry) => ({
        key: normalizeKey(entry?.key),
        fingerprint: String(entry?.fingerprint || "").trim(),
        writeID: normalizeKey(entry?.writeId || entry?.write_id),
      })).filter((entry) => entry.key)
    : [];
  const acknowledgedKeys = Array.isArray(diffAcknowledged?.keys)
    ? diffAcknowledged.keys.map((value) => normalizeKey(value)).filter(Boolean)
    : [];
  const askNoteHistory = Array.isArray(project?.studioAskNoteHistory || project?.studio_ask_note_history)
    ? (project.studioAskNoteHistory || project.studio_ask_note_history).map((entry) => ({
        id: normalizeKey(entry?.id),
        requestID: normalizeKey(entry?.requestID || entry?.requestId || entry?.request_id),
        writeID: normalizeKey(entry?.writeID || entry?.writeId || entry?.write_id),
        insertedText: String(entry?.insertedText || entry?.inserted_text || "").trim(),
      })).filter((entry) => entry.id)
    : [];
  const versions = Array.isArray(project?.versions)
    ? project.versions.map(normalizeVersion).filter(Boolean)
    : [];
  const activeVersionId = normalizeKey(project?.activeVersionId || project?.active_version_id);

  return {
    projectId: normalizeKey(project?.id),
    title: String(project?.title || "").trim(),
    activeVersionId,
    lastVersionId: normalizeKey(project?.lastVersionId || project?.last_version_id),
    activeVersion: versions.find((version) => version.id === activeVersionId) || null,
    versions,
    focusedDiffKey: normalizeKey(threadViewState?.focusedDiffKey || threadViewState?.focused_diff_key),
    reopenedLineageKeys: Array.isArray(threadViewState?.reopenedLineageKeys || threadViewState?.reopened_lineage_keys)
      ? (threadViewState.reopenedLineageKeys || threadViewState.reopened_lineage_keys)
          .map((value) => normalizeKey(value))
          .filter(Boolean)
      : [],
    latestReopenedWriteID: normalizeKey(threadViewState?.latestReopenedWriteID || threadViewState?.latest_reopened_write_id),
    acknowledgedKeys,
    acknowledgedEntries,
    askNoteHistory,
    askNoteHistoryCount: askNoteHistory.length,
  };
}

export function resolveStudioProjectMetadataBaseURL(baseURL = "") {
  const candidate = String(
    baseURL
    || process.env.THEM_BASE_URL
    || process.env.BACKEND_BASE_URL
    || process.env.BACKEND_URL
    || "http://127.0.0.1:3000"
  ).trim();
  return candidate.replace(/\/+$/, "") || "http://127.0.0.1:3000";
}

export async function fetchStudioProjectMetadata(projectId, headers, baseURL = "") {
  const resolvedBaseURL = resolveStudioProjectMetadataBaseURL(baseURL);
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${resolvedBaseURL}/screenplay/projects/${projectId}?include_drafts=1`, {
        headers: {
          ...headers,
          Connection: "close",
        },
      });
      const payload = await response.json().catch(() => ({}));
      return {
        response,
        payload,
        metadata: extractStudioProjectMetadata(payload),
      };
    } catch (error) {
      lastError = error;
      const material = [
        error?.message,
        error?.cause?.message,
        error?.cause?.code,
        error?.code,
      ].filter(Boolean).join(" ");
      if (!/ECONNRESET|fetch failed|socket|network|terminated/i.test(material) || attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }
  }
  throw lastError || new Error(`Failed to fetch Studio project metadata for ${projectId}`);
}
