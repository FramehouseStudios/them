// Ghost payoff ledger — per-character ghost payoff per sequence (writing craft, D009)
import { buildGhostPayoff } from "./ghost_payoff.js";

function trimmed(v){ return String(v||"").trim(); }

export function buildGhostPayoffLedger({ characters, finalImage } = {}) {
  const arr = Array.isArray(characters) ? characters : [];
  return arr.map(c=> buildGhostPayoff({ character: c.name || c.character, ghost: c.ghost, want: c.want, need: c.need, finalImage }));
}

export function flagUnpaidGhostLedger({ ledger } = {}) {
  const arr = Array.isArray(ledger) ? ledger : [];
  return arr.filter(l=> !l.paid || !l.payoff.includes(l.ghost.slice(0,10))).map(l=> `Ghost not paid for ${l.character}`);
}

export default { buildGhostPayoffLedger, flagUnpaidGhostLedger };
