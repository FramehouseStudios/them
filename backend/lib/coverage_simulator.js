// T-coverage-simulator — Craft Intelligence Suite, Layer 2.
//
// Simulates how a coverage reader would scan a screenplay and reports
// quantitative + qualitative signals: pacing, scene count, dialogue
// ratio, average scene length, character distribution. Surfaces
// likely-actionable issues (scenes too long, dialogue-light pages,
// pacing irregularities) before the writer submits.
//
// Pure: no LLM, no I/O. Same input → same output.
//
// Public surface:
//
//   simulateCoverage({ text, pageCount?, frameworkId? }) -> {
//     schemaVersion,
//     overview: { pageCount, sceneCount, dialogueRatio, avgSceneLengthLines },
//     pacing: { intensity, peakScenes, longScenes, shortScenes },
//     characters: [{ name, lineCount, sceneCount, share }],
//     warnings: [{ severity, code, message }],
//     summary
//   }
//
// Used by the iOS Craft tab to surface a "what a reader will see"
// pre-flight before submission.

const SCHEMA_VERSION = 1;
const DEFAULT_PAGE_COUNT = 110;
const LONG_SCENE_LINES = 80;
const SHORT_SCENE_LINES = 3;
const DIALOGUE_RATIO_LOW = 0.18;
const DIALOGUE_RATIO_HIGH = 0.70;
const CHARACTER_DISTRIBUTION_TOP = 8;

function trimToString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function splitLines(text) {
  if (typeof text !== "string") return [];
  return text.replace(/\r\n?/g, "\n").split("\n");
}

function isSceneHeading(line) {
  if (typeof line !== "string") return false;
  return /^(INT\.|EXT\.|INT\/EXT|EST\.)\s/i.test(line.trim());
}

function isCharacterCue(line) {
  if (typeof line !== "string") return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isSceneHeading(trimmed)) return false;
  if (!/[A-Z]/.test(trimmed)) return false;
  if (trimmed !== trimmed.toUpperCase()) return false;
  return /^[A-Z][A-Z0-9 .'\-()@]{1,38}[A-Z0-9)]$/.test(trimmed);
}

function isDialogueLine(line, prevWasCueOrDialogue) {
  if (typeof line !== "string") return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (isSceneHeading(trimmed) || isCharacterCue(trimmed)) return false;
  if (/^\(.*\)$/.test(trimmed)) return false; // parenthetical
  return prevWasCueOrDialogue;
}

function partitionIntoScenes(lines) {
  const scenes = [];
  let current = null;
  for (const line of lines) {
    if (isSceneHeading(line)) {
      if (current) scenes.push(current);
      current = { heading: line.trim(), lines: [] };
      continue;
    }
    if (!current) {
      current = { heading: null, lines: [] };
    }
    current.lines.push(line);
  }
  if (current) scenes.push(current);
  return scenes;
}

function characterStats(lines) {
  // Walk the lines: a cue followed by dialogue lines counts as one
  // appearance for that character + line counts equal to the number
  // of subsequent non-empty non-cue non-heading lines.
  const stats = new Map();
  let activeCue = null;
  for (const raw of lines) {
    const line = (raw || "").trim();
    if (!line) { activeCue = null; continue; }
    if (isSceneHeading(line)) { activeCue = null; continue; }
    if (isCharacterCue(line)) {
      const name = line.replace(/\s*\([^)]*\)\s*$/, "").trim();
      activeCue = name;
      const entry = stats.get(name) || { name, lineCount: 0, sceneAppearances: 0 };
      // Don't increment sceneAppearances here — the scene-level walk
      // is the right place for that. Each unique cue counts as one
      // line for share calculations.
      entry.lineCount += 1;
      stats.set(name, entry);
      continue;
    }
    if (/^\(.*\)$/.test(line)) continue; // parenthetical
    if (activeCue) {
      const entry = stats.get(activeCue) || { name: activeCue, lineCount: 0, sceneAppearances: 0 };
      entry.lineCount += 1;
      stats.set(activeCue, entry);
    }
  }
  return [...stats.values()].sort((a, b) => b.lineCount - a.lineCount);
}

function sceneAppearancesByCharacter(scenes) {
  const counts = new Map();
  for (const scene of scenes) {
    const seenInScene = new Set();
    for (const raw of scene.lines) {
      const line = (raw || "").trim();
      if (isCharacterCue(line)) {
        const name = line.replace(/\s*\([^)]*\)\s*$/, "").trim();
        seenInScene.add(name);
      }
    }
    for (const name of seenInScene) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return counts;
}

