// Scene beat craft — per-scene beat craft assignment (writing craft, D009)
import { assignCraftPerBeat } from "./beat_craft.js";

export function buildSceneBeatCraft({ sceneIndex, genre, tone } = {}) {
  const beats = assignCraftPerBeat({ genre, tone });
  const s = Math.max(1, Number(sceneIndex)||1);
  // 5 beats per scene
  const start = (s-1)*5;
  return beats.slice(start, start+5).map(b=> ({ ...b, scene: s }));
}

export default { buildSceneBeatCraft };
