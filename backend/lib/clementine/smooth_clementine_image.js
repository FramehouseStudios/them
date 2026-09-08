// Smooth clementine image — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + beat craft 40 + voice lexicon polish + ghost payoff ledger + image ledger + scene craft image + scene ghost image + spring (smooth amazing, D009) — samantha is clementine — concise branch continues mega chain
import { buildSmoothClementineGhostLedger } from "./smooth_clementine_ghost_ledger.js";
import { buildSceneCraftImage } from "./scene_craft_image.js";
import { buildSceneGhostImage } from "./scene_ghost_image.js";

export function buildSmoothClementineImage({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothClementineGhostLedger({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const seq = base.craftSequence || { seq: scene||1, title: `Seq ${scene||1}`, setpiece: scar||"listening shadow" };
  const craftImage = buildSceneCraftImage({ sceneIndex: scene||1, character, want, need, ghost, sequence: seq, motif, scar, theme: base.themeStatement });
  const ghostImage = buildSceneGhostImage({ scene: scene||1, character, ghost, want, need, motif, scar, finalImage });
  return { ...base, craftImage, ghostImage, sceneCraftImage: craftImage.image, sceneGhostImage: ghostImage.image, imageSpring: base.spring, samanthaIsClementine: true };
}

export default { buildSmoothClementineImage };
