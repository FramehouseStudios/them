// Working-set compaction helpers (D008 memory tiers).
//
// Always-on prefix (persona + voice-spec) is NEVER compacted here — that
// lives in cache_policy.buildCacheStablePrefix / partitionPromptParts.
// This module only summarizes recent turns into a compact working-set
// structure that rides in the dynamic tail.

const DEFAULT_MAX_RECENT_TURNS = 12;
const DEFAULT_MAX_SUMMARY_CHARS = 1_200;
const DEFAULT_COMPACT_TURN_THRESHOLD = 16;
const DEFAULT_COMPACT_TOKEN_ESTIMATE = 2_500;

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function estimateTokensFromText(text) {
  const s = trimToString(text);
  if (!s) return 0;
  // Rough heuristic (~4 chars/token); good enough for shouldCompact gates.
  return Math.max(1, Math.ceil(s.length / 4));
}

function normalizeTurn(turn = {}) {
  if (typeof turn === "string") {
    const content = trimToString(turn);
    return content ? { role: "user", content } : null;
  }
  if (!turn || typeof turn !== "object") return null;
  const role = trimToString(turn.role || turn.speaker || "user") || "user";
  const content = trimToString(
    turn.content ?? turn.text ?? turn.utterance ?? turn.message ?? ""
  );
  if (!content) return null;
  return {
    role,
    content: content.length > 800 ? `${content.slice(0, 797)}...` : content,
    at: turn.at || turn.createdAt || null,
  };
}

/**
 * Whether the working set should be compacted before the next Companion turn.
 * alwaysOnPrefix is ignored (must stay cache-stable / untouched).
 */
function shouldCompact({
  turns = [],
  tokenEstimate = null,
  maxTurns = DEFAULT_COMPACT_TURN_THRESHOLD,
  maxTokenEstimate = DEFAULT_COMPACT_TOKEN_ESTIMATE,
} = {}) {
  const list = Array.isArray(turns) ? turns : [];
  if (list.length >= Math.max(1, Number(maxTurns) || DEFAULT_COMPACT_TURN_THRESHOLD)) {
    return true;
  }
  let tokens = Number(tokenEstimate);
  if (!Number.isFinite(tokens) || tokens < 0) {
    tokens = list.reduce((sum, t) => {
      const n = normalizeTurn(t);
      return sum + (n ? estimateTokensFromText(n.content) : 0);
    }, 0);
  }
  return tokens >= Math.max(1, Number(maxTokenEstimate) || DEFAULT_COMPACT_TOKEN_ESTIMATE);
}

/**
 * Compact recent turns → structured summary for the dynamic working set.
 * Does not touch persona / voice-spec (always-on prefix).
 */
function compactWorkingSet(turns = [], {
  maxRecentTurns = DEFAULT_MAX_RECENT_TURNS,
  maxSummaryChars = DEFAULT_MAX_SUMMARY_CHARS,
  keepLast = 4,
} = {}) {
  const normalized = (Array.isArray(turns) ? turns : [])
    .map(normalizeTurn)
    .filter(Boolean);
  const keep = Math.max(0, Math.round(Number(keepLast) || 0));
  const recentKeep = normalized.slice(-keep);
  const toFold = keep > 0 ? normalized.slice(0, Math.max(0, normalized.length - keep)) : normalized;

  const lines = [];
  for (const t of toFold.slice(-Math.max(1, Number(maxRecentTurns) || DEFAULT_MAX_RECENT_TURNS))) {
    const role = t.role === "assistant" || t.role === "clementine" ? "Clementine" : "User";
    lines.push(`- ${role}: ${t.content}`);
  }
  let summaryText = lines.join("\n").trim();
  const maxChars = Math.max(200, Number(maxSummaryChars) || DEFAULT_MAX_SUMMARY_CHARS);
  if (summaryText.length > maxChars) {
    summaryText = `${summaryText.slice(0, maxChars - 3)}...`;
  }

  return {
    version: 1,
    compactedAt: null, // caller / job fills when persisted
    foldedTurnCount: toFold.length,
    keptRecentTurnCount: recentKeep.length,
    summary: summaryText
      ? {
          kind: "working_set_digest",
          text: summaryText,
          approxTokens: estimateTokensFromText(summaryText),
        }
      : null,
    recentTurns: recentKeep,
  };
}

/**
 * Assemble a prompt-facing working-set payload. alwaysOnPrefix is returned
 * verbatim and must not be merged into the compact summary.
 */
function buildWorkingSetState({
  alwaysOnPrefix = "",
  turns = [],
  priorCompact = null,
  forceCompact = false,
  compactOptions = {},
  shouldCompactOptions = {},
} = {}) {
  const prefix = trimToString(alwaysOnPrefix);
  const list = Array.isArray(turns) ? turns : [];
  const needsCompact = forceCompact || shouldCompact({ turns: list, ...shouldCompactOptions });
  const compact = needsCompact
    ? compactWorkingSet(list, compactOptions)
    : {
        version: 1,
        compactedAt: null,
        foldedTurnCount: 0,
        keptRecentTurnCount: list.length,
        summary: priorCompact?.summary || null,
        recentTurns: list.map(normalizeTurn).filter(Boolean),
      };

  return {
    /** Cache-stable; never rewrite / compact this string here. */
    alwaysOnPrefix: prefix,
    workingSet: compact,
    didCompact: needsCompact,
    dynamicTailHint: [
      compact.summary?.text ? `Working-set digest:\n${compact.summary.text}` : "",
      compact.recentTurns.length
        ? `Recent turns:\n${compact.recentTurns.map((t) => `${t.role}: ${t.content}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export {
  DEFAULT_MAX_RECENT_TURNS,
  DEFAULT_COMPACT_TURN_THRESHOLD,
  DEFAULT_COMPACT_TOKEN_ESTIMATE,
  estimateTokensFromText,
  shouldCompact,
  compactWorkingSet,
  buildWorkingSetState,
};
