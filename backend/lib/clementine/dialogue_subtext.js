// Dialogue subtext — status-aware subtext (writing craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildSubtext({ line, character, status } = {}) {
  const who = trimmed(character) || "John";
  const text = trimmed(line) || "Hello.";
  const s = trimmed(status).toLowerCase();
  // status: up/down/even
  let sub = "says logistics, means stay";
  if (s === "up") sub = `${who} controls, wants ${who.toLowerCase()} to prove safe`;
  if (s === "down") sub = `${who} yields, wants to be remembered`;
  if (s === "even") sub = `${who} listens, ghost bedroom memory`;
  return { line: text, character: who, status: s || "even", subtext: `${text} // subtext: ${sub}` };
}

export function analyzeStatus({ line, character } = {}) {
  const t = trimmed(line).toLowerCase();
  if (t.includes("please") || t.includes("sorry")) return "down";
  if (t.includes("we need") || t.includes("must")) return "up";
  return "even";
}

export default { buildSubtext, analyzeStatus };
