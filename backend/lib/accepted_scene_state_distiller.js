const ACCEPTED_SCENE_STATE_VERSION = 2;
const ACCEPTED_SCENE_FACT_FIELDS = Object.freeze([
  "decisions",
  "revelations",
  "relationshipChanges",
  "irreversibleConsequences",
]);
const ACCEPTED_SCENE_SCALAR_FIELDS = Object.freeze([
  "summary",
  "outcome",
  "causalHandoff",
]);
const FACTS_PER_FIELD_MAX = 4;
const STORY_OBLIGATION_CHANGES_MAX = 6;
const STORY_OBLIGATION_STATUSES = new Set([
  "advanced",
  "complicated",
  "transformed",
  "paid_off",
]);
const VISIBLE_PAYOFF_CHANGE_PATTERN = /\b(?:accepts?|admits?|abandons?|betrays?|breaks?|burns?|chooses?|closes?|confesses?|destroys?|dies?|exposes?|forgives?|gives?|hands?|leaves?|locks?|opens?|publishes?|refuses?|releases?|returns?|reveals?|saves?|shoots?|signs?|surrenders?|takes?|tears?|tells?|unlocks?)\b/i;

const CAUSAL_PATTERNS = Object.freeze({
  decisions: Object.freeze([
    /\b(?:chooses?|decides?|refuses?|commits?|agrees?|accepts?|rejects?|quits?|surrenders?|votes?|confesses?|admits?)\b/i,
    /\b(?:hands? (?:over|back)|turns? (?:himself|herself|themself|themselves) in|walks? away for good)\b/i,
    /\bI\s+(?:choose|decide|refuse|will|won't|accept|reject|quit|confess|admit)\b/i,
  ]),
  revelations: Object.freeze([
    /\b(?:reveals?|confesses?|admits?|the truth is|turns out|comes clean|was behind it)\b/i,
    /\bI\s+(?:lied|stole|forged|betrayed|killed|hid|covered it up)\b/i,
  ]),
  relationshipChanges: Object.freeze([
    /\b(?:forgives?|betrays?|abandons?|disowns?|embraces?|kisses?|breaks? up|ends? (?:the relationship|the marriage|the engagement))\b/i,
    /\b(?:chooses?|picks?)\s+.{2,80}\s+over\s+.{2,80}\b/i,
    /\b(?:trusts?|protects?)\s+.{2,80}\s+(?:instead of|over)\s+.{2,80}\b/i,
  ]),
  irreversibleConsequences: Object.freeze([
    /\b(?:dies?|died|is dead|was killed|is killed|was arrested|is arrested|burn(?:s|ed)?|destroy(?:s|ed)?|shred(?:s|ded)?|broadcasts?|broadcast|publish(?:es|ed)?|shoots?|shot|stabs?|stabbed)\b/i,
    /\b(?:sets?|set) .{0,60} on fire|\bhand(?:s|ed)? (?:the )?(?:evidence|proof|recording|weapon) over|\bturn(?:s|ed)? (?:himself|herself|themself|themselves) in\b/i,
    /\bsign(?:s|ed)? (?:the )?(?:divorce|confession|deed|contract|plea)|\bwalk(?:s|ed)? away for good|\b(?:leave(?:s|d)?|left) forever\b/i,
  ]),
});

const SUPPORT_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "because", "been", "but", "by", "for",
  "from", "had", "has", "have", "he", "her", "hers", "him", "his", "i", "in", "into",
  "is", "it", "its", "of", "on", "or", "our", "she", "that", "the", "their", "them",
  "they", "this", "to", "was", "we", "were", "what", "when", "where", "which", "who",
  "will", "with", "you", "your",
]);

function clean(value, maxChars = 260) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(1, Number(maxChars || 260)))
    .trim();
}

function normalizedEvidence(value = "") {
  return clean(value, 320)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+([,.;:!?])/g, "$1")
    .toLowerCase();
}

function normalizedToken(value = "") {
  let token = String(value || "").toLowerCase().replace(/^'+|'+$/g, "");
  if (token.length > 5 && token.endsWith("ies")) token = `${token.slice(0, -3)}y`;
  else if (token.length > 5 && token.endsWith("ing")) token = token.slice(0, -3);
  else if (token.length > 4 && token.endsWith("ed")) token = token.slice(0, -2);
  else if (token.length > 4 && token.endsWith("es")) token = token.slice(0, -2);
  else if (token.length > 3 && token.endsWith("s")) token = token.slice(0, -1);
  return token;
}

