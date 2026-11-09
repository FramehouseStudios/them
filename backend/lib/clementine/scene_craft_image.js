// Scene craft image — per-scene craft + image echo with scar (writing craft, D009)
import { buildSceneCraft } from "./scene_craft.js";
import { buildImageEcho } from "./image_echo.js";

export function buildSceneCraftImage({ sceneIndex, character, want, need, ghost, sequence, motif, scar, theme } = {}) {
  const base = buildSceneCraft({ sceneIndex, character, want, need, ghost, sequence, motif, theme });
  const img = buildImageEcho({ scene: sceneIndex, motif: motif || base.motif, scar: scar || "second hand missing" });
  return { ...base, image: img.image, imageEcho: img.image, scar: img.scar };
}

export default { buildSceneCraftImage };
