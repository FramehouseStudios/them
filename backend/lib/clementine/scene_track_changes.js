// Scene track changes — per-scene rewrite history (writing partner, D009)
import { recordChange, getChanges } from "./track_changes.js";

function trimmed(v){ return String(v||"").trim(); }

export function recordSceneChange({ scene, line, from, to } = {}) {
  const key = `scene-${Math.max(1, Number(scene)||1)}`;
  return recordChange({ key, line, from, to });
}

export function getSceneChanges({ scene } = {}) {
  const key = `scene-${Math.max(1, Number(scene)||1)}`;
  return getChanges({ key });
}

export function summarizeSceneChanges({ scene } = {}) {
  const changes = getSceneChanges({ scene });
  const count = changes.length;
  const last = changes[changes.length-1];
  return { scene: Number(scene)||1, count, last, summary: count ? `Scene ${scene}: ${count} changes, last line ${last.line} ${last.from}→${last.to}` : `Scene ${scene}: no changes` };
}

export default { recordSceneChange, getSceneChanges, summarizeSceneChanges };