function supportTokens(value = "") {
  return clean(value, 500)
    .match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.map(normalizedToken)
    .filter((token) => token.length > 1 && !SUPPORT_STOPWORDS.has(token)) || [];
}

function screenplayEvidenceLines(pageText = "") {
  const out = [];
  let speaker = "";
  for (const sourceLine of String(pageText || "").split(/\r?\n/)) {
    const raw = clean(sourceLine, 320);
    if (!raw) {
      speaker = "";
      continue;
    }
    if (/^(?:INT\.|EXT\.|INT\/EXT\.|INT\.\/EXT\.|CUT TO:|FADE (?:IN|OUT)|SMASH CUT:|DISSOLVE TO:)/i.test(raw)) {
      speaker = "";
      continue;
    }
    if (/^[A-Z][A-Z0-9 .'-]{1,48}(?:\s*\([^\n]{1,24}\))?$/.test(raw) && !/[.!?]$/.test(raw)) {
      speaker = clean(raw.replace(/\s*\([^\n]{1,24}\)$/, ""), 72);
      continue;
    }
    if (/^\([^\n]{1,80}\)$/.test(raw)) continue;
    if (raw.length < 4) continue;
    out.push({
      text: raw,
      display: clean(speaker ? `${speaker}: ${raw}` : raw, 320),
      kind: speaker ? "dialogue" : "action",
    });
  }
  return out;
}

function exactPageEvidence(evidence = "", lines = []) {
  const target = normalizedEvidence(evidence);
  if (!target) return null;
  for (const line of lines) {
    if (normalizedEvidence(line.text) === target || normalizedEvidence(line.display) === target) {
      return line;
    }
  }
  return null;
}

function factHasEvidenceSupport(fact = "", evidenceLine = null) {
  if (!evidenceLine) return false;
  const factTerms = [...new Set(supportTokens(fact))];
  const evidenceTerms = new Set(supportTokens(`${evidenceLine.display} ${evidenceLine.text}`));
  if (!factTerms.length || !evidenceTerms.size) return false;
  const overlap = factTerms.filter((term) => evidenceTerms.has(term));
  const requiredOverlap = factTerms.length <= 2 ? factTerms.length : 2;
  if (overlap.length < requiredOverlap) return false;
  return overlap.length / factTerms.length >= 0.34;
}

function sanitizeGroundedFact(value, lines) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fact = clean(value.fact ?? value.value ?? value.text, 240);
  const evidence = clean(value.evidence ?? value.quote, 320);
  const evidenceLine = exactPageEvidence(evidence, lines);
  if (!fact || !evidenceLine || !factHasEvidenceSupport(fact, evidenceLine)) return null;
  return {
    fact,
    evidence: evidenceLine.text,
  };
}

function sourceHasEvidenceSupport(source = "", evidenceLine = null, { status = "" } = {}) {
  if (!evidenceLine) return false;
  const sourceTerms = [...new Set(supportTokens(source))];
  const evidenceTerms = new Set(supportTokens(`${evidenceLine.display} ${evidenceLine.text}`));
  if (!sourceTerms.length || !evidenceTerms.size) return false;
  const overlap = sourceTerms.filter((term) => evidenceTerms.has(term));
  const requiredOverlap = status === "paid_off"
    ? Math.max(2, Math.ceil(sourceTerms.length * 0.5))
    : sourceTerms.length === 1 ? 1 : sourceTerms.length <= 5 ? 2 : 3;
  return overlap.length >= Math.min(requiredOverlap, sourceTerms.length);
}

function knownStoryObligations(projectContext = null) {
  const context = projectContext && typeof projectContext === "object" && !Array.isArray(projectContext)
    ? projectContext
    : {};
  const out = [];
  const seen = new Set();
  const push = (kind, value) => {
    const obligation = clean(value, 220);
    const key = obligation.toLowerCase();
    if (!obligation || seen.has(key)) return;
    seen.add(key);
    out.push({ kind, obligation });
  };
  const asList = (value) => Array.isArray(value) ? value : value ? [value] : [];
  for (const value of asList(context.unresolvedSetups ?? context.unresolved_setups)) {
    push("setup", value);
  }
  for (const value of asList(context.actThreePayoffPath ?? context.act_three_payoff_path)) {
    push("promised_payoff", value);
  }
  const scenes = Array.isArray(context.acceptedScenes ?? context.accepted_scenes)
    ? (context.acceptedScenes ?? context.accepted_scenes)
    : [];
  for (const scene of scenes.slice(0, 12)) {
    for (const value of scene?.decisions ?? []) push("accepted_consequence", value);
    for (const value of scene?.revelations ?? []) push("accepted_consequence", value);
    for (const value of scene?.relationshipChanges ?? scene?.relationship_changes ?? []) {
      push("accepted_consequence", value);
    }
    for (const value of scene?.irreversibleConsequences ?? scene?.irreversible_consequences ?? []) {
      push("accepted_consequence", value);
    }
  }
  return out.slice(0, 20);
}

