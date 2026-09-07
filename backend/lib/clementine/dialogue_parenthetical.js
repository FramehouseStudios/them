// Dialogue parenthetical — status-aware parenthetical (writing craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildParenthetical({ line, character, status } = {}) {
  const who = trimmed(character) || "John";
  const s = trimmed(status).toLowerCase();
  const text = trimmed(line) || "Hello.";
  let paren = "";
  if (s === "up") paren = "(controlling)";
  if (s === "down") paren = "(yielding)";
  if (s === "even") paren = "(listening)";
  if (!paren) paren = "(beat)";
  return { character: who, line: text, status: s || "even", parenthetical: paren, formatted: `${who}\n${paren}\n${text}` };
}

export default { buildParenthetical };
