// Dialogue notes — status/subtext/punch-up for a line (screenwriting craft, D009)
// Pure helper, no backend/index.js growth.

function trimmed(v){ return String(v||"").trim(); }

export function rewriteLine({ line, character, note, style } = {}) {
  const text = trimmed(line);
  if (!text) return { original: "", rewritten: "", note: "" };
  const who = trimmed(character) || "CHARACTER";
  const n = trimmed(note).toLowerCase();
  const s = trimmed(style).toLowerCase();
  let rewritten = text;
  // status shifts: make subtext about power, not topic
  if (n.includes("status") || n.includes("power")) {
    // lower status: add hedge, upper: cut hedge
    if (s === "lower") rewritten = text.replace(/^(I|We)\b/, "$1 just").trim();
    if (s === "raise") rewritten = text.replace(/\bjust\b/i, "").replace(/\s{2,}/g," ").trim();
  }
  // subtext: add what line is about vs what scene is about
  if (n.includes("subtext") || n.includes("unsaid")) {
    // keep line but tag subtext
    rewritten = `${text} // subtext: wants ${who.toLowerCase()} to stay, says logistics`;
  }
  // punch-up: tighten
  if (n.includes("tighten") || n.includes("punch")) {
    rewritten = text.replace(/\b(very|really|just|quite)\b/gi,"").replace(/\s{2,}/g," ").trim();
  }
  return { original: text, rewritten: rewritten || text, note: trimmed(note), character: who, style: s || "neutral" };
}

export default { rewriteLine };
