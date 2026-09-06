import { normalizeSnippet } from "./utils.js";

export function learnedFieldProvenanceToApi(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((item) => {
      const field = normalizeSnippet(item?.field, 64);
      const value = normalizeSnippet(item?.value, 240);
      if (!field || !value) return null;
      return {
        id: normalizeSnippet(item?.id, 96),
        field,
        value,
        learned_value: normalizeSnippet(item?.learnedValue ?? item?.learned_value, 240),
        source: normalizeSnippet(item?.source, 64),
        status: normalizeSnippet(item?.status, 32) || "current",
        question_id: normalizeSnippet(item?.questionId ?? item?.question_id, 120),
        question: normalizeSnippet(item?.question, 260),
        target_label: normalizeSnippet(item?.targetLabel ?? item?.target_label, 120),
        source_correction_id: normalizeSnippet(
          item?.sourceCorrectionId ?? item?.source_correction_id,
          96
        ),
        correction_text: normalizeSnippet(item?.correctionText ?? item?.correction_text, 600),
        learned_at: Math.max(0, Number(item?.learnedAt ?? item?.learned_at ?? 0)),
        updated_at: Math.max(0, Number(item?.updatedAt ?? item?.updated_at ?? 0)),
      };
    })
    .filter(Boolean)
    .slice(0, 16);
}

export function createMemoryCardRecencyBuilder({
  computeStalenessDays,
  classifyStalenessBand,
}) {
  return function buildMemoryCardRecency({
    rememberedAt = 0,
    lastUsedAt = 0,
    lastSignalAt = 0,
    activityAt = 0,
    superseded = false,
  } = {}, nowTs = Date.now()) {
    const recordedTimestamp = (value) => (
      typeof value === "number" && Number.isFinite(value) && value > 0 && value <= nowTs
        ? value : 0
    );
    const anchor = recordedTimestamp(activityAt);
    const days = anchor ? computeStalenessDays({ lastMentionedAt: anchor }, nowTs) : null;
    return {
      rememberedAt: recordedTimestamp(rememberedAt),
      lastUsedAt: recordedTimestamp(lastUsedAt),
      qualityLastFeedbackAt: recordedTimestamp(lastSignalAt),
      stalenessDays: days,
      stalenessBand: days === null
        ? "unknown"
        : (superseded ? "stale" : classifyStalenessBand(days)),
    };
  };
}
