function cleanText(value, maxChars) {
  return String(value ?? "").trim().slice(0, maxChars);
}

function buildCanonClarificationPayload(memoryWriteSummary = null) {
  const source = memoryWriteSummary?.canonCorrectionAmbiguity;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;

  const id = cleanText(source.id, 96);
  const status = cleanText(source.status || "pending", 32).toLowerCase();
  const candidateFacts = (Array.isArray(source.candidateFacts) ? source.candidateFacts : [])
    .map((fact) => cleanText(fact, 220))
    .filter(Boolean)
    .slice(0, 8);
  if (!id || status !== "pending" || candidateFacts.length < 2) return null;

  const projectId = cleanText(source.projectId, 96);
  const projectTitle = cleanText(source.projectTitle, 160);
  const correctionText = cleanText(source.correctionText, 600);
  const correctionMemoryId = cleanText(source.correctionMemoryId, 80);
  const createdAt = Math.max(0, Number(source.createdAt || 0));

  return {
    id,
    status,
    ...(projectId ? { project_id: projectId } : {}),
    ...(projectTitle ? { project_title: projectTitle } : {}),
    correction_text: correctionText,
    candidate_facts: candidateFacts,
    ...(correctionMemoryId ? { correction_memory_id: correctionMemoryId } : {}),
    selected_fact: null,
    selected_facts: [],
    receipt_id: null,
    created_at: createdAt,
    resolved_at: null,
  };
}

export { buildCanonClarificationPayload };
