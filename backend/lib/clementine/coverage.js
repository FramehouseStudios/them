// Coverage rating — format + story + mentor gold (D009 strangler under lib/clementine).
// Pure helpers: same input -> same output. No backend/index.js growth.
// Rates screenplay formatting (scene headings, character cues) and story
// (pacing, scenes, dialogue ratio) on a 1–5 scale, plus deterministic
// mentor-golden scoring for offline eval. Used by the coverage tab and
// the weekly mentor golden set without growing the god file.

export const COVERAGE_SCHEMA_VERSION = 1;
export const RATING_SCALE_MIN = 1;
export const RATING_SCALE_MAX = 5;

export const THRESHOLDS = Object.freeze({
  passMinOverall: 3.5,
  failMaxOverall: 2.8,
});

export const RATING_LEVEL = Object.freeze({
  PASS: "PASS",
  CONSIDER: "CONSIDER",
  FAIL: "FAIL",
});

export const FORMAT_WEIGHTS = Object.freeze({
  missingHeadingDot: 1.5,
  charCueNotCaps: 1.0,
  microSceneChoppy: 0.5,
});

function toStringText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function splitLines(text) {
  return toStringText(text).replace(/\r\n?/g, "\n").split("\n");
}

function isSceneHeading(line) {
  return /^(INT\.|EXT\.|INT\/EXT|EST\.)\s/i.test(String(line || "").trim());
}

function looksLikeSceneHeadingButBroken(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  if (isSceneHeading(t)) return false;
  // INT without dot, or heading-like all caps with location/time hint
  if (/^INT\s+[A-Z]/i.test(t) || /^EXT\s+[A-Z]/i.test(t)) return true;
  if (/^(INT|EXT)[\s/]*$/i.test(t)) return true;
  return false;
}

function isCharacterCue(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  if (isSceneHeading(t)) return false;
  if (t !== t.toUpperCase()) return false;
  if (!/[A-Z]/.test(t)) return false;
  return /^[A-Z][A-Z0-9 .'()\-]{1,38}[A-Z0-9)]$/.test(t);
}

function looksLikeCharacterCueButNotCaps(line) {
  const t = String(line || "").trim();
  if (!t) return false;
  if (isSceneHeading(t)) return false;
  if (isCharacterCue(t)) return false;
  // Title-case name that would be a cue if uppercased, or cue with colon
  if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+){0,2}$/.test(t) && t.length < 30) return true;
  if (/^[A-Z][A-Z0-9 .'()\-]{1,38}:$/.test(t)) return true;
  return false;
}

function clampScore(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 3;
  return Math.max(RATING_SCALE_MIN, Math.min(RATING_SCALE_MAX, Math.round(v * 10) / 10));
}

function levelForScore(score) {
  const s = Number(score);
  if (s >= THRESHOLDS.passMinOverall) return RATING_LEVEL.PASS;
  if (s <= THRESHOLDS.failMaxOverall) return RATING_LEVEL.FAIL;
  return RATING_LEVEL.CONSIDER;
}

// ---------- format rating ----------

export function rateFormat(text) {
  const t = toStringText(text);
  if (!t.trim()) {
    return { score: 1, level: RATING_LEVEL.FAIL, hard: 1, soft: 0, issues: [{ code: "empty_draft", severity: "hard", message: "Empty draft." }], totalIssues: 1 };
  }
  const lines = splitLines(t);
  let hard = 0;
  let soft = 0;
  const issues = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (looksLikeSceneHeadingButBroken(line)) {
      hard += 1;
      issues.push({ code: "scene_heading_shape", severity: "hard", line: idx + 1, excerpt: line.trim().slice(0, 60), message: "Scene heading missing INT./EXT. dot." });
    }
    if (looksLikeCharacterCueButNotCaps(line)) {
      soft += 1;
      issues.push({ code: "character_cue_caps", severity: "soft", line: idx + 1, excerpt: line.trim().slice(0, 60), message: "Character cue should be CAPS." });
    }
  }
  // heading density: no headings at all is a hard signal for format
  const headingCount = lines.filter(isSceneHeading).length;
  if (headingCount === 0) {
    hard += 1;
    issues.push({ code: "no_headings", severity: "hard", message: "No INT./EXT. headings detected." });
  }
  let score = 5;
  score -= hard * FORMAT_WEIGHTS.missingHeadingDot;
  score -= soft * 0.4;
  // tiny soft penalty for micro headings spam is not format; keep simple
  score = clampScore(score);
  const level = levelForScore(score);
  return { score, level, hard, soft, issues, totalIssues: issues.length };
}

