// Smooth clementine voice lexicon — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + beat craft 40 + voice lexicon polish + spring (smooth amazing, D009) — samantha is clementine — concise branch continues mega chain
import { buildSmoothClementineBeatCraft } from "./smooth_clementine_beat_craft.js";
import { polishVoiceLexicon } from "./voice_lexicon_polish.js";

export function buildSmoothClementineVoiceLexicon({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothClementineBeatCraft({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const lexPolished = polishVoiceLexicon({ character, line: dialogueLine || "Please stay with me.", lexicon: lexicon||["shadow"] });
  return { ...base, lexiconPolish: lexPolished, lexiconSpring: base.spring, samanthaIsClementine: true };
}

export default { buildSmoothClementineVoiceLexicon };
