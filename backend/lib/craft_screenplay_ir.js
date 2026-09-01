// Deterministic screenplay-to-scene intermediate representation.
//
// This module establishes coordinates only. It deliberately does not infer
// story semantics from page position; classifiers and explicit writer
// overrides are the only sources that may mark a craft beat present.

import { isSceneHeading, normalizeFountainText } from "./fountain_import.js";

const DEFAULT_LINES_PER_PAGE = 55;

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function estimatedPage(lineNumber, linesPerPage) {
  return Math.max(1, Math.floor((Math.max(1, lineNumber) - 1) / linesPerPage) + 1);
}

function excerptText(text, limit = 320) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function scenesFromText(text, linesPerPage) {
  const normalized = normalizeFountainText(text);
  if (!normalized.trim()) return [];

  const lines = normalized.split("\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (isSceneHeading(lines[index])) starts.push(index);
  }

  // A valid draft without sluglines is still analyzable as one scene-sized
  // unit. Its absence must not be mistaken for evidence of a structural beat.
  if (starts.length === 0) starts.push(0);

  return starts.map((startIndex, sceneIndex) => {
    const nextStart = starts[sceneIndex + 1] ?? lines.length;
    let endIndex = nextStart - 1;
    while (endIndex > startIndex && !String(lines[endIndex] || "").trim()) endIndex -= 1;
    const sceneText = lines.slice(startIndex, endIndex + 1).join("\n").trim();
    const rawTitle = String(lines[startIndex] || "").trim();
    const title = isSceneHeading(rawTitle) ? rawTitle.replace(/^\./, "").trim() : `Scene ${sceneIndex + 1}`;
    const lineStart = startIndex + 1;
    const lineEnd = Math.max(lineStart, endIndex + 1);
    return {
      id: `scene-${String(sceneIndex + 1).padStart(4, "0")}`,
      title,
      text: sceneText,
      lineStart,
      lineEnd,
      pageStart: estimatedPage(lineStart, linesPerPage),
      pageEnd: estimatedPage(lineEnd, linesPerPage),
      pageBasis: "estimated-from-lines",
    };
  }).filter((scene) => Boolean(scene.text));
}

function scenesFromStructuredInput(scenes, linesPerPage) {
  if (!Array.isArray(scenes)) return [];
  let nextEstimatedLine = 1;
  return scenes.flatMap((rawScene, index) => {
    if (!rawScene || typeof rawScene !== "object") return [];
    const text = normalizeFountainText(rawScene.text || "").trim();
    const title = String(rawScene.title || rawScene.heading || `Scene ${index + 1}`).trim();
    if (!text && !title) return [];

    const lineCount = Math.max(1, text ? text.split("\n").length : 1);
    const lineStart = positiveInteger(rawScene.lineStart) || nextEstimatedLine;
    const lineEnd = positiveInteger(rawScene.lineEnd) || lineStart + lineCount - 1;
    nextEstimatedLine = Math.max(nextEstimatedLine, lineEnd + 1);

    const explicitPageStart = positiveInteger(rawScene.pageStart);
    const explicitPageEnd = positiveInteger(rawScene.pageEnd);
    const pageStart = explicitPageStart || estimatedPage(lineStart, linesPerPage);
    const pageEnd = Math.max(pageStart, explicitPageEnd || estimatedPage(lineEnd, linesPerPage));

    return [{
      id: String(rawScene.id || `scene-${String(index + 1).padStart(4, "0")}`),
      title: title || `Scene ${index + 1}`,
      text: text || title,
      lineStart,
      lineEnd: Math.max(lineStart, lineEnd),
      pageStart,
      pageEnd,
      pageBasis: explicitPageStart || explicitPageEnd ? "screenplay-metadata" : "estimated-from-lines",
    }];
  });
}

function parseScreenplayToScenes(screenplay = {}, { linesPerPage = DEFAULT_LINES_PER_PAGE } = {}) {
  const safeLinesPerPage = positiveInteger(linesPerPage) || DEFAULT_LINES_PER_PAGE;
  // The full Fountain draft is canonical when both representations are sent;
  // Studio's outline scene array may omit bodies and page coordinates.
  const text = typeof screenplay?.text === "string" ? screenplay.text : "";
  if (text.trim()) return scenesFromText(text, safeLinesPerPage);
  return scenesFromStructuredInput(screenplay?.scenes, safeLinesPerPage);
}

export {
  DEFAULT_LINES_PER_PAGE,
  excerptText,
  parseScreenplayToScenes,
};
