// Title + Logline live (Orbit Fake glitch, screenwriting craft, D009)
// Pure helper, no backend/index.js growth.

function trimmed(v){ return String(v||"").trim(); }

const COMPS = {
  horror: ["Hereditary", "The Babadook"],
  "sci-fi": ["Ex Machina", "Arrival"],
  thriller: ["Nightcrawler", "Prisoners"],
  drama: ["Manchester by the Sea", "Lady Bird"],
};

export function buildTitle({ setting, genre, motif } = {}) {
  const s = trimmed(setting) || "Bedroom";
  const g = trimmed(genre) || "horror";
  const m = trimmed(motif) || "listening shadow";
  // Orbit Fake: title glitches with motif
  const base = s.toUpperCase();
  const glitch = m.includes("shadow") ? " // glitch" : "";
  return `${base}${glitch} — ${g}`;
}

export function buildLogline({ characters, setting, genre, want, need, motif } = {}) {
  const chars = Array.isArray(characters) ? characters.join(" & ") : trimmed(characters) || "John & Sally";
  const s = trimmed(setting) || "bedroom";
  const g = trimmed(genre) || "horror";
  const w = trimmed(want) || "prove the room is safe";
  const n = trimmed(need) || "admit fear";
  const m = trimmed(motif) || "listening shadow";
  const comps = (COMPS[g.toLowerCase()] || COMPS.horror).join(" meets ");
  return `When ${chars} ${w} in a ${s} where ${m} remembers, they must ${n} or be remembered — a ${g} in the vein of ${comps}.`;
}

export function buildOrbitFakeTitlePage({ project, genre, setting, motif } = {}) {
  const title = buildTitle({ setting: setting || project?.setting || "bedroom", genre: genre || project?.genre || "horror", motif: motif || project?.motif || "listening shadow" });
  const logline = buildLogline({ characters: project?.characters?.map(c=>c.name) || ["John","Sally"], setting, genre, want: project?.characterContexts?.[0]?.want, need: project?.characterContexts?.[0]?.need, motif });
  return { title, logline, orbitFake: title.includes("glitch"), comps: COMPS[(genre||"horror").toLowerCase()] || COMPS.horror };
}

export default { buildTitle, buildLogline, buildOrbitFakeTitlePage };
