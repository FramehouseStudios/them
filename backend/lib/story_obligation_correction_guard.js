const STORY_OBLIGATION_CORRECTION_MAX = 24;
const STORY_OBLIGATION_VIOLATION_MAX = 4;

const CORRECTION_ACTIONS = new Set(["keep_open", "retire"]);
const ANCHOR_STOP_WORDS = new Set([
  "about", "after", "again", "against", "before", "being", "both", "could", "from", "have",
  "into", "must", "only", "open", "other", "over", "remain", "remains", "setup", "should",
  "story", "that", "their", "them", "then", "there", "these", "they", "this", "through",
  "until", "very", "what", "when", "where", "which", "while", "with", "would",
]);

const SAFE_RETIREMENT_FRAME = /\b(?:retired|removed|discarded|off limits|out of canon)\b|\b(?:do not|don't|never|must not|cannot|can't|avoid|omit|without)\b.{0,80}\b(?:use|return|restore|resurrect|reintroduce|recover|find|open|include|mention)\b/i;
const CLOSED_OBLIGATION_FRAME = /\b(?:already\s+)?(?:pays?\s+off|paid\s+off|resolves?|resolved|closes?|closed|completes?|completed|fulfills?|fulfilled|settles?|settled|finishes?|finished|discharges?|discharged|wraps?\s+up|wrapped\s+up|no\s+longer\s+open|ends?\s+the\s+(?:setup|thread|promise))\b/i;
const CONSUMED_OPEN_OBLIGATION_ACTION = "use|uses|used|spend|spends|spent|ignite|ignites|ignited|light|lights|lit|fire|fires|fired|burn|burns|burned|launch|launches|launched|detonate|detonates|detonated|destroy|destroys|destroyed";
const SAFE_OPEN_FRAME = /\b(?:keep|keeps|kept|leave|leaves|left|remain|remains|still)\b.{0,50}\b(?:open|unresolved|unpaid|unspent|unused|active|alive)\b|\b(?:not|isn't|is not|hasn't|has not|never|without|do not|don't|must not)\b.{0,35}\b(?:use|used|spend|spent|ignite|ignited|light|lit|fire|fired|burn|burned|launch|launched|detonate|detonated|destroy|destroyed|pay\s+off|paid\s+off|resolve|resolved|close|closed|complete|completed|fulfill|fulfilled|settle|settled|finish|finished)\b/i;
const NON_CONSUMPTION_SPEECH_FRAME = /\b(?:if|unless|should|could|would|might|can|cannot|can't|don't|do not|never)\b.{0,45}\b(?:use|spend|ignite|light|fire|burn|launch|detonate|destroy)\b|\b(?:use|spend|ignite|light|fire|burn|launch|detonate|destroy)\s+(?:that|it)\s*[,?]/i;

function clean(value = "", maxChars = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxChars).trim();
}

function normalizeStoryObligationCorrections(value = []) {
  const source = Array.isArray(value) ? value : [];
  const newestByObligation = new Map();
  for (const item of source) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obligation = clean(item.obligation, 220);
    const action = clean(item.action, 32).toLowerCase().replace(/[\s-]+/g, "_");
    const correctedAtValue = Number(
      item.correctedAt ?? item.corrected_at ?? item.updatedAt ?? item.updated_at ?? 0
    );
    const correctedAt = Number.isFinite(correctedAtValue) ? Math.max(0, correctedAtValue) : 0;
    if (!obligation || !CORRECTION_ACTIONS.has(action)) continue;
    const correction = {
      obligation,
      action,
      correctedAt,
      note: clean(item.note, 240),
    };
    const key = obligation.toLowerCase();
    const existing = newestByObligation.get(key);
    if (!existing || correction.correctedAt >= existing.correctedAt) {
      newestByObligation.set(key, correction);
    }
  }
  return [...newestByObligation.values()]
    .sort((left, right) => right.correctedAt - left.correctedAt)
    .slice(0, STORY_OBLIGATION_CORRECTION_MAX);
}

function storyObligationCorrectionsFromContext(context = null) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return [];
  const graph = context.screenplayFeatureStoryGraph ??
    context.screenplay_feature_story_graph ??
    context.featureStoryGraph ??
    context.feature_story_graph ??
    {};
  const candidates = [
    context.screenplayStoryObligationCorrections,
    context.screenplay_story_obligation_corrections,
    context.storyObligationCorrections,
    context.story_obligation_corrections,
    graph.storyObligationCorrections,
    graph.story_obligation_corrections,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeStoryObligationCorrections(candidate);
    if (normalized.length) return normalized;
  }
  return [];
}

