// D009 — pure derive* helpers extracted verbatim from backend/index.js.
//
// Every function here reads only its arguments (plus the helpers imported
// below): no module state, no calls back into index.js. Moved verbatim with
// its doc comment; index.js imports it by the same name, so no call site
// changed.

import { normalizeThemeLabel, normalizeThemeTone } from "./normalizers.js";
import { clampUnit } from "./utils.js";

function deriveThemeMemoryReason(label, source, emotionalTone) {
  const safeLabel = normalizeThemeLabel(label, "this thread");
  const sourceTag = String(source || "carry").trim().toLowerCase();
  if (sourceTag === "classifier") {
    return `This kept recurring around ${safeLabel.toLowerCase()}, so I kept it as an active thread.`;
  }
  if (sourceTag === "summarizer") {
    return `This pattern stayed active, so I kept a refined summary for ${safeLabel.toLowerCase()}.`;
  }
  const tone = normalizeThemeTone(emotionalTone, "");
  if (tone) {
    return `This theme stayed emotionally consistent (${tone}), so I kept it in memory.`;
  }
  return `This thread kept showing up, so I kept it in memory.`;
}

function deriveCycleMemoryMoment({ memory, seasonalWave }) {
  const seasonNumber = Math.max(
    1,
    Math.min(4, Number(seasonalWave?.seasonNumber ?? memory?.season ?? 1))
  );
  const seasonProgress = clampUnit(
    seasonalWave?.seasonProgress ?? memory?.seasonProgress,
    0
  );
  const cycleIndex = Math.max(
    0,
    Number((seasonalWave?.cycleIndex ?? memory?.cycleIndex) || 0)
  );
  const seasonJustAdvanced = Boolean(memory?.seasonJustAdvanced || seasonalWave?.seasonJustAdvanced);
  const cycleJustAdvanced = Boolean(memory?.cycleJustAdvanced || seasonalWave?.cycleJustAdvanced);

  if (cycleJustAdvanced) return "cycle_restart";
  if (seasonJustAdvanced) return "season_transition";
  if (seasonNumber === 1 && cycleIndex > 0 && seasonProgress <= 0.28) return "reconnection_window";
  if (seasonNumber === 4 && seasonProgress >= 0.70) return "release_window";
  return "ambient";
}

function deriveMilestoneStage(value, week2, week3, week4) {
  const v = Math.max(0, Number(value || 0));
  if (v >= week4) return 4;
  if (v >= week3) return 3;
  if (v >= week2) return 2;
  return 1;
}

export {
  deriveCycleMemoryMoment,
  deriveMilestoneStage,
  deriveThemeMemoryReason,
};
