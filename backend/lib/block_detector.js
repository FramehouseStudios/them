// T-block-detector — Craft Intelligence Suite, Layer 2.
//
// Detects writer's-block patterns from existing creative-memory
// signals plus four additive `habits` fields. Pure analysis: takes a
// snapshot of `habits` and the current time, returns a structured
// signal. No I/O, no persistence — the route layer is responsible for
// reading `habits` and serializing the result.
//
// Public surface:
//
//   computeBlockSignal({ habits, nowMs }) -> {
//     schemaVersion, score, level, signals, summary,
//     habitsObserved   // echo of the inputs the score was built from
//   }
//
// The four signals that contribute to the score:
//
//   1. Long gap since the last scene completion (or attempt, if no
//      completion has been recorded). A user who is writing daily
//      scores 0; a user who hasn't completed a scene in 14+ days
//      scores 1.
//   2. Attempt/completion drop-off. `scenes_completed / scenes_attempted`
//      below 0.3 indicates the user is starting scenes they don't
//      finish — a classic block pattern.
//   3. Short-turn ratio. `recent_short_turns / 8` (capped). A
//      user whose recent /talk turns are stubs ("...", "uh", "next")
//      is signalling stuck-ness.
//   4. Talk-turn gap. Hours since the last /talk turn. Mostly a tie-
//      breaker — long enough gaps already show up in (1).
//
// Each contributes a 0..1 normalized component; the composite score
// is the weighted mean. The level is bucketed; the summary explains
// the dominant signal so the iOS surface can echo it back to the
// user without phrasing it themselves.

const SCHEMA_VERSION = 1;

const SIGNAL_WEIGHTS = Object.freeze({
  scene_completion_gap: 0.4,
  attempt_completion_dropoff: 0.3,
  short_turn_ratio: 0.2,
  talk_turn_gap: 0.1,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Block-level thresholds. Scores below LOW_MAX are reported with
// level=low (no nudge); MEDIUM and HIGH escalate the iOS nudge tone.
const LEVEL_LOW_MAX = 0.25;
const LEVEL_MEDIUM_MAX = 0.55;

const MIN_ATTEMPTS_FOR_DROPOFF = 3;
const SHORT_TURN_WINDOW = 8;

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function dayGapScore(gapMs) {
  if (!Number.isFinite(gapMs) || gapMs <= 0) return 0;
  // 0 days → 0; 14+ days → 1; linear in between.
  return clamp01(gapMs / (14 * DAY_MS));
}

function hourGapScore(gapMs) {
  if (!Number.isFinite(gapMs) || gapMs <= 0) return 0;
  // 0h → 0; 72h+ → 1; linear in between.
  return clamp01(gapMs / (72 * HOUR_MS));
}

function dropoffScore({ attempted, completed }) {
  const a = Number(attempted);
  const c = Number(completed);
  if (!Number.isFinite(a) || a < MIN_ATTEMPTS_FOR_DROPOFF) return 0;
  if (!Number.isFinite(c) || c < 0) return 1;
  const rate = Math.max(0, Math.min(1, c / a));
  // 0.0 completion → 1; 0.3 → ~1; 0.7 → 0; >0.7 → 0.
  if (rate >= 0.7) return 0;
  if (rate <= 0.3) return 1;
  // Linear interpolation between 0.3 and 0.7.
  return clamp01((0.7 - rate) / 0.4);
}

function shortTurnScore(recentShortTurns) {
  const n = Number(recentShortTurns);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return clamp01(n / SHORT_TURN_WINDOW);
}

function bucketLevel(score) {
  if (score < LEVEL_LOW_MAX) return "low";
  if (score < LEVEL_MEDIUM_MAX) return "medium";
  return "high";
}

function summarizeSignal(dominant, level) {
  if (level === "low") {
    return "No block signal — keep going.";
  }
  switch (dominant) {
    case "scene_completion_gap":
      return level === "high"
        ? "It's been a while since you finished a scene. Try a low-stakes warm-up."
        : "You haven't shipped a scene in a few days — a short scene can break the spell.";
    case "attempt_completion_dropoff":
      return level === "high"
        ? "You're starting scenes but not finishing them. Try a one-page scene with a clear button."
        : "Recent scenes are stalling before the finish — try writing the last line first.";
    case "short_turn_ratio":
      return level === "high"
        ? "Recent prompts have been very short. Try describing one image you can't shake."
        : "Your prompts have gotten clipped — try a longer beat description.";
    case "talk_turn_gap":
      return "Welcome back. Pick up with the last scene that felt alive.";
    default:
      return "Block signal detected — try a small concrete prompt.";
  }
}

function computeBlockSignal({ habits = {}, nowMs = Date.now() } = {}) {
  const now = Number(nowMs) || Date.now();
  const h = habits || {};

  // Anchor the "last activity" off the most recent of completion or attempt.
  const lastCompletionAt = Number(h.last_scene_completion_at) || null;
  const lastAttemptAt = Number(h.last_scene_attempt_at) || null;
  const sceneAnchor = lastCompletionAt && lastAttemptAt
    ? Math.max(lastCompletionAt, lastAttemptAt)
    : (lastCompletionAt || lastAttemptAt || null);
  const lastTalkTurnAt = Number(h.last_talk_turn_at) || null;

  const components = {
    scene_completion_gap: sceneAnchor
      ? dayGapScore(now - sceneAnchor)
      : 0,
    attempt_completion_dropoff: dropoffScore({
      attempted: h._scenes_attempted,
      completed: h._scenes_completed,
    }),
    short_turn_ratio: shortTurnScore(h.recent_short_turns),
    talk_turn_gap: lastTalkTurnAt ? hourGapScore(now - lastTalkTurnAt) : 0,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [k, v] of Object.entries(components)) {
    weightedSum += SIGNAL_WEIGHTS[k] * v;
    totalWeight += SIGNAL_WEIGHTS[k];
  }
  const score = totalWeight > 0 ? clamp01(weightedSum / totalWeight) : 0;
  const level = bucketLevel(score);

  // Identify the strongest signal (after weighting) for the summary.
  let dominantKey = "scene_completion_gap";
  let dominantValue = -1;
  for (const [k, v] of Object.entries(components)) {
    const weighted = SIGNAL_WEIGHTS[k] * v;
    if (weighted > dominantValue) {
      dominantValue = weighted;
      dominantKey = k;
    }
  }

  const signals = Object.entries(components)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      key,
      value: round3(value),
      weight: SIGNAL_WEIGHTS[key],
    }))
    .sort((a, b) => b.value * b.weight - a.value * a.weight);

  return {
    schemaVersion: SCHEMA_VERSION,
    score: round3(score),
    level,
    signals,
    summary: summarizeSignal(dominantKey, level),
    habitsObserved: {
      last_scene_attempt_at: lastAttemptAt,
      last_scene_completion_at: lastCompletionAt,
      last_talk_turn_at: lastTalkTurnAt,
      scenes_attempted: Number(h._scenes_attempted) || 0,
      scenes_completed: Number(h._scenes_completed) || 0,
      recent_short_turns: Number(h.recent_short_turns) || 0,
    },
  };
}