function sanitizeStoryObligationChange(value, lines, obligations) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = clean(value.obligation ?? value.source ?? value.setup, 220);
  const known = obligations.find((item) => item.obligation.toLowerCase() === source.toLowerCase());
  const status = clean(value.status, 32).toLowerCase().replace(/[\s-]+/g, "_");
  const result = sanitizeGroundedFact({
    fact: value.result ?? value.fact,
    evidence: value.evidence ?? value.quote,
  }, lines);
  if (!known || !STORY_OBLIGATION_STATUSES.has(status) || !result) return null;
  const evidenceLine = exactPageEvidence(value.evidence ?? value.quote, lines);
  if (!sourceHasEvidenceSupport(known.obligation, evidenceLine, { status })) return null;
  if (status === "paid_off" && !VISIBLE_PAYOFF_CHANGE_PATTERN.test(evidenceLine?.display || "")) {
    return null;
  }
  if (status === "paid_off" && known.kind === "accepted_consequence") return null;
  return {
    kind: known.kind,
    obligation: known.obligation,
    status,
    result: result.fact,
    evidence: result.evidence,
  };
}

function pushUniqueFact(target, value) {
  if (!value?.fact) return;
  if (target.some((item) => item.fact.toLowerCase() === value.fact.toLowerCase())) return;
  target.push(value);
}

function deterministicFacts(lines = []) {
  const out = Object.fromEntries(ACCEPTED_SCENE_FACT_FIELDS.map((field) => [field, []]));
  for (const line of lines) {
    for (const [field, patterns] of Object.entries(CAUSAL_PATTERNS)) {
      if (!patterns.some((pattern) => pattern.test(line.text))) continue;
      pushUniqueFact(out[field], { fact: line.display, evidence: line.text });
      if (out[field].length > FACTS_PER_FIELD_MAX) out[field].length = FACTS_PER_FIELD_MAX;
    }
  }
  return out;
}

function evidenceRecord(field, item) {
  return clean(`${field}|${item.fact}|${item.evidence}`, 520);
}

function compactState({ source = "deterministic", fields = {}, rejectedFacts = 0 } = {}) {
  const out = {
    version: ACCEPTED_SCENE_STATE_VERSION,
    source,
    rejectedFacts: Math.max(0, Number(rejectedFacts || 0)),
  };
  const evidence = [];
  for (const field of ACCEPTED_SCENE_SCALAR_FIELDS) {
    const item = fields[field];
    if (!item?.fact) continue;
    out[field] = item.fact;
    evidence.push(evidenceRecord(field, item));
  }
  for (const field of ACCEPTED_SCENE_FACT_FIELDS) {
    const items = Array.isArray(fields[field]) ? fields[field].slice(0, FACTS_PER_FIELD_MAX) : [];
    if (!items.length) continue;
    out[field] = items.map((item) => item.fact);
    evidence.push(...items.map((item) => evidenceRecord(field, item)));
  }
  const storyObligationChanges = Array.isArray(fields.storyObligationChanges)
    ? fields.storyObligationChanges.slice(0, STORY_OBLIGATION_CHANGES_MAX)
    : [];
  if (storyObligationChanges.length) {
    out.storyObligationChanges = storyObligationChanges;
    evidence.push(...storyObligationChanges.map((item) => evidenceRecord(
      "storyObligationChanges",
      { fact: item.result, evidence: item.evidence }
    )));
  }
  if (evidence.length) out.stateEvidence = evidence.slice(0, 12);
  return out;
}

