// Clementine's coverage: how she reads a script the moment it arrives.
//
// Studio coverage vocabulary — a grade, a verdict (RECOMMEND / CONSIDER /
// PASS), five pillars scored 1–10, what works, what is missing, and the one
// move — composed from analyzers that already exist and are deterministic:
// element-aware pagination, the coverage simulator (pacing, dialogue ratio,
// character distribution), the format linter, and the page-craft heuristic
// applied per scene. No model call: the same script always gets the same
// read, and the read is explainable line by line. Structure here is the
// *shape* of the script on the page (scene boundaries near the act turns of
// a three-act feature); beat detection proper lives in the Craft tab's
// classifier run.

import { paginateScreenplay } from "./screenplay_pagination.js";
import { simulateCoverage } from "./coverage_simulator.js";
import { lintScreenplay } from "./format_linter.js";
import { scorePageHeuristic } from "../evals/page_craft/score_page.js";
import { getFrameworkById, DEFAULT_FRAMEWORK_ID } from "./craft_frameworks.js";

export const COVERAGE_SCHEMA_VERSION = 1;
export const PILLARS = Object.freeze(["structure", "pacing", "dialogue", "character", "format"]);
export const PILLAR_WEIGHTS = Object.freeze({ structure: 0.30, dialogue: 0.25, character: 0.20, pacing: 0.15, format: 0.10 });

function clamp10(value) {
  return Math.max(1, Math.min(10, Number(value.toFixed(1))));
}

function tenFromFive(score) {
  // page-craft dimensions are 1–5; map linearly onto 1–10.
  return clamp10(1 + (Math.max(1, Math.min(5, Number(score || 1))) - 1) * 2.25);
}

export function gradeFor(overall) {
  if (overall >= 8.5) return "A";
  if (overall >= 7) return "B";
  if (overall >= 5.5) return "C";
  if (overall >= 4) return "D";
  return "F";
}

export function verdictFor(overall) {
  if (overall >= 8) return "RECOMMEND";
  if (overall >= 6) return "CONSIDER";
  return "PASS";
}

function splitScenes(lines) {
  const scenes = [];
  let current = null;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const upper = line.toUpperCase();
    const isHeading = /^(INT\.|EXT\.|INT\/EXT|EXT\/INT|I\/E\.|EST\.|INT |EXT )/.test(upper);
    if (isHeading) {
      if (current) scenes.push(current);
      current = { heading: line, startLine: index + 1, lines: [] };
    } else if (current) {
      current.lines.push(raw);
    }
  });
  if (current) scenes.push(current);
  return scenes;
}

function structureRead({ scenes, pages, pageCount }) {
  const notes = [];
  if (!scenes.length || pageCount === 0) {
    return { score: 1, notes: ["No scene headings, so there is no shape to read yet."], turns: [] };
  }
  // Where each scene starts, as a fraction of the script's pages.
  const lineToPage = new Map();
  for (const page of pages) {
    for (let l = page.startLine; l <= page.endLine; l += 1) if (!lineToPage.has(l)) lineToPage.set(l, page.page);
  }
  const positions = scenes.map((s) => (lineToPage.get(s.startLine) || 1) / Math.max(1, pageCount));
  const fw = getFrameworkById(DEFAULT_FRAMEWORK_ID);
  const targets = [
    { id: "first-plot-point", label: "Act One turn", range: [20 / 110, 30 / 110] },
    { id: "midpoint-twist", label: "Midpoint", range: [50 / 110, 60 / 110] },
    { id: "second-plot-point", label: "Low point", range: [70 / 110, 82 / 110] },
  ].map((t) => {
    const beat = fw?.beats?.find((b) => b.id === t.id);
    const range = beat?.expectedPageRange ? [beat.expectedPageRange.start / 110, beat.expectedPageRange.end / 110] : t.range;
    return { ...t, range };
  });
  const turns = targets.map((t) => {
    const hit = positions.some((p) => p >= t.range[0] - 0.04 && p <= t.range[1] + 0.04);
    return { id: t.id, label: t.label, sceneBoundaryNearby: hit };
  });
  let score = 4;
  const hits = turns.filter((t) => t.sceneBoundaryNearby).length;
  score += hits * 1.5;
  if (scenes.length >= 8) score += 1;
  if (pageCount >= 60) score += 0.5;
  if (pageCount < 8) { score = Math.min(score, 4); notes.push("Too few pages to read an act shape; this is a scene, not a feature yet."); }
  for (const t of turns) if (!t.sceneBoundaryNearby && pageCount >= 30) notes.push(`No scene turns where the ${t.label.toLowerCase()} should land.`);
  if (hits === turns.length && pageCount >= 30) notes.push("Scene boundaries fall where the three-act turns belong.");
  return { score: clamp10(score), notes, turns, sceneCount: scenes.length };
}

