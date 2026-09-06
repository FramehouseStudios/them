// Low-confidence "say that again" prompts must not feed back on themselves.
//
// When the assistant's own playback re-enters the microphone (speakerphone,
// the iOS Simulator with no echo cancellation, a laptop mic next to its
// speakers) every reply is cut into a short low-confidence clip, /talk answers
// each clip with a spoken clarification, and that clarification becomes the
// next clip. This module tracks consecutive low-confidence clarifications per
// session so the handler can go silent (204 continue_listening) after a few
// spoken ones, which breaks the loop while still letting a real listener hear
// the first prompt.

const DEFAULT_MAX_SPOKEN_STREAK = 2;
const DEFAULT_WINDOW_MS = 15_000;

function parseNonNegativeInt(raw, fallback) {
  const value = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Read the policy from env once per call site; tests pass their own env. */
function readLowConfidenceRepeatPolicy(env = process.env) {
  return Object.freeze({
    maxSpokenStreak: parseNonNegativeInt(
      env?.LOW_CONFIDENCE_REPEAT_PROMPT_MAX_STREAK,
      DEFAULT_MAX_SPOKEN_STREAK,
    ),
    windowMs: Math.max(
      1_000,
      parseNonNegativeInt(env?.LOW_CONFIDENCE_REPEAT_PROMPT_WINDOW_MS, DEFAULT_WINDOW_MS),
    ),
  });
}

/**
 * Advance the per-session streak. Mutates `memory` and returns the new streak
 * (1 when the previous prompt is older than the window or absent).
 */
function advanceLowConfidenceRepeatStreak(memory, now = Date.now(), windowMs = DEFAULT_WINDOW_MS) {
  if (!memory || typeof memory !== "object") return 1;
  const lastAt = Math.max(0, Number(memory.lastLowConfidenceRepeatAt || 0));
  const previous = Math.max(0, Number(memory.lowConfidenceRepeatCount || 0));
  const streak = lastAt > 0 && now - lastAt <= windowMs ? previous + 1 : 1;
  memory.lowConfidenceRepeatCount = streak;
  memory.lastLowConfidenceRepeatAt = now;
  memory.lastUpdatedAt = now;
  return streak;
}

/** Clear the streak after a usable transcript. Returns true when memory changed. */
function resetLowConfidenceRepeatStreak(memory, now = Date.now()) {
  if (!memory || typeof memory !== "object") return false;
  const had = Number(memory.lowConfidenceRepeatCount || 0) > 0
    || Number(memory.lastLowConfidenceRepeatAt || 0) > 0;
  if (!had) return false;
  memory.lowConfidenceRepeatCount = 0;
  memory.lastLowConfidenceRepeatAt = 0;
  memory.lastUpdatedAt = now;
  return true;
}

/** Speak the clarification only while the streak is within the spoken budget. */
function shouldSpeakLowConfidenceRepeatPrompt(streak, policy = readLowConfidenceRepeatPolicy()) {
  return Number(streak || 0) <= Number(policy?.maxSpokenStreak ?? DEFAULT_MAX_SPOKEN_STREAK);
}

export {
  DEFAULT_MAX_SPOKEN_STREAK,
  DEFAULT_WINDOW_MS,
  readLowConfidenceRepeatPolicy,
  advanceLowConfidenceRepeatStreak,
  resetLowConfidenceRepeatStreak,
  shouldSpeakLowConfidenceRepeatPrompt,
};
