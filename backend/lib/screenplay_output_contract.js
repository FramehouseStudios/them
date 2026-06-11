const SCENE_HEADING_RE = /^(INT|EXT|EST|INT\/EXT|I\/E)\.?(?:\s|$)/i;
const TRANSITION_RE = /^[A-Z0-9 .'\-]+ TO:$|^(FADE IN|FADE OUT|CUT TO BLACK)\.?$/i;
const PARENTHETICAL_RE = /^\([^()\n]{1,80}\)$/;
const CONTRACT_DIVIDER_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;

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
    "screenplay continuation",
    "screenplay draft",
    "screenplay page",
    "screenplay pages",
    "scene",
    "scene draft",
    "scene pages",
    "fountain",
    "fountain page",
    "fountain pages",
    "draft",
    "draft pages",
    "page draft",
    "pages",
    "in screenplay format",
    "try this",
    "use this",
    "notes",
    "craft notes",
    "why this works",
    "what changed",
    "end scene",
    "end of scene",
    "end of excerpt",
  ].includes(normalized)) {
    return true;
  }

  return [
    /^(absolutely|certainly|definitely|of course|sure|yes|yeah|okay|ok|got it|great)\b.{0,120}\b(here|let's|lets|i'll|i will|continu)/,
    /^here (?:are|is)\b.{0,120}\b(page|pages|scene|beat|continuation|rewrite|revision|version|screenplay|script|fountain|draft)\b/,
    /^here(?:'s| is)\b.{0,120}\b(scene|page|beat|continuation|rewrite|revision|version|screenplay|script)\b/,
    /^in screenplay format\b/,
    /^(?:screenplay|scene|fountain|draft|page|pages)(?:\s+(?:page|pages|continuation|draft|version|pass|rewrite|revision))?$/,
    /^screenplay\s*:/,
    /^scene\s*:/,
    /^fountain\s*:/,
    /^pages?\s*:/,
    /^draft\s*:/,
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
    /^(?:why this works|what changed|notes?|craft notes?)\b/,
    /^(?:end scene|end of scene|end of excerpt)\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function looksLikeScreenplayStrategyLeadInLine(line = "") {
  const normalized = lowerContractLine(line);
  if (!normalized) return false;
  if (looksLikeScreenplayOutputStarterLine(line)) return false;

  return [
    /^(?:one\s+)?(?:quick\s+)?(?:strategy|craft|diagnosis|note|page-first note|page velocity|output contract|highest-leverage fix|next three turns?|act iii payoff path|payoff path|memory to page execution|turn runway)\b/,
    /^the (?:move|turn|pressure|subtext|engine|page|scene|beat) (?:is|here is)\b/,
    /^(?:this|the) (?:scene|beat|page|moment|exchange|pass) (?:needs|wants|should|must|can)\b/,
    /^this (?:gives|keeps|lets|makes|should give|should keep)\b.*\b(?:scene|beat|page|moment|exchange|dialogue|character|pressure|subtext|tension|emotion|turn)\b/,
    /^the (?:key|idea|move|pressure|subtext|turn) (?:is|here is)\b/,
    /^to make (?:it|this|the scene|the page|the exchange) (?:faster|smarter|more expert|more cinematic|more emotional|work)\b/,
    /^i (?:would|kept|focused|anchored|made|gave|added|cut|preserved)\b.*\b(?:scene|beat|page|moment|exchange|dialogue|pressure|subtext|turn|objective|obstacle)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function nextNonEmptyLineAfter(lines = [], startIndex = 0) {
  for (let index = Math.max(0, Number(startIndex || 0)); index < lines.length; index += 1) {
    const candidate = String(lines[index] || "");
    if (normalizeContractLine(candidate)) return candidate;
  }
  return "";
}

function previousNonEmptyLineBefore(lines = [], startIndex = 0) {
  for (let index = Math.min(lines.length - 1, Number(startIndex || 0)); index >= 0; index -= 1) {
    const candidate = String(lines[index] || "");
    if (normalizeContractLine(candidate)) return candidate;
  }
  return "";
}

function hasScreenplayStarterAhead(lines = [], startIndex = 0, maxNonEmptyLookahead = 10) {
  let seen = 0;
  for (let index = Math.max(0, Number(startIndex || 0)); index < lines.length; index += 1) {
    const line = String(lines[index] || "");
    const cleaned = normalizeContractLine(line);
    if (!cleaned) continue;
    seen += 1;
    if (seen > maxNonEmptyLookahead) return false;
    const nextNonEmpty = nextNonEmptyLineAfter(lines, index + 1);
    if (looksLikeScreenplayOutputStarterLine(cleaned, nextNonEmpty)) {
      return true;
    }
  }
  return false;
}

function stripCodeFenceLines(lines = []) {
  return lines.filter((line) => {
    const trimmed = String(line || "").trim();
    return !/^```(?:[a-z0-9_-]+)?\s*$/i.test(trimmed) && !CONTRACT_DIVIDER_RE.test(trimmed);
  });
}

function looksLikeScreenplayContractDriftLine(line = "") {
  return looksLikeScreenplayChatDriftLine(line) || looksLikeScreenplayStrategyLeadInLine(line);
}

function lineFollowsScreenplayDialogueCue(lines = [], index = 0) {
  const line = String(lines[index] || "");
  const previousNonEmpty = previousNonEmptyLineBefore(lines, index - 1);
  if (!previousNonEmpty) return false;
  return (
    isParentheticalLine(previousNonEmpty)
    || isUppercaseCueCandidate(previousNonEmpty, line)
  );
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
    if (
      looksLikeScreenplayStrategyLeadInLine(cleaned) &&
      hasScreenplayStarterAhead(lines, startIndex + 1)
    ) {
      startIndex += 1;
      continue;
    }
    break;
  }
  return lines.slice(startIndex);
}

function stripInteriorContractDrift(lines = []) {
  return lines.filter((line, index) => {
    const cleaned = normalizeContractLine(line);
    if (!cleaned || !looksLikeScreenplayContractDriftLine(cleaned)) return true;
    if (lineFollowsScreenplayDialogueCue(lines, index)) return true;
    return !hasScreenplayStarterAhead(lines, index + 1);
  });
}

function stripTrailingContractDrift(lines = []) {
  const trimmed = [...lines];
  while (trimmed.length) {
    const line = String(trimmed[trimmed.length - 1] || "");
    const cleaned = normalizeContractLine(line);
    if (
      !cleaned
      || (
        looksLikeScreenplayContractDriftLine(cleaned)
        && !lineFollowsScreenplayDialogueCue(trimmed, trimmed.length - 1)
      )
    ) {
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
  const interiorStripped = stripInteriorContractDrift(leadingStripped);
  const trailingStripped = stripTrailingContractDrift(interiorStripped);
  return trailingStripped
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