function pacingRead(coverage) {
  const notes = [];
  let score = 8;
  const codes = coverage.warnings.map((w) => w.code);
  const count = (code) => coverage.warnings.filter((w) => w.code === code).length;
  if (codes.includes("no_scenes_detected")) return { score: 2, notes: ["No scenes to pace."] };
  score -= Math.min(3, count("scene_too_long") * 1);
  if (count("scene_too_long")) notes.push(`${count("scene_too_long")} scene${count("scene_too_long") > 1 ? "s run" : " runs"} past a page and a half without a turn.`);
  if (codes.includes("many_micro_scenes")) { score -= 1.5; notes.push("Many micro-scenes; the cut is doing work the writing should."); }
  if (codes.includes("dialogue_heavy")) { score -= 1; notes.push("Dialogue-heavy: the camera has little to do."); }
  if (codes.includes("dialogue_thin")) { score -= 1; notes.push("Dialogue-thin: people are not pressuring each other on the page."); }
  const ratio = Number(coverage.overview?.dialogueRatio ?? 0);
  if (ratio >= 0.3 && ratio <= 0.6 && !codes.length) notes.push("Dialogue and action trade off at a readable rhythm.");
  return { score: clamp10(score), notes };
}

function dialogueRead(sceneScores) {
  if (!sceneScores.length) return { score: 3, notes: ["No dialogue to read."] };
  const avg = (key) => sceneScores.reduce((a, s) => a + (s.dimensions[key]?.score ?? s.dimensions[key] ?? 1), 0) / sceneScores.length;
  const subtext = avg("subtext_density");
  const anti = avg("anti_cliche");
  const voice = avg("distinct_character_voice");
  const score = clamp10(tenFromFive(subtext) * 0.45 + tenFromFive(anti) * 0.3 + tenFromFive(voice) * 0.25);
  const notes = [];
  if (subtext < 2.5) notes.push("Characters say the feeling; the subtext is spoken aloud.");
  if (anti < 2.5) notes.push("Stock lines are carrying scenes that need tactics.");
  if (voice < 2.5) notes.push("Voices blur; cover the cues and the lines could swap.");
  if (subtext >= 3.5 && anti >= 3.5) notes.push("Lines dodge and pressure instead of announcing.");
  return { score, notes, subtext, anti, voice };
}

function characterRead(coverage, sceneScores) {
  const characters = Array.isArray(coverage.characters) ? coverage.characters : [];
  const notes = [];
  if (!characters.length) return { score: 3, notes: ["No character cues found."] };
  const top = characters[0];
  const speaking = characters.filter((c) => (c.lineCount || 0) >= 3).length;
  let score = 5;
  if (speaking >= 2) score += 1.5;
  if (speaking >= 4) score += 1;
  if (top?.share > 0.6) { score -= 1.5; notes.push(`${top.name} carries ${Math.round(top.share * 100)}% of the lines; nobody pushes back.`); }
  else if (top?.share > 0 && top.share <= 0.45) notes.push("The argument is shared; more than one person has a point.");
  const voice = sceneScores.length ? sceneScores.reduce((a, s) => a + (s.dimensions.distinct_character_voice?.score ?? s.dimensions.distinct_character_voice ?? 1), 0) / sceneScores.length : 2;
  score += (voice - 3) * 0.75;
  const continuity = sceneScores.length ? sceneScores.reduce((a, s) => a + (s.dimensions.continuity_want_obstacle_cost?.score ?? s.dimensions.continuity_want_obstacle_cost ?? 1), 0) / sceneScores.length : 2;
  if (continuity < 2.5) notes.push("Wants and obstacles are hard to find scene to scene.");
  else if (continuity >= 3.5) notes.push("Scenes carry a want and something in the way.");
  return { score: clamp10(score), notes, speaking, topShare: top?.share ?? 0 };
}

function formatRead(lint, sceneScores, pageCount) {
  const suggestions = Array.isArray(lint?.suggestions) ? lint.suggestions : [];
  const hard = suggestions.filter((s) => s.severity === "hard").length;
  const medium = suggestions.filter((s) => s.severity === "medium").length;
  const perPage = Math.max(1, pageCount);
  // Log curve: one hard issue per page costs about a point; a page full of
  // them costs four, and the difference between messy and messier survives.
  let score = 9 - Math.min(4, Math.log2(1 + hard / perPage) * 1.35) - Math.min(2, Math.log2(1 + medium / perPage));
  const playability = sceneScores.length ? sceneScores.reduce((a, s) => a + (s.dimensions.format_playability?.score ?? s.dimensions.format_playability ?? 1), 0) / sceneScores.length : 2;
  score = score * 0.7 + tenFromFive(playability) * 0.3;
  const notes = [];
  if (hard) notes.push(`${hard} hard format issue${hard > 1 ? "s" : ""}: sluglines or cues a reader will trip on.`);
  if (!hard && !medium) notes.push("Clean pages; nothing between the reader and the story.");
  return { score: clamp10(score), notes, hard, medium };
}

