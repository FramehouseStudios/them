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
export {
  TOKENS_PER_TURN,
  MILLITURNS_PER_TURN,
  TURNS_PER_APPROX_CONVERSATION,
  LOW_BALANCE_RATIO,
  WALLET_LANE,
  WALLET_LANE_VALUES,
  WALLET_EMPTY_CODE,
  tokensToMilliturns,
  turnsToMilliturns,
  milliturnsToTurns,
  estimateReservationMilliturns,
  createWalletEmptyError,
  createWalletStore,
} from "./wallet.js";
export {
  DOMAIN_BALANCES as WALLET_DOMAIN_BALANCES,
  DOMAIN_IAP as WALLET_DOMAIN_IAP,
  createMemoryWalletPersistence,
  createPostgresWalletPersistence,
  createAdapterWalletPersistence,
  createWalletPersistence,
} from "./wallet_persistence.js";

export { classifyReflex } from "./reflex_classifier.js";
export {
  TEMPLATE_BANK,
  TEMPLATE_IDS,
  interpolate,
  renderReflexTemplate,
  listTemplateIds,
} from "./reflex_templates.js";
export { tryReflexReply } from "./reflex_lane.js";
export {
  peekKnownFacts,
  peekVoiceSpecHints,
  isReflexEligibleLane,
  tryTalkEdgeReflex,
  sendReflexReply,
} from "./talk_edge_adapter.js";

export {
  isClementineMuseEnabled,
  shouldUseMuseForLane,
  messagesToMuseParts,
  extractMuseOutputText,
  normalizeMuseUsage,
  createMuseAwareChatSupplier,
} from "./muse_provider.js";

export {
  PACKS,
  listPacks,
  getPackById,
  getPackByProductId,
  publicPackShape,
} from "./pack_catalog.js";
export {
  hasAppStoreVerifySecrets,
  hasCompleteAppStoreVerifyConfig,
  createIapVerifier,
  createMockIapVerifier,
} from "./iap_verify.js";
export {
  createAppStoreServerVerifyImpl,
  resolveAppStoreEnvironment,
  decodeJwsPayloadUnverified,
} from "./iap_app_store_verify.js";
export { mountIapCreditRoute, calmBalancePayload } from "./iap_credit_route.js";

