// Character voice — per-character lexicon + cadence (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

const CADENCE = {
  John: "short, control",
  Sally: "lyrical, attachment",
  Sam: "quiet, listening",
};

export function buildCharacterVoice({ character, lexicon, ghost, want } = {}) {
  const who = trimmed(character) || "John";
  const cad = CADENCE[who] || "naturalistic";
  const lex = Array.isArray(lexicon) ? lexicon.slice(0,5) : [];
  const g = trimmed(ghost) || "bedroom memory";
  const w = trimmed(want) || "prove safe";
  return { character: who, cadence: cad, lexicon: lex, ghost: g, want: w, voice: `${who} ${cad} wants ${w} ghost ${g.slice(0,30)}` };
}

export default { buildCharacterVoice };