function pickNotes(pillars) {
  const strengths = [];
  const weaknesses = [];
  for (const [name, read] of Object.entries(pillars)) {
    for (const note of read.notes) {
      const positive = /readable rhythm|belong|shared|dodge|carry a want|Clean pages/.test(note);
      (positive ? strengths : weaknesses).push({ pillar: name, note, score: read.score });
    }
  }
  strengths.sort((a, b) => b.score - a.score);
  weaknesses.sort((a, b) => a.score - b.score);
  return { works: strengths.slice(0, 2).map((x) => x.note), missing: weaknesses.slice(0, 2).map((x) => x.note) };
}

function theMove(pillars) {
  const lowest = Object.entries(pillars).sort((a, b) => a[1].score - b[1].score)[0];
  const [name, read] = lowest;
  switch (name) {
    case "structure": return "Mark the three turns on the page first: where act one commits, where the midpoint flips the tactic, where the low point strips it. Move scenes until a boundary lands on each.";
    case "dialogue": return "Take the flattest exchange and rewrite every line as a tactic: nobody says the feeling, everybody wants something.";
    case "character": return read.topShare > 0.6 ? "Give the second character the better argument for one scene and let them win it." : "Pick one scene and write the want and the obstacle in the first two lines of action.";
    case "pacing": return "Cut into the longest scene at its turn and leave on the exit image.";
    case "format": return "Fix the sluglines and cues first; a reader forgives a weak scene before a broken page.";
    default: return "Write the next scene.";
  }
}

function spokenRead({ title, grade, verdict, overall, pillars, works, missing, move, pageCount }) {
  const name = title ? `"${title}"` : "this draft";
  const lowest = Object.entries(pillars).sort((a, b) => a[1].score - b[1].score)[0][0];
  const highest = Object.entries(pillars).sort((a, b) => b[1].score - a[1].score)[0][0];
  const parts = [];
  parts.push(`Here's my read on ${name}: ${pageCount} page${pageCount === 1 ? "" : "s"}, a ${grade}, and I'd mark it ${verdict.toLowerCase()}.`);
  if (works[0]) parts.push(`What works: ${works[0].replace(/\.$/, "")}, so the ${highest} is your strongest card.`);
  if (missing[0]) parts.push(`What's missing: ${missing[0].replace(/\.$/, "")}; that's why ${lowest} is the low number.`);
  parts.push(`The move: ${move.replace(/\.$/, "")}.`);
  parts.push("Want to start there?");
  return parts.join(" ");
}

export function rateScreenplay({ draft = "", title = "", linesPerPage } = {}) {
  const text = String(draft || "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    const err = new Error("draft_required");
    err.code = "draft_required";
    throw err;
  }
  const pagination = paginateScreenplay(text, { linesPerPage });
  const pageCount = pagination.pages.length;
  const lines = text.split("\n");
  const scenes = splitScenes(lines);
  const coverage = simulateCoverage({ text, pageCount });
  const lint = lintScreenplay({ text });
  const sceneScores = scenes
    .map((s) => [s.heading, ...s.lines].join("\n"))
    .filter((t) => t.trim().split("\n").length >= 3)
    .slice(0, 60)
    .map((t) => scorePageHeuristic(t));
  const pillars = {
    structure: structureRead({ scenes, pages: pagination.pages, pageCount }),
    pacing: pacingRead(coverage),
    dialogue: dialogueRead(sceneScores),
    character: characterRead(coverage, sceneScores),
    format: formatRead(lint, sceneScores, pageCount),
  };
  const overall = clamp10(PILLARS.reduce((a, p) => a + pillars[p].score * PILLAR_WEIGHTS[p], 0));
  const grade = gradeFor(overall);
  const verdict = verdictFor(overall);
  const { works, missing } = pickNotes(pillars);
  const move = theMove(pillars);
  const spoken = spokenRead({ title: String(title || "").trim(), grade, verdict, overall, pillars, works, missing, move, pageCount });
  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    title: String(title || "").trim(),
    pageCount,
    sceneCount: scenes.length,
    overall,
    grade,
    verdict,
    pillars: Object.fromEntries(PILLARS.map((p) => [p, { score: pillars[p].score, notes: pillars[p].notes }])),
    structureTurns: pillars.structure.turns || [],
    works,
    missing,
    move,
    spoken,
    warnings: coverage.warnings,
    formatIssues: { hard: pillars.format.hard, medium: pillars.format.medium },
    characters: (coverage.characters || []).slice(0, 8),
  };
}
