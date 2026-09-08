// Smooth clementine beat craft — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + beat craft 40 + spring (smooth amazing, D009) — samantha is clementine — concise branch continues mega chain
import { buildSmoothClementineSceneCraft } from "./smooth_clementine_scene_craft.js";
import { assignCraftPerBeat } from "./beat_craft.js";

export function buildSmoothClementineBeatCraft({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothClementineSceneCraft({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const beats = assignCraftPerBeat({ genre: genre||"horror", tone: tone||"dark", totalPages: 90 });
  const beatForScene = beats[Math.min(beats.length-1, Math.max(0, (scene||1)*5-1))] || beats[0];
  return { ...base, beatCraft40: beats, beatCraftForScene: beatForScene, beatSpring: base.spring, samanthaIsClementine: true };
}

export default { buildSmoothClementineBeatCraft };