// ---------- story rating ----------

export function rateStory(text) {
  const t = toStringText(text);
  if (!t.trim()) {
    return { score: 1, level: RATING_LEVEL.FAIL, sceneCount: 0, dialogueRatio: 0, warnings: [{ code: "no_scenes_detected", severity: "soft", message: "No scenes detected." }], summary: "No scenes detected." };
  }
  const lines = splitLines(t);
  const headings = lines.filter(isSceneHeading);
  const sceneCount = headings.length;
  // partition scenes for pacing
  const scenes = [];
  let current = null;
  for (const line of lines) {
    if (isSceneHeading(line)) {
      if (current) scenes.push(current);
      current = { heading: line.trim(), lines: [] };
      continue;
    }
    if (!current) current = { heading: null, lines: [] };
    current.lines.push(line);
  }
  if (current) scenes.push(current);
  const realScenes = scenes.filter((s) => s.heading);
  const avgSceneLines = realScenes.length ? realScenes.reduce((a, s) => a + s.lines.length, 0) / realScenes.length : 0;
  // dialogue ratio: character cue -> following non-empty lines until blank
  let cueCount = 0;
  let dialogueLines = 0;
  let active = false;
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) { active = false; continue; }
    if (isSceneHeading(trimmed)) { active = false; continue; }
    if (isCharacterCue(trimmed)) { cueCount += 1; active = true; continue; }
    if (/^\(.*\)$/.test(trimmed)) continue;
    if (active) dialogueLines += 1;
    else active = false;
  }
  const totalLines = lines.filter((l) => String(l || "").trim()).length || 1;
  const dialogueRatio = Math.round((dialogueLines / totalLines) * 1000) / 1000;
  const warnings = [];
  if (realScenes.length === 0) warnings.push({ code: "no_scenes_detected", severity: "soft", message: "No INT./EXT. scene headings detected." });
  const longScenes = realScenes.filter((s) => s.lines.length > 80);
  if (longScenes.length > 0) warnings.push({ code: "scene_too_long", severity: longScenes.length >= 3 ? "medium" : "soft", message: `${longScenes.length} scene(s) exceed 80 lines.` });
  const shortScenes = realScenes.filter((s) => s.lines.length < 3);
  if (shortScenes.length / Math.max(1, realScenes.length) > 0.4) warnings.push({ code: "many_micro_scenes", severity: "soft", message: `${shortScenes.length} scenes are very short (<3 lines); pacing may feel choppy.` });
  if (dialogueRatio < 0.18 && totalLines > 60) warnings.push({ code: "dialogue_thin", severity: "soft", message: `Dialogue ratio low (${(dialogueRatio * 100).toFixed(1)}%).` });
  if (dialogueRatio > 0.7) warnings.push({ code: "dialogue_heavy", severity: "soft", message: `Dialogue ratio high (${(dialogueRatio * 100).toFixed(1)}%).` });
  // score: start at 5, penalize per warning
  let score = 5;
  if (realScenes.length === 0) score -= 2;
  if (longScenes.length > 0) score -= Math.min(1.5, longScenes.length * 0.6);
  if (shortScenes.length / Math.max(1, realScenes.length) > 0.4) score -= 0.6;
  if (dialogueRatio < 0.18 && totalLines > 60) score -= 0.7;
  if (dialogueRatio > 0.7) score -= 0.6;
  if (avgSceneLines > 60) score -= 0.4;
  score = clampScore(score);
  const level = levelForScore(score);
  const summary = realScenes.length === 0 ? "No scenes detected." : warnings.length === 0 ? `${sceneCount} scene(s), ${(dialogueRatio * 100).toFixed(0)}% dialogue — reads balanced.` : `${sceneCount} scene(s), ${warnings.length} story signal(s) flagged.`;
  return { score, level, sceneCount, dialogueRatio, avgSceneLines: Math.round(avgSceneLines * 100) / 100, warnings, summary };
}

