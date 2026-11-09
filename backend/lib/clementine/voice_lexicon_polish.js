// Voice lexicon polish — per-character lexicon cadence polish (writing craft, D009)
import { buildCharacterVoice } from "./character_voice.js";

function trimmed(v){ return String(v||"").trim(); }

export function polishVoiceLexicon({ character, line, lexicon } = {}) {
  const voice = buildCharacterVoice({ character, lexicon });
  let text = trimmed(line) || "Hello.";
  // inject lexicon word if missing
  const lex = voice.lexicon[0] || (Array.isArray(lexicon) ? lexicon[0] : "");
  if (lex && !text.toLowerCase().includes(lex.toLowerCase())) {
    text = `${text} ${lex}`.trim();
  }
  // cadence polish: John short -> cut hedge, Sally lyrical -> add pause
  if (voice.cadence.includes("short")) text = text.replace(/\b(just|very)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  if (voice.cadence.includes("lyrical")) text = text.replace(/\. /g, " — ").trim();
  return { character: voice.character, cadence: voice.cadence, lexicon: voice.lexicon, polished: text };
}

export default { polishVoiceLexicon };
