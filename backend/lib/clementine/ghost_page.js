// Ghost page — character ghost backstory page (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

export function buildGhostPage({ character, ghost, want, need, flaw, setting } = {}) {
  const who = trimmed(character) || "JOHN";
  const g = trimmed(ghost) || `${who}'s ghost: bedroom memory age 14`;
  const w = trimmed(want) || "prove safe";
  const n = trimmed(need) || "admit fear";
  const f = trimmed(flaw) || "control";
  const s = trimmed(setting) || "bedroom";
  const page = [
    `INT. ${s.toUpperCase()} - GHOST PAGE - ${who}`,
    ``,
    `${who}'s ghost: ${g}`,
    ``,
    `Want: ${w} — obstacle is ${f}`,
    `Need: ${n} — cost is being remembered`,
    ``,
    `Image: ${s} holds the scar — same room, light changed`,
  ].join("\n");
  return { character: who, ghost: g, want: w, need: n, flaw: f, setting: s, page, logline: `${who} ghost ${g.slice(0,60)}` };
}

export default { buildGhostPage };
