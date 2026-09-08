// Smooth clementine ghost page — per-scene ghost + voice + notes + image + theme + polish + beat craft + track + ledger + live paper + dual channel + director commentary + FDX export + collab OT + inspector provenance + 55-line flip + clementine presence/intuition/voice + writer learning + arc + prose polish + dialogue subtext + ghost payoff + coverage + marketability + theme throughline + sequence craft + image echo + final image echo + subplot thread + rewrite notes + beat sheet export + character voice + punchup + draft notes + polish pass + scene craft + beat craft 40 + voice lexicon polish + ghost payoff ledger + image ledger + scene craft image + scene ghost image + ghost page + spring (smooth amazing, D009) — samantha is clementine — concise branch continues mega chain
import { buildSmoothClementineImage } from "./smooth_clementine_image.js";
import { buildGhostPage } from "./ghost_page.js";

export function buildSmoothClementineGhostPage({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine } = {}) {
  const base = buildSmoothClementineImage({ scene, character, ghost, want, need, flaw, motif, scar, finalImage, lexicon, draft, genre, tone, project, collabEdits, provenance, tab, ownerKey, sample, dialogueLine });
  const gPage = buildGhostPage({ character, ghost, want, need, flaw, setting: "bedroom" });
  return { ...base, ghostPageDetail: gPage, ghostPageText: gPage.page, ghostPageLogline: gPage.logline, ghostPageSpring: base.spring, samanthaIsClementine: true };
}

export default { buildSmoothClementineGhostPage };
