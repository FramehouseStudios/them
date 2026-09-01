// Cache-stable prefix policy for Muse Spark (D008).
//
// Persona + voice-spec live in the frozen prefix. Dynamic junk (date,
// user id, mood, turn state) goes at the END of input so prompt cache hits.

const DEFAULT_CACHE_KEY_PREFIX = "them-clementine";
const DEFAULT_CACHE_KEY_VERSION = "v0";
const DEFAULT_MODEL = "muse-spark-1.2";

function trimToString(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

/**
 * Build the app-level prompt_cache_key, e.g. them-clementine-v0.
 * Bump version when persona/voice-spec material changes.
 */
function buildPromptCacheKey({
  prefix = DEFAULT_CACHE_KEY_PREFIX,
  version = process.env.CLEMENTINE_CACHE_KEY_VERSION || DEFAULT_CACHE_KEY_VERSION,
} = {}) {
  const p = trimToString(prefix) || DEFAULT_CACHE_KEY_PREFIX;
  const v = trimToString(version) || DEFAULT_CACHE_KEY_VERSION;
  return `${p}-${v}`;
}

/**
 * Stable instructions prefix: persona + voice-spec only.
 * NEVER put date, user-id, mood, session ids, or tool schemas that rotate
 * mid-session into this string.
 */
function buildCacheStablePrefix({
  personaText = "",
  voiceSpecText = "",
} = {}) {
  const parts = [];
  const persona = trimToString(personaText);
  const voice = trimToString(voiceSpecText);
  if (persona) parts.push(persona);
  if (voice) parts.push(voice);
  return parts.join("\n\n").trim();
}

/**
 * Split a turn into cache-stable instructions vs dynamic suffix content.
 * Dynamic junk belongs at the end of input.
 */
function partitionPromptParts({
  personaText = "",
  voiceSpecText = "",
  dynamicContext = "",
  userUtterance = "",
} = {}) {
  const cacheStablePrefix = buildCacheStablePrefix({ personaText, voiceSpecText });
  const dynamicTail = [trimToString(dynamicContext), trimToString(userUtterance)]
    .filter(Boolean)
    .join("\n\n");
  return {
    prompt_cache_key: buildPromptCacheKey(),
    instructions: cacheStablePrefix,
    /** Put at end of Responses `input` so the prefix stays cacheable. */
    dynamicInput: dynamicTail,
    model: process.env.MUSE_MODEL || DEFAULT_MODEL,
  };
}

export {
  DEFAULT_CACHE_KEY_PREFIX,
  DEFAULT_CACHE_KEY_VERSION,
  DEFAULT_MODEL,
  buildPromptCacheKey,
  buildCacheStablePrefix,
  partitionPromptParts,
};
