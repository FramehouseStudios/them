// Smooth clementine polish — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + spring (smooth amazing, D009) — samantha is clementine — concise branch continues mega chain
import { buildSmoothClementineDraftNotes } from "./smooth_clementine_draft_notes.js";
import { polishDraft } from "./polish_pass.js";

export function buildSmoothClementinePolish({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothClementineDraftNotes({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const fountain = base.polishedDraft || draft || base.payoff || "";
  const seqs = base.throughline || [];
  const polished = polishDraft({ draft: fountain, sequences: seqs });
  return { ...base, polishPass: polished, polishDraft: polished.draft, polishChanges: polished.changes, polishSpring: base.spring, samanthaIsClementine: true };
}

export default { buildSmoothClementinePolish };