function anchorTokens(value = "", maxTokens = 10) {
  return [...new Set(
    (String(value || "").toLowerCase().match(/[a-z0-9']+/g) || [])
      .map((token) => token.replace(/'s$/, ""))
      .filter((token) => token.length >= 4 && !ANCHOR_STOP_WORDS.has(token))
  )].slice(0, Math.max(1, Number(maxTokens || 10)));
}

function actionAnchorTokens(value = "") {
  return [...new Set(
    (String(value || "").match(/[A-Za-z0-9']+/g) || [])
      .filter((raw) => !/^[A-Z][a-z]+(?:'s)?$/.test(raw))
      .map((token) => token.toLowerCase().replace(/'s$/, ""))
      .filter((token) => token.length >= 4 && !ANCHOR_STOP_WORDS.has(token))
  )].slice(0, 8);
}

function consumesOpenObligation(windowText = "", obligation = "") {
  const anchors = actionAnchorTokens(obligation);
  if (!anchors.length) return false;
  const anchorPattern = anchors.join("|");
  const directFrame = new RegExp(
    `\\b(?:${CONSUMED_OPEN_OBLIGATION_ACTION})\\b(?:\\s+[^\\s.!?]+){0,4}\\s+\\b(?:${anchorPattern})\\b|` +
    `\\b(?:${anchorPattern})\\b(?:\\s+[^\\s.!?]+){0,8}\\s+\\b(?:${CONSUMED_OPEN_OBLIGATION_ACTION})\\b`,
    "i"
  );
  return directFrame.test(String(windowText || ""));
}

function supportsObligation(windowText = "", obligation = "") {
  const anchors = anchorTokens(obligation);
  if (!anchors.length) return false;
  const tokens = new Set(anchorTokens(windowText, 128));
  const matches = anchors.filter((token) => tokens.has(token)).length;
  const required = anchors.length === 1 ? 1 : Math.min(3, Math.max(2, Math.ceil(anchors.length * 0.4)));
  return matches >= required;
}

function correctionWindows(text = "") {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const value = clean(lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join(" "), 640);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  if (!out.length && clean(text, 640)) out.push(clean(text, 640));
  return out;
}

function repairDirectiveFor(violation = {}) {
  if (violation.type === "retired_obligation_reintroduced") {
    return `Remove the retired story obligation entirely: ${violation.obligation}. Do not use it as a prop, beat, reveal, setup, or payoff.`;
  }
  return `Keep this writer-corrected obligation unresolved: ${violation.obligation}. Do not describe it as paid off, resolved, closed, or completed.`;
}

function evaluateStoryObligationCorrectionAdherence({
  text = "",
  corrections = [],
  storyContext = null,
} = {}) {
  const normalized = normalizeStoryObligationCorrections(
    Array.isArray(corrections) && corrections.length
      ? corrections
      : storyObligationCorrectionsFromContext(storyContext)
  );
  const windows = correctionWindows(text);
  const violations = [];
  for (const correction of normalized) {
    const matching = windows.filter((window) => supportsObligation(window, correction.obligation));
    if (!matching.length) continue;
    if (correction.action === "retire") {
      const unsafe = matching.find((window) => !SAFE_RETIREMENT_FRAME.test(window));
      if (unsafe) {
        violations.push({
          type: "retired_obligation_reintroduced",
          action: correction.action,
          obligation: correction.obligation,
          excerpt: clean(unsafe, 300),
        });
      }
    } else {
      const closed = matching.find((window) => (
        (CLOSED_OBLIGATION_FRAME.test(window) || consumesOpenObligation(window, correction.obligation)) &&
        !SAFE_OPEN_FRAME.test(window) &&
        !NON_CONSUMPTION_SPEECH_FRAME.test(window)
      ));
      if (closed) {
        violations.push({
          type: "open_obligation_closed",
          action: correction.action,
          obligation: correction.obligation,
          excerpt: clean(closed, 300),
        });
      }
    }
    if (violations.length >= STORY_OBLIGATION_VIOLATION_MAX) break;
  }
  return {
    applicable: normalized.length > 0,
    ok: violations.length === 0,
    reason: violations.length ? "writer_story_obligation_violation" : "ok",
    correctionsChecked: normalized.length,
    violations,
    repairDirectives: violations.map(repairDirectiveFor),
  };
}

export {
  evaluateStoryObligationCorrectionAdherence,
  normalizeStoryObligationCorrections,
  storyObligationCorrectionsFromContext,
  supportsObligation,
};
