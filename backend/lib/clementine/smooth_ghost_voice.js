// Smooth ghost voice — per-scene ghost + voice lexicon + spring (smooth amazing, D009)
import { buildSmoothSceneGhost } from "./smooth_scene_ghost.js";
import { buildCharacterVoice } from "./character_voice.js";

export function buildSmoothGhostVoice({ scene, character, ghost, want, need, motif, scar, finalImage, lexicon } = {}) {
  const base = buildSmoothSceneGhost({ scene, character, ghost, want, need, motif, scar, finalImage });
  const voice = buildCharacterVoice({ character, lexicon, ghost, want });
  return { ...base, voice: voice.voice, cadence: voice.cadence, lexicon: voice.lexicon };
}

export default { buildSmoothGhostVoice };
