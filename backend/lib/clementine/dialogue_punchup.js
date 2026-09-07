// Dialogue punch-up — per-character voice lexicon + status (screenwriting craft, D009)
import { buildCharacterVoice } from "./character_voice.js";
import { rewriteLine } from "./dialogue_notes.js";

function trimmed(v){ return String(v||"").trim(); }

export function punchUpDialogue({ line, character, note } = {}) {
  const voice = buildCharacterVoice({ character });
  const base = rewriteLine({ line, character, note: note || "punch-up tighten" });
  // inject lexicon word if not present
  const lex = voice.lexicon[0] || "";
  let rewritten = base.rewritten;
  if (lex && !rewritten.toLowerCase().includes(lex.toLowerCase())) {
    rewritten = `${rewritten} ${lex}`.trim();
  }
  // cadence hint
  if (voice.cadence.includes("short")) rewritten = rewritten.replace(/,\s*/g, ". ").trim();
  return { original: base.original, rewritten, character: voice.character, cadence: voice.cadence, note: base.note };
}

export default { punchUpDialogue };