// T-block-signal-system-prompt: produce a compact coaching block the
// prompt-assembly path can inject into the system prompt when a
// writer's block signal warrants it. Returns "" for `low` so the
// happy-case prompt is unchanged. `medium` and `high` produce
// progressively firmer coaching tones.
function buildBlockCoachingBlockForPrompt(signal) {
  if (!signal || typeof signal !== "object") return "";
  const level = signal.level;
  if (level !== "medium" && level !== "high") return "";
  const summary = typeof signal.summary === "string" && signal.summary
    ? signal.summary
    : "Writer may be stuck.";
  if (level === "high") {
    return [
      "writer-coaching-note:",
      `  observation: ${summary}`,
      "  tone: warmer, shorter sentences, lower-stakes prompts",
      "  ask: invite ONE concrete image or beat — do not ask for a finished scene",
      "story-rescue-protocol:",
      "  diagnose: find the immediate craft blockage: unclear want, passive protagonist, weak obstacle, repeated tactic, missing consequence, act-pressure drift, or no exit turn",
      "  engines: choose one pressure engine: reversal, revelation, deadline, impossible choice, secret exposure, relationship cost, antagonist move, object payoff, ironic complication, or image transformation",
      "  delivery: offer the strongest next beat first; if context exists, draft a tiny playable Fountain sample instead of advice alone",
    ].join("\n");
  }
  // medium
  return [
    "writer-coaching-note:",
    `  observation: ${summary}`,
    "  tone: gentle, encouraging",
    "  ask: a small concrete prompt that builds on what the writer already has",
    "story-rescue-protocol:",
    "  diagnose: translate stuckness into one story problem: want, obstacle, consequence, tactic, reveal, or act pressure",
    "  engines: suggest one clean next-move engine before offering alternatives",
    "  delivery: make the next move playable on the page, not abstract encouragement",
  ].join("\n");
}

export {
  computeBlockSignal,
  buildBlockCoachingBlockForPrompt,
  SCHEMA_VERSION as BLOCK_SIGNAL_SCHEMA_VERSION,
  SIGNAL_WEIGHTS,
  LEVEL_LOW_MAX,
  LEVEL_MEDIUM_MAX,
  SHORT_TURN_WINDOW,
};
