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

const SAVE_THE_CAT_40 = Object.freeze([
  "Opening Image","Theme Stated","Set-Up","Catalyst","Debate","Break into Two","B Story","Fun and Games","Midpoint","Bad Guys Close In","All Is Lost","Dark Night of the Soul","Finale","Final Image",
  "Opening Image echo","Theme reprise","Set-Up payoff","Catalyst echo","Debate resolved","B Story payoff","Fun and Games turn","Midpoint false win/loss","Break into Three","Gathering the Team","Executing the Plan","High Tower Surprise","Dig Deep Down","Finale execution","Final Image scar","Opening Image tag","Theme lived","Set-Up closure","Catalyst answer","Debate answer","B Story closure","Fun and Games cost","Midpoint truth","Bad Guys final","All Is Lost choice","Resurrection"
].slice(0,40));

export function getFeatureBeats({ genre, tone, mood, totalPages = 90, influences } = {}) {
  const tp = clampTotalPages(totalPages);
  const base = getThreeActBeats({ genre, tone, mood, influences });
  const act1Pages = Math.round(tp * 0.25);
  const act2Pages = Math.round(tp * 0.5);
  const act3Pages = tp - act1Pages - act2Pages;
  const acts = [
    { ...base.acts[0], pages: act1Pages },
    { ...base.acts[1], pages: act2Pages },
    { ...base.acts[2], pages: act3Pages },
  ];
  // For true 90p, emit 40-beat Save-The-Cat scaffold; 15p stays base beats
  const beat40 = tp >= 60 ? SAVE_THE_CAT_40.map((title, i) => ({ title, beat: i+1, page: Math.round(((i+1)/40)*tp) || 1 })) : null;
  return {
    ...base,
    totalPages: tp,
    acts,
    beats40: beat40,
    beatCount: beat40 ? 40 : base.acts.flatMap(a=>a.beats).length,
  };
}

export { clampTotalPages };
