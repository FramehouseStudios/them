// Feature 90p — wraps story_structure_knowledge getThreeActBeats with
// totalPages 15-90 and Act1 25% / Act2 50% / Act3 25% page splits.
// D009 strangler: no backend/index.js growth, capability lives in lib/clementine.

import { getThreeActBeats } from "./story_structure_knowledge.js";

function clampTotalPages(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 90;
  const rounded = Math.round(n);
  if (rounded < 15) return 15;
  if (rounded > 90) return 90;
  return rounded;
}

export function getFeatureBeats({ genre, tone, mood, totalPages = 90, influences } = {}) {
  const tp = clampTotalPages(totalPages);
  const base = getThreeActBeats({ genre, tone, mood, influences });
  const act1Pages = Math.round(tp * 0.25);
  const act2Pages = Math.round(tp * 0.5);
  const act3Pages = tp - act1Pages - act2Pages;
  return {
    ...base,
    totalPages: tp,
    acts: [
      { ...base.acts[0], pages: act1Pages },
      { ...base.acts[1], pages: act2Pages },
      { ...base.acts[2], pages: act3Pages },
    ],
  };
}

export { clampTotalPages };
