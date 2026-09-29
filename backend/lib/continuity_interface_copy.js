// Older app builds sent Feature Compass interface text as the story's "last
// scene outcome" ("Write or accept a page batch and it will stay reviewable
// here.", "Latest: L45-L49, 5 lines · ABCD1234"). It was saved to memory and
// read back on Home as if it were story. The app no longer sends it; this
// drops what is already stored.

const INTERFACE_COPY = [
  /^write or accept a page batch and it will stay reviewable here\.?$/i,
  /^open the thread to review accepted page writes\.?$/i,
  /^latest: l\d+-l\d+, \d+ lines?( · [a-z0-9]+)?$/i,
  // Feature Compass placeholder when no next scene was known, saved as the
  // scene summary / next plan: "the next scene: DINER",
  // "Next scene: the next scene. DINER", "Write the next scene: DINER".
  /^the next scene(:.*)?$/i,
  /^next scene: the next scene\b/i,
  /^write the next scene\b/i,
];

function withoutInterfaceCopy(value) {
  const text = String(value || "").trim();
  return INTERFACE_COPY.some((pattern) => pattern.test(text)) ? "" : text;
}

// "Act I" + "Act I - Opening Image (p1-p12)" reads "Act I / Act I - …".
function continuityPosition(act, featureSequence) {
  const actText = String(act || "").trim();
  const sequence = String(featureSequence || "").trim();
  const repeatsAct = actText && sequence.toLowerCase().startsWith(`${actText.toLowerCase()} `);
  return [repeatsAct ? "" : actText, sequence].filter(Boolean).join(" / ");
}

export { continuityPosition, withoutInterfaceCopy };
