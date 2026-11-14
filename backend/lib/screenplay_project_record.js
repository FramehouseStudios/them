import { readPresenceRecord, ensurePresenceRecord } from './clementine/presence_record.js';

export function normalizeStoredScreenplayProjectRecord(entry, {
  normalizeSnippet,
  normalizeStoredScreenplayDiffAcknowledgementState,
  normalizeStoredScreenplayOutline,
  normalizeOutlineRevision,
  normalizeStoredScreenplayVersion,
  normalizeStoredScreenplayCollaborator,
  normalizeStoredScreenplayComment,
  normalizeStoredScreenplayStudioAskNoteHistory,
  normalizeScreenplayStringList,
  normalizeOutlineMutationReceipts,
  normalizeStoredScreenplayThreadViewState
}) {
  if (!entry || typeof entry !== "object") return null;
  const id = normalizeSnippet(entry.id, 64);
  const title = normalizeSnippet(entry.title, 160);
  if (!id || !title) return null;
  const diffAcknowledged = normalizeStoredScreenplayDiffAcknowledgementState(
    entry.studioDiffAcknowledged
    || entry.studio_diff_acknowledged
    || {
      keys: entry.studioDiffAcknowledgedKeys
        || entry.studio_diff_acknowledged_keys,
      entries: entry.studioDiffAcknowledgedEntries
        || entry.studio_diff_acknowledged_entries,
    }
  );
  const outline = normalizeStoredScreenplayOutline(entry.outline);
  const outlineRevision = normalizeOutlineRevision(
    entry.outlineRevision ?? entry.outline_revision ?? outline.revision
  );
  outline.revision = outlineRevision;
  const versions = Array.isArray(entry.versions)
    ? entry.versions.map(normalizeStoredScreenplayVersion).filter(Boolean)
    : [];
  const collaborators = Array.isArray(entry.collaborators)
    ? entry.collaborators.map(normalizeStoredScreenplayCollaborator).filter(Boolean)
    : [];
  const comments = Array.isArray(entry.comments)
    ? entry.comments.map(normalizeStoredScreenplayComment).filter(Boolean)
    : [];
  const studioAskNoteHistory = normalizeStoredScreenplayStudioAskNoteHistory(
    entry.studioAskNoteHistory
    || entry.studio_ask_note_history
    || entry.studioExchangeHistory
    || entry.studio_exchange_history
  );
  const migrated = readPresenceRecord(entry) ? { ...entry } : null;
  if (migrated) ensurePresenceRecord(migrated);
  return {
    ...(migrated ? {
      clementinePresence: migrated.clementinePresence,
      samanthaPresence: migrated.samanthaPresence,
      clementinePresenceCompatibilityBaseline: migrated.clementinePresenceCompatibilityBaseline,
    } : {}),
    id,
    title,
    archived: Boolean(entry.archived),
    tags: normalizeScreenplayStringList(entry.tags, 24, 48),
    characters: normalizeScreenplayStringList(entry.characters, 24, 48),
    setting: normalizeSnippet(entry.setting, 120),
    tone: normalizeSnippet(entry.tone, 120),
    promptSeed: normalizeSnippet(entry.promptSeed, 240),
    logline: normalizeSnippet(entry.logline, 500),
    themeArgument: normalizeSnippet(entry.themeArgument ?? entry.theme_argument ?? entry.theme, 500),
    centralQuestion: normalizeSnippet(
      entry.centralQuestion ?? entry.central_question ?? entry.dramaticQuestion ?? entry.dramatic_question,
      500
    ),
    protagonistWant: normalizeSnippet(entry.protagonistWant ?? entry.protagonist_want, 500),
    protagonistNeed: normalizeSnippet(entry.protagonistNeed ?? entry.protagonist_need, 500),
    antagonisticForce: normalizeSnippet(entry.antagonisticForce ?? entry.antagonistic_force, 500),
    actPosition: normalizeSnippet(entry.actPosition ?? entry.act_position ?? entry.act, 80),
    endingImage: normalizeSnippet(entry.endingImage ?? entry.ending_image ?? entry.finalImage ?? entry.final_image, 500),
    unresolvedSetups: normalizeScreenplayStringList(entry.unresolvedSetups ?? entry.unresolved_setups, 24, 220),
    createdAt: Math.max(0, Number(entry.createdAt || 0)),
    updatedAt: Math.max(0, Number(entry.updatedAt || entry.createdAt || 0)),
    lastPhase: normalizeSnippet(entry.lastPhase, 48) || "scene_draft",
    activeVersionId: normalizeSnippet(entry.activeVersionId, 64),
    lastVersionId: normalizeSnippet(entry.lastVersionId, 64),
    lastVersionAt: Math.max(0, Number(entry.lastVersionAt || 0)),
    studioThreadViewState: normalizeStoredScreenplayThreadViewState(entry.studioThreadViewState || entry.studio_thread_view_state),
    studioDiffAcknowledgedKeys: diffAcknowledged.keys,
    studioDiffAcknowledgedEntries: diffAcknowledged.entries,
    studioAskNoteHistory,
    outlineRevision,
    outlineMutationReceipts: normalizeOutlineMutationReceipts(
      entry.outlineMutationReceipts ?? entry.outline_mutation_receipts
    ),
    outline,
    versions,
    collaborators,
    comments,
  };
}
