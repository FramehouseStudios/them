function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
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

  return {
    projectId: normalizeKey(project?.id),
    title: String(project?.title || "").trim(),
    focusedDiffKey: normalizeKey(threadViewState?.focusedDiffKey || threadViewState?.focused_diff_key),
    reopenedLineageKeys: Array.isArray(threadViewState?.reopenedLineageKeys || threadViewState?.reopened_lineage_keys)
      ? (threadViewState.reopenedLineageKeys || threadViewState.reopened_lineage_keys)
          .map((value) => normalizeKey(value))
          .filter(Boolean)
      : [],
    latestReopenedWriteID: normalizeKey(threadViewState?.latestReopenedWriteID || threadViewState?.latest_reopened_write_id),
    acknowledgedKeys,
    acknowledgedEntries,
  };
}

export async function fetchStudioProjectMetadata(projectId, headers) {
  const response = await fetch(`http://127.0.0.1:3000/screenplay/projects/${projectId}?include_drafts=1`, {
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  return {
    response,
    payload,
    metadata: extractStudioProjectMetadata(payload),
  };
}
