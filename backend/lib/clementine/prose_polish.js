// Prose polish — action lines show, not tell, image echo (writing craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function polishActionLine({ line, motif, imageEcho } = {}) {
  let text = trimmed(line);
  if (!text) return { original: "", polished: "" };
  const before = text;
  // cut filter "we see" "we hear"
  text = text.replace(/\bwe (see|hear|watch|notice)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  // show not tell: "is scared" -> "grip tightens"
  text = text.replace(/\bis (scared|afraid|nervous)\b/gi, "grip tightens");
  // add image echo if motif present and line thin
  if (motif && text.length < 80) {
    const m = trimmed(motif);
    const echo = trimmed(imageEcho) || `${m} with stain`;
    if (!text.toLowerCase().includes(m.toLowerCase())) text = `${text} — ${echo}`;
  }
  // caps first letter
  if (text) text = text.charAt(0).toUpperCase() + text.slice(1);
  return { original: before, polished: text || before, motif: trimmed(motif) };
}

export default { polishActionLine };
