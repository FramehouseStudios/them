const SCENE_HEADING_RE = /^(INT|EXT|EST|INT\/EXT|I\/E)\.?(?:\s|$)/i;
const TRANSITION_RE = /^[A-Z0-9 .'\-]+ TO:$|^(FADE IN|FADE OUT|CUT TO BLACK)\.?$/i;
const PARENTHETICAL_RE = /^\([^()\n]{1,80}\)$/;

function normalizeContractLine(line = "") {
  return String(line || "")
    .replace(/^>\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/[*_`]/g, "")
    .replace(/\u2019/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function lowerContractLine(line = "") {
  return normalizeContractLine(line)
    .toLowerCase()
    .replace(/[.:!?-]+$/g, "")
    .trim();
}

function isSceneHeadingLine(line = "") {
  return SCENE_HEADING_RE.test(normalizeContractLine(line));
}

function isTransitionLine(line = "") {
  return TRANSITION_RE.test(normalizeContractLine(line));
}

function isParentheticalLine(line = "") {
  return PARENTHETICAL_RE.test(normalizeContractLine(line));
}

function isUppercaseCueCandidate(line = "", nextNonEmpty = "") {
  const trimmed = normalizeContractLine(line);
  if (!trimmed || trimmed.length > 42 || /[.!?]$/.test(trimmed)) return false;
  if (isSceneHeadingLine(trimmed) || isTransitionLine(trimmed) || isParentheticalLine(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase() || !/[A-Z]/.test(trimmed)) return false;
  const next = normalizeContractLine(nextNonEmpty);
  if (!next || isSceneHeadingLine(next) || isTransitionLine(next)) return false;
  return true;
}

export function looksLikeScreenplayOutputStarterLine(line = "", nextNonEmpty = "") {
  const trimmed = normalizeContractLine(line);
  if (!trimmed) return false;
  return (
    isSceneHeadingLine(trimmed)
    || isTransitionLine(trimmed)
    || isParentheticalLine(trimmed)
    || isUppercaseCueCandidate(trimmed, nextNonEmpty)
  );
}

export function looksLikeScreenplayChatDriftLine(line = "") {
  const normalized = lowerContractLine(line);
  if (!normalized) return false;
  if (looksLikeScreenplayOutputStarterLine(line)) return false;

  if ([
    "absolutely",
    "certainly",
    "definitely",
    "of course",
    "sure",
    "yes",
    "yeah",
    "okay",
    "ok",
    "got it",
    "great",
    "screenplay",
    "scene",
    "in screenplay format",
    "try this",
    "use this",
  ].includes(normalized)) {
    return true;
  }

  return [
    /^(absolutely|certainly|definitely|of course|sure|yes|yeah|okay|ok|got it|great)\b.{0,120}\b(here|let's|lets|i'll|i will|continu)/,
    /^here(?:'s| is)\b.{0,120}\b(scene|page|beat|continuation|rewrite|revision|version|screenplay|script)\b/,
    /^in screenplay format\b/,
    /^screenplay\s*:/,
    /^scene\s*:/,
    /^try this\b/,
    /^use this\b/,
    /^continuing\b/,
    /^i(?:'ll| will) (keep|make|stay|write|continue|revise|rewrite|punch|tighten|turn|anchor)\b/,
    /^i can (make|keep|also|turn|tighten|revise|continue|rewrite|punch|go)\b/,
    /^i (kept|focused|anchored|stayed)\b/,
    /^want me to\b/,
    /^do you want\b/,
    /^would you like\b/,
    /^should we\b/,
    /^how does that\b/,
    /^does this\b.{0,80}\bfeel\b/,
    /^if you want\b/,
    /^let me know\b/,
    /^tell me if\b/,
    /^we can\b.{0,80}\b(next|also|tighten|revise|rewrite|continue|make)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function stripCodeFenceLines(lines = []) {
  return lines.filter((line) => !/^```(?:[a-z0-9_-]+)?\s*$/i.test(String(line || "").trim()));
}

function stripLeadingContractDrift(lines = []) {
  let startIndex = 0;
  while (startIndex < lines.length) {
    const line = String(lines[startIndex] || "");
    const cleaned = normalizeContractLine(line);
    if (!cleaned) {
      startIndex += 1;
      continue;
    }
    if (looksLikeScreenplayChatDriftLine(cleaned)) {
      startIndex += 1;
      continue;
    }
    break;
  }
  return lines.slice(startIndex);
}

function stripTrailingContractDrift(lines = []) {
  const trimmed = [...lines];
  while (trimmed.length) {
    const line = String(trimmed[trimmed.length - 1] || "");
    const cleaned = normalizeContractLine(line);
    if (!cleaned || looksLikeScreenplayChatDriftLine(cleaned)) {
      trimmed.pop();
      continue;
    }
    break;
  }
  return trimmed;
}

export function normalizeScreenplayOutputContractText(text = "") {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
  if (!normalized) return "";

  const lines = stripCodeFenceLines(normalized.split("\n"));
  const leadingStripped = stripLeadingContractDrift(lines);
  const trailingStripped = stripTrailingContractDrift(leadingStripped);
  return trailingStripped
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
