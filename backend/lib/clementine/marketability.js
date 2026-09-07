// Marketability comps — commercial appeal, comps, audience (screenwriting craft, D009)
function trimmed(v){ return String(v||"").trim(); }

const MARKET = {
  horror: { audience: "A24 horror audience", appeal: "high concept single location", comps: ["Hereditary","The Babadook"], budget: "micro" },
  "sci-fi": { audience: "festival sci-fi", appeal: "high concept low VFX", comps: ["Ex Machina","Coherence"], budget: "low" },
  thriller: { audience: "prestige thriller", appeal: "contained tension", comps: ["Prisoners","Nightcrawler"], budget: "mid" },
  drama: { audience: "indie drama", appeal: "character trio", comps: ["Lady Bird","Manchester by the Sea"], budget: "micro" },
};

export function buildMarketability({ genre, setting, characters } = {}) {
  const g = trimmed(genre).toLowerCase() || "horror";
  const m = MARKET[g] || MARKET.horror;
  const chars = Array.isArray(characters) ? characters.join(" & ") : trimmed(characters) || "John & Sally";
  const s = trimmed(setting) || "bedroom";
  return {
    genre: g,
    comps: [...m.comps],
    audience: m.audience,
    appeal: m.appeal,
    budget: m.budget,
    logline: `A ${g} for ${m.audience}: ${chars} in a ${s} — ${m.appeal}, in the vein of ${m.comps.join(" meets ")}`,
  };
}

export default { buildMarketability };
