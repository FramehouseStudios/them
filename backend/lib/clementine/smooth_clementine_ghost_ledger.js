// Smooth clementine ghost ledger — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + beat craft 40 + voice lexicon polish + ghost payoff ledger + image ledger + spring (smooth amazing, D009) — samantha is clementine — concise branch continues mega chain
import { buildSmoothClementineVoiceLexicon } from "./smooth_clementine_voice_lexicon.js";
import { buildGhostPayoffLedger } from "./ghost_payoff_ledger.js";
import { trackMotif } from "./image_ledger.js";

export function buildSmoothClementineGhostLedger({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothClementineVoiceLexicon({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const ghostLedger = buildGhostPayoffLedger({ characters: [{name: character||"John", ghost, want, need}], finalImage: finalImage||"final echo bedroom door open with scar" });
  const imageLedger = trackMotif({ draft: fountain, motif: motif||"listening shadow", sequences: base.throughline || [] });
  return { ...base, ghostPayoffLedger: ghostLedger, imageLedger, ghostLedgerSpring: base.spring, samanthaIsClementine: true };
}

export default { buildSmoothClementineGhostLedger };