function buildDeterministicAcceptedSceneState(pageText = "") {
  const lines = screenplayEvidenceLines(pageText);
  const facts = deterministicFacts(lines);
  const causalItems = ACCEPTED_SCENE_FACT_FIELDS.flatMap((field) => facts[field]);
  const lastCausal = causalItems[causalItems.length - 1] || null;
  const lastAction = [...lines].reverse().find((line) => line.kind === "action") || null;
  const outcomeLine = lastCausal || (lastAction
    ? { fact: lastAction.display, evidence: lastAction.text }
    : null);
  const excerptLines = lines.slice(0, 3);
  const summaryLine = excerptLines.length
    ? {
      fact: clean(excerptLines.map((line) => line.display).join(" "), 240),
      evidence: excerptLines[0].text,
    }
    : null;
  return compactState({
    source: "deterministic",
    fields: {
      summary: summaryLine,
      outcome: outcomeLine,
      causalHandoff: outcomeLine,
      ...facts,
    },
  });
}

function stripJsonFence(value = "") {
  const raw = String(value || "").trim();
  if (!raw.startsWith("```")) return raw;
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseAcceptedSceneStateResponse(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const raw = stripJsonFence(value);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function validateAcceptedSceneStatePayload(payload, pageText = "", projectContext = null) {
  const source = payload?.sceneState && typeof payload.sceneState === "object"
    ? payload.sceneState
    : payload;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { fields: {}, acceptedFacts: 0, rejectedFacts: 1 };
  }
  const lines = screenplayEvidenceLines(pageText);
  const fields = {};
  let acceptedFacts = 0;
  let rejectedFacts = 0;
  for (const field of ACCEPTED_SCENE_SCALAR_FIELDS) {
    const raw = source[field];
    if (raw == null || raw === "") continue;
    const item = sanitizeGroundedFact(raw, lines);
    if (item) {
      fields[field] = item;
      acceptedFacts += 1;
    } else {
      rejectedFacts += 1;
    }
  }
  for (const field of ACCEPTED_SCENE_FACT_FIELDS) {
    const rawItems = Array.isArray(source[field]) ? source[field] : [];
    const items = [];
    for (const raw of rawItems.slice(0, FACTS_PER_FIELD_MAX * 2)) {
      const item = sanitizeGroundedFact(raw, lines);
      if (item) {
        pushUniqueFact(items, item);
        acceptedFacts += 1;
      } else {
        rejectedFacts += 1;
      }
      if (items.length >= FACTS_PER_FIELD_MAX) break;
    }
    if (items.length) fields[field] = items;
  }
  const obligations = knownStoryObligations(projectContext);
  const rawChanges = Array.isArray(source.storyObligationChanges)
    ? source.storyObligationChanges
    : [];
  const storyObligationChanges = [];
  for (const raw of rawChanges.slice(0, STORY_OBLIGATION_CHANGES_MAX * 2)) {
    const item = sanitizeStoryObligationChange(raw, lines, obligations);
    if (item && !storyObligationChanges.some((existing) => (
      existing.obligation.toLowerCase() === item.obligation.toLowerCase()
    ))) {
      storyObligationChanges.push(item);
      acceptedFacts += 1;
    } else {
      rejectedFacts += 1;
    }
    if (storyObligationChanges.length >= STORY_OBLIGATION_CHANGES_MAX) break;
  }
  if (storyObligationChanges.length) fields.storyObligationChanges = storyObligationChanges;
  return { fields, acceptedFacts, rejectedFacts };
}

function mergeAcceptedSceneState(modelResult, fallback) {
  const merged = {
    ...fallback,
    source: modelResult.acceptedFacts > 0 ? "model_grounded" : "deterministic",
    rejectedFacts: modelResult.rejectedFacts,
  };
  const evidence = [];
  for (const field of ACCEPTED_SCENE_SCALAR_FIELDS) {
    const item = modelResult.fields[field];
    if (!item) continue;
    merged[field] = item.fact;
    evidence.push(evidenceRecord(field, item));
  }
  for (const field of ACCEPTED_SCENE_FACT_FIELDS) {
    const modelItems = modelResult.fields[field] || [];
    const existing = Array.isArray(fallback[field]) ? fallback[field] : [];
    const facts = [];
    for (const value of [...modelItems.map((item) => item.fact), ...existing]) {
      const fact = clean(value, 240);
      if (!fact || facts.some((item) => item.toLowerCase() === fact.toLowerCase())) continue;
      facts.push(fact);
      if (facts.length >= FACTS_PER_FIELD_MAX) break;
    }
    if (facts.length) merged[field] = facts;
    evidence.push(...modelItems.map((item) => evidenceRecord(field, item)));
  }
  if (Array.isArray(modelResult.fields.storyObligationChanges)) {
    merged.storyObligationChanges = modelResult.fields.storyObligationChanges
      .slice(0, STORY_OBLIGATION_CHANGES_MAX);
    evidence.push(...merged.storyObligationChanges.map((item) => evidenceRecord(
      "storyObligationChanges",
      { fact: item.result, evidence: item.evidence }
    )));
  }
  const fallbackEvidence = Array.isArray(fallback.stateEvidence) ? fallback.stateEvidence : [];
  merged.stateEvidence = [...evidence, ...fallbackEvidence]
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 12);
  return merged;
}

