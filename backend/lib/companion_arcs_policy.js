// Companion arcs are the relationship-app layer of the prompt: social spark
// hype, hidden depth modes, seasonal waves, evolution cycles, melancholy
// seeds, time-of-day tone. They were built for a companion product and they
// crowd the 12k-character prompt budget that craft blocks need. Writing
// sessions do not get them unless CLEMENTINE_COMPANION_ARCS=1.
//
// What stays regardless: identity, human style (venting/motivation),
// therapeutic depth (real distress), knowledge, back-reference continuity,
// and the director addendum.

const ARC_ADDENDA = Object.freeze([
  "socialSparkAddendum",
  "socialSparkMemoryHookAddendum",
  "hiddenDepthModeAddendum",
  "seasonalWaveAddendum",
  "cycleEvolutionAddendum",
  "cycleConsciousMemoryAddendum",
  "characterTextureAddendum",
  "trajectoryAddendum",
  "timeOfDayToneAddendum",
  "weeklyArcAddendum",
  "weeklyExpansionAddendum",
  "movementAddendum",
  "selfAwarenessAddendum",
  "melancholySeedAddendum",
]);

function envFlagOn(value) {
  const n = String(value ?? "").trim().toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function resolveCompanionArcsPolicy(env = process.env) {
  return Object.freeze({ arcsEnabled: envFlagOn(env?.CLEMENTINE_COMPANION_ARCS) });
}

/**
 * Returns { addenda, dropped }: the addenda map with arc blocks blanked when
 * the policy disables them, plus the names of blocks that actually had text.
 * Never mutates the input.
 */
function applyCompanionArcsPolicy(addenda = {}, policy = resolveCompanionArcsPolicy()) {
  const source = addenda && typeof addenda === "object" ? addenda : {};
  if (policy?.arcsEnabled) return { addenda: { ...source }, dropped: [] };
  const next = { ...source };
  const dropped = [];
  for (const name of ARC_ADDENDA) {
    if (String(next[name] || "").trim()) dropped.push(name);
    next[name] = "";
  }
  return { addenda: next, dropped };
}

export {
  ARC_ADDENDA,
  resolveCompanionArcsPolicy,
  applyCompanionArcsPolicy,
};
