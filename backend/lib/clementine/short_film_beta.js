// Short-film beta flag (M1 beta — voice → 5 of 15 horror bedroom).
// Flag-gated like page_multipass.js. Default OFF so V1 stays safe.

const FLAG_SHORT_FILM_BETA = "CLEMENTINE_SHORT_FILM_BETA";

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function envFlagTruthy(value) {
  const n = trimToString(value).toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}

function isShortFilmBetaEnabled(env = process.env) {
  return envFlagTruthy(env?.[FLAG_SHORT_FILM_BETA]);
}

/**
 * True when this talk request should run the short-film beta lane.
 * Requires flag + Page lane (or explicit shortFilmBeta on clementine).
 */
function shouldRunShortFilmBeta(req, env = process.env) {
  if (!isShortFilmBetaEnabled(env)) return false;
  const c = req?.clementine;
  if (!c) return false;
  if (c.shortFilmBeta === false) return false;
  if (c.shortFilmBeta === true) return true;
  const lane = trimToString(c.lane);
  // Allow both explicit beta intent and generic Page lane — parser decides.
  return lane === "Page" || lane.toLowerCase() === "page" || lane === "SHORT_FILM_BETA" || lane.toLowerCase() === "short_film_beta";
}

export {
  FLAG_SHORT_FILM_BETA,
  envFlagTruthy,
  isShortFilmBetaEnabled,
  shouldRunShortFilmBeta,
};
