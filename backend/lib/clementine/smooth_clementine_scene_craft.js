// Smooth clementine scene craft — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + spring (smooth amazing, D009) — samantha is clementine — concise branch continues mega chain
import { buildSmoothClementinePolish } from "./smooth_clementine_polish.js";
import { buildSceneCraft } from "./scene_craft.js";

export function buildSmoothClementineSceneCraft({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothClementinePolish({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const seq = base.craftSequence || { seq: scene||1, title: `Seq ${scene||1}`, setpiece: scar||"listening shadow" };
  const sceneCraft = buildSceneCraft({ sceneIndex: scene||1, totalScenes: 8, character, want, need, ghost, sequence: seq, motif, theme: base.themeStatement||want });
  return { ...base, sceneCraft, sceneObstacle: sceneCraft.obstacle, sceneCost: sceneCraft.cost, sceneImageEcho: sceneCraft.imageEcho, sceneSpring: base.spring, samanthaIsClementine: true };
}

export default { buildSmoothClementineSceneCraft };
