// Clementine Muse runtime skeleton (D008).
// Plug-in: import from here or individual modules; talk/page pipelines
// should call laneForIntent + createMuseClient the way they call
// createRealtimeSupplier / requestOpenAIText today.

export { INTENT, INTENT_VALUES, classifyIntent } from "./intents.js";
export { LANE, EFFORT, INTENT_LANE_MAP, laneForIntent } from "./lanes.js";
export {
  DEFAULT_CACHE_KEY_PREFIX,
  DEFAULT_CACHE_KEY_VERSION,
  DEFAULT_MODEL,
  buildPromptCacheKey,
  buildCacheStablePrefix,
  partitionPromptParts,
} from "./cache_policy.js";
export { createPageReservationStore } from "./page_cancel.js";
export {
  PAGE_CANCELLED_CODE,
  createPageCancelledError,
  isPageCancelledError,
  gatePageGeneration,
  mapAbortToPageCancel,
} from "./page_abort.js";
export {
  peekUtterance,
  peekPageHints,
  resolveSessionId,
  resolveUserId,
  resolveTalkLane,
  beginPageWork,
  createPageLaneTalkAdapter,
} from "./page_lane_adapter.js";
export {
  DEFAULT_BASE_URL,
  buildMuseResponsesRequest,
  createMuseClient,
  normalizeEffort,
  resolveApiKey,
} from "./muse_client.js";
export {
  MEMORY_TOOL_NAMES,
  MEMORY_KINDS,
  buildMemoryToolSchemas,
  createMemoryTools,
} from "./memory_tools.js";
export {
  DEFAULT_MAX_RECENT_TURNS,
  DEFAULT_COMPACT_TURN_THRESHOLD,
  DEFAULT_COMPACT_TOKEN_ESTIMATE,
  estimateTokensFromText,
  shouldCompact,
  compactWorkingSet,
  buildWorkingSetState,
} from "./memory_working_set.js";
export { createMemoryCompactionJob } from "./memory_compaction_job.js";