function simulateCoverage({ text = "", pageCount = null, frameworkId = null } = {}) {
  const lines = splitLines(text);
  const scenes = partitionIntoScenes(lines);
  const realScenes = scenes.filter((s) => s.heading);
  const totalLines = lines.length;
  const pageLines = 55; // industry-ish lines-per-page

  let dialogueLines = 0;
  let prevWasCueOrDialogue = false;
  for (const line of lines) {
    if (isCharacterCue(line)) { prevWasCueOrDialogue = true; continue; }
    if (isSceneHeading(line)) { prevWasCueOrDialogue = false; continue; }
    if (!line || !line.trim()) { prevWasCueOrDialogue = false; continue; }
    if (isDialogueLine(line, prevWasCueOrDialogue)) {
      dialogueLines += 1;
    } else if (/^\(.*\)$/.test(line.trim())) {
      // parenthetical — keep state
    } else {
      prevWasCueOrDialogue = false;
    }
  }

  const dialogueRatio = totalLines > 0
    ? Math.round((dialogueLines / totalLines) * 1000) / 1000
    : 0;

  const sceneLineCounts = realScenes.map((s) => s.lines.length);
  const avgSceneLengthLines = sceneLineCounts.length
    ? Math.round((sceneLineCounts.reduce((a, b) => a + b, 0) / sceneLineCounts.length) * 100) / 100
    : 0;

  const longScenes = realScenes
    .map((s, idx) => ({ idx, heading: s.heading, lineCount: s.lines.length }))
    .filter((s) => s.lineCount > LONG_SCENE_LINES);
  const shortScenes = realScenes
    .map((s, idx) => ({ idx, heading: s.heading, lineCount: s.lines.length }))
    .filter((s) => s.lineCount < SHORT_SCENE_LINES);
  const peakScenes = [...realScenes]
    .map((s, idx) => ({ idx, heading: s.heading, lineCount: s.lines.length }))
    .sort((a, b) => b.lineCount - a.lineCount)
    .slice(0, 3);

  const charStats = characterStats(lines);
  const sceneAppearances = sceneAppearancesByCharacter(realScenes);
  const totalCharacterLines = charStats.reduce((a, b) => a + b.lineCount, 0);
  const characters = charStats.slice(0, CHARACTER_DISTRIBUTION_TOP).map((c) => ({
    name: c.name,
    lineCount: c.lineCount,
    sceneCount: sceneAppearances.get(c.name) || 0,
    share: totalCharacterLines > 0
      ? Math.round((c.lineCount / totalCharacterLines) * 1000) / 1000
      : 0,
  }));

  const intensity = realScenes.length === 0
    ? "low"
    : longScenes.length / Math.max(1, realScenes.length) > 0.25
      ? "high"
      : shortScenes.length / Math.max(1, realScenes.length) > 0.5
        ? "low"
        : "medium";

  const warnings = [];
  if (realScenes.length === 0) {
    warnings.push({ severity: "soft", code: "no_scenes_detected", message: "No INT./EXT. scene headings detected." });
  }
  if (longScenes.length > 0) {
    warnings.push({
      severity: longScenes.length >= 3 ? "medium" : "soft",
      code: "scene_too_long",
      message: `${longScenes.length} scene(s) exceed ${LONG_SCENE_LINES} lines; readers may skim.`,
    });
  }
  if (shortScenes.length / Math.max(1, realScenes.length) > 0.4) {
    warnings.push({
      severity: "soft",
      code: "many_micro_scenes",
      message: `${shortScenes.length} scenes are very short (<${SHORT_SCENE_LINES} lines); pacing may feel choppy.`,
    });
  }
  if (dialogueRatio < DIALOGUE_RATIO_LOW && totalLines > 60) {
    warnings.push({
      severity: "soft",
      code: "dialogue_thin",
      message: `Dialogue ratio is low (${(dialogueRatio * 100).toFixed(1)}%); the script reads action-heavy.`,
    });
  }
  if (dialogueRatio > DIALOGUE_RATIO_HIGH) {
    warnings.push({
      severity: "soft",
      code: "dialogue_heavy",
      message: `Dialogue ratio is high (${(dialogueRatio * 100).toFixed(1)}%); the script reads talky.`,
    });
  }
  if (characters.length > 0 && characters[0].share > 0.55) {
    warnings.push({
      severity: "soft",
      code: "character_dominance",
      message: `${characters[0].name} carries ${(characters[0].share * 100).toFixed(0)}% of dialogue; other voices may underdevelop.`,
    });
  }

  const summary = realScenes.length === 0
    ? "No scenes detected. Try formatting scene headings as INT./EXT."
    : warnings.length === 0
      ? `${realScenes.length} scene(s), ${(dialogueRatio * 100).toFixed(0)}% dialogue — reads balanced.`
      : `${realScenes.length} scene(s), ${warnings.length} coverage signal(s) flagged.`;

  return {
    schemaVersion: SCHEMA_VERSION,
    overview: {
      pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : Math.max(1, Math.round(totalLines / pageLines)),
      sceneCount: realScenes.length,
      dialogueRatio,
      avgSceneLengthLines,
    },
    pacing: {
      intensity,
      peakScenes,
      longScenes,
      shortScenes,
    },
    characters,
    warnings,
    frameworkId: typeof frameworkId === "string" ? frameworkId : null,
    summary,
  };
}

export {
  simulateCoverage,
  LONG_SCENE_LINES,
  SHORT_SCENE_LINES,
  DIALOGUE_RATIO_LOW,
  DIALOGUE_RATIO_HIGH,
  SCHEMA_VERSION as COVERAGE_SIMULATOR_SCHEMA_VERSION,
};
