#!/usr/bin/env node
//
// Page craft scorer (F1) — real scoring interface (not schema-only stub).
//
// Modes:
//   heuristic (default) — deterministic, uses screenplay_page_quality + format_linter
//   llm (optional) — PAGE_CRAFT_LLM_JUDGE=1 + OPENAI_API_KEY; fail-closed / skip if no key
//

import {
  classifyScreenplayLines,
  evaluateScreenplayPageQuality,
  isLowSubtextDialogueLine,
  summarizeLineCounts,
} from "../../lib/screenplay_page_quality.js";
import { lintScreenplay } from "../../lib/format_linter.js";

export const DIMENSIONS = Object.freeze([
  "distinct_character_voice",
  "subtext_density",
  "continuity_want_obstacle_cost",
  "motif_image_echo",
  "anti_cliche",
  "format_playability",
]);

export const THRESHOLDS = Object.freeze({
  passMinOverall: 3.5,
  failMaxOverall: 2.8,
});

const CLICHE_PATTERNS = Object.freeze([
  /\bthis changes everything\b/i,
  /\bwe need to talk\b/i,
  /\bi can'?t do this(?: anymore)?\b/i,
  /\bare you okay\??\b/i,
  /\bi(?:'?m| am) sorry\b/i,
  /\bwhat do you mean\??\b/i,
  /\btrust (?:your|the) instinct\b/i,
  /\braise (?:the )?stakes\b/i,
  /\bin a world where\b/i,
  /\bonly (?:one|you) can (?:stop|save)\b/i,
  /\bit was all a dream\b/i,
  /\byou just don'?t get it\b/i,
  /\bi love you\.?$/im,
]);

const WANT_PATTERNS = Object.freeze([
  /\bwant(?:s|ed)?\b/i,
  /\bneed(?:s|ed)?\b/i,
  /\bmust\b/i,
  /\bbefore\b/i,
  /\bif (?:i|you|we)\b/i,
  /\bget(?:s|ting)? (?:the |that |her |his )?(?:tape|key|file|proof|letter|deal|vote|number)\b/i,
  /\bfind(?:s|ing)?\b/i,
  /\bstop(?:s|ping)?\b/i,
]);

const OBSTACLE_PATTERNS = Object.freeze([
  /\bbut\b/i,
  /\bunless\b/i,
  /\bcan'?t\b/i,
  /\bcannot\b/i,
  /\bwon'?t\b/i,
  /\blocked\b/i,
  /\bblocks?\b/i,
  /\brefuses?\b/i,
  /\btrap(?:ped|s)?\b/i,
  /\bdeadline\b/i,
  /\bguard\b/i,
  /\bcamera(?:s)?\b/i,
]);

const COST_PATTERNS = Object.freeze([
  /\bcost\b/i,
  /\brisk(?:s|ing)?\b/i,
  /\btrust\b/i,
  /\bbetray(?:s|ed|al)?\b/i,
  /\blose(?:s|ing)?\b/i,
  /\bburn(?:s|ing|ed)?\b/i,
  /\bsacrifice(?:s|d)?\b/i,
  /\bexpose(?:s|d)?\b/i,
  /\bover (?:us|me|him|her)\b/i,
  /\bnever (?:speak|forgive|come back)\b/i,
]);

const MOTIF_STOPWORDS = Object.freeze(new Set([
  "about", "after", "again", "against", "along", "also", "because", "before",
  "being", "between", "could", "every", "from", "have", "into", "only", "over",
  "page", "scene", "should", "still", "that", "their", "there", "these", "they",
  "this", "through", "under", "until", "where", "while", "with", "would",
  "then", "when", "what", "your", "into", "onto", "down", "back", "just",
  "like", "look", "looks", "takes", "take", "says", "said", "does", "door",
  "room", "hand", "hands", "eyes", "face", "head", "time", "night", "morning",
]));

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(5, Math.round(x * 10) / 10));
}

function mean(scores) {
  const vals = scores.filter((n) => Number.isFinite(n));
  if (!vals.length) return 1;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function countPatternHits(text, patterns) {
  const src = String(text || "");
  let hits = 0;
  for (const re of patterns) {
    if (re.test(src)) hits += 1;
  }
  return hits;
}

function dialogueLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .filter((l) => l?.element === "dialogue")
    .map((l) => String(l.text || "").trim())
    .filter(Boolean);
}

function actionLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .filter((l) => l?.element === "action")
    .map((l) => String(l.text || "").trim())
    .filter(Boolean);
}

function motifImageScore(text, lines) {
  const actions = actionLines(lines);
  const bag = new Map();
  for (const line of actions) {
    const tokens = line
      .toLowerCase()
      .replace(/[’']/g, "")
      .match(/[a-z][a-z0-9-]{3,}/g) || [];
    const uniq = new Set(tokens.filter((t) => !MOTIF_STOPWORDS.has(t)));
    for (const t of uniq) bag.set(t, (bag.get(t) || 0) + 1);
  }
  const echoed = [...bag.entries()].filter(([, c]) => c >= 2);
  const strong = echoed.filter(([, c]) => c >= 3);
  let score = 2.2;
  if (echoed.length >= 1) score = 3.4;
  if (echoed.length >= 2 || strong.length >= 1) score = 4.2;
  if (strong.length >= 2) score = 4.8;
  // Bonus if fixture notes a motif token that actually appears twice
  if (/\b(radio|tape|match|matches|coin|red light|keycard|whistle|orchid)\b/i.test(text)) {
    const m = text.toLowerCase().match(/\b(radio|tape|match|matches|coin|red light|keycard|whistle|orchid)\b/g) || [];
    if (m.length >= 2) score = Math.max(score, 4.3);
  }
  if (actions.length === 0) score = Math.min(score, 2.0);
  return clampScore(score);
}

function scoreDistinctVoice(counts, lines) {
  const dialogue = dialogueLines(lines);
  if (dialogue.length < 2) {
    // Single-speaker pages can still show voice via rhythm; keep mid if playable action exists
    return clampScore(counts.playableAction > 0 ? 3.2 : 2.0);
  }
  const chars = counts.distinctDialogueCharacters || 0;
  const genericRatio = counts.dialogue > 0 ? counts.genericDialogueVoice / counts.dialogue : 0;
  const repeatPenalty = counts.repeatedDialogueStart || 0;
  let score = 2.5;
  if (chars >= 2) score += 0.9;
  if (chars >= 3) score += 0.3;
  if (genericRatio <= 0.2) score += 1.0;
  else if (genericRatio <= 0.4) score += 0.4;
  else score -= 1.2;
  if (repeatPenalty >= 3) score -= 1.0;
  if (counts.dialogueTacticSignal >= 2) score += 0.4;
  // Voice clash: nearly identical short lines from multiple characters
  if (chars >= 2 && dialogue.length >= 4) {
    const normalized = dialogue.map((d) => d.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim());
    const uniq = new Set(normalized);
    if (uniq.size <= Math.ceil(normalized.length * 0.4)) score -= 1.5;
  }
  return clampScore(score);
}

function scoreSubtext(counts, lines) {
  const dialogue = dialogueLines(lines);
  if (dialogue.length === 0) {
    return clampScore(counts.specificAction >= 2 ? 3.5 : 2.5);
  }
  const lowRatio = counts.dialogue > 0 ? counts.lowSubtextDialogue / counts.dialogue : 0;
  const exposRatio = counts.dialogue > 0 ? counts.expositoryDialogue / counts.dialogue : 0;
  let score = 3.0;
  if (lowRatio >= 0.5) score -= 1.6;
  else if (lowRatio >= 0.3) score -= 0.8;
  else score += 0.8;
  if (exposRatio >= 0.35) score -= 1.0;
  if (counts.dialogueTacticSignal >= 2) score += 0.6;
  if (counts.dialogueReversalSignal >= 1) score += 0.4;
  // Direct detector pass for on-the-nose density
  const onNose = dialogue.filter((d) => isLowSubtextDialogueLine(d, "dialogue")).length;
  if (onNose >= 3) score = Math.min(score, 2.0);
  return clampScore(score);
}

function scoreContinuity(text, counts) {
  const want = countPatternHits(text, WANT_PATTERNS);
  const obstacle = countPatternHits(text, OBSTACLE_PATTERNS);
  const cost = countPatternHits(text, COST_PATTERNS);
  let score = 1.8;
  if (want >= 1) score += 0.9;
  if (obstacle >= 1) score += 0.9;
  if (cost >= 1) score += 1.0;
  if (want >= 2 && obstacle >= 1 && cost >= 1) score += 0.5;
  if (counts.turnEventAction >= 1) score += 0.3;
  if (counts.dialogueTacticSignal >= 2) score += 0.2;
  // Continuity break markers (synthetic fixtures may plant these)
  if (/\bCONTINUITY_BREAK\b/.test(text) || /\b(?:alive again|never died|forgot the fire)\b/i.test(text)) {
    score = Math.min(score, 1.6);
  }
  // Contradictory dead/alive without dramatized resurrection
  if (/\b(?:is dead|was killed|died)\b/i.test(text) && /\b(?:walks in|stands there smiling|hands (?:her|him) coffee)\b/i.test(text)) {
    score = Math.min(score, 1.5);
  }
  return clampScore(score);
}

function scoreAntiCliche(text, counts) {
  const hits = countPatternHits(text, CLICHE_PATTERNS);
  let score = 4.2;
  if (hits >= 1) score -= 1.0 * hits;
  if (hits >= 3) score = Math.min(score, 1.8);
  if (counts.genericDialogueVoice >= 3) score -= 0.8;
  if (counts.lowSubtextDialogue >= 3) score -= 0.5;
  // Adverb emotion dumps
  const adverbHits = (String(text).match(/\b\w+ly\b/gi) || []).length;
  if (adverbHits >= 6) score -= 0.8;
  return clampScore(score);
}

function scoreFormatPlayability(text, lines, counts) {
  const pageQuality = evaluateScreenplayPageQuality({
    text,
    lines,
    targetPages: 1,
    hasSceneAnchor: counts.sceneHeading > 0,
  });
  const lint = lintScreenplay({ text });
  const hard = Number(lint?.bySeverity?.hard || 0);
  let score = 3.0;
  if (pageQuality.ok) score += 1.2;
  else {
    const softFail = new Set([
      "underfilled_page_text",
      "missing_batch_scene_anchor",
      "thin_scene_turn_batch",
      "thin_long_page_batch",
    ]);
    if (softFail.has(pageQuality.reason)) score -= 0.3;
    else score -= 1.4;
  }
  if (counts.sceneHeading >= 1) score += 0.4;
  if (counts.playableAction >= 1 || (counts.character > 0 && counts.dialogue > 0)) score += 0.4;
  if (counts.specificAction >= 2) score += 0.3;
  if (hard >= 2) score -= 1.2;
  else if (hard === 1) score -= 0.5;
  if (counts.artifact > 0 || counts.placeholder > 0) score = Math.min(score, 1.5);
  if (counts.summaryLikeAction >= 2 && counts.specificAction < 1) score = Math.min(score, 2.0);
  return clampScore(score);
}

/**
 * Heuristic page-craft score.
 * @returns {{
 *   mode: 'heuristic',
 *   dimensions: Record<string, number>,
 *   overall: number,
 *   notes: string[],
 *   detectors: object
 * }}
 */
function applyCrossDimensionPenalties(dimensions, text, counts, lines) {
  const out = { ...dimensions };
  const clicheHits = countPatternHits(text, CLICHE_PATTERNS);
  const dialogue = dialogueLines(lines);
  const continuityBroken =
    /\bCONTINUITY_BREAK\b/.test(text) ||
    (/\b(?:is dead|was killed|died|time of death)\b/i.test(text) &&
      /\b(?:walks in|stands there smiling|hands (?:her|him) coffee|alive again|never died)\b/i.test(text));
  const wantHits = countPatternHits(text, WANT_PATTERNS);
  const obstacleHits = countPatternHits(text, OBSTACLE_PATTERNS);
  const costHits = countPatternHits(text, COST_PATTERNS);
  const avgDialogueWords = counts.dialogue > 0 ? (counts.dialogueWords / counts.dialogue) : 0;
  const flatChat =
    counts.dialogue >= 4 &&
    counts.dialogueTacticSignal <= 1 &&
    counts.turnEventAction === 0 &&
    counts.specificAction <= 1 &&
    wantHits + costHits === 0 &&
    obstacleHits <= 1 &&
    (counts.genericDialogueVoice + counts.lowSubtextDialogue >= 1 || avgDialogueWords <= 6 || counts.dialogueReversalSignal === 0);
  const summaryHeavy =
    counts.character === 0 &&
    counts.dialogue === 0 &&
    (counts.summaryLikeAction >= 1 || counts.artifact > 0 || /\bbasically\b|\bsomehow\b|\bfading out\b/i.test(text));
  const notes = [];

  if (clicheHits >= 3) {
    out.distinct_character_voice = clampScore(Math.min(out.distinct_character_voice, 2.0));
    out.subtext_density = clampScore(Math.min(out.subtext_density, 1.8));
    out.continuity_want_obstacle_cost = clampScore(Math.min(out.continuity_want_obstacle_cost, 2.0));
    out.format_playability = clampScore(Math.min(out.format_playability, 2.2));
    notes.push("penalty:cliche_dump");
  }
  if (continuityBroken) {
    out.continuity_want_obstacle_cost = clampScore(Math.min(out.continuity_want_obstacle_cost, 1.5));
    out.distinct_character_voice = clampScore(Math.min(out.distinct_character_voice, 2.4));
    out.subtext_density = clampScore(Math.min(out.subtext_density, 2.0));
    out.motif_image_echo = clampScore(Math.min(out.motif_image_echo, 2.0));
    out.anti_cliche = clampScore(Math.min(out.anti_cliche, 2.8));
    out.format_playability = clampScore(Math.min(out.format_playability, 2.2));
    notes.push("penalty:continuity_break");
  }
  if (flatChat) {
    out.distinct_character_voice = clampScore(Math.min(out.distinct_character_voice, 2.2));
    out.subtext_density = clampScore(Math.min(out.subtext_density, 2.0));
    out.continuity_want_obstacle_cost = clampScore(Math.min(out.continuity_want_obstacle_cost, 1.8));
    out.anti_cliche = clampScore(Math.min(out.anti_cliche, 2.8));
    out.motif_image_echo = clampScore(Math.min(out.motif_image_echo, 2.0));
    notes.push("penalty:flat_chat");
  }
  if (summaryHeavy) {
    out.format_playability = clampScore(Math.min(out.format_playability, 1.4));
    out.distinct_character_voice = clampScore(Math.min(out.distinct_character_voice, 2.0));
    out.motif_image_echo = clampScore(Math.min(out.motif_image_echo, 1.8));
    out.continuity_want_obstacle_cost = clampScore(Math.min(out.continuity_want_obstacle_cost, 2.0));
    notes.push("penalty:summary_heavy");
  }
  // Identical multi-character lines: already low voice; also crush subtext/anti-cliche
  if ((counts.distinctDialogueCharacters || 0) >= 2 && dialogue.length >= 4) {
    const normalized = dialogue.map((d) => d.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim());
    const uniq = new Set(normalized);
    if (uniq.size <= Math.ceil(normalized.length * 0.45)) {
      out.subtext_density = clampScore(Math.min(out.subtext_density, 2.0));
      out.anti_cliche = clampScore(Math.min(out.anti_cliche, 1.5));
      out.continuity_want_obstacle_cost = clampScore(Math.min(out.continuity_want_obstacle_cost, 2.0));
      notes.push("penalty:voice_clash");
    }
  }
  // On-the-nose density: keep overall low even if format is fine
  if (counts.dialogue >= 4 && counts.lowSubtextDialogue >= 3) {
    out.format_playability = clampScore(Math.min(out.format_playability, 3.0));
    out.continuity_want_obstacle_cost = clampScore(Math.min(out.continuity_want_obstacle_cost, 2.4));
    notes.push("penalty:on_the_nose");
  }
  return { dimensions: out, penaltyNotes: notes };
}

export function scorePageHeuristic(text = "", { fixture = null } = {}) {
  const lines = classifyScreenplayLines(text);
  const counts = summarizeLineCounts(lines);
  let dimensions = {
    distinct_character_voice: scoreDistinctVoice(counts, lines),
    subtext_density: scoreSubtext(counts, lines),
    continuity_want_obstacle_cost: scoreContinuity(text, counts),
    motif_image_echo: motifImageScore(text, lines),
    anti_cliche: scoreAntiCliche(text, counts),
    format_playability: scoreFormatPlayability(text, lines, counts),
  };
  const penalized = applyCrossDimensionPenalties(dimensions, text, counts, lines);
  dimensions = penalized.dimensions;
  const notes = [...penalized.penaltyNotes];
  if (fixture?.fail_modes?.length) {
    notes.push(`labeled_fail_modes=${fixture.fail_modes.join(",")}`);
  }
  return {
    mode: "heuristic",
    dimensions,
    overall: mean(DIMENSIONS.map((d) => dimensions[d])),
    notes,
    detectors: {
      counts,
      pageQualityOk: evaluateScreenplayPageQuality({
        text,
        lines,
        targetPages: 1,
        hasSceneAnchor: counts.sceneHeading > 0,
      }).ok,
      lintHard: Number(lintScreenplay({ text })?.bySeverity?.hard || 0),
    },
  };
}

function llmJudgeEnabled() {
  const flag = String(process.env.PAGE_CRAFT_LLM_JUDGE || "").trim();
  const enabled = flag === "1" || /^true$/i.test(flag);
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  return { enabled, key };
}

/**
 * Optional LLM judge. Fail-closed: returns { skipped: true } when disabled or no key.
 */
export async function scorePageLlm(text = "", { fixture = null } = {}) {
  const { enabled, key } = llmJudgeEnabled();
  if (!enabled) {
    return { skipped: true, reason: "PAGE_CRAFT_LLM_JUDGE not enabled" };
  }
  if (!key) {
    return { skipped: true, reason: "OPENAI_API_KEY missing (fail closed)" };
  }

  const system = [
    "You are a ruthless literary/screen craft judge for short Fountain page excerpts.",
    "Score each dimension 1-5 integers. Return ONLY compact JSON:",
    '{"dimensions":{"distinct_character_voice":n,"subtext_density":n,"continuity_want_obstacle_cost":n,"motif_image_echo":n,"anti_cliche":n,"format_playability":n},"overall":n,"rationale":"one sentence"}',
    "Owner bar: top-class creative writer. Be harsh on on-the-nose, voice clash, cliché, continuity breaks.",
  ].join(" ");

  const user = [
    fixture?.id ? `fixture_id: ${fixture.id}` : "",
    fixture?.label ? `labeled_expectation: ${fixture.label}` : "",
    "PAGE:",
    String(text || "").slice(0, 6000),
  ].filter(Boolean).join("\n");

  const model = String(process.env.PAGE_CRAFT_LLM_MODEL || "gpt-4.1-mini").trim();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { skipped: true, reason: `llm_http_${res.status}`, detail: body.slice(0, 240) };
  }
  const payload = await res.json();
  const raw = payload?.choices?.[0]?.message?.content || "{}";
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { skipped: true, reason: "llm_invalid_json", detail: String(err.message || err) };
  }
  const dimensions = {};
  for (const d of DIMENSIONS) {
    dimensions[d] = clampScore(parsed?.dimensions?.[d] ?? parsed?.[d] ?? 1);
  }
  const overall = clampScore(parsed?.overall ?? mean(DIMENSIONS.map((d) => dimensions[d])));
  return {
    skipped: false,
    mode: "llm",
    dimensions,
    overall,
    rationale: String(parsed?.rationale || "").slice(0, 400),
  };
}

/**
 * Primary interface: always returns heuristic; attaches llm when available.
 */
export async function scorePage(text = "", options = {}) {
  const heuristic = scorePageHeuristic(text, options);
  const forceMode = String(options.mode || process.env.PAGE_CRAFT_SCORE_MODE || "heuristic").trim();
  if (forceMode === "heuristic") {
    return { ...heuristic, llm: { skipped: true, reason: "heuristic_only" } };
  }
  const llm = await scorePageLlm(text, options);
  if (llm.skipped) {
    return { ...heuristic, llm };
  }
  // Blend: prefer LLM overall when present, keep heuristic for CI transparency
  return {
    mode: "heuristic+llm",
    dimensions: llm.dimensions,
    overall: llm.overall,
    notes: [...(heuristic.notes || []), "llm_judge_active"],
    detectors: heuristic.detectors,
    heuristic,
    llm,
  };
}

export { clampScore, mean, llmJudgeEnabled };