// ---------- mentor gold ----------

export function scoreMentorGoldenReply(reply, testCase) {
  const text = String(reply || "");
  const lower = text.toLowerCase();
  if (testCase && typeof testCase === "object") {
    if (testCase.golden !== undefined && text === testCase.golden) return { overall: 4.5, verdict: RATING_LEVEL.PASS };
    if (testCase.weak !== undefined && text === testCase.weak) return { overall: 1.5, verdict: RATING_LEVEL.FAIL };
  }
  const weakHints = ["how are you", "scrap the", "let's brainstorm", "just write", "don't worry", "trust your gut", "beautiful and vulnerable", "great dialogue", "love the metaphor", "you've got this", "hold space", "be kind", "step 1"];
  const isWeakLike = weakHints.some((h) => lower.includes(h));
  const hasPlace = /(parking lot|diner|church|airport|rooftop|garage|courtroom|school|bank|farm|bus|lab|bookstore|hospital|bedroom|kitchen)/i.test(text);
  const hasNames = (text.match(/\b[A-Z][a-z]+\b/g) || []).length >= 1;
  const hasWant = /wants?|needs?|has to|trying to/i.test(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  let score = 3;
  if (isWeakLike) score -= 1.5;
  if (hasPlace) score += 0.6;
  if (hasNames) score += 0.3;
  if (hasWant) score += 0.3;
  if (words < 10 || words > 260) score -= 0.5;
  score = clampScore(score);
  const verdict = levelForScore(score);
  return { overall: score, verdict };
}

export function scoreMentorGoldenBatch(cases) {
  const list = Array.isArray(cases) ? cases : [];
  return list.map((c) => ({
    id: String(c.id || ""),
    golden: scoreMentorGoldenReply(c.golden, c),
    weak: scoreMentorGoldenReply(c.weak, c),
  }));
}

export function mentorPassRate(scoredBatch) {
  const list = Array.isArray(scoredBatch) ? scoredBatch : [];
  if (list.length === 0) return 0;
  let pass = 0;
  for (const entry of list) {
    if (entry && entry.golden && entry.golden.verdict === RATING_LEVEL.PASS) pass += 1;
  }
  return Math.round((pass / list.length) * 1000) / 1000;
}

// ---------- combined coverage rating ----------

export function rateCoverage({ text = "", formatResult = null, storyResult = null } = {}) {
  const format = formatResult && typeof formatResult === "object" && typeof formatResult.score === "number" ? formatResult : rateFormat(text);
  const story = storyResult && typeof storyResult === "object" && typeof storyResult.score === "number" ? storyResult : rateStory(text);
  const overall = clampScore((Number(format.score) + Number(story.score)) / 2);
  const verdict = levelForScore(overall);
  const summary = overall >= THRESHOLDS.passMinOverall ? "Coverage PASS — format and story read ready." : overall <= THRESHOLDS.failMaxOverall ? "Coverage FAIL — address format or story signals." : "Coverage CONSIDER — one dimension needs tightening.";
  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    overall,
    verdict,
    format,
    story,
    summary,
  };
}

export function buildCoveragePayload({ text, projectId = "", frameworkId = null } = {}) {
  const format = rateFormat(text);
  const story = rateStory(text);
  const coverage = rateCoverage({ text, formatResult: format, storyResult: story });
  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    projectId: String(projectId || ""),
    frameworkId: typeof frameworkId === "string" ? frameworkId : null,
    overall: coverage.overall,
    verdict: coverage.verdict,
    format,
    story,
    summary: coverage.summary,
  };
}

export default {
  COVERAGE_SCHEMA_VERSION,
  RATING_SCALE_MIN,
  RATING_SCALE_MAX,
  THRESHOLDS,
  RATING_LEVEL,
  FORMAT_WEIGHTS,
  rateFormat,
  rateStory,
  scoreMentorGoldenReply,
  scoreMentorGoldenBatch,
  mentorPassRate,
  rateCoverage,
  buildCoveragePayload,
};
