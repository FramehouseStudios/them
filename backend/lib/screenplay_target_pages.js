// The length a writer set for a script (Studio Settings -> Target length).
// The app's ScreenplayTargetLength keeps the same 5...180 range; anything
// else is "not set" (0), and the planner falls back to a feature length.
export const SCREENPLAY_TARGET_PAGES_MIN = 5;
export const SCREENPLAY_TARGET_PAGES_MAX = 180;

export function normalizeScreenplayTargetPages(value) {
  const pages = Math.round(Number(value));
  if (!Number.isFinite(pages)) return 0;
  return pages >= SCREENPLAY_TARGET_PAGES_MIN && pages <= SCREENPLAY_TARGET_PAGES_MAX ? pages : 0;
}