function acceptedSceneDistillationPrompts({ pageText = "", projectContext = null } = {}) {
  const context = projectContext && typeof projectContext === "object" && !Array.isArray(projectContext)
    ? projectContext
    : {};
  const contextLines = [
    context.act ? `Act: ${clean(context.act, 80)}` : "",
    context.featureSequence ? `Sequence: ${clean(context.featureSequence, 180)}` : "",
    context.currentBeat ? `Prior beat: ${clean(context.currentBeat, 220)}` : "",
    context.lastSceneOutcome ? `Prior outcome: ${clean(context.lastSceneOutcome, 220)}` : "",
  ].filter(Boolean);
  const obligations = knownStoryObligations(context);
  if (obligations.length) {
    contextLines.push("Known obligations (obligation must match one of these exactly):");
    for (const item of obligations) contextLines.push(`- [${item.kind}] ${item.obligation}`);
  }
  const systemPrompt = [
    "You distill an explicitly accepted screenplay page into durable scene state.",
    "Return JSON only. Never invent an event, motive, relationship change, or future beat.",
    "Every non-empty fact must include one exact evidence line copied from the accepted page.",
    "Phrase each fact using the page's own concrete nouns and verbs so it can be verified against that evidence.",
    "A causalHandoff states only the changed pressure the next scene inherits; it must not invent what happens next.",
    "storyObligationChanges may reference only a supplied known obligation. Use advanced when it gains motion, complicated when its cost or obstacle deepens, transformed when its dramatic meaning changes, and paid_off only when a setup or promised payoff is visibly fulfilled on this page.",
    "Every storyObligationChanges result must describe the visible change on this page and include one exact page evidence line that materially supports both the known obligation and the result. A repeated prop name alone is not a payoff.",
    "Use empty objects or arrays when the page does not establish a field.",
    "Schema: {\"sceneState\":{\"summary\":{\"fact\":\"\",\"evidence\":\"\"},\"outcome\":{\"fact\":\"\",\"evidence\":\"\"},\"causalHandoff\":{\"fact\":\"\",\"evidence\":\"\"},\"decisions\":[{\"fact\":\"\",\"evidence\":\"\"}],\"revelations\":[],\"relationshipChanges\":[],\"irreversibleConsequences\":[],\"storyObligationChanges\":[{\"obligation\":\"exact known obligation\",\"status\":\"advanced|complicated|transformed|paid_off\",\"result\":\"\",\"evidence\":\"\"}]}}",
  ].join("\n");
  const userPrompt = [
    contextLines.length ? `PROJECT POSITION\n${contextLines.join("\n")}` : "",
    `ACCEPTED PAGE\n${String(pageText || "").trim().slice(0, 12_000)}`,
  ].filter(Boolean).join("\n\n");
  return { systemPrompt, userPrompt };
}

async function distillAcceptedSceneState({
  pageText = "",
  projectContext = null,
  renderText = null,
} = {}) {
  const fallback = buildDeterministicAcceptedSceneState(pageText);
  if (typeof renderText !== "function" || !String(pageText || "").trim()) return fallback;
  const prompts = acceptedSceneDistillationPrompts({ pageText, projectContext });
  try {
    const raw = await renderText({
      ...prompts,
      modelTier: "structural",
      maxTokens: 900,
    });
    const payload = parseAcceptedSceneStateResponse(raw);
    const modelResult = validateAcceptedSceneStatePayload(payload, pageText, projectContext);
    return mergeAcceptedSceneState(modelResult, fallback);
  } catch {
    return fallback;
  }
}

export {
  ACCEPTED_SCENE_STATE_VERSION,
  acceptedSceneDistillationPrompts,
  buildDeterministicAcceptedSceneState,
  distillAcceptedSceneState,
  parseAcceptedSceneStateResponse,
  validateAcceptedSceneStatePayload,
};
